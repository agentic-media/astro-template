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

### Theme — per-site CSS variable overrides

Set `theme.cssVariables` in `site.config.yaml` to override any of the
default tokens defined in `src/styles/global.css`. The integration
emits an inline `<style is:global>:root { ... }</style>` in `<head>`
after the default stylesheet, so the overrides win without shipping
a per-site CSS file.

```yaml
# site.config.yaml
theme:
  cssVariables:
    "--accent": "#fd190b"
    "--brand-navy": "#0e2a5a"
    "--content-width": "1095px"
    "--radius-card": "8px"
    "--font-body": "system-ui, -apple-system, sans-serif"
```

Keys must start with `--` (CSS custom property syntax). Values are
emitted verbatim except for a defensive strip of `</style` sequences.
Sites without the block render at the template defaults — no change
to the existing build.

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

---

## Per-site configuration

The template reads its configuration from Cloudflare Pages environment
variables (Astro exposes them via `import.meta.env.PUBLIC_*` to the
client bundle). All variables are documented in `.env.example`.

Quick summary:

| variable                       | what it gates                                                  |
|--------------------------------|----------------------------------------------------------------|
| `PUBLIC_SITE_NAME`             | display name in `<title>`, `og:site_name`                      |
| `PUBLIC_SITE_SHORT_NAME`       | `apple-mobile-web-app-title`                                   |
| `PUBLIC_THEME_COLOR`           | address-bar color                                              |
| `PUBLIC_LANGUAGE`              | `<html lang>` (default `it`)                                   |
| `PUBLIC_OG_LOCALE`             | `og:locale` (default `it_IT`)                                  |
| `PUBLIC_GA_ID`                 | Google Analytics 4 measurement ID — empty = GA never loaded    |
| `PUBLIC_ADSENSE_CLIENT`        | AdSense client (also drives `/ads.txt`)                        |
| `PUBLIC_ADS_TXT_EXTRA`         | base64-encoded extra ads.txt lines                             |
| `PUBLIC_CMP_PROVIDER`          | cookie consent banner: `consent.js` (default) or `none`        |
| `PUBLIC_PUSH_ENABLED`          | toggle the Web Push opt-in UI (`true`/`false`)                 |
| `PUBLIC_VAPID_KEY`             | VAPID public key, paired with the per-site Worker              |
| `PUBLIC_PUSH_API`              | path the Worker route handles (default `/api/push/subscribe`)  |
| `PUBLIC_ROBOTS_DISALLOW`       | comma-separated paths to disallow in `/robots.txt`             |

Set them in Cloudflare Pages → your project → Settings → Environment
variables (production AND preview, unless you only want the script in
production builds).

### Dynamic `/ads.txt`

The template includes a `src/pages/ads.txt.ts` route that emits the
AdSense provider line based on `PUBLIC_ADSENSE_CLIENT`. The site MUST
serve a matching `ads.txt` for AdSense crawlers to verify ownership;
this dynamic route is enough for most cases — when the env var is
empty, the response body is empty (200 OK).

### Dynamic `/robots.txt`

`src/pages/robots.txt.ts` emits a default-allow robots.txt and points
to the sitemap derived from `Astro.site`. Override per-route via
`PUBLIC_ROBOTS_DISALLOW`.

### Article pagination (multi-page articles)

Articles are single-page by default. To split an article into multiple
SERP-friendly pages (each its own URL with its own ad-pageview), wrap
content in `<Page>...</Page>` blocks inside the MDX body:

```mdx
---
title: ...
---
<Page>
First page content. Lorem ipsum dolor sit amet…
</Page>

<Page>
Second page content. Sed do eiusmod tempor…
</Page>
```

The route `[topic]/[slug]/[...page]` produces:
- `/[topic]/[slug]/`     → page 1
- `/[topic]/[slug]/2/`   → page 2
- …

Articles without `<Page>` wrappers are rendered as a single page (all
content under `/[topic]/[slug]/`). The choice is per-article and
controlled by the writer.
