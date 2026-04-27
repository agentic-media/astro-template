import siteConfig from 'virtual:agentic-media/site-config';
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const articles = await getCollection('articles');
  const sorted = articles.sort(
    (a, b) =>
      new Date(b.data.publishedDate).getTime() -
      new Date(a.data.publishedDate).getTime()
  );

  return rss({
    title: siteConfig.identity.name,
    description: siteConfig.identity.description,
    site: context.site?.toString() ?? 'https://example.com',
    language: (siteConfig.identity.language) === 'en' ? 'en-US' : 'it-IT',
    customData: `<language>${(siteConfig.identity.language) === 'en' ? 'en-US' : 'it-IT'}</language>`,
    items: sorted.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: new Date(article.data.publishedDate),
      link: `/${article.data.topic}/${article.id}/`,
      author: article.data.author,
      categories: [article.data.topic, ...article.data.tags],
    })),
  });
}
