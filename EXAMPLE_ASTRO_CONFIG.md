# Recommended `astro.config.mjs` for consumer sites

The sitemap integration auto-includes every static page Astro builds.
Multi-page articles (`/[topic]/[slug]/`, `/[topic]/[slug]/2/`, …) all
get their own URL — that's correct for crawling but you usually want
ONLY the canonical page-1 URL in the sitemap. Filter accordingly:

```js
// astro.config.mjs (consumer)
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    mdx(),
    sitemap({
      // Drop pagination shards (/foo/bar/2/, /foo/bar/3/, …) so only
      // the canonical page-1 URL is in the sitemap. Article body
      // pages still link rel=prev/next so search engines find them.
      filter: (page) => !/\/\d+\/?$/.test(new URL(page).pathname.replace(/\/$/, '')),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  build: { format: 'directory' },
  trailingSlash: 'always',
});
```

Astro's sitemap output appears at:
- `/sitemap-index.xml` — the index Google Search Console wants
- `/sitemap-0.xml` — actual URLs (split into multiple shards on
  larger sites)

`/robots.txt` (handled by the template's dynamic route) automatically
points GSC at `/sitemap-index.xml`.
