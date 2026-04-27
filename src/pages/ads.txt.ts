import siteConfig from 'virtual:agentic-media/site-config';
// Dynamic ads.txt route. Emits the AdSense provider line based on
// PUBLIC_ADSENSE_CLIENT (Cloudflare Pages env var). When the var is
// empty, returns 200 with an empty body so crawlers see "no ads
// providers" cleanly.
//
// AdSense format: `google.com, pub-<PUB_ID>, DIRECT, f08c47fec0942fa0`
// where PUB_ID is the numeric tail of `ca-pub-<PUB_ID>`. We accept both
// the `ca-pub-XXXX` and bare `pub-XXXX` forms in PUBLIC_ADSENSE_CLIENT
// and normalise.
//
// Sites that need additional providers (ads_txt managers, exchanges,
// resellers) can override this route in their own repo or set
// PUBLIC_ADS_TXT_EXTRA to a base64-encoded string of additional lines
// to append.
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const raw = (siteConfig.integrations.adsense.client).trim();
  const extraB64 = siteConfig.integrations.adsense.adsTxtExtra;

  const lines: string[] = [];
  if (raw) {
    // Normalise: accept "ca-pub-1234567890" or "pub-1234567890"
    const norm = raw.startsWith('ca-') ? raw.slice(3) : raw;
    const pubId = norm.startsWith('pub-') ? norm : `pub-${norm}`;
    lines.push(`google.com, ${pubId}, DIRECT, f08c47fec0942fa0`);
  }
  if (extraB64) {
    try {
      const extra = atob(extraB64);
      lines.push(extra);
    } catch {
      // ignore malformed extras — rather emit a clean ads.txt than 500
    }
  }
  const body = lines.length ? lines.join('\n') + '\n' : '';
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
