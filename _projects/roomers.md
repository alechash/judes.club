---
title: Roomers
order: 1
kind: iOS
year: 2026
cover: /projects/roomers.png
tagline: >-
  Shared plant care for homes — smart watering schedules the whole household
  sees, so nobody ever double-waters again.
description: >-
  Roomers is an iOS app for shared plant care: adaptive watering schedules,
  household sync with roommates, care guides, and photo logs.
role: Engineering &amp; Design
stack: [SwiftUI, Fastify, Postgres, Railway]
status: Live on the App Store
tags: [iOS, SwiftUI, Full Stack, 2026]
links:
  - label: App Store
    url: https://apps.apple.com/us/app/roomers-plants-for-roommates/id6786161601
challenge: >-
  Houseplants in a shared home die of coordination failure, not neglect —
  either everyone waters the pothos or everyone assumes someone else did.
  Care knowledge lives in one roommate's head and leaves when they do.
approach: >-
  Make the household the unit, not the user. One shared set of plants,
  schedules, and activity, synced through a small API so every phone agrees.
  Watering intervals start from species, light, and pot size, then adapt to
  each plant's real rhythm from a one-tap soil check.
outcome: >-
  A household joins with a code and from then on the plants have one shared
  history — who watered what, when, and what's due next — instead of a group
  chat full of "did anyone water the fern?"
---

Roomers is a plant-care app built for the way plants actually live: in shared homes, cared for by whoever happens to be around. Create a household, invite roommates with a code, and everyone sees the same plants, the same schedule, and the same activity log. When someone waters, everyone's phone knows — the end of double-watering and of quietly dying ferns.

The schedules are smart rather than static. Each plant's watering interval starts from its species, light conditions, and pot size, then learns the plant's real rhythm from one-tap soil checks. Feeding reminders pause automatically for winter dormancy. A curated houseplant library makes adding a plant quick, with species-specific care guides and troubleshooting attached, and photo logging keeps a visual record of how everything is doing.

Under the hood it's a SwiftUI app talking to a small Fastify + Postgres API on Railway — just enough backend to keep a household in sync, and no more.
