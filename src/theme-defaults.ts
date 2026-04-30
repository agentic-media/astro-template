// Canonical default values for every CSS custom property the
// template's components reference. The integration emits these as
// `<style is:global>:root{...}</style>` in <head>, after merging with
// the consumer's `site.config.yaml::theme.cssVariables` overrides.
//
// `src/styles/global.css` MUST NOT define any `:root { --foo: ...; }`
// rule. Defaults live here; per-site overrides live in YAML; both
// flow through one `<style>` block. One source of truth.
//
// Adding a token: add it here AND make sure components reference it
// via `var(--foo)`. Renaming: deprecate via an alias here for one
// release, then remove.
export const DEFAULT_THEME_TOKENS: Record<string, string> = {
  // Brand colours.
  '--navy':            '#0c1a3a',
  '--magenta':         '#c9356b',
  '--accent':          '#c9356b',

  // Text.
  '--contrast':        '#222222',
  '--contrast-2':      '#575760',
  '--contrast-3':      '#888891',

  // Surfaces.
  '--base':            '#f7f8f9',
  '--base-2':          '#ffffff',
  '--base-3':          '#eef0f3',

  // Hairlines.
  '--hairline':        '#b2b2be',

  // Typography.
  '--font-heading':    "'Blinker', system-ui, sans-serif",
  '--font-body':       "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",

  // Spacing.
  '--content-width':   '1000px',
  '--col-gap':         '40px',
  // Article body column on desktop. Used by .ist-single__* sections
  // so the cover, body, page nav, sources, author, post-nav all
  // share the same width and stay visually aligned.
  '--article-width':   '820px',

  // Radius.
  '--radius-card':     '10px',
  '--radius-cta':      '8px',
  '--radius-tag':      '2rem',
};
