---
title: "The market won the argument: building a baseball model and betting it on Kalshi"
date: 2026-07-28
tags: [baseball, data, prediction-markets, engineering]
description: >-
  Statball started as a nostalgia project: a cream-newsprint almanac that
  replays famous games pitch by pitch. A hundred commits later it had ingested
  every game since 1901, built its own discovery engine, and was betting real
  money on Kalshi. It did not go the way the model hoped. This is the build log.
---

[Statball](https://statball.net) started as a nostalgia project. I wanted a
vintage newspaper sports page on the web — cream newsprint, condensed marquee
type, an LED scoreboard — that could replay baseball's most legendary finishes
one play at a time, with a win-probability needle swinging on every pitch.

About a hundred commits later, the same repository contained a 1.3&nbsp;GB
play-by-play database, an ML discovery engine with a false-discovery-rate
correction, a pre-registered prediction protocol, and a cron job placing
real-money orders on Kalshi with my account.

The almanac is still there. But the honest summary of the project is that I
built a toy, the toy demanded data, the data demanded a model, and the model
demanded to be tested against a market — which promptly taught it some
humility. This is the build log, including the parts that didn't work, because
those turned out to be the point.

## A newspaper that replays games

Version one shipped with six games, each hand-reconstructed from public
play-by-play: the ball through Buckner's legs in '86, Dave Roberts stealing
second in the '04 ALCS, Gibson off Eckersley, Freese twice down to his final
strike, Mazeroski's walk-off, Fisk waving it fair. You step through a game
pitch by pitch, or let it auto-play, while a retro scoreboard tracks the
score, inning, outs, and baserunners, and a win-probability chart scrubs along
underneath. Drag across the chart and the game follows your cursor.

Two early decisions aged well. First, no charting library — the
win-probability chart is hand-drawn SVG, which meant I owned every pixel when
the design later got opinionated. Second, the win probability is *derived*,
not fabricated. A small self-contained model combines the classic base-out run
expectancy table (RE24) with a run estimate for the innings still to come, and
reads the home team's win probability off a normal approximation of the run
differential. It's an approximation and the site says so, but every swing in
the chart traces back to a real change in game state rather than a designer's
sense of drama.

Around the replays grew the almanac furniture: an On This Day page, and the
Oddities file — a shelf for unassisted triple plays, immaculate innings, and
the hidden-ball trick.

## Then Retrosheet happened

Six games is a demo. Baseball has a complete, public, volunteer-maintained
record of essentially every game ever played, kept by
[Retrosheet](https://www.retrosheet.org), and once you know that, a
hand-curated archive starts to feel like a placeholder.

So the project grew an ingest pipeline: Retrosheet's event files, parsed with
the Chadwick tools, loaded into SQLite. The game-log archive covers every game
since 1901 down to the inning; the play-by-play era adds about 14.7 million
plate appearances. The events database alone is 1.3&nbsp;GB, which is a funny
thing to find inside what is nominally a Next.js side project.

The archive turned the site from a museum into an instrument. A
[Scorigami](https://statball.net/scorigami) explorer (every final score that
has ever happened, and when it happened first), team pages for every
franchise, an era toggle that follows you around the site, and replays rebuilt
out-by-out from the real sequence of events — eleven of them now, not six.

## The Lab: subtract identity until only the stories are left

With every game since 1901 in a queryable database, the tempting move is to go
anomaly fishing: scan everything, surface whatever looks weird, write it up.
The problem is that a century of baseball contains an enormous amount of
weirdness by pure chance, and a scanner with no discipline becomes a machine
for laundering noise into narrative.

The [Statball Lab](https://statball.net/lab) is my attempt to do it with
discipline. The core trick is what I'd call identity-free residuals. For each
target stat — runs, wins, home runs, strikeouts, walks, errors — a
gradient-boosted model absorbs era and context: year, month, day or night,
home or road. Then iterative backfitting removes each franchise's, ballpark's,
and opponent's long-run character. Team and park are deliberately *not*
features of the model, because a tree ensemble would happily learn year×team
interactions — which are exactly the deviations being hunted. Whatever is left
in a residual cannot be explained by when the game happened, where it
happened, or who was playing. If a residual still shows structure, something
actually happened.

On top of those residuals sit thirteen analysis families: interaction
subgroups (about twenty thousand of them), head-to-head matchup residuals,
parsed line scores, schedule and fatigue effects, season-vector outliers via
IsolationForest, year-over-year persistence, streak tests, detrended
correlations, regime change-points, and so on. Everything that comes out the
other side has passed Benjamini–Hochberg FDR control, batched permutation
tests, and bootstrap confidence intervals. The engine writes its findings —
with generated articles and chart specs — straight into the site.

The satisfying moments are when the machine rediscovers history blind. The
schedule scanner, knowing nothing but dates and times, found the blue-law
Sundays when Pennsylvania teams couldn't play at home, and the decades of
missing night games at Wrigley. The outlier family, working purely from the
geometry of standardized season vectors, flagged Connie Mack's fire-sale
Athletics as one of the largest one-winter identity shifts in the sport's
history. And the innings family established that "down one run with three
outs left" has been worth roughly the same slim chance for a century — a
constant, stable across every era it can be measured in.

## The Oracle: predicting tonight instead of explaining 1975

Explaining the past is safe. Every claim the Lab makes is checkable but also
unfalsifiable in the way that matters: nothing is at stake. So the next step
was a [prediction system](https://statball.net/model) for real games — tonight's
slate, published before first pitch, scored after the last out.

The design constraint I cared most about was that the system couldn't be
allowed to flatter itself. So the protocol is pre-registered and frozen: the
model's coefficients were fit on data before May, the feature set is fixed for
the season, and the evaluation code is treated as untouchable — editing it
would be rewriting the yardstick mid-experiment. Every pick lands in a
[public ledger](https://statball.net/record), scored game by game. When a
model change looks promising, it goes into a walk-forward research harness,
not into the live season.

## The $100 experiment

Then came the obvious question: is any of this worth money? Kalshi runs
prediction markets on MLB games, which means every night there's a real price
to disagree with.

The test was a $100 experiment replayed at real Kalshi prices over the
May-to-early-July window, under the frozen protocol, with a few
pre-registered strategies. The headline result was humbling, and it's the
single most important number the project produced: over that window, the
Kalshi close was better calibrated than the model. Market Brier score 0.2459,
model 0.2619. The market, aggregating everyone's information, is simply
sharper on average than my frozen regression.

But the experiment had a second finding. The only strategy line that made
real money was the *strong-edge* line: bet only when the model disagrees with
the price by five or more points, sized at quarter-Kelly. That line turned
$100 into $141.85. The looser line that bet every two-point disagreement
roughly broke even at $103.99 — and that's before you get rigorous about
fees.

Read together, those two results say something specific: you don't profit by
being smarter than the market on average, because you're not. If there's
profit at all, it comes from the rare nights when the model and the market
disagree *a lot*, sized fractionally, with costs priced in. Everything else
is donating the spread.

## Rebuilding the trader around a humbling result

The first live trader I wrote did not follow that lesson, and the design
review that fixed it was essentially a list of ways I was quietly lighting
money on fire.

The gate was confidence, not price: any pick the model liked at 62%+ got bet,
even when Kalshi priced the same team *higher* than the model — a
negative-expected-value trade against a market we had just measured as
sharper. There was a 3% "base stake" on edgeless picks, which converted
spread plus fees into a guaranteed drip out of the account, because Kelly on
a zero edge is zero. And the fee math was missing entirely: Kalshi's taker
fee is 0.07·P·(1−P) per contract, about 1.6 cents at mid prices — roughly
2.5% of stake, which is *larger than most of the edges being bet*.

The rebuilt trader has one gate: net edge. A signal exists only when the
model's probability beats the ask *plus the fee* by at least five points —
the pre-registered strong line, now net of costs — and only when the book is
real (a live bid, a sane ask, a spread of six cents or less; a wide or
one-sided book means the ask is stale, not cheap). Stake is quarter-Kelly on
fee-adjusted odds, capped at 10% per position and 25% per day. No base bet.
Each run cancels any resting order whose game has started or whose edge has
evaporated. Model confidence is no longer consulted at all, because a 62%
pick priced at 64 cents carries no information the price doesn't already
contain.

Operationally the whole thing is one Docker image on Railway with two jobs:
the same container that serves the site becomes the cron trader when a flag
is set. The trader defaults to dry-run; real orders require explicit intent.
The live account — the [Stake](https://statball.net/stake) — is published on
the site, wallet balance and all, because a track record you can edit isn't a
track record.

## The graveyard

The part of the project I'm proudest of is the pile of features that don't
exist.

Model improvements go through a walk-forward harness: fit on the past,
predict the future, slide the window, repeat across decades of seasons. No
peeking. The harness has now rejected, in order: lineup rating channels,
bullpen rating channels, platoon structure, park-specific home-field
advantage, starter rest days, and a seed-ensemble scheme. Built, tested,
flat. Every one of them is a real effect you can find in-sample; none of them
survived out-of-sample at game granularity, where a 60/40 edge is enormous
and most true signals are already soaked into the base rates the model
carries anyway.

Each of those features would have made the model *feel* smarter. The
walk-forward harness is what stands between "feels smarter" and the live
account, and its job is to say no. Meanwhile the live system tracks the two
leading indicators that actually predict whether this ends well: closing line
value — whether the market moves toward our price after we bet — and the
slowly accumulating forward sample.

A note on process: the four-day sprint from scaffold to trading engine was
pair-work with Claude Code — it did the typing and a lot of the arguing, I
made the calls. What kept the speed from becoming recklessness wasn't either
of us being careful in the moment; it was that every model idea, no matter
who proposed it, had to survive the same frozen protocol and the same
walk-forward gauntlet. Process beats vigilance.

## What I actually built

The about page says it in one line: *Statball builds baseball models. The
models are proprietary; the results are not.* The site has grown the full
costume of a quant firm — a research page, a published model card, a live
trading desk, even a careers page with application questions — and the
costume is doing real work, because the firm framing imposes the right
obligations. Firms publish track records. Firms eat their fees. Firms don't
retrain the model mid-season because last week felt bad.

Underneath the costume, what I actually built is a discipline machine. The
almanac was the fun part. The archive made claims checkable. The Lab added
multiple-testing hygiene so the archive couldn't be strip-mined for fake
stories. The frozen protocol made predictions falsifiable. The market priced
them, the fees taxed them, and the public ledger made the outcome
un-editable. Every stage exists to make it harder for the project to lie to
me.

The design document for the trader ends with an honesty clause, and it
belongs at the end of this post too: no configuration of this system is
guaranteed to print money. The market's aggregate calibration beats the
model's. Profit, if any, comes from rare large disagreements, sized
fractionally, with costs priced in.

The forward ledger is the arbiter. It's [public](https://statball.net/stake).
