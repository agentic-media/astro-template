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
  }).default({}),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
