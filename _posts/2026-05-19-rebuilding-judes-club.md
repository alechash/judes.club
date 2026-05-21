---
title: "Rebuilding judes.club"
date: 2026-05-19
tags: [meta, engineering, design]
description: >-
  Why I tore down the old site and rebuilt it around writing — and why the
  new one is a quiet pile of static files instead of something clever.
---

The site you are reading is the third version of judes.club, and the first one I expect to keep for a while.

The previous version was a fullscreen slide deck — five panels you scrolled through one at a time, each with its own background photograph. It looked good in a screenshot. It was also, I eventually admitted, a website that made a single first impression and then had nowhere to put anything. There was no room to grow because every section was already a full screen.

The thing I actually wanted to do more of — write — had no home at all. So I started over.

## Writing first, everything else second

The clearest decision in this rebuild was hierarchy. A portfolio shows people what you made. Writing shows them how you think, and how you think is the part that ages well. Projects ship, get sunset, get superseded. The reasoning behind them doesn't.

So [writing](/writing/) is now the section directly under the hero, with the most visual weight on the page. Projects and photography are still here — I'm proud of both — but they sit deliberately downstream, as compact panels rather than headline acts. If you only scroll far enough to read one thing, I'd rather it be a post than a project card.

> A portfolio is a list of answers. Writing is a record of the questions.

## Why Jekyll, why static

The new site is a [Jekyll](https://jekyllrb.com) project: a folder of Markdown and HTML that compiles to plain static files. No database. No server-side runtime. No build pipeline I have to keep alive at 2 a.m.

That choice is the same argument I made in [*Boring on purpose*](/writing/boring-on-purpose/), applied to my own site. A personal site has exactly one job — be there, load fast, and not break — and it has to do that job for years with very little attention. Static files are almost unfairly good at this. The whole site is a pile of HTML a CDN can serve in its sleep.

Writing a post is now just adding a Markdown file to `_posts`:

```
_posts/2026-05-19-rebuilding-judes-club.md
```

That matters more than it sounds. The friction between *having a thought* and *publishing it* is the entire ballgame for a blog. If publishing means a deploy ceremony, I won't do it. If it means saving a text file, I might.

## What I kept

Rebuilds are tempting precisely because they let you throw everything away, and that's also their biggest trap. A few things from the old site were genuinely working, so they survived the move:

- **The look.** Dark, warm off-white type, a serif for display and a clean sans for everything else. The old site had a real visual identity. I cleaned it up rather than replacing it.
- **The photography page.** It pulls live view, like, and download counts from Unsplash, and that data is honestly the most fun part of the whole site. It would have been vandalism to remove it.
- **Restraint.** No analytics theatre, no popups, no cookie banner for cookies I don't set.

The result is a site that is mostly empty space, a navigation bar, and words. That is the version I wanted the first two times and didn't have the discipline to build. This post is the first thing written in its new home — and now that writing finally has somewhere to live, I intend to use it.
