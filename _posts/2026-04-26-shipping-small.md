---
title: "Shipping small: what building iOS apps taught me about scope"
date: 2026-04-26
tags: [ios, product, engineering]
description: >-
  Every app I've shipped got smaller before it got finished. Notes on scope,
  the App Store, and why the first honest version is the one that matters.
---

Every iOS app I have shipped got *smaller* on the way to the App Store, not bigger. That surprised me the first time. It stopped surprising me somewhere around the third.

When you start, the feature list is a wish. It contains everything the app could plausibly do, written down with equal confidence — the core thing it exists for, and the eleven nice-to-haves that occurred to you in the shower. The list looks like a plan. It is actually a hazard.

## The first honest version

The version that matters is the smallest one you would not be embarrassed to put in front of a real person. Not the smallest one that technically compiles — the smallest one that is genuinely *useful* for one specific job.

With [Tracktide](/projects/tracktide/), that meant logging a dose and seeing how much was left in the vial. That's it. Cycles, history, reminders, widgets — all of it good, all of it shipped eventually, none of it in the first build. If the core loop of "log a thing, see the consequence" wasn't fast and obvious, no amount of secondary features would save it. If it *was*, the rest could follow at its own pace.

> Scope is not a list of features. Scope is a decision about what you are willing to be judged on.

## Cutting is the actual work

Adding features is easy — it's just typing. Cutting them is the part that requires judgment, because every cut is an argument with the version of you that wrote the wish list.

A few rules I now apply without much debate:

- **If a feature needs another feature to make sense, both are out of v1.** Dependencies between nice-to-haves are a sign the core isn't carrying its weight yet.
- **A setting is a decision you failed to make.** Sometimes you genuinely need it. Usually you're just postponing a hard call onto the user.
- **If I can't explain why a screen exists in one sentence, the screen doesn't exist.**
- **The empty state is a feature.** Most apps look their worst on day one, with no data in them. That's the first thing every new user sees.

## The App Store keeps you honest

There is a specific humility that comes from app review. You can sit with a build for weeks, convinced it's ready, and then a reviewer — or worse, a real user — finds the seam in ninety seconds. SwiftData makes the storage layer pleasant; it does nothing for the fact that you forgot what happens when someone denies the notification permission and then opens the reminders screen.

Shipping small is partly a scope discipline and partly an exposure strategy. The sooner a real person touches the smallest honest version, the sooner you find out which of your assumptions were load-bearing. Everything I would have spent polishing the wish-list features, I now spend watching what actually breaks.

The apps got smaller because *finished* turned out to mean something narrower, and better, than I first thought. Finished is not "everything I imagined." Finished is "the core thing works, and I'd defend it." The rest is a roadmap, and a roadmap is allowed to take its time.
