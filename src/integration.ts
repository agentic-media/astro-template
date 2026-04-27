// agentic-media Astro Integration
//
// Two responsibilities:
//
// 1. Load the consumer site's `site.config.yaml`, validate against
//    the SiteConfigSchema, and expose the parsed object as a virtual
//    module `virtual:agentic-media/site-config` that template files
//    import. Also propagates `identity.url` into Astro's `site:` and
//    `identity.theme/language` into a few config defaults.
//
// 2. injectRoute() every page the template ships so consuming sites
//    don't need to re-export each one. Consumers override per-route
//    by defining their own `src/pages/<route>.astro` (project routes
//    win over injected routes).
//
// Usage in consumer's astro.config.mjs:
//
//   import { defineConfig } from 'astro/config';
//   import sitemap from '@astrojs/sitemap';
//   import mdx from '@astrojs/mdx';
//   import agenticMedia from '@agentic-media/astro-template/integration';
//
//   export default defineConfig({
//     integrations: [agenticMedia(), mdx(), sitemap({ /* see EXAMPLE */ })],
//     build: { format: 'directory' },
//     trailingSlash: 'always',
//   });
//
// `site:` is filled from `site.config.yaml::identity.url`; the consumer
// doesn't repeat it in astro.config.
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { loadSiteConfig, resolveSiteConfigPath } from './lib/load-site-config.js';
import type { SiteConfig } from './site-config.js';

const ROUTES: Array<{ pattern: string; entrypoint: string }> = [
  { pattern: '/',                                 entrypoint: '@agentic-media/astro-template/pages/index.astro' },
  { pattern: '/404',                              entrypoint: '@agentic-media/astro-template/pages/404.astro' },
  { pattern: '/feed.xml',                         entrypoint: '@agentic-media/astro-template/pages/feed.xml.ts' },
  { pattern: '/ads.txt',                          entrypoint: '@agentic-media/astro-template/pages/ads.txt.ts' },
  { pattern: '/robots.txt',                       entrypoint: '@agentic-media/astro-template/pages/robots.txt.ts' },
  { pattern: '/chi-siamo',                        entrypoint: '@agentic-media/astro-template/pages/chi-siamo.astro' },
  { pattern: '/contatti',                         entrypoint: '@agentic-media/astro-template/pages/contatti.astro' },
  { pattern: '/cookie-policy',                    entrypoint: '@agentic-media/astro-template/pages/cookie-policy.astro' },
  { pattern: '/privacy-policy',                   entrypoint: '@agentic-media/astro-template/pages/privacy-policy.astro' },
  { pattern: '/pagina/[page]',                    entrypoint: '@agentic-media/astro-template/pages/pagina/[page].astro' },
  { pattern: '/argomento',                        entrypoint: '@agentic-media/astro-template/pages/argomento/index.astro' },
  { pattern: '/argomento/[topic]',                entrypoint: '@agentic-media/astro-template/pages/argomento/[topic].astro' },
  { pattern: '/argomento/[topic]/pagina/[page]',  entrypoint: '@agentic-media/astro-template/pages/argomento/[topic]/pagina/[page].astro' },
  { pattern: '/autore/[slug]',                    entrypoint: '@agentic-media/astro-template/pages/autore/[slug].astro' },
  { pattern: '/autore/[slug]/pagina/[page]',      entrypoint: '@agentic-media/astro-template/pages/autore/[slug]/pagina/[page].astro' },
  { pattern: '/[topic]/[slug]/[...page]',         entrypoint: '@agentic-media/astro-template/pages/[topic]/[slug]/[...page].astro' },
];

export interface AgenticMediaTemplateOptions {
  /**
   * Path to the YAML config file, relative to the consumer site's
   * project root. Default: `site.config.yaml`.
   */
  config?: string;
  /**
   * Route patterns to skip injecting. Use when the consumer site has a
   * radically different route at one of the template's paths and wants
   * a clean build (you can also just define the file in the consumer's
   * `src/pages/` — Astro project routes win).
   */
  excludeRoutes?: string[];
}

const VIRTUAL_ID = 'virtual:agentic-media/site-config';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

function virtualSiteConfigPlugin(siteConfig: SiteConfig): import('vite').Plugin {
  return {
    name: 'agentic-media:site-config',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        return `export default ${JSON.stringify(siteConfig)};`;
      }
      return null;
    },
  };
}

export default function agenticMediaTemplate(
  options: AgenticMediaTemplateOptions = {}
): AstroIntegration {
  const exclude = new Set(options.excludeRoutes ?? []);
  return {
    name: '@agentic-media/astro-template',
    hooks: {
      'astro:config:setup': ({ config, injectRoute, logger, updateConfig }) => {
        // Load YAML
        const ymlPath = resolveSiteConfigPath(config.root, options.config);
        const siteConfig = loadSiteConfig({ path: ymlPath });
        logSummary(logger, siteConfig);

        // Propagate identity.url to Astro's `site:` so consumers don't
        // duplicate it. Skip if astro.config already set one (consumer
        // override wins).
        const updates: Parameters<typeof updateConfig>[0] = {
          vite: { plugins: [virtualSiteConfigPlugin(siteConfig)] },
        };
        if (!config.site) {
          (updates as Record<string, unknown>).site = siteConfig.identity.url;
        }
        updateConfig(updates);

        // Inject template-provided routes.
        let count = 0;
        for (const r of ROUTES) {
          if (exclude.has(r.pattern)) continue;
          injectRoute(r);
          count++;
        }
        logger.info(`injected ${count} routes; site=${siteConfig.identity.url}`);
      },
    },
  };
}

function logSummary(logger: AstroIntegrationLogger, c: SiteConfig): void {
  logger.info(
    `loaded site.config.yaml — name="${c.identity.name}", topics=${c.topics.length}, ` +
    `cmp=${c.integrations.cmp.provider}, push=${c.integrations.push.enabled}, ` +
    `ga=${c.integrations.ga.id ? 'on' : 'off'}, adsense=${c.integrations.adsense.client ? 'on' : 'off'}`
  );
}
