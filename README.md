# astro-template

Shared Astro 6 template for editorial sites. Ships routing, layouts,
components, RSS feed, sitemap config, and a Web Push worker as a
git-installable package.

## Install

In a consuming Astro 6 project:

```bash
npm install github:agentic-media/astro-template#main
```

That gives you `@agentic-media/astro-template` as a dependency.

## Usage

```js
// astro.config.mjs (consumer)
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://example.com',
  integrations: [mdx(), sitemap()],
  build: { format: 'directory' },
  trailingSlash: 'always',
});
```

```ts
// src/content.config.ts (consumer)
export { collections } from '@agentic-media/astro-template/content';
```

```astro
---
// src/pages/index.astro (consumer)
import Base from '@agentic-media/astro-template/layouts/Base.astro';
---
<Base title="Lorem ipsum dolor sit amet" description="Sed do eiusmod tempor incididunt.">
  <h1>Lorem ipsum</h1>
  <p>Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
</Base>
```

## What you get

```
src/
  components/         # ArticleCard, AuthorBox, Breadcrumbs, Footer, Header,
                      # Page, Pagination, PullQuote, Sidebar, SourceCard,
                      # Sources, TagPill
  layouts/            # Base.astro, ArticleLayout.astro
  pages/              # index, 404, feed.xml.ts, [topic]/[slug]/[...page],
                      # argomento/[topic], autore/[slug], pagina/[page]
  styles/             # global.css
  content.config.ts   # `articles` + `authors` collection schemas
public/
  consent.js          # GDPR cookie consent banner
  push.js             # client-side push subscription helper
  sw.js               # service worker for push notifications
  fonts/              # default Blinker (latin + latin-ext)
scripts/
  fetch-sources.mjs   # crawl + cache <title>/<og:image> for citation links
  migrate-pages.mjs   # WordPress export → Astro pages migrator
workers/
  push/               # Cloudflare Worker that fans out VAPID-signed Web Push
```

### Branding

`Header.astro` and `Footer.astro` accept three optional props:

- `logoTop` (default `BRAND`) — top tier of the bi-colored wordmark
- `logoBottom` (default `TEMPLATE`) — bottom tier
- `siteName` (default `Site`) — used in nav aria-labels

Override per-site:

```astro
<Header logoTop="LOREM" logoBottom="IPSUM" siteName="Lorem Ipsum" />
```

### Content collections

`articles` schema:

```ts
title: string
description: string
ogTitle?: string
ogDescription?: string
publishedDate: string         // ISO date
modifiedDate?: string
author: string
authorSlug: string
tags: string[]
topic: string
heroImage?: string
heroImageAlt?: string
sources?: Array<{ url: string; title?: string; siteName?: string }>
```

`authors` schema:

```ts
name: string
slug: string
title: string
bio: string
bioShort: string
specialization: string[]
topics: string[]
avatar?: string
writingStyle: string
```

### URL structure

The template assumes Italian-language editorial conventions
(`/argomento/<topic>/`, `/autore/<slug>/`, `/<topic>/<slug>/`,
paginated via `/pagina/<n>/`). All canonical URLs use `Astro.site`,
so set `site:` correctly in your `astro.config.mjs`.

### Push notifications

Worker code is in `workers/push/`. Per-site setup:

1. Generate a VAPID keypair (e.g. `npx web-push generate-vapid-keys`).
2. Create two KV namespaces: `PUSH_SUBS` and `PUSH_TOPIC_INDEX`.
3. Edit `wrangler.toml` to set `name`, the route pattern, the
   `zone_name`, and the KV namespace IDs.
4. Set worker secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `PUSH_AUTH_BEARER`.
5. `npx wrangler deploy`.

The included `public/sw.js` and `public/push.js` handle the
subscriber side. Call `subscribe(topic)` from the page once the user
opts in.

## License

MIT — Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
do eiusmod tempor incididunt ut labore et dolore magna aliqua.
