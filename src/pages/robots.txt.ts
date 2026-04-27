// Dynamic robots.txt route. Allows everything by default and points
// to the sitemap derived from `Astro.site`. Set PUBLIC_ROBOTS_DISALLOW
// to a comma-separated list of paths to disallow (e.g. "/admin/,/draft/").
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const disallow = (import.meta.env.PUBLIC_ROBOTS_DISALLOW ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  const lines = ['User-agent: *'];
  if (disallow.length === 0) {
    lines.push('Allow: /');
  } else {
    for (const d of disallow) lines.push(`Disallow: ${d}`);
  }
  if (site) {
    lines.push(`Sitemap: ${new URL('sitemap-index.xml', site).toString()}`);
  }
  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
