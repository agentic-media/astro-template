// Ambient declaration for the virtual module the integration registers.
// Lets template + consumer files import the parsed YAML with full
// types.
declare module 'virtual:agentic-media/site-config' {
  import type { SiteConfig } from '@agentic-media/astro-template/site-config';
  const siteConfig: SiteConfig;
  export default siteConfig;
}
