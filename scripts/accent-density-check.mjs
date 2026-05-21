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
// v1: density gate — rejects articles whose diacritic density falls below a
//     configured threshold. Catches catastrophic stripping on narrative Italian
//     but misses partial stripping on bureaucratic-register sites (baseline
//     density ~0.02-0.04; a partially-stripped article at 0.015 looks clean).
//
// v2: word-signature gate — counts occurrences of five forms that are
//     near-impossible in clean Italian prose:
//       perche  (should be perché)
//       puo     (should be può)
//       piu     (should be più)
//       citta   (should be città)
//       e'      as free-standing word (should be è)
//     URL slugs and bare hyperlinks are stripped before matching so that
//     internal link hrefs (/perche-mangiare-di-piu/) don't trigger false
//     positives. An article is flagged when its per-article signature count
//     exceeds `signature_floor` (default 3).
//
// An article fails the gate when EITHER the density check OR the signature
// check fires.
//
// Threshold precedence: --threshold argv > site.config.yaml > default 0.01.
// Signature floor precedence: --signature-floor argv > site.config.yaml > default 3.
//
// Usage:
//   node scripts/accent-density-check.mjs [path]
//   node scripts/accent-density-check.mjs src/content/articles/ --threshold 0.04
//   node scripts/accent-density-check.mjs --site-config ./site.config.yaml
//   node scripts/accent-density-check.mjs --list-only       # report, do not fail
//   node scripts/accent-density-check.mjs --signature-floor 2
//
// site.config.yaml shape (all fields optional):
//   accent_density_check:
//     threshold: 0.04        # density floor; lower = more permissive
//     min_words: 200         # files below this word count are skipped
//     signature_floor: 3     # max tolerated word-signature hits before flag
//
// Override per-article: set `accent_density_check: skip` in frontmatter
// (rare — English or quote-heavy pieces).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const DIACRITIC_RE = /[àèéìíòóùúÀÈÉÌÍÒÓÙÚâêîôûÂÊÎÔÛ]/g;
const ITALIAN_WORD_RE = /[a-zàèéìíòóùúA-ZÀÈÉÌÍÒÓÙÚâêîôûÂÊÎÔÛ]+/g;

// v2: five word forms that are near-impossible in accent-clean Italian.
// URL slugs are stripped before matching; \b anchors prevent substring hits
// (e.g. "spunto" does not trigger "puo").
// e' as a free-standing word uses whitespace/line anchors because the
// apostrophe is not a word-boundary character in JS regex.
const WORD_SIGNATURES = [
  { name: 'perche', re: /\bperche\b/gi },
  { name: 'puo',    re: /\bpuo\b/gi },
  { name: 'piu',    re: /\bpiu\b/gi },
  { name: 'citta',  re: /\bcitta\b/gi },
  { name: "e'",     re: /(?:^|(?<=\s))e'(?=\s|$)/gim },
];

function parseArgs(argv) {
  const args = {
    paths: [],
    threshold: null,
    minWords: null,
    signatureFloor: null,
    listOnly: false,
    siteConfig: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--min-words') args.minWords = Number(argv[++i]);
    else if (a === '--signature-floor') args.signatureFloor = Number(argv[++i]);
    else if (a === '--site-config') args.siteConfig = argv[++i];
    else if (a === '--list-only') args.listOnly = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'usage: accent-density-check.mjs [path...] [--threshold N] [--min-words N] [--signature-floor N] [--site-config path] [--list-only]\n'
      );
      process.exit(0);
    } else args.paths.push(a);
  }
  if (args.paths.length === 0) args.paths.push('src/content/articles');
  return args;
}

// Read accent_density_check.{threshold,min_words} from a site config yaml.
// Returns {} when no file is found or the section is absent. Minimal hand
// parser to avoid pulling js-yaml into a pre-install context (GH Actions
// runs this before npm install in some flows).
function loadSiteConfigSection(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  let inSection = false;
  let sectionIndent = 0;
  const out = {};
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (!inSection) {
      if (line === 'accent_density_check:' || line.startsWith('accent_density_check:')) {
        inSection = true;
        sectionIndent = indent;
      }
      continue;
    }
    if (indent <= sectionIndent) break;
    const m = line.match(/^([a-z_]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^['"](.+)['"]$/, '$1');
    if (key === 'threshold') out.threshold = Number(val);
    else if (key === 'min_words') out.minWords = Number(val);
    else if (key === 'signature_floor') out.signatureFloor = Number(val);
  }
  return out;
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

// Strip markdown link targets and bare URLs so that /perche-mangiare-di-piu/
// slug fragments in hrefs do not trigger the word-signature check.
function stripUrls(text) {
  // [link text](url) — keep the display text, drop the URL
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // bare URLs
  text = text.replace(/https?:\/\/\S+/g, '');
  return text;
}

function countSignatures(text) {
  const clean = stripUrls(text);
  let total = 0;
  const breakdown = {};
  for (const sig of WORD_SIGNATURES) {
    const m = clean.match(sig.re);
    const c = m ? m.length : 0;
    if (c > 0) breakdown[sig.name] = c;
    total += c;
  }
  return { total, breakdown };
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
  const { total: sigCount, breakdown: sigBreakdown } = countSignatures(text);
  return { file, diacritics, words, density, sigCount, sigBreakdown };
}

function fmtRow({ file, diacritics, words, density, sigCount, sigBreakdown, skipped }) {
  if (skipped) return `SKIP ${file} (${skipped})`;
  const d = density.toFixed(4);
  const sigSuffix = sigCount > 0
    ? `  sigs=${sigCount}(${Object.entries(sigBreakdown).map(([k, v]) => `${k}:${v}`).join(',')})`
    : '';
  return `    diac=${String(diacritics).padStart(4)}  words=${String(words).padStart(5)}  density=${d}${sigSuffix}  ${file}`;
}

const args = parseArgs(process.argv.slice(2));

// Resolve threshold + min-words + signature-floor: argv > site.config.yaml > default.
const configPath = args.siteConfig || resolve('site.config.yaml');
const fromConfig = loadSiteConfigSection(configPath);
const threshold = args.threshold ?? fromConfig.threshold ?? 0.01;
const minWords = args.minWords ?? fromConfig.minWords ?? 200;
// signature_floor: max tolerated word-signature hits per article before flagging.
// Default 3 — the five signatures are so unambiguous in clean Italian that
// even 1-2 can indicate partial stripping, but a floor of 3 avoids noise on
// articles with a single occurrence in a quoted passage or list item. Sites
// processing bureaucratic-register copy (pensione baseline ~0.02-0.04) should
// lower this to 1-2 via site.config.yaml since density alone misses partial strips.
const signatureFloor = args.signatureFloor ?? fromConfig.signatureFloor ?? 3;
const thresholdSource = args.threshold != null
  ? 'argv'
  : fromConfig.threshold != null
    ? `site.config.yaml (${configPath})`
    : 'default';

const files = args.paths.flatMap((p) => walkMdx(resolve(p)));

if (files.length === 0) {
  process.stderr.write(`no .mdx files found under ${args.paths.join(', ')}\n`);
  process.exit(2);
}

const results = files.map(measure);
const densityFailures = [];
const sigFailures = [];
const lowWord = [];

for (const r of results) {
  if (r.skipped) continue;
  if (r.words < minWords) {
    lowWord.push(r);
    continue;
  }
  if (r.density < threshold) densityFailures.push(r);
  if (r.sigCount > signatureFloor) sigFailures.push(r);
}

const failures = [...new Set([...densityFailures, ...sigFailures])];

// Print sorted by density ascending — worst offenders first
results.sort((a, b) => (a.density ?? 1) - (b.density ?? 1));
for (const r of results) process.stdout.write(fmtRow(r) + '\n');

process.stdout.write(
  `\nchecked ${results.length} files; threshold ${threshold} (from ${thresholdSource}); min-words ${minWords}; signature-floor ${signatureFloor}; ${densityFailures.length} below density threshold; ${sigFailures.length} above signature floor; ${lowWord.length} below min-words (skipped from gate)\n`
);

if (failures.length > 0) {
  process.stdout.write('\nFAIL — likely Write-tool diacritic stripping:\n');
  for (const r of densityFailures) {
    process.stdout.write(
      `  [density] ${r.file}  (${r.diacritics} diacritics across ${r.words} words; density ${r.density.toFixed(4)} < ${threshold})\n`
    );
  }
  for (const r of sigFailures) {
    const detail = Object.entries(r.sigBreakdown).map(([k, v]) => `${k}:${v}`).join(', ');
    process.stdout.write(
      `  [sigs]    ${r.file}  (${r.sigCount} signature hits > floor ${signatureFloor}: ${detail})\n`
    );
  }
  if (!args.listOnly) process.exit(1);
}
