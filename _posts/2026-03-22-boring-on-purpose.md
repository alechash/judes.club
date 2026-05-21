---
title: "Boring on purpose"
date: 2026-03-22
tags: [engineering, craft]
description: >-
  The newest tool is rarely the right one. A case for choosing technology
  that is proven, predictable, and a little bit boring.
---

There is a specific kind of excitement that comes with starting a new project. The repo is empty, the constraints are theoretical, and for a few hours you get to imagine the cleanest version of everything. That is exactly the moment you are most likely to make a decision you will regret.

The temptation is always to reach for the newest thing — the framework that shipped its 1.0 last month, the database with the impressive benchmark, the language feature that just landed. New tools feel like leverage. Sometimes they are. More often, they are a loan against your future attention, and the interest is paid in debugging sessions nobody scheduled.

## What "boring" actually buys you

When I call a tool boring, I mean something specific. I mean it has been in production somewhere serious for years. I mean that when you hit an error message, the first page of search results is a real answer and not a GitHub issue with three thumbs-up and no replies. I mean the failure modes are documented, the edges are worn smooth, and the people who maintain it have already made the embarrassing mistakes so you don't have to.

Boring technology is predictable, and predictability compounds. Every hour you don't spend discovering that a library doesn't handle timezones, or that a framework's caching layer has opinions you didn't ask for, is an hour you spend on the actual problem.

> The goal was never to use interesting tools. The goal was to build something that works and keeps working when you're not looking at it.

## Novelty has a place — it's just a small one

This isn't an argument for never learning anything. It's an argument for being deliberate about *where* the novelty goes. Every project gets a budget for the unfamiliar, and it is much smaller than you want it to be. Spend it on the part that is genuinely new — the thing that is the reason the project exists — and be relentlessly conventional everywhere else.

If the interesting part of your product is a recommendation engine, then the recommendation engine is where the new ideas go. The auth, the database, the deployment pipeline, the way you serve static files — all of that should be the most obvious, well-trodden choice available. Nobody has ever opened an app and been delighted that the session store was exotic.

## It shows up most in client work

I notice this most clearly through [Belayer](/projects/belayer/), the consultancy I run. Clients are not paying for a tour of the frontier. They are paying for something that ships, that the next engineer can understand, and that does not become a liability the moment I hand it back. A clever architecture that only I can maintain is not a gift — it's a hostage situation with extra steps.

So the work tends to look unremarkable from the outside, and that is the point. Boring on the inside is what calm looks like on the outside: software that loads, behaves, and gets out of the way.

The most senior instinct I have developed is not knowing the newest thing. It is being unbothered about not knowing it — and choosing, on purpose, the tool that will still be obvious in three years.
