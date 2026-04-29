// Ambient declaration for the virtual sources cache the integration
// registers. The plugin reads `<consumer-root>/src/data/sources-cache.json`
// at build time and exposes it here. Sites without a populated cache
// (no prebuild step yet) get an empty object and Sources.astro falls
// back to rendering plain URLs.
//
// The cache is populated by:
//   - `scripts/prebuild-sources.mjs` (mongo-backed, on the consumer
//     site; runs in the lordship sandbox where LORDSHIP_MONGO_URI is
//     reachable).
//   - `scripts/fetch-sources.mjs` (legacy, OG-only, no mongo) for
//     sites that haven't migrated.
//
// Both writers produce the same shape; the mongo-backed one
// additionally sets `source_id` so JSON-LD citation lookups resolve.
declare module 'virtual:agentic-media/sources-cache' {
  export interface CachedSource {
    url: string;
    finalUrl?: string;
    ok: boolean;
    title?: string | null;
    description?: string | null;
    image?: string | null;
    siteName?: string | null;
    fetchedAt?: string;
    /** mongo ObjectId hex — only populated when the cache came from
     * the lordship mongo `sources` collection (i.e.
     * `prebuild-sources.mjs`). Legacy `fetch-sources.mjs` output
     * leaves this undefined. */
    source_id?: string;
    error?: string;
  }
  export interface SourcesCache {
    /** Keyed on `sha1(url)[:16]` — the canonical url-key the template
     * has used since the OG-cache landed. */
    byUrlKey: Record<string, CachedSource>;
    /** Keyed on the mongo ObjectId hex. Empty when the cache came
     * from `fetch-sources.mjs` (no source_ids). */
    bySourceId: Record<string, CachedSource>;
  }
  const cache: SourcesCache;
  export default cache;
}
