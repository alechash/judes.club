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

Not users of a website. A system of record: names, contacts, home addresses, current assignments, the kind of personal detail that exists in one place and actually matters. It is the most sensitive data we hold. Staff can search it just by asking — someone types "find translators in France who speak Spanish" and gets an answer back.

Getting the assistant to understand the request was never the hard part. Everything between the request and the answer was.

## The setup

Some quick background, since everything below depends on it.

The assistant is an internal chat tool. A staff member opens it, types a request in plain language, and gets an answer. Under the hood it's an LLM wired up to a set of tools, which are just small functions it's allowed to call. The model has no direct line to a database. When it wants data it calls a tool, and the tool is the only code that ever touches a real record.

Finding people is one of those tools. When someone types "find translators in France who speak Spanish," the model doesn't search anything itself. It reads the request, works out the criteria, and calls the person-search tool with them. The tool runs the query against the records and hands back the matches, and the model presents what comes back.

That splits the work in two. The model turns language into criteria; the tool turns criteria into people. The rest of this post is about the tool — the interface it exposes and how it runs a query. That half is where the hard parts are.

## The model doesn't get a query language

The obvious way to build this is to give the model a flexible search tool and let it improvise: hand it something query-shaped and let it filter however it likes.

For data like this, I think that's the wrong instinct. The records are read-only to the assistant by construction — it physically cannot write to them — and the whole feature is gated behind a permission claim. But not being able to change a record is not the same as not being able to over-read one. A model that improvises queries can ask for more than it should, in shapes nobody reviewed beforehand.

So the model doesn't get a query language. It gets a vocabulary.

Every criterion it can express is a small declared object: a field, an operator, and a value.

```json
{ "field": "departments", "operator": "current",
  "value": { "departmentId": "…", "isManager": true } }
```

It can't invent a field or an operator. Whatever it sends is validated against a registry of things we explicitly marked as searchable, and that happens before any record is read. The model does the clever part, turning "translators in France" into the right criteria, but it has no say in the shape of the search itself.

## Not everyone sees the same person

There's a second reason, and for me it's the one that settles the question.

Not everyone who uses the assistant sees the same things. Permissions here aren't a single yes-or-no on whether you can search people. They're finer-grained than that. Two people can run the same search and get back different fields on the same person, because each record is authorized piece by piece against the claims of whoever is asking. Some details just aren't yours to see, and which ones depends on who you are.

A free-form query language has nowhere to put that. It lets any caller name any field and then relies on the backend to silently drop whatever they weren't cleared for, on every query, forever. Meanwhile the model is reasoning in a vocabulary that may not even be valid for the person it's working for.

A declared registry gives you one place to enforce it. The fields are finite and known, so "what can this caller search?" has an actual answer. You hand each user only the fields their claims allow, and the model can't form a criterion for a field it was never given. A field someone isn't cleared for doesn't get stripped out of their results after the fact. It was never put in front of the model to begin with.

## One definition, five jobs

The old version of this tool had two parallel systems bolted together. There were about sixteen typed parameters for the fast path, plus a stringly-typed JSON blob for everything else, and the filter logic was reflected out of attributes at runtime. Adding one searchable field meant editing five files and hoping you got them consistent. The two halves didn't even agree on what "searchable" meant.

The rewrite replaces all of that with one idea. A search field is defined once, and that single definition does five separate jobs.

```csharp
SearchField.ObjectCollection<DepartmentAssignment>("departments")
    .Operators(Current, Past, Future, Ever, Never)
    .TemporalRange(d => d.StartDate, d => d.EndDate)
    .Member("departmentId", …)
    .Member("isManager", …)
    .Phase1("departmentIds")              // how it narrows the server query
    .Selects("departments { … }");        // what it fetches back
```

That one block gives us all five: the description the model reads, the rules its input is validated against, how the criterion gets pushed into the upstream search, what data we're allowed to pull back, and how a match is finally decided. Add a field and all five come with it. There's no second file to update and forget.

The builder produces one object behind a small interface, and the interface is just those five jobs written out:

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

Two implementations cover every field we have. A scalar field is one value on the record — a name, a date, a status. An object-collection field is a list of sub-records, like assignments or languages, each with its own small shape. The registry is a dictionary of these keyed by name. Generating the prompt text, validating the model's input, building the query, choosing what to fetch, deciding the match: each one is the same loop over the same objects.

This matters for sensitive data more than it might sound. Because "what is searchable" and "what is fetchable" come from the same definition, you can't accidentally fetch a field you never meant to expose. And if you do get something wrong, it's wrong in exactly one place.

## Two phases, and a hard limit

The search runs in two phases. That wasn't a design preference; the shape of the data rules out anything simpler.

There are somewhere around **8–10 million** person records, and each one carries **hundreds of fields**. Nothing queries that shape in one shot. The search index — the thing that can scan all of those records quickly — only covers some of the fields: the common ones, the ones worth indexing. Everything else lives in the full record, where a fast query can't see it.

So the search is split along exactly that line.

Phase 1 is a real query against the upstream service. It narrows on the indexed fields — location, department, team — server-side, across all ten million records at once. Its job is to turn ten million into a small candidate set, and the upstream service is the only sensible place to do that. You don't want to pull a haystack of sensitive personal records into your own process just to sift them.

Phase 2 takes that narrowed set, fetches the full records including the un-indexed fields, and evaluates the remaining criteria in memory. Those are the things the index can't express — "currently in this department," for instance, which depends on a start date and an end date.

Neither phase can do the other's job. You can't index hundreds of fields across ten million records and keep it fast, and you can't drag ten million full records into a process to filter them by hand. So each phase does the part it can and leaves the rest alone.

There's one rule between the two phases that I care about more than speed: a Phase-1 narrowing has to be sound. It is allowed to return too much. It is not allowed to drop a real match. If we can't push a criterion down to Phase 1 without risking a false exclusion, we don't push it, and Phase 2 checks it instead. A slow search is annoying; a search that quietly misses someone is a real problem.

That rule is why `TryContributeToPhase1` returns a `bool`. The return value isn't "did this field contribute anything" — it's "did it fully express this criterion server-side." The tool tracks that across every criterion:

```csharp
var needsPhase2 = false;
foreach (var criterion in criteria)
{
    bool fullyPushed = criterion.Field.TryContributeToPhase1(
        criterion.Operator, criterion.Value, phase1Query);
    needsPhase2 |= !fullyPushed;
}
```

If every criterion pushes cleanly into the indexed query, `needsPhase2` stays `false` and Phase 2 is skipped entirely. The Phase-1 result is already the answer, and nothing gets enriched. As soon as one criterion can't be fully expressed server-side — a temporal check, an un-indexed field, a compound object match — Phase 2 turns on, but only as a verification pass over a set that's already small. The expensive path is opt-in, and it's the criteria themselves that decide whether you're on it.

There's also a ceiling. If Phase 1 comes back with more than **2,000 candidates**, the tool refuses to fetch them and asks for a narrower search instead. That refusal is deliberate. An assistant that will happily pull ten thousand people's full records into memory because someone asked a vague question isn't something you want pointed at this data.

## "Currently"

The part I'm happiest with is how some ordinary words ended up with precise meanings.

"Who's in the translation department" and "who used to be in it" are different questions, and the whole difference is two dates on an assignment. So temporal scope is just an operator. Every object field that has a start and end date gets the same five — `current`, `past`, `future`, `ever`, `never` — and one function decides them all:

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

The model never reasons about a date. It picks the word `current`, and the function decides what that word means.

The other half of a match is the value. For an object field the value isn't a scalar. It's a partial object, and matching works by subset containment: the criterion holds if every member it names matches the item, and any member it doesn't name is ignored.

```csharp
bool Contains(Assignment item, JsonElement value)
{
    foreach (var member in value.EnumerateObject())
        if (!field.Members[member.Name].Matches(item, member.Value))
            return false;   // a named member disagreed
    return true;            // everything named agreed
}
```

That's what lets a single field cover a whole family of questions. `{ departmentId: X }` means "in department X, any role." Add `isManager: true` and it narrows to "managing department X." Pick the operator `current` and it becomes "managing department X right now." It's the same field and the same two functions throughout — the model just names more members, or picks a different word.

Evaluating the field end to end is then about what you'd expect: take the person's assignments, keep the ones that are `InScope` for the operator, and check whether any of those `Contains` the value. `Never` runs the same check and flips the result.

That's the division of labour I want everywhere in this thing. The model deals with language; the code decides what's actually true.

## Read-only by construction

Most of the safety in this design isn't a runtime check added at the end. It comes from the structure.

The tool has no write path, so there's nothing to call that could change a record. The feature is gated behind a claim, so it doesn't exist at all for people who shouldn't have it. The model can only name fields from a fixed registry, only use the operators those fields declared, and only receive the data those same definitions said to fetch. The candidate pool is capped. Every criterion is validated before any record is read.

Add those up and the model never sees anything it didn't ask for by name, and it can only ask in a vocabulary we wrote down on purpose.

## Why build it this way

It would have been faster to give the model a search box and move on. It usually is.

But the thing being searched is a record of real people, and "the AI got a little too creative" is not a sentence I want to say about that kind of data. The declarative layer wasn't built to be elegant, though it's a nice side effect that adding a field is now one block instead of five files. It was built so that the safe way to use the tool and the only way to use it are the same way.

The model is the clever part of this system. The data isn't something to improvise around. Most of the design is just keeping those two things apart.
