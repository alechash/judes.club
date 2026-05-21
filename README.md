# judes.club

Personal site of **Alec Jude Wilson** — software engineer in New York.
Writing, projects, and photography. Built with [Jekyll](https://jekyllrb.com).

## Structure

```
_config.yml          Site config
_layouts/            default · post · project
_includes/           head · nav · footer
_posts/              Blog posts (Markdown) — /writing/
_projects/           Projects collection — /projects/
assets/css/style.css The whole stylesheet
index.html           Homepage
writing/index.html   Blog index
projects/index.html  Projects index
photo.html           Photography (live stats via Unsplash worker)
legal/               Privacy policy + terms
```

## Run locally

Requires Ruby + Bundler.

```sh
bundle install
bundle exec jekyll serve --livereload
```

Then open <http://127.0.0.1:4000>.

## Add a blog post

Drop a Markdown file in `_posts/` named `YYYY-MM-DD-title.md`:

```markdown
---
title: "Your title"
date: 2026-06-01
tags: [engineering]
description: One-line summary used on cards and for SEO.
---

Write the post here.
```

It appears automatically at `/writing/title/` and on the homepage.

## Add a project

Drop a Markdown file in `_projects/` (see existing files for the full set of
fields). `order` controls its position everywhere.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with
Jekyll and publishes to GitHub Pages. In the repo settings, set
**Settings → Pages → Source** to **GitHub Actions**.
