# Insieme Push Worker

Cloudflare Worker that stores Web Push subscriptions in KV and fans out
notifications signed with VAPID. Pairs with the front-end opt-in modal
in `public/push.js` and the service worker in `public/sw.js`.

## One-time setup

### 1. Install Wrangler locally (optional)

```bash
npm install -g wrangler
wrangler login
```

### 2. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

You get a `publicKey` and `privateKey`. The public key is base64url-encoded
(87 chars). The private key is base64url-encoded (43 chars). Save both.

### 3. Create the KV namespaces

```bash
cd workers/push
wrangler kv namespace create SUBS
wrangler kv namespace create TOPIC_INDEX
```

Each command prints an `id`. Paste the IDs into `wrangler.toml` in place of
`REPLACE_WITH_KV_ID`.

### 4. Set Worker secrets

```bash
wrangler secret put VAPID_PUBLIC_KEY
# paste publicKey from step 2

wrangler secret put VAPID_PRIVATE_KEY
# paste privateKey from step 2

wrangler secret put VAPID_SUBJECT
# enter mailto:admin@example.com

wrangler secret put ADMIN_TOKEN
# enter a long random string — the bearer token for /api/push/send
```

Generate a random ADMIN_TOKEN with: `openssl rand -hex 32`.

### 5. Deploy

```bash
wrangler deploy
```

### 6. Front-end env vars (Cloudflare Pages)

In the Pages project (Settings → Environment variables), add to **Production
+ Preview**:

| Variable | Value | Notes |
|---|---|---|
| `PUBLIC_VAPID_KEY` | (publicKey from step 2) | Same value the Worker uses |
| `PUBLIC_PUSH_API` | `/api/push/subscribe` | Default; only override if Worker is on a different host |

Trigger a fresh Pages build so the new env vars are baked in.

## Sending a notification

POST to `/api/push/send` with a Bearer token:

```bash
curl -X POST https://your-site.example/api/push/send \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "topic": "relazioni",
    "title": "Nuovo articolo: Bugie quotidiane",
    "body": "Cosa rivelano le piccole bugie sulle nostre relazioni.",
    "url": "/relazioni/bugie-quotidiane-cosa-rivelano-davvero-di-noi-e-delle-nostre-relazioni/",
    "image": "https://your-site.example/images/example.webp"
  }'
```

The Worker fans out to:

- everyone subscribed to **`all`** ("Tutte le novità"), AND
- everyone subscribed to the article's **specific topic**

so users with overlapping subscriptions get exactly one notification (the
fan-out de-duplicates by subscription ID).

### Trigger from CI

Add to `.github/workflows/notify-on-deploy.yml`:

```yaml
name: Push notify on deploy
on:
  push:
    branches: [astro-redesign]
    paths: ['src/content/articles/*.mdx']
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }
      - name: Detect new articles and POST to push API
        env:
          ADMIN_TOKEN: ${{ secrets.PUSH_ADMIN_TOKEN }}
        run: |
          # Diff the article folder against the previous commit; for every
          # *added* file (not modified), extract topic + title + slug from
          # frontmatter and curl the push API.
          # Implementation left as an exercise; see scripts/notify-on-new-article.sh
          ./scripts/notify-on-new-article.sh
```

## iOS support

Web Push on iOS Safari (16.4+) requires the user to first **add the site
to the Home Screen** (PWA install). The opt-in modal in `push.js` detects
iOS-not-installed and shows install instructions instead of the
"Attiva notifiche" button. Once installed and re-opened from the Home
Screen, the subscription flow works the same as Chrome / Firefox / Android.

The PWA prerequisites are already in place:

- `public/manifest.webmanifest` — `display: standalone`, themed colours
- `public/sw.js` — service worker registered at install time
- `<link rel="manifest">`, `<meta name="apple-mobile-web-app-capable">` and
  `<link rel="apple-touch-icon">` injected by `Base.astro`

## Observability

- `GET /api/push/health` → `{ "ok": true }` for uptime checks.
- `POST /api/push/send` returns `{ ok, total, sent, failed, gone }`.
  `gone` counts subscriptions that returned 404/410 — they're auto-pruned.
- Daily cron at 03:00 UTC currently a stub; extend in `scheduled()` once
  there's enough data to know what to clean.

## Costs

- KV: free tier covers 100k reads/day, 1k writes/day, 1GB storage. Each
  subscription is ~500 bytes. 100k writes ≈ 200k subscribers worth of
  initial signups; 100k reads supports ~10k push sends per day.
- Workers: free tier covers 100k requests/day. A single `/api/push/send`
  call counts as one Worker request even if it fans out to 10k pushes
  (the outgoing pushes are subrequests, capped at 50/req on free tier
  and 1000/req on paid). For larger fan-outs, batch in chunks via cron.
