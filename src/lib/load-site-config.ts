// Load + validate site.config.yaml. Used by the integration's
// `astro:config:setup` hook.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { SiteConfigSchema, type SiteConfig } from '../site-config.js';

export interface LoadOptions {
  /** Absolute path to the YAML file (resolved against the consumer
      site's project root). */
  path: string;
}

export function loadSiteConfig({ path }: LoadOptions): SiteConfig {
  if (!existsSync(path)) {
    throw new Error(
      `[@agentic-media/astro-template] site.config.yaml not found at ${path}.\n` +
      `Drop a file at <project-root>/site.config.yaml — see the template README for the schema.`
    );
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (e) {
    throw new Error(
      `[@agentic-media/astro-template] cannot read ${path}: ${(e as Error).message}`
    );
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (e) {
    throw new Error(
      `[@agentic-media/astro-template] ${path} is not valid YAML: ${(e as Error).message}`
    );
  }
  const result = SiteConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `[@agentic-media/astro-template] ${path} failed validation:\n${issues}`
    );
  }
  return result.data;
}

export function resolveSiteConfigPath(rootUrl: URL, override?: string): string {
  if (override) {
    return override.startsWith('/')
      ? override
      : resolve(rootUrl.pathname, override);
  }
  return resolve(rootUrl.pathname, 'site.config.yaml');
}
