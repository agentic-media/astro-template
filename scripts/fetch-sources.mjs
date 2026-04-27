#!/usr/bin/env node
// Walk all articles, collect every unique source URL from frontmatter,
// fetch each one, parse OG / Twitter / <title> metadata, and write a
// deterministic cache to src/data/sources-cache.json. The cache is
// committed to the repo so builds are reproducible offline.
//
// Usage:
//   node scripts/fetch-sources.mjs           # only fetch URLs not in cache
//   node scripts/fetch-sources.mjs --refresh # refetch everything

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';

const ARTICLES_DIR = 'src/content/articles';
const CACHE_PATH = 'src/data/sources-cache.json';
const TIMEOUT_MS = 12_000;
const REFRESH = process.argv.includes('--refresh');

function urlKey(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}

function collectFrontmatterSources(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return [];
  const fm = m[1];
  const block = fm.match(/^sources:\n((?:\s+- url:.*\n?)+)/m);
  if (!block) return [];
  const urls = [];
  for (const line of block[1].split('\n')) {
    const u = line.match(/url:\s*"([^"]+)"/);
    if (u) urls.push(u[1]);
  }
  return urls;
}

function pickMeta($, names) {
  for (const n of names) {
    const v =
      $(`meta[property="${n}"]`).attr('content') ??
      $(`meta[name="${n}"]`).attr('content');
    if (v) return v.trim();
  }
  return null;
}

function absolutize(maybeUrl, base) {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

async function fetchOg(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          (process.env.SOURCES_USER_AGENT || 'Mozilla/5.0 (compatible; AgenticMediaBot/1.0; +https://example.com)'),
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { url, ok: false, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      pickMeta($, ['og:title', 'twitter:title']) ??
      ($('title').first().text().trim() || null);
    const description = pickMeta($, [
      'og:description',
      'twitter:description',
      'description',
    ]);
    const image = absolutize(
      pickMeta($, ['og:image', 'twitter:image', 'twitter:image:src']),
      url
    );
    const siteName =
      pickMeta($, ['og:site_name']) ??
      (() => {
        try {
          return new URL(res.url || url).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }
      })();

    return {
      url,
      finalUrl: res.url || url,
      ok: true,
      title,
      description,
      image,
      siteName,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { url, ok: false, error: String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const cache = loadCache();
  const seen = new Set();

  for (const file of readdirSync(ARTICLES_DIR)) {
    if (!file.endsWith('.mdx')) continue;
    const raw = readFileSync(join(ARTICLES_DIR, file), 'utf8');
    for (const url of collectFrontmatterSources(raw)) {
      seen.add(url);
    }
  }

  const todo = [...seen].filter((u) => REFRESH || !cache[urlKey(u)]?.ok);
  console.log(`Total URLs: ${seen.size}, to fetch: ${todo.length}`);

  // Fetch with limited concurrency
  const CONCURRENCY = 6;
  let inFlight = 0;
  let i = 0;
  await new Promise((resolve) => {
    const next = async () => {
      if (i >= todo.length && inFlight === 0) return resolve();
      while (inFlight < CONCURRENCY && i < todo.length) {
        const url = todo[i++];
        inFlight++;
        fetchOg(url).then((result) => {
          cache[urlKey(url)] = result;
          inFlight--;
          if (result.ok) {
            console.log(`  ok  ${url}  → ${result.title?.slice(0, 60) ?? ''}`);
          } else {
            console.warn(`  !!  ${url}  ${result.error}`);
          }
          next();
        });
      }
    };
    next();
  });

  // Prune entries no longer referenced
  for (const k of Object.keys(cache)) {
    const entry = cache[k];
    if (!entry?.url || !seen.has(entry.url)) delete cache[k];
  }

  saveCache(cache);
  console.log(`\nWrote ${CACHE_PATH} with ${Object.keys(cache).length} entries.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
