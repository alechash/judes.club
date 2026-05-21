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

We have an internal assistant. Among other things, it finds people.

Not "people" as in users of a website. People as in a system of record — names, contacts, where someone lives, what they're assigned to, personal details that exist in exactly one place and actually matter. It's the most sensitive data we hold. And the assistant lets staff search it by just *asking*: "find translators in France who speak Spanish."

The interesting problem was never the asking. It's everything between the question and the answer.

## The setup

Worth thirty seconds on what this actually is, because the rest leans on it.

The assistant is an internal chat tool. A staff member opens it, types a request in plain language, and gets an answer back. Under the hood it's an LLM wired up with a set of *tools* — small, well-defined functions it's allowed to call. It has no direct line to a database. If it wants data, it calls a tool, and a tool is the only thing that ever touches a real record.

Finding people is one of those tools. Type "find translators in France who speak Spanish" and the LLM doesn't go searching anything itself — it reads the request, works out the criteria, and calls the person-search tool with them. The tool runs the actual query against the records and hands back the matches. The LLM just presents what comes back.

So there are two jobs here, and they belong to two different things. The LLM turns language into criteria. The tool turns criteria into people. This post is about the second half — that tool, the interface it exposes, and how it runs a query — because that's where every hard part lives.

## The model doesn't get a query language

The obvious way to build this is to hand the model a flexible search tool and let it improvise — give it something query-shaped, let it filter.

Over data like this, that's the wrong instinct. The records are read-only to the assistant by construction — it physically cannot write to them — and the whole feature sits behind a permission claim. But "can't mutate" isn't the same as "can't overreach." A model that improvises queries is a model that can ask for more than it should, in shapes you never reviewed.

So the LLM doesn't get a query language. It gets a **vocabulary**.

Every criterion it can express is a small, declared object — a field, an operator, and a value:

```json
{ "field": "departments", "operator": "current",
  "value": { "departmentId": "…", "isManager": true } }
```

It can't invent a field. It can't invent an operator. Anything it sends is validated against a registry of things we explicitly decided are searchable, *before* a single record is touched. The model is powerful at the edge — turning "translators in France" into the right criteria — and deliberately powerless about the shape of the search itself.

## Not everyone sees the same person

There's a second reason the model can't have a query language, and it's the one that really settles it.

Not everyone who uses the assistant sees the same things. Permissions here aren't "can you search people — yes or no." They're finer than that. Two people can run the *same* search and get back different fields on the same person, because a record is authorized piece by piece against the claims of whoever's asking. Some details are simply not yours to see — and which details depends entirely on who you are.

A free-form query language has nowhere to put that. It lets any caller name any field, and then leans on the backend to quietly drop whatever they weren't cleared for — query shape by query shape, forever — while the model reasons in a vocabulary that isn't even valid for the person it's working for.

A declared registry is the chokepoint that fixes it. The fields are finite and known, so "what can *this* caller search?" is a question with an answer. You hand each user only the fields their claims allow, and the model can't form a criterion for a field that isn't in the vocabulary it was handed. The fields someone can't see aren't filtered out of their results after the fact. They were never offered to the model in the first place.

## One definition, five jobs

The old version of this tool had two parallel systems bolted together: about sixteen typed parameters for the fast path, and a stringly-typed JSON blob for everything else, with filter logic reflected out of attributes at runtime. Adding one new searchable field meant editing five files and hoping. Worse, the two halves disagreed about what "searchable" even meant.

The rewrite collapses all of it into a single idea: a **search field** is defined once, and that one definition does five jobs.

```csharp
SearchField.ObjectCollection<DepartmentAssignment>("departments")
    .Operators(Current, Past, Future, Ever, Never)
    .TemporalRange(d => d.StartDate, d => d.EndDate)
    .Member("departmentId", …)
    .Member("isManager", …)
    .Phase1("departmentIds")              // how it narrows the server query
    .Selects("departments { … }");        // what it fetches back
```

From that one block we derive: the description the model reads, the rules its input is validated against, how the criterion gets pushed into the upstream search, what data we're allowed to pull back, and how the match is finally decided. Add a field, and all five fall out for free. There's no second place to forget.

Concretely, the builder produces one object behind a small interface — and the interface *is* those five jobs:

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

Two implementations cover every field we have: a *scalar* field — one value on the record, a name or a date or a status — and an *object-collection* field — a list of sub-records, like assignments or languages, each with its own little shape. The registry is just a dictionary of these, keyed by name. Validating the model's input, generating the prompt text, building the query, choosing what to fetch, deciding the match — every one of those is the same loop over the same objects.

That matters for sensitive data more than it sounds like it should. When "what's searchable" and "what's fetchable" come from the same definition, you can't accidentally pull a field you never meant to expose. The blast radius of a mistake is one definition.

## Two phases, and a hard limit

The two-phase split isn't a preference. The data forces it.

There are somewhere around **8–10 million** person records, and each one carries **hundreds of fields**. Nothing queries that shape in a single shot. The search index — the thing that can scan all ten million quickly — only covers a *slice* of those fields: the common ones, the ones worth indexing. Everything else lives in the full record, invisible to a fast query.

So the search runs in two phases, split exactly along that line.

**Phase 1** is a real query against the upstream service. It narrows on the indexed fields — location, department, team — server-side, across all ten million records at once. Its only job is to turn ten million into a small candidate set. It's also the only honest place to do that: you never want to pull a haystack of sensitive personal records into your own process to sift them.

**Phase 2** takes that narrowed set, fetches the *full* records — un-indexed fields included — and evaluates the rest of the criteria in memory: the things the index can't express, like "*currently* in this department," with its start and end dates.

You couldn't fold this into one phase if you tried. You can't index hundreds of fields across ten million records and keep it fast, and you can't drag ten million full records into a process to sift them by hand. Each phase does the part it's actually capable of, and nothing else.

The two phases have one rule between them that I care about more than speed: a Phase-1 narrowing must be **sound**. It's allowed to return too much. It is never allowed to drop a real match. If we can't push a criterion down without risking a false exclusion, we don't push it — Phase 2 verifies it instead. A search that quietly misses someone is worse than a slow one.

That rule is why `TryContributeToPhase1` returns a `bool`. It doesn't mean "did this field contribute something" — it means "did it *fully* express this criterion server-side." The tool tracks that across every criterion:

```csharp
var needsPhase2 = false;
foreach (var criterion in criteria)
{
    bool fullyPushed = criterion.Field.TryContributeToPhase1(
        criterion.Operator, criterion.Value, phase1Query);
    needsPhase2 |= !fullyPushed;
}
```

If every criterion pushes cleanly into the indexed query, `needsPhase2` stays `false` and Phase 2 is skipped outright — the Phase-1 result *is* the answer, and nothing gets enriched at all. The moment one criterion can't be fully expressed server-side — a temporal check, an un-indexed field, a compound object match — Phase 2 switches on, but only as a verification pass over an already-small set. The expensive path is opt-in, and the criteria themselves decide whether you're on it.

And there's a ceiling. If Phase 1 still comes back with more than **2,000 candidates**, the tool doesn't fetch them. It stops and asks for a narrower search. Refusing to over-fetch is the feature. An assistant that will happily drag ten thousand people's full records into memory because the question was vague is not an assistant you want pointed at this data.

## "Currently"

The piece I'm happiest with is how ordinary words became precise.

"Who's in the translation department" and "who *used* to be in it" are different questions, and the entire difference is two dates on an assignment. So temporal scope is just an operator, and every object field with a start/end date gets the same five — `current`, `past`, `future`, `ever`, `never` — decided by one function:

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

The model never reasons about a date. It picks the word `current`. The function owns what the word means.

The other half of a match is the *value*. For an object field the value isn't a scalar — it's a partial object, and matching is subset containment: the criterion holds if every member it *names* matches the item, and members it doesn't name are ignored.

```csharp
bool Contains(Assignment item, JsonElement value)
{
    foreach (var member in value.EnumerateObject())
        if (!field.Members[member.Name].Matches(item, member.Value))
            return false;   // a named member disagreed
    return true;            // everything named agreed
}
```

That's what lets one field cover a whole family of questions. `{ departmentId: X }` is "in department X, any role." Add `isManager: true` and it tightens to "managing department X." Pick the operator `current` and it's "managing department X *right now*." Same field, same two functions — the model just names more members, or picks a different word.

Evaluating the field end to end is then exactly what you'd expect: take the person's assignments, keep the ones `InScope` for the operator, and check whether any of them `Contains` the value. `Never` runs the identical check and flips the answer.

The LLM handles language. The code handles truth. That's the division of labour I want everywhere in this thing.

## Read-only by construction

None of the safety here is a runtime check bolted on at the end. It's structural.

The tool has no write path — there's nothing to call. The feature is gated behind a claim, so it doesn't exist for people who shouldn't have it. The model can only name fields from a fixed registry, only use operators those fields declared, and only ever receive data those same definitions said to fetch. The candidate pool is capped. Every criterion is validated before any record is read.

Put together, the model never gets to see anything it didn't ask for *by name* — and it can only ask in a vocabulary we wrote down on purpose.

## Why build it this way

It would have been faster to give the model a search box and move on. It usually is.

But the thing being searched is a record of real people, and "the AI got a little too creative" is not an incident you want to explain about that kind of data. The declarative layer isn't there to be elegant — though it is nice that adding a field is now one block instead of five files. It's there so that the safe path and the only path are the same path.

The model is the clever part. The data is not something you improvise around. Keeping those two facts in separate boxes is most of the design.
