// Topic filtering — show only topics that actually have at least one
// published article. The site.config.yaml::topics list is the
// declared universe; this helper returns the subset that's populated.
//
// Why centralised: Header dropdown, Footer column, Sidebar panel,
// `/argomento/` index, and the `[topic]` getStaticPaths all read the
// same list. Filtering in one place keeps them consistent — a topic
// either renders everywhere or nowhere.
//
// Why not just delete empty topics from site.config.yaml: editorial
// classification drifts faster than the YAML; a topic that's empty
// today may have articles tomorrow without a config edit. Keeping
// the declared universe in YAML and filtering at render time is the
// fewer-surprises path.
import { getCollection } from 'astro:content';
import siteConfig from 'virtual:agentic-media/site-config';

export type Topic = {
  slug: string;
  label: string;
  description?: string;
  icon?: string;
};

export type TopicWithCount = Topic & { count: number };

let cached: { byTopic: Record<string, number>; nonEmpty: TopicWithCount[] } | null = null;

async function loadCounts() {
  if (cached) return cached;
  const articles = await getCollection('articles');
  const byTopic: Record<string, number> = {};
  for (const a of articles) {
    const t = a.data.topic;
    if (t) byTopic[t] = (byTopic[t] ?? 0) + 1;
  }
  const declared = siteConfig.topics as Topic[];
  const nonEmpty: TopicWithCount[] = declared
    .map((t) => ({ ...t, count: byTopic[t.slug] ?? 0 }))
    .filter((t) => t.count > 0);
  cached = { byTopic, nonEmpty };
  return cached;
}

/** Topics declared in site.config.yaml that have ≥ 1 article. */
export async function getNonEmptyTopics(): Promise<TopicWithCount[]> {
  const { nonEmpty } = await loadCounts();
  return nonEmpty;
}

/** All declared topics with their article counts (zero included). */
export async function getTopicsWithCounts(): Promise<TopicWithCount[]> {
  const { byTopic } = await loadCounts();
  const declared = siteConfig.topics as Topic[];
  return declared.map((t) => ({ ...t, count: byTopic[t.slug] ?? 0 }));
}

/** Article count for a single topic slug. Used by argomento/[topic] guard. */
export async function getTopicCount(slug: string): Promise<number> {
  const { byTopic } = await loadCounts();
  return byTopic[slug] ?? 0;
}
