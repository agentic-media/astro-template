#!/usr/bin/env node
// Replace Unicode curly quotes with ASCII straight quotes in the YAML
// frontmatter of .mdx files. Body content is left untouched — markdown
// renders curly quotes fine; only the frontmatter goes through js-yaml,
// which rejects "..." (smart quotes) as string delimiters with a "bad
// indentation of a mapping entry" error.
//
// Background: LLM-driven authoring tools (the Claude Edit tool, agent
// dispatchers writing fresh content) naturally emit typographic curly
// quotes. They look right to a reader, but a build that runs
// `astro:content sync` fails immediately at frontmatter parse time —
// see e.g. CF Pages build failures on insieme PRs #120 + #121
// (2026-05-20).
//
// Usage:
//   node scripts/strip-frontmatter-curly.mjs [path...]
//   node scripts/strip-frontmatter-curly.mjs src/content/articles/
//   node scripts/strip-frontmatter-curly.mjs --check src/content/articles/
//
// --check: exit 1 if any frontmatter still contains curly quotes (CI gate).
//          No file mutations.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const CURLY = {
  '“': '"',   // U+201C LEFT DOUBLE QUOTATION MARK
  '”': '"',   // U+201D RIGHT DOUBLE QUOTATION MARK
  '„': '"',   // U+201E DOUBLE LOW-9 QUOTATION MARK (rare, but seen)
  '‟': '"',   // U+201F DOUBLE HIGH-REVERSED-9 (rare)
  '‘': "'",   // U+2018 LEFT SINGLE QUOTATION MARK
  '’': "'",   // U+2019 RIGHT SINGLE QUOTATION MARK
  '‚': "'",   // U+201A SINGLE LOW-9 QUOTATION MARK
  '‛': "'",   // U+201B SINGLE HIGH-REVERSED-9
};
const CURLY_KEYS = Object.keys(CURLY);
const CURLY_RE = new RegExp(`[${CURLY_KEYS.join('')}]`, 'g');

function parseArgs(argv) {
  const args = { paths: [], check: false };
  for (const a of argv) {
    if (a === '--check') args.check = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'usage: strip-frontmatter-curly.mjs [path...] [--check]\n'
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
  if (!src.startsWith('---\n') && !src.startsWith('---\r\n')) return null;
  const after = src.indexOf('\n---\n', 4);
  if (after === -1) return null;
  return { front: src.slice(4, after), body: src.slice(after) };
}

// Detect YAML lines that use SINGLE-quote delimiters around a value.
// In single-quoted YAML strings, a literal `'` would terminate the
// string, so if such a file contains curly apostrophes (’) inside the
// single-quoted value, converting curly → straight would break the
// parse. These are rare in our corpora (everything is `"..."` outer)
// but the guard makes the tool safe to run anywhere.
const SINGLE_QUOTED_YAML_LINE = /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*'/m;

function processFile(file, checkOnly) {
  const src = readFileSync(file, 'utf8');
  const split = splitFrontmatter(src);
  if (!split) return { file, skipped: 'no frontmatter' };
  const matches = split.front.match(CURLY_RE);
  if (!matches) return { file, clean: true };
  if (SINGLE_QUOTED_YAML_LINE.test(split.front)) {
    return {
      file,
      skipped: `single-quoted YAML string detected — refusing to auto-convert (manual review recommended; ${matches.length} curly chars in frontmatter)`,
    };
  }
  if (checkOnly) return { file, badChars: matches.length, wouldFix: false };
  const fixed = split.front.replace(CURLY_RE, (c) => CURLY[c]);
  writeFileSync(file, '---\n' + fixed + split.body);
  return { file, badChars: matches.length, fixed: true };
}

const args = parseArgs(process.argv.slice(2));
const files = args.paths.flatMap((p) => walkMdx(resolve(p)));
if (files.length === 0) {
  process.stderr.write(`no .mdx files under ${args.paths.join(', ')}\n`);
  process.exit(2);
}

let bad = 0;
let fixed = 0;
for (const file of files) {
  const r = processFile(file, args.check);
  if (r.skipped) continue;
  if (r.clean) continue;
  bad += r.badChars;
  if (r.fixed) {
    process.stdout.write(`fixed ${r.badChars} curly chars in ${r.file}\n`);
    fixed++;
  } else {
    process.stdout.write(`BAD: ${r.badChars} curly chars in frontmatter of ${r.file}\n`);
  }
}

process.stdout.write(
  `\nchecked ${files.length} files; ${args.check ? `${bad} curly chars across all flagged files` : `fixed ${fixed} files (${bad} curly chars total)`}\n`
);

if (args.check && bad > 0) process.exit(1);
