// agentic-media Astro Integration
//
// Injects all template-provided routes into the consuming site so a
// fresh consumer doesn't need to define a single page — every URL the
// template ships gets registered automatically.
//
// Usage in consumer's astro.config.mjs:
//
//   import { defineConfig } from 'astro/config';
//   import sitemap from '@astrojs/sitemap';
//   import mdx from '@astrojs/mdx';
//   import agenticMedia from '@agentic-media/astro-template/integration';
//
//   export default defineConfig({
//     site: 'https://example.com',
//     integrations: [agenticMedia(), mdx(), sitemap({ /* see EXAMPLE_ASTRO_CONFIG */ })],
//     build: { format: 'directory' },
//     trailingSlash: 'always',
//   });
//
// Consumers can override any injected route by defining a file at the
// same path under their own src/pages/. Astro's per-project pages take
// precedence over inject-route injections.
import type { AstroIntegration } from 'astro';

const ROUTES: Array<{ pattern: string; entrypoint: string }> = [
  // Top-level
  { pattern: '/',                                 entrypoint: '@agentic-media/astro-template/pages/index.astro' },
  { pattern: '/404',                              entrypoint: '@agentic-media/astro-template/pages/404.astro' },
  { pattern: '/feed.xml',                         entrypoint: '@agentic-media/astro-template/pages/feed.xml.ts' },
  { pattern: '/ads.txt',                          entrypoint: '@agentic-media/astro-template/pages/ads.txt.ts' },
  { pattern: '/robots.txt',                       entrypoint: '@agentic-media/astro-template/pages/robots.txt.ts' },

  // Static editorial pages — consumers commonly override these to put
  // their own copy in. The template's defaults are placeholder lorem
  // ipsum scaffolds.
  { pattern: '/chi-siamo',                        entrypoint: '@agentic-media/astro-template/pages/chi-siamo.astro' },
  { pattern: '/contatti',                         entrypoint: '@agentic-media/astro-template/pages/contatti.astro' },
  { pattern: '/cookie-policy',                    entrypoint: '@agentic-media/astro-template/pages/cookie-policy.astro' },
  { pattern: '/privacy-policy',                   entrypoint: '@agentic-media/astro-template/pages/privacy-policy.astro' },

  // Pagination
  { pattern: '/pagina/[page]',                    entrypoint: '@agentic-media/astro-template/pages/pagina/[page].astro' },

  // Topic / argomento
  { pattern: '/argomento',                        entrypoint: '@agentic-media/astro-template/pages/argomento/index.astro' },
  { pattern: '/argomento/[topic]',                entrypoint: '@agentic-media/astro-template/pages/argomento/[topic].astro' },
  { pattern: '/argomento/[topic]/pagina/[page]',  entrypoint: '@agentic-media/astro-template/pages/argomento/[topic]/pagina/[page].astro' },

  // Authors / autore
  { pattern: '/autore/[slug]',                    entrypoint: '@agentic-media/astro-template/pages/autore/[slug].astro' },
  { pattern: '/autore/[slug]/pagina/[page]',      entrypoint: '@agentic-media/astro-template/pages/autore/[slug]/pagina/[page].astro' },

  // Article body — multi-page articles per /[topic]/[slug]/[...page]
  { pattern: '/[topic]/[slug]/[...page]',         entrypoint: '@agentic-media/astro-template/pages/[topic]/[slug]/[...page].astro' },
];

export interface AgenticMediaTemplateOptions {
  /**
   * Route patterns to skip injecting. Use when the consumer site wants
   * to fully replace one of the template pages with its own (you
   * could just define the file in the consumer's src/pages/ — Astro's
   * project routes win — but excluding here keeps the build cleaner).
   */
  excludeRoutes?: string[];
}

export default function agenticMediaTemplate(
  options: AgenticMediaTemplateOptions = {}
): AstroIntegration {
  const exclude = new Set(options.excludeRoutes ?? []);
  return {
    name: '@agentic-media/astro-template',
    hooks: {
      'astro:config:setup': ({ injectRoute, logger }) => {
        let count = 0;
        for (const r of ROUTES) {
          if (exclude.has(r.pattern)) continue;
          injectRoute(r);
          count++;
        }
        logger.info(`injected ${count} routes`);
      },
    },
  };
}
