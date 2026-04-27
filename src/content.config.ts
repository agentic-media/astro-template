import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    publishedDate: z.string(),
    modifiedDate: z.string().optional(),
    author: z.string(),
    authorSlug: z.string(),
    tags: z.array(z.string()),
    topic: z.string(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    sources: z
      .array(
        z.object({
          url: z.string().url(),
          title: z.string().optional(),
          siteName: z.string().optional(),
        })
      )
      .optional(),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    title: z.string(),
    bio: z.string(),
    bioShort: z.string(),
    specialization: z.array(z.string()),
    topics: z.array(z.string()),
    avatar: z.string().optional(),
    writingStyle: z.string(),
  }),
});

export const collections = { articles, authors };
