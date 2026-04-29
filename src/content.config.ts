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
    // Enriched citations from the lordship's mongo `articles` collection.
    // Populated by the publisher's `prebuild-sources.mjs` step (which
    // resolves each `source_id` against the lordship's `sources`
    // collection). Optional: legacy articles imported before the dual-
    // write landed have no `cited_sources` and fall back to the flat
    // `sources` array above.
    cited_sources: z
      .array(
        z.object({
          source_id: z.string(),               // mongo ObjectId hex
          snippet: z.string().nullable().optional(),
          position: z.number().int().nonnegative(),
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
