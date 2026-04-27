#!/usr/bin/env node
// Migrate WordPress page-2 content into MDX articles.
// For each article in src/content/articles/*.mdx, fetch the page-2 HTML
// from `origin/static-staging:notizia/<slug>/2/index.html`, extract the
// body and the Fonti list, rewrite the MDX with <Page> boundaries and
// a `sources` frontmatter array.
//
// Usage:
//   node scripts/migrate-pages.mjs            # migrate all
//   node scripts/migrate-pages.mjs --slug=foo # only foo
//   node scripts/migrate-pages.mjs --dry      # don't write files

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const ARTICLES_DIR = 'src/content/articles';
const STAGING_REF = 'origin/static-staging';
const PAGE_IMPORT = `import Page from '../../components/Page.astro';`;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const onlySlug = args.find((a) => a.startsWith('--slug='))?.split('=')[1];

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});

// Keep <a> as markdown but allow target="_blank"-only attributes to drop
turndown.addRule('linkClean', {
  filter: 'a',
  replacement: (content, node) => {
    const href = node.getAttribute('href');
    if (!href) return content;
    return `[${content}](${href})`;
  },
});

function gitShow(path) {
  try {
    return execSync(`git show ${STAGING_REF}:${path}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('No frontmatter found');
  return { fm: match[1], body: match[2] };
}

function frontmatterHasSources(fm) {
  return /^sources:/m.test(fm);
}

function injectSources(fm, urls) {
  if (!urls.length) return fm;
  if (frontmatterHasSources(fm)) return fm; // already has it, leave alone
  const lines = urls.map((u) => `  - url: "${u}"`).join('\n');
  return `${fm.trimEnd()}\nsources:\n${lines}`;
}

function stripTrailingContinue(body) {
  return body.replace(/\n*Continua a leggere\s*→?\s*\n*$/u, '\n');
}

function extractFromPage2(html) {
  const $ = cheerio.load(html);
  const $entry = $('article .entry-content').first();
  if (!$entry.length) return null;

  // Sources before we strip the box
  const sources = [];
  $entry
    .find('.fonti-box a, .wp-block-list a, ul a')
    .each((_, el) => {
      const href = $(el).attr('href');
      if (href && /^https?:\/\//.test(href)) sources.push(href);
    });

  // Remove WP-only chrome from the body
  $entry.find('.fonti-box, .page-link-nav, .wm-author-box, .wp-block-heading').remove();
  $entry.find('h2.wp-block-heading, h2:contains("Ultimi articoli")').remove();
  $entry.find('script, style').remove();

  // Convert remaining HTML to MD
  let md = turndown.turndown($entry.html() || '');

  // Tidy whitespace and stray paragraphs
  md = md
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { md, sources: Array.from(new Set(sources)) };
}

function rewriteMdx({ raw, page2Md, sources }) {
  const { fm, body } = parseFrontmatter(raw);

  // Drop any pre-existing import lines for Page so we re-add a single canonical one
  let cleanBody = body
    .replace(/^\s*import\s+Page\s+from\s+['"][^'"]+['"];\s*\n/gm, '')
    .trimStart();

  cleanBody = stripTrailingContinue(cleanBody).trim();

  const newFm = injectSources(fm, sources);

  const out = [
    `---\n${newFm}\n---`,
    PAGE_IMPORT,
    '',
    '<Page>',
    '',
    cleanBody,
    '',
    '</Page>',
    '',
    '<Page>',
    '',
    page2Md,
    '',
    '</Page>',
    '',
  ].join('\n');

  return out;
}

function main() {
  const files = readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .filter((f) => !onlySlug || f.startsWith(onlySlug));

  let migrated = 0;
  let skipped = 0;
  let missing = 0;

  for (const file of files) {
    const slug = file.replace(/\.mdx$/, '');
    const path = join(ARTICLES_DIR, file);
    const raw = readFileSync(path, 'utf8');

    // Already migrated?
    if (raw.includes('<Page>')) {
      skipped++;
      continue;
    }

    const html = gitShow(`notizia/${slug}/2/index.html`);
    if (!html) {
      // No page 2: just strip the dangling line and wrap in a single <Page>
      const { fm, body } = parseFrontmatter(raw);
      const cleanBody = stripTrailingContinue(body).trim();
      const out = [
        `---\n${fm}\n---`,
        PAGE_IMPORT,
        '',
        '<Page>',
        '',
        cleanBody,
        '',
        '</Page>',
        '',
      ].join('\n');
      if (!DRY) writeFileSync(path, out);
      missing++;
      console.log(`[no-page-2] ${slug}`);
      continue;
    }

    const extracted = extractFromPage2(html);
    if (!extracted) {
      console.warn(`[no-entry-content] ${slug}`);
      skipped++;
      continue;
    }

    // Page 2 is empty (e.g. only had a <p></p>): treat as single-page,
    // still capture sources if any were on page 2.
    if (!extracted.md.trim()) {
      const { fm, body } = parseFrontmatter(raw);
      const newFm = injectSources(fm, extracted.sources);
      const cleanBody = stripTrailingContinue(body).trim();
      const out = [
        `---\n${newFm}\n---`,
        PAGE_IMPORT,
        '',
        '<Page>',
        '',
        cleanBody,
        '',
        '</Page>',
        '',
      ].join('\n');
      if (!DRY) writeFileSync(path, out);
      missing++;
      console.log(`[empty-page-2] ${slug}  (${extracted.sources.length} sources)`);
      continue;
    }

    const out = rewriteMdx({
      raw,
      page2Md: extracted.md,
      sources: extracted.sources,
    });

    if (!DRY) writeFileSync(path, out);
    migrated++;
    console.log(
      `[ok] ${slug}  (${extracted.sources.length} sources, ${extracted.md.length} chars)`
    );
  }

  console.log(
    `\nDone: migrated=${migrated} no-page-2=${missing} skipped=${skipped}`
  );
}

main();
