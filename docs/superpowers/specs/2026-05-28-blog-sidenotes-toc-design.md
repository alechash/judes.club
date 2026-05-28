# Blog post layout: margin sidenotes + sticky TOC

Date: 2026-05-28
Status: Approved, implementing

## Goal

Give long-form posts a Tufte-style reading layout:

- **Left margin:** footnotes rendered as sidenotes, vertically aligned to the
  paragraph that references them.
- **Right margin:** a sticky table of contents that highlights the current
  section as you scroll.
- **Narrow screens:** notes collapse to tap-to-expand inline; TOC becomes a
  collapsible bar at the top.

A separate, future phase adds comments (Cloudflare Worker + D1) — designed
below but explicitly **not** built now.

## Authoring model

Authors write standard kramdown footnotes — no new syntax, no raw HTML:

```markdown
The model never writes the query.[^why]

[^why]: Read-only access still leaves room to read more than you should.
```

kramdown (GFM input, already configured) renders:

- an inline marker `<sup id="fnref:why"><a href="#fn:why" class="footnote">N</a></sup>`
- a `.footnotes` `<ol>` at the end of the post
- auto-generated IDs on every `h2`/`h3` (reused by the TOC)

JavaScript is pure progressive enhancement on top of this. With JS off, the
post degrades to normal bottom footnotes and no TOC.

## Layout

Post pages use a 3-column grid wider than the site's default `--wrap` (1180px):
a new `--wrap-post: 1320px`. The reading column stays `--read` (720px), centered.

```
[ left gutter ~1fr ] [ prose minmax(0,720px) ] [ right gutter ~1fr ]
   sidenotes (abs)          reading                  TOC (sticky)
```

- `.article-grid` is `position: relative`. Header, prose, and post-nav live in
  column 2 (rows 1–3). The TOC occupies column 3, spanning all rows, `position:
  sticky; top: 5rem` (clears the fixed navbar).
- Sidenotes are `<aside class="sidenote">` inserted in the DOM right after the
  block that references them. In wide mode they are `position: absolute`; JS sets
  their `left`/`width` (left gutter) and `top` (aligned to the marker).
- **Collision avoidance:** notes are laid out in document order; each note's top
  is `max(markerTop, previousNoteBottom + gap)` so adjacent notes never overlap.

## Responsive

- `≥ 1080px`: full three columns; sidenotes in the left gutter; sticky TOC right.
- `< 1080px`: single column. Sidenotes hidden by default; tapping a marker
  toggles the note inline below its paragraph. TOC renders as a `<details>`
  "Contents" bar after the header.
- Respects `prefers-reduced-motion`. Markers and the mobile toggle are real
  focusable controls.

## JavaScript (`assets/post.js`, post pages only)

Recomputes layout on load, `fonts.ready`, window resize (debounced), and via a
`ResizeObserver` on the prose (images shifting height). Uses an offsetParent-walk
for vertical position so the reveal-on-scroll transform doesn't skew alignment.

1. **Sidenotes** — for each `.footnotes li#fn:NAME`, clone its content into an
   `<aside class="sidenote">`, tag the marker, hide the bottom list, and lay out
   per the rules above. Wide = margin; narrow = tap-to-expand.
2. **TOC** — build a nested list from `.prose h2,h3`, inject into the gutter rail
   and a mobile `<details>`. `IntersectionObserver` sets the active section.

## Files

- `_config.yml` — exclude `docs` from the Jekyll build.
- `_layouts/post.html` — 3-col scaffold.
- `assets/css/style.css` — grid, `.sidenote`, `.toc`, responsive, footnote fallback.
- `assets/post.js` — relocation + collision layout, TOC + scroll-spy, mobile toggle.
- `_posts/2026-05-21-the-llm-never-writes-the-query.md` — a few demo footnotes.

## Comments — Cloudflare Worker (design only, not built)

Static site, so comments need a backend. The site already runs a CF Worker for
photos (`photos_api`), so this fits existing infra.

- **Worker API** at e.g. `comments.judes.club`: `GET /comments?slug=…`,
  `POST /comments`. CORS locked to judes.club.
- **D1 (SQLite)** table: `id, post_slug, parent_id, author, body, created_at,
  status (pending|approved|spam)`. Relational beats KV for threading + moderation.
- **Spam/privacy:** Cloudflare Turnstile (no third-party tracker) + IP
  rate-limit in the Worker + honeypot. New comments land `pending`.
- **Moderation:** admin endpoint behind Cloudflare Access (Google login);
  optional email-on-new-comment via MailChannels/Resend.
- **Frontend:** small script on post pages fetches approved comments, renders a
  thread, posts submissions.
- **Why not alternatives:** Giscus forces GitHub login; Disqus brings
  ads/tracking — off-brand. Worker+D1 is self-owned and privacy-respecting.
