// Zod schema for the consumer's site.config.yaml. The integration
// loads the YAML at config:setup, validates against this schema, and
// exposes the parsed object via the virtual module
// `virtual:agentic-media/site-config`.
//
// Every site-specific string the template renders comes from here.
// Secrets (VAPID private key, push auth bearer, MongoDB URI, GH deploy
// token) NEVER live in this file — they stay in env, read by workers /
// deploy scripts, never by template-rendered pages.
import { z } from 'zod';

const TopicSchema = z.object({
  slug: z.string(),
  label: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

// A tag entry may be a bare slug string (legacy) or a {slug, label} object.
// Bare strings are normalised to {slug, label} at validation time so all
// downstream code can rely on the object shape.
const TagEntrySchema = z.union([
  z.string().transform((s) => ({ slug: s, label: s })),
  z.object({ slug: z.string(), label: z.string() }),
]);

export type TagEntry = { slug: string; label: string };

const FooterLinkSchema = z.object({
  href: z.string(),
  label: z.string(),
});

export const SiteConfigSchema = z.object({
  identity: z.object({
    name: z.string(),
    shortName: z.string().optional(),
    url: z.string().url(),
    description: z.string().default(''),
    themeColor: z.string().default('#0c1a3a'),
    language: z.string().default('it'),
    ogLocale: z.string().default('it_IT'),
  }),
  hero: z.object({
    tagline: z.string().default(''),
    headline: z.string().optional(),
    lede: z.string().optional(),
    emptyTitle: z.string().default('Nessun articolo ancora pubblicato.'),
    emptyBody: z.string().default(''),
  }).default({}),
  topics: z.array(TopicSchema).default([]),
  // Controlled vocabulary for tag chips. Each entry maps a slug (used in
  // article frontmatter `tags:` and in URLs) to a human-readable label
  // (rendered on the chip). Bare string entries are backwards-compatible
  // with the flat-slug form used before this field was introduced.
  //
  // Example (site.config.yaml):
  //   tag_vocabulary:
  //     - { slug: "isee-fisco", label: "ISEE e Fisco" }
  //     - { slug: "pensioni",   label: "Pensioni" }
  //     - "bonus"               # bare slug — label falls back to "bonus"
  tag_vocabulary: z.array(TagEntrySchema).default([]),
  /** Optional per-slug display name overrides for topic hubs. When a
   *  slug is absent from this map the template falls back to Title-Case
   *  derivation (hyphens → spaces, first letter of each word capitalised).
   *  Example (site.config.yaml):
   *    topicDisplayNames:
   *      benessere-mentale: "Benessere Mentale"
   *      bonus-e-agevolazioni: "Bonus e Agevolazioni"
   */
  topicDisplayNames: z.record(z.string(), z.string()).default({}),
  topicsPage: z.object({
    title: z.string().default('Argomenti'),
    lede: z.string().default(''),
  }).default({}),
  header: z.object({
    /** Top-nav links rendered between the logo and the Argomenti
        dropdown. Empty array = only logo + Argomenti dropdown. */
    nav: z.array(FooterLinkSchema).default([
      { href: '/',          label: 'Home' },
      { href: '/contatti/', label: 'Contatti' },
    ]),
    /** Label for the Argomenti dropdown trigger. */
    topicsLabel: z.string().default('Argomenti'),
  }).default({}),
  footer: z.object({
    disclaimer: z.string().default(''),
    copyrightHolder: z.string().optional(),
    topicsTitle: z.string().default('Argomenti'),
    linksTitle: z.string().default('Collegamenti'),
    links: z.array(FooterLinkSchema).default([
      { href: '/',                label: 'Home' },
      { href: '/chi-siamo/',      label: 'Chi siamo' },
      { href: '/contatti/',       label: 'Contatti' },
      { href: '/privacy-policy/', label: 'Privacy Policy' },
      { href: '/cookie-policy/',  label: 'Cookie Policy' },
      { href: '/feed.xml',        label: 'RSS Feed' },
    ]),
  }).default({}),
  contact: z.object({
    email: z.string().default(''),
  }).default({}),
  integrations: z.object({
    ga: z.object({
      id: z.string().default(''),
    }).default({}),
    adsense: z.object({
      client: z.string().default(''),
      adsTxtExtra: z.string().default(''),
    }).default({}),
    cmp: z.object({
      provider: z.string().default('consent.js'),
      id: z.string().default(''),
      cookieName: z.string().default('site_consent'),
      storageKey: z.string().default('site_consent'),
    }).default({}),
    push: z.object({
      enabled: z.boolean().default(false),
      vapidPublicKey: z.string().default(''),
      pushApi: z.string().default('/api/push/subscribe'),
    }).default({}),
    contact: z.object({
      // 'formspree' | 'tally' | 'web3forms' | 'mailto' | 'none'.
      // 'mailto' falls back to a mailto: action (no JS, opens user's MUA).
      // 'none' suppresses the form entirely; only the email/info column renders.
      provider: z.enum(['formspree', 'tally', 'web3forms', 'mailto', 'none']).default('mailto'),
      // Full POST endpoint for hosted form services (e.g.
      // 'https://formspree.io/f/xxxxxxx'). Required when provider is set to a
      // service; ignored for 'mailto' / 'none'.
      endpoint: z.string().default(''),
      // Path the user lands on after a successful submit. Set to a
      // dedicated thank-you page if you want analytics (`/contatti/grazie/`).
      // The default keeps them on /contatti/ with a `?sent=1` query param so
      // the page can render an inline confirmation banner.
      successPath: z.string().default('/contatti/?sent=1'),
    }).default({}),
  }).default({}),
  robots: z.object({
    disallow: z.array(z.string()).default([]),
  }).default({}),
  logo: z.object({
    top: z.string().default('BRAND'),
    middle: z.string().default(''),
    bottom: z.string().default('TEMPLATE'),
    /** Optional image logo URL. If set, replaces the text wordmark in
        Header and Footer with an <img>. Use a public-dir path like
        `/logo.svg` or `/logo.png`. SVG preferred for sharp scaling. */
    image: z.string().optional(),
    /** Optional alt text for the image logo. Falls back to identity.name
        when omitted. Only used when logo.image is set. */
    imageAlt: z.string().optional(),
    /** Optional rendered max height in px for the image logo. Default 56.
        Adjust per site if the logo's aspect ratio needs more vertical
        room. */
    imageMaxHeight: z.number().int().min(20).max(160).default(56),
  }).default({}),
  // Search / Pagefind configuration. Consumers set language-specific
  // strings here so the template stays language-agnostic.
  //
  // Example (site.config.yaml — Italian site):
  //
  //   search:
  //     path: /cerca/
  //     label: Cerca
  //     placeholder: "Cerca articoli…"
  //     uiTranslations:
  //       placeholder: "Cerca articoli…"
  //       zero_results: 'Nessun risultato per "[SEARCH_TERM]".'
  //       many_results: '[COUNT] risultati per "[SEARCH_TERM]"'
  //       one_result:   '1 risultato per "[SEARCH_TERM]"'
  //       alt_search:   'Nessun risultato per "[SEARCH_TERM]". Prova con "[DIFFERENT_TERM]"?'
  //       search_label: "Cerca in questo sito"
  //       filters_label: "Filtri"
  //       clear_search:  "Cancella"
  //       load_more:     "Carica altri risultati"
  //       search_hint:   "Inizia a scrivere per cercare…"
  search: z.object({
    /** URL path of the search results page. Default: /search/ */
    path: z.string().default('/search/'),
    /** Label shown in the sidebar widget heading and as the submit button aria-label. */
    label: z.string().default('Search'),
    /** Placeholder text for the sidebar search input. */
    placeholder: z.string().default('Search articles…'),
    /** Pagefind UI translation strings. Omit keys to use Pagefind defaults. */
    uiTranslations: z.record(z.string(), z.string()).default({}),
  }).default({}),
  // Per-site CSS variable overrides. The integration emits these as
  // `<style is:global>:root { --foo: bar; }</style>` in <head>, layered
  // AFTER the template's default tokens in `src/styles/global.css` —
  // so a consumer can repaint accent / surfaces / radii / etc. without
  // shipping a stylesheet.
  //
  // Example (site.config.yaml):
  //
  //   theme:
  //     cssVariables:
  //       "--accent": "#fd190b"
  //       "--brand-navy": "#0e2a5a"
  //       "--content-width": "1095px"
  //       "--radius-card": "8px"
  //
  // Sites that omit this block render at the template defaults. The
  // value strings are emitted verbatim — checked-in YAML, no escaping
  // beyond stripping `</style>` to defang an accidental sequence.
  theme: z.object({
    cssVariables: z.record(z.string().regex(/^--/), z.string()).default({}),
  }).default({}),
  // Hero / image dimensions. ONE source of truth consumed by:
  //   • this template (CSS vars on :root via the integration)
  //   • the lordship's writer + agent-creative (in-run image generation)
  //   • the publisher's astro-github validator (dim assertion + backfill)
  // See agentic-media/control-center/schemas/hero-dims-from-config.md.
  // Sites that omit this block render at the defaults below — identical
  // to today's behaviour. Opt-in is a single block in site.config.yaml.
  media: z.object({
    hero: z.object({
      width: z.number().int().positive().default(1600),
      height: z.number().int().positive().default(900),
      quality: z.number().int().min(1).max(100).default(78),
      formats: z.array(z.enum(['webp'])).default(['webp']),
      // List of widths (px) for build-time srcset. Empty = single-size.
      // Producers (writer/agent-creative/wp-json-sync) emit one
      // hero-{w}w.webp per width via emit_hero_set; downscale-only.
      derivatives: z.array(z.number().int().positive()).default([]),
    }).default({}),
  }).default({}),
  // Search page config. The integration injects the template's search
  // page at `search.path` so consumers need ZERO files in src/pages/.
  // All UI strings come from this block; the integration falls back to
  // the defaults below when the block is omitted.
  //
  // Example (site.config.yaml, Italian consumer):
  //   search:
  //     path: "/cerca/"
  //     label: "Cerca"
  //     placeholder: "Cerca articoli…"
  //     uiTranslations:
  //       placeholder: "Cerca articoli…"
  //       zero_results: 'Nessun risultato per "[SEARCH_TERM]".'
  //       …
  search: z.object({
    /** URL path where the search page is injected. */
    path: z.string().default('/search/'),
    /** Human-readable label used in the page title and breadcrumb. */
    label: z.string().default('Search'),
    /** Input placeholder text. */
    placeholder: z.string().default('Search articles…'),
    /** Pagefind UI translation strings. Any key absent here falls back
     *  to Pagefind's own defaults (English). */
    uiTranslations: z.record(z.string(), z.string()).default({}),
  }).default({}),
  // Opt-in feature flags. Each flag defaults to false so existing
  // consumer sites that omit this block are unaffected.
  //
  // Example (site.config.yaml):
  //   features:
  //     filterChips: true
  //     stickySidebar: true
  //     dualToneLogo: true
  features: z.object({
    /** Render a FilterChips bar on index/argomento pages. */
    filterChips: z.boolean().default(false),
    /** Enable sticky sidebar at >= 768 px viewport width. */
    stickySidebar: z.boolean().default(false),
    /** Apply dual-tone navy/gold CSS vars to the CSS wordmark logo. */
    dualToneLogo: z.boolean().default(false),
  }).default({}),

  // CI-gate config consumed by scripts/accent-density-check.mjs. Not
  // rendered at runtime. Each site declares its own diacritic-density
  // floor; the script falls back to a permissive default if absent.
  accent_density_check: z.object({
    /** Reject .mdx whose diacritics-per-Italian-word density is below this. */
    threshold: z.number().min(0).max(1).default(0.01),
    /** Files with fewer Italian-letter words are skipped from the gate. */
    min_words: z.number().int().min(0).default(200),
  }).optional(),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
