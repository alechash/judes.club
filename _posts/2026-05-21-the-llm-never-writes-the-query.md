---
title: "The LLM never writes the query: a declarative search layer over sensitive records"
date: 2026-05-21
tags: [ai, architecture, engineering]
description: >-
  We have an internal assistant that searches a system of record for people —
  the most sensitive data we hold. Here's the query layer behind it: one
  definition per field, two phases, and a model that never gets to write a
  query itself.
---

We have an internal assistant. One of the things it does is find people.

By people I mean records in a system of record — names, contacts, home addresses, current assignments, and other personal details that exist in exactly one place and actually matter. This is the most sensitive data we hold. Staff can search it by typing a request in plain language, such as "find translators in France who speak Spanish," and getting an answer back.

The model handles the request itself without much trouble. This post is about what happens between the request and the answer.

## The setup

First, some background on what the assistant is.

It's an internal chat tool. A staff member opens it, types a request in plain language, and gets an answer. Under the hood it's an LLM with a set of tools, which are small functions it's allowed to call. The model has no direct connection to a database. When it needs data, it calls a tool, and the tool is the only code that touches a real record.

Finding people is one of those tools. When someone types "find translators in France who speak Spanish," the model reads the request, works out the search criteria, and calls the person-search tool with them. The tool runs the query and returns the matches, and the model presents them.

So the model turns language into criteria, and the tool turns criteria into people. The rest of this post is about the tool: the interface it exposes and how it runs a query.

## The model doesn't get a query language

The obvious way to build this is to give the model a flexible search tool and let it improvise — hand it something query-shaped and let it filter however it likes.

For data like this, that's a bad idea. The records are read-only to the assistant by construction; it can't write to them, and the whole feature is gated behind a permission claim. But read-only access still leaves room to read more than you should. If the model improvises its own queries, it can request data in shapes nobody reviewed beforehand.

So instead of a query language, the model gets a fixed vocabulary. Every criterion it can express is a small declared object with a field, an operator, and a value:

```json
{ "field": "departments", "operator": "current",
  "value": { "departmentId": "…", "isManager": true } }
```

The model can't invent a field or an operator. Whatever it sends is validated against a registry of things we marked as searchable, and that validation runs before any record is read. The model still works out which criteria a request needs, but it doesn't control the shape of the search.

## Not everyone sees the same person

There's a second reason the model doesn't get a query language, and it matters more than the first.

Not everyone who uses the assistant sees the same data. Permissions here aren't a single yes-or-no on whether you can search people; they're more granular. Two people can run the same search and get back different fields on the same person, because each record is authorized field by field against the claims of whoever is asking. Which details you can see depends on who you are.

A free-form query language has no good way to handle that. It lets any caller name any field, then relies on the backend to drop whatever they weren't cleared for on every query. The model ends up reasoning in a vocabulary that may not be valid for the person it's working for.

A declared registry handles it in one place. The fields are finite and known, so "what can this caller search?" has a definite answer. You give each user only the fields their claims allow, and the model can't form a criterion for a field it was never given. Fields a user isn't cleared for are never offered to the model, so they don't have to be filtered out of the results afterward.

## One definition, five jobs

The old version of this tool had two parallel systems bolted together. There were about sixteen typed parameters for the fast path, plus a stringly-typed JSON blob for everything else, with the filter logic reflected out of attributes at runtime. Adding one searchable field meant editing five files and making sure they stayed consistent. The two halves didn't even agree on what "searchable" meant.

The rewrite replaces that with a single concept. A search field is defined once, and that one definition does five separate jobs.

```csharp
SearchField.ObjectCollection<DepartmentAssignment>("departments")
    .Operators(Current, Past, Future, Ever, Never)
    .TemporalRange(d => d.StartDate, d => d.EndDate)
    .Member("departmentId", …)
    .Member("isManager", …)
    .Phase1("departmentIds")              // how it narrows the server query
    .Selects("departments { … }");        // what it fetches back
```

That one block produces all five things: the description the model reads, the rules its input is validated against, how the criterion gets pushed into the upstream search, what data we fetch back, and how a match is decided. Adding a field means writing one of these blocks, and all five jobs come from it.

The builder produces one object behind a small interface. The interface is those five jobs:

```csharp
public interface ISearchField
{
    string Name { get; }

    // 1 — what the model is told this field is
    void DescribeForLlm(StringBuilder text);

    // 2 — is a given { operator, value } even legal here?
    //     null means fine; otherwise it's the error handed back to the model
    string? Validate(SearchOperator op, JsonElement value);

    // 3 — push this criterion into the Phase-1 server query, if it can be
    bool TryContributeToPhase1(SearchOperator op, JsonElement value, Phase1Query query);

    // 4 — what to pull back from the full record in Phase 2
    string? GraphQlSelection { get; }

    // 5 — the final, authoritative yes/no for one person
    bool Evaluate(PersonRecord person, SearchOperator op, JsonElement value);
}
```

Two implementations cover every field we have. A scalar field is a single value on the record, such as a name, a date, or a status. An object-collection field is a list of sub-records, like assignments or languages, each with its own shape. The registry is a dictionary of these, keyed by name. Generating the prompt text, validating input, building the query, choosing what to fetch, and deciding the match are all the same loop over the same objects.

This is useful for sensitive data specifically. Because what's searchable and what's fetchable come from the same definition, you can't accidentally fetch a field you didn't mean to expose. A mistake in a field definition is contained to that one definition.

## Two phases, and a hard limit

The search runs in two phases, because the shape of the data doesn't allow anything simpler.

There are around **8–10 million** person records, and each one has **hundreds of fields**. You can't query that in a single shot. The search index, which is the thing that can scan all of those records quickly, only covers some of the fields — the common ones that are worth indexing. The rest of the fields live in the full record, which a fast query can't see.

The two phases split along that line.

Phase 1 is a query against the upstream service. It narrows on the indexed fields — location, department, team — on the server, across all ten million records at once. Its job is to reduce ten million records to a small candidate set. That work has to happen on the upstream service; you don't want to pull a large set of sensitive personal records into your own process just to sift through them.

Phase 2 takes the narrowed set, fetches the full records including the un-indexed fields, and evaluates the remaining criteria in memory. Those criteria are the ones the index can't express, like "currently in this department," which depends on a start date and an end date.

You can't merge the two phases. Indexing hundreds of fields across ten million records and keeping it fast isn't feasible, and neither is loading ten million full records into a process to filter them there. Each phase does the part it can.

There's one rule between the phases that matters more than speed: a Phase-1 narrowing has to be sound. It's allowed to return too many records, but it can't drop a real match. If a criterion can't be pushed down to Phase 1 without risking a false exclusion, we don't push it, and Phase 2 evaluates it instead. We would rather return a slow result than a wrong one.

This is why `TryContributeToPhase1` returns a `bool`. The return value doesn't mean "did this field contribute something." It means "did it fully express this criterion on the server." The tool tracks that across every criterion:

```csharp
var needsPhase2 = false;
foreach (var criterion in criteria)
{
    bool fullyPushed = criterion.Field.TryContributeToPhase1(
        criterion.Operator, criterion.Value, phase1Query);
    needsPhase2 |= !fullyPushed;
}
```

If every criterion pushes cleanly into the indexed query, `needsPhase2` stays `false` and Phase 2 is skipped. The Phase-1 result is the answer, and nothing gets enriched. If one criterion can't be fully expressed on the server — a temporal check, an un-indexed field, a compound object match — Phase 2 runs, but only as a verification pass over a candidate set that's already small. So the expensive path only runs when the criteria actually need it.

There's also a ceiling. If Phase 1 returns more than **2,000 candidates**, the tool doesn't fetch them; it asks for a narrower search instead. If a question is vague enough to match ten thousand people, the right response is to ask for more detail, not to load ten thousand full records into memory.

## "Currently"

Temporal scope is a good example of how an ordinary word ends up with a precise meaning here.

"Who's in the translation department" and "who used to be in it" are different questions, and the difference is two dates on an assignment. So temporal scope is an operator. Every object field with a start and end date gets the same five operators — `current`, `past`, `future`, `ever`, `never` — and one function handles all of them:

```csharp
bool InScope(Assignment a, SearchOperator op, DateOnly today) => op switch
{
    Current => (a.Start is null || a.Start <= today)
            && (a.End   is null || a.End   >= today),
    Past    => a.End   is { } end   && end   <  today,
    Future  => a.Start is { } start && start >  today,
    Ever    => true,
    _       => false,   // Never: every item is in scope, negated after the match
};
```

The model doesn't work with dates at all. It picks the word `current`, and the function defines what `current` means.

The other half of a match is the value. For an object field, the value isn't a single scalar; it's a partial object. Matching works by subset containment: the criterion holds if every member it names matches the item, and members it doesn't name are ignored.

```csharp
bool Contains(Assignment item, JsonElement value)
{
    foreach (var member in value.EnumerateObject())
        if (!field.Members[member.Name].Matches(item, member.Value))
            return false;   // a named member disagreed
    return true;            // everything named agreed
}
```

This is what lets one field cover a range of questions. `{ departmentId: X }` means "in department X, in any role." Adding `isManager: true` narrows it to "managing department X." Choosing the operator `current` narrows it further, to "managing department X right now." It's the same field and the same two functions in each case; the model just names more members or picks a different operator.

Evaluating the field end to end works as you'd expect: take the person's assignments, keep the ones that are `InScope` for the operator, and check whether any of them `Contains` the value. `Never` runs the same check and negates the result.

## Read-only by construction

The safety properties here come from the structure of the tool, not from runtime checks added at the end.

The tool has no write path, so there's no code path that could change a record. The feature is gated behind a claim, so it isn't available to people who shouldn't have it. The model can only name fields from a fixed registry, only use the operators those fields declared, and only receive the data those definitions specify. The candidate pool is capped. Every criterion is validated before any record is read.

Taken together, this means the model only ever receives fields it named explicitly, and it can only name fields from a vocabulary we defined.

## Why build it this way

Giving the model a plain search box would have been faster to build, and for most features that tradeoff is fine.

But the data being searched is a record of real people, and I didn't want "the AI improvised a query" to be a possible explanation for an incident involving that data. The declarative layer isn't there to be elegant, although it is convenient that adding a field now takes one block instead of edits across five files. It's there so that the only way to use the tool is also a way we reviewed in advance.

The model is good at turning language into criteria, and that's the job it has here. What data a query is allowed to touch is decided by the tool and the field definitions, not improvised by the model. Keeping those two responsibilities separate is most of what the design does.
