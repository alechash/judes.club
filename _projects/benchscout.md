---
title: BenchScout
order: 2
kind: iOS &amp; Web
year: 2024
cover: /projects/benchscout.png
tagline: >-
  Live scores, stats, and deep sports history across MLB, NHL, NBA, NFL, and
  college football — one scoreboard with a real archive behind it.
description: >-
  BenchScout is a sports platform with live scores, play-by-play, odds,
  standings, news, and a historical archive reaching back to 1901.
role: Engineering &amp; Design
stack: [Next.js, TypeScript, Postgres, SwiftUI]
status: Live at benchscout.com — iOS app in development
tags: [iOS, Web, SwiftUI, 2024]
links:
  - label: benchscout.com
    url: https://benchscout.com
challenge: >-
  Live scores and sports history live in different places — score apps are
  shallow, reference sites are slow, and nothing connects tonight's game to
  the hundred seasons behind it.
approach: >-
  One platform, both halves. Real-time scores, play-by-play, odds,
  standings, and news across MLB, NHL, NBA, NFL, and college football, sitting
  on top of BenchScout's own historical archive — with features like On This Day tying the live slate back to the
  record.
outcome: >-
  A single place to follow tonight and look up forever: live games with
  highlights and recaps up front, deep league history one tap behind them.
---

BenchScout is a sports information platform covering MLB, NHL, NBA, NFL, and college football. The front of the site is the live layer: real-time scores, play-by-play, odds, game highlights and recaps, standings, and aggregated news. Live data is pulled every minute during games from the MLB Stats API, ESPN, and The Odds API. Behind it sits BenchScout's own Postgres archive — MLB back to 1901, the NHL to 1917, the NFL to 1920, and the NBA to 1946 — surfaced through dedicated league sections and an On This Day feature that connects the current slate to everything that came before it.

The web platform, built with Next.js and TypeScript, is live at [benchscout.com](https://benchscout.com). A native iOS companion built in SwiftUI, with home screen widgets and Live Activities, is in development.
