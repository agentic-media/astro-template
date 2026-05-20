#!/usr/bin/env node
// Detect Write-tool diacritic stripping in Italian .mdx articles.
//
// Italian editorial prose carries a stable diacritic density (~0.07–0.11
// diacritics per Italian-letter word). The Claude Write tool silently
// normalises curly punctuation and, more dangerously for IT corpora,
// collapses accented vowels to their ASCII bases. An article that should
// read "perché", "città", "più" becomes "perche", "citta", "piu" — still
// parses, still ships green, reads like illiterate Italian.
//
// This gate counts diacritics per Italian-letter word and rejects any
// article whose density falls below --threshold (default 0.01, i.e.
// 1 diacritic per 100 words). Site-specific baselines vary: narrative
// Italian (insieme) sits at 0.07-0.11, bureaucratic Italian (pensione,
// heavy acronyms + numbers) sits at 0.02-0.04. The default catches
// catastrophic stripping (density near zero) without false-positives
// on either register; sites with rich narrative prose can raise the
// floor via --threshold in their workflow.
//
// Usage:
//   node scripts/accent-density-check.mjs [path]
//   node scripts/accent-density-check.mjs src/content/articles/ --threshold 0.04
//   node scripts/accent-density-check.mjs --list-only       # report, do not fail
//
// Override per-article: set `accent_density_check: skip` in frontmatter
// (rare — English or quote-heavy pieces).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const DIACRITIC_RE = /[àèéìíòóùúÀÈÉÌÍÒÓÙÚâêîôûÂÊÎÔÛ]/g;
const ITALIAN_WORD_RE = /[a-zàèéìíòóùúA-ZÀÈÉÌÍÒÓÙÚâêîôûÂÊÎÔÛ]+/g;

function parseArgs(argv) {
  const args = { paths: [], threshold: 0.01, minWords: 200, listOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--min-words') args.minWords = Number(argv[++i]);
    else if (a === '--list-only') args.listOnly = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'usage: accent-density-check.mjs [path...] [--threshold N] [--min-words N] [--list-only]\n'
      );
      process.exit(0);
    } else args.paths.push(a);
  }
  if (args.paths.length === 0) args.paths.push('src/content/articles');
  return args;
}

function walkMdx(root) {
  const out = [];
  const st = statSync(root);
  if (st.isFile()) {
    if (extname(root) === '.mdx') out.push(root);
    return out;
  }
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walkMdx(p));
    else if (extname(p) === '.mdx') out.push(p);
  }
  return out;
}

function splitFrontmatter(src) {
  if (!src.startsWith('---')) return { frontmatter: '', body: src };
  const end = src.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', body: src };
  return {
    frontmatter: src.slice(3, end).trim(),
    body: src.slice(end + 4).trim(),
  };
}

function hasSkipFlag(frontmatter) {
  return /^\s*accent_density_check\s*:\s*skip\s*$/m.test(frontmatter);
}

function measure(file) {
  const src = readFileSync(file, 'utf8');
  const { frontmatter, body } = splitFrontmatter(src);
  if (hasSkipFlag(frontmatter)) {
    return { file, skipped: 'frontmatter override' };
  }
  const titleMatch = frontmatter.match(/^title\s*:\s*['"]?(.+?)['"]?\s*$/m);
  const titleText = titleMatch ? titleMatch[1] : '';
  const text = `${titleText}\n${body}`;
  const diacritics = (text.match(DIACRITIC_RE) || []).length;
  const words = (text.match(ITALIAN_WORD_RE) || []).length;
  const density = words > 0 ? diacritics / words : 0;
  return { file, diacritics, words, density };
}

function fmtRow({ file, diacritics, words, density, skipped }) {
  if (skipped) return `SKIP ${file} (${skipped})`;
  const d = density.toFixed(4);
  return `${density >= 0 ? '    ' : ''}diac=${String(diacritics).padStart(4)}  words=${String(words).padStart(5)}  density=${d}  ${file}`;
}

const args = parseArgs(process.argv.slice(2));
const files = args.paths.flatMap((p) => walkMdx(resolve(p)));

if (files.length === 0) {
  process.stderr.write(`no .mdx files found under ${args.paths.join(', ')}\n`);
  process.exit(2);
}

const results = files.map(measure);
const failures = [];
const lowWord = [];

for (const r of results) {
  if (r.skipped) continue;
  if (r.words < args.minWords) {
    lowWord.push(r);
    continue;
  }
  if (r.density < args.threshold) failures.push(r);
}

// Print sorted by density ascending — worst offenders first
results.sort((a, b) => (a.density ?? 1) - (b.density ?? 1));
for (const r of results) process.stdout.write(fmtRow(r) + '\n');

process.stdout.write(
  `\nchecked ${results.length} files; ${failures.length} below threshold ${args.threshold}; ${lowWord.length} below min-words ${args.minWords} (skipped from gate)\n`
);

if (failures.length > 0) {
  process.stdout.write('\nFAIL — likely Write-tool diacritic stripping:\n');
  for (const r of failures) {
    process.stdout.write(
      `  ${r.file}  (${r.diacritics} diacritics across ${r.words} words; density ${r.density.toFixed(4)} < ${args.threshold})\n`
    );
  }
  if (!args.listOnly) process.exit(1);
}
