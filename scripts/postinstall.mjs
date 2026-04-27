// postinstall: when this package is installed as a dependency, copy
// our public/ assets (fonts, push.js, consent.js, sw.js) into the
// consumer's public/ directory so Astro's build picks them up. Astro
// integrations cannot directly contribute to the public dir, so we
// hop in at install-time instead.
//
// Idempotent: skips files that already exist (so consumer overrides
// stick — drop your own /fonts/foo.woff2 in public/ and we won't
// clobber it).
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// We're running inside the dependency's directory. INIT_CWD is the
// directory `npm install` was invoked from — i.e. the consumer's repo
// root. If unset (rare), assume cwd.
const here = dirname(fileURLToPath(import.meta.url));
const tplRoot = resolve(here, '..');
const tplPublic = join(tplRoot, 'public');
const consumerRoot = process.env.INIT_CWD || process.cwd();
const consumerPublic = join(consumerRoot, 'public');

// Sanity guard: don't try to copy when we're being run from inside
// the template's own dev environment (consumer == template).
if (consumerRoot === tplRoot) {
  process.exit(0);
}

if (!existsSync(tplPublic)) {
  // Nothing to copy.
  process.exit(0);
}

let copied = 0;
let skipped = 0;

function walk(srcDir, dstDir) {
  for (const entry of readdirSync(srcDir)) {
    const src = join(srcDir, entry);
    const dst = join(dstDir, entry);
    const st = statSync(src);
    if (st.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      walk(src, dst);
    } else {
      if (existsSync(dst)) {
        skipped++;
        continue;
      }
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      copied++;
    }
  }
}

try {
  walk(tplPublic, consumerPublic);
  // Quiet on success; CF Pages logs are noisy enough.
  if (copied || skipped) {
    process.stdout.write(
      `[@agentic-media/astro-template] public/: copied ${copied}, kept ${skipped}\n`
    );
  }
} catch (e) {
  process.stderr.write(
    `[@agentic-media/astro-template] postinstall warning: ${e.message}\n`
  );
  // Never fail npm install on this — the build will surface a clearer
  // error if the assets are actually missing.
}
