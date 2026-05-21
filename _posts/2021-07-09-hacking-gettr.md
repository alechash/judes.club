---
title: "Hacking GETTR in 34 minutes"
date: 2021-07-09
tags: [security]
description: >-
  GETTR launched as Trump world's answer to Twitter. It took me 34 minutes to
  reverse-engineer its internal API — and the thing that finally stopped me
  wasn't GETTR at all.
---

GETTR launched as the big new conservative social network — Trump world's answer to Twitter. So, naturally, the first thing I wanted to know was how it was built.

Long story short: it took me 34 minutes to reverse-engineer GETTR's internal API, and then to abuse it badly enough to get rate-limited.

It wasn't hard. What actually surprised me was how little stood in the way. There was no real API rate limit at all. To prove that to myself, I had a script create around **1,000 posts in a minute and a half** — no throttling, no checks, nothing anywhere telling me to slow down.

And here's the part I still think is funny: the thing that *finally* stopped me wasn't GETTR's API. It was Cloudflare. The rate limit that eventually kicked in was Cloudflare's generic protection sitting in front of the site — not anything GETTR had built themselves.

By the end I had an account with roughly a thousand posts on it. Scrolling from the top of them to the bottom took 22 seconds.

For a platform that launched to that much attention, that's a lot of front door left unlocked.
