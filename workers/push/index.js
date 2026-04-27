// Insieme Salute Toscana — push-notifications Cloudflare Worker.
//
// Endpoints (mounted at /api/push/* via wrangler.toml routes):
//
//   POST /api/push/subscribe   — store a subscription + topic list
//   POST /api/push/rotate      — replace an old subscription with a new one
//   POST /api/push/unsubscribe — remove a subscription
//   POST /api/push/send        — admin: fan out a notification (Bearer token)
//   GET  /api/push/health      — liveness check
//
// KV layout:
//   SUBS                 main map: id → JSON { endpoint, keys, topics, ua, createdAt }
//   TOPIC_INDEX          per-topic set: <topic>:<id> → "1"
//
// Where id = sha1(endpoint).hex().slice(0, 32)
//
// Web Push payload encryption uses VAPID + Aes128Gcm (RFC 8291). We
// implement just enough of it inline so the Worker has no Node deps.

// ─── Routing ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/push\/?/, '');

    // CORS for browser POSTs
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    try {
      if (path === 'health' && request.method === 'GET')      return cors(json({ ok: true }));
      if (path === 'subscribe' && request.method === 'POST')   return cors(await handleSubscribe(request, env));
      if (path === 'rotate' && request.method === 'POST')      return cors(await handleRotate(request, env));
      if (path === 'unsubscribe' && request.method === 'POST') return cors(await handleUnsubscribe(request, env));
      if (path === 'send' && request.method === 'POST')        return cors(await handleSend(request, env, ctx));
      return cors(json({ error: 'not found' }, 404));
    } catch (err) {
      return cors(json({ error: String(err && err.message || err) }, 500));
    }
  },

  async scheduled(event, env, ctx) {
    // Daily prune: walk SUBS, delete entries whose last failed send was a 410.
    // Stub for now — implement once real send volume tells us what to clean.
    return;
  },
};

function cors(res) {
  res.headers.set('access-control-allow-origin', '*');
  res.headers.set('access-control-allow-methods', 'POST, GET, OPTIONS');
  res.headers.set('access-control-allow-headers', 'content-type, authorization');
  return res;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ─── Subscription handlers ────────────────────────────────────────────────

async function handleSubscribe(request, env) {
  const { subscription, topics, lang, userAgent } = await request.json();
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return json({ error: 'invalid subscription' }, 400);
  }
  const id = await endpointId(subscription.endpoint);
  const cleanTopics = normaliseTopics(topics);

  const record = {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    topics: cleanTopics,
    lang: lang || 'it-IT',
    ua: (userAgent || '').slice(0, 200),
    createdAt: Date.now(),
  };

  await env.SUBS.put(id, JSON.stringify(record));
  await Promise.all(cleanTopics.map((t) => env.TOPIC_INDEX.put(`${t}:${id}`, '1')));

  return json({ ok: true, id });
}

async function handleRotate(request, env) {
  const { old: oldSub, new: newSub } = await request.json();
  if (!oldSub || !oldSub.endpoint || !newSub || !newSub.endpoint) {
    return json({ error: 'missing subscriptions' }, 400);
  }
  const oldId = await endpointId(oldSub.endpoint);
  const newId = await endpointId(newSub.endpoint);

  const oldRaw = await env.SUBS.get(oldId);
  const oldRec = oldRaw ? JSON.parse(oldRaw) : null;
  const topics = oldRec?.topics || ['all'];

  if (oldRec) {
    await Promise.all(oldRec.topics.map((t) => env.TOPIC_INDEX.delete(`${t}:${oldId}`)));
    await env.SUBS.delete(oldId);
  }

  const record = {
    endpoint: newSub.endpoint,
    keys: newSub.keys,
    topics,
    lang: oldRec?.lang || 'it-IT',
    ua: oldRec?.ua || '',
    createdAt: Date.now(),
  };
  await env.SUBS.put(newId, JSON.stringify(record));
  await Promise.all(topics.map((t) => env.TOPIC_INDEX.put(`${t}:${newId}`, '1')));

  return json({ ok: true, id: newId });
}

async function handleUnsubscribe(request, env) {
  const { endpoint } = await request.json();
  if (!endpoint) return json({ error: 'missing endpoint' }, 400);
  const id = await endpointId(endpoint);
  const raw = await env.SUBS.get(id);
  if (!raw) return json({ ok: true, removed: 0 });
  const rec = JSON.parse(raw);
  await Promise.all((rec.topics || []).map((t) => env.TOPIC_INDEX.delete(`${t}:${id}`)));
  await env.SUBS.delete(id);
  return json({ ok: true, removed: 1 });
}

// ─── Send (admin) ─────────────────────────────────────────────────────────

async function handleSend(request, env, ctx) {
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'unauthorized' }, 401);

  const payload = await request.json();
  const { topic = 'all', title, body, url, image } = payload;
  if (!title) return json({ error: 'title required' }, 400);

  // Collect subscriber IDs: anyone subscribed to "all" PLUS anyone
  // subscribed to this specific topic.
  const ids = new Set();
  for (const t of [topic, 'all']) {
    let cursor = undefined;
    do {
      const list = await env.TOPIC_INDEX.list({ prefix: `${t}:`, cursor });
      for (const k of list.keys) ids.add(k.name.slice(t.length + 1));
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
  }

  const message = JSON.stringify({
    title,
    body: body || '',
    url: url || '/',
    image: image || undefined,
    topic,
    tag: topic,
  });

  let sent = 0, failed = 0, gone = 0;
  for (const id of ids) {
    const raw = await env.SUBS.get(id);
    if (!raw) continue;
    const rec = JSON.parse(raw);
    try {
      const status = await sendWebPush(rec, message, env);
      if (status >= 200 && status < 300) sent++;
      else if (status === 404 || status === 410) {
        gone++;
        await Promise.all((rec.topics || []).map((t) => env.TOPIC_INDEX.delete(`${t}:${id}`)));
        await env.SUBS.delete(id);
      } else failed++;
    } catch (e) {
      failed++;
    }
  }

  return json({ ok: true, total: ids.size, sent, failed, gone });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function normaliseTopics(topics) {
  const allowed = ['all', 'relazioni', 'famiglia', 'benessere-mentale', 'lavoro',
                   'vita-digitale', 'mezza-eta', 'adolescenza', 'salute-corpo'];
  const set = new Set();
  for (const t of (topics || [])) {
    if (allowed.includes(t)) set.add(t);
  }
  if (set.has('all') || set.size === 0) return ['all'];
  return Array.from(set);
}

async function endpointId(endpoint) {
  const buf = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ─── Web Push (RFC 8291) ──────────────────────────────────────────────────
// Minimal aes128gcm payload encryption + VAPID JWT signing in one place,
// no npm dependencies.

async function sendWebPush(rec, payloadJson, env) {
  const subscription = { endpoint: rec.endpoint, keys: rec.keys };
  const audience = new URL(subscription.endpoint).origin;

  const vapid = await buildVapidJwt({
    audience,
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  });

  const encrypted = await encryptPayload(subscription, new TextEncoder().encode(payloadJson));

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      'content-length': String(encrypted.byteLength),
      ttl: '2419200',
      authorization: `vapid t=${vapid}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body: encrypted,
  });
  return res.status;
}

// VAPID JWT — ES256 signed JWT with header { alg: ES256, typ: JWT }
async function buildVapidJwt({ audience, subject, publicKey, privateKey }) {
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = base64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  }));
  const data = new TextEncoder().encode(`${header}.${payload}`);

  // The VAPID private key is supplied as a base64url-encoded raw 32-byte d.
  const dBytes = base64urlDecode(privateKey);
  const pubBytes = base64urlDecode(publicKey); // 65-byte uncompressed point

  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: base64url(pubBytes.subarray(1, 33)),
    y: base64url(pubBytes.subarray(33, 65)),
    d: base64url(dBytes),
    key_ops: ['sign'],
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data));

  return `${header}.${payload}.${base64url(sig)}`;
}

// aes128gcm encryption per RFC 8291 §3.4
async function encryptPayload(subscription, plaintext) {
  // 1. Generate ephemeral ECDH key pair (P-256).
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)); // 65 bytes

  // 2. Import recipient's public key (subscription.keys.p256dh).
  const recipientPubRaw = base64urlDecode(subscription.keys.p256dh);
  const recipientPub = await crypto.subtle.importKey(
    'raw', recipientPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );

  // 3. ECDH shared secret.
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: recipientPub }, keyPair.privateKey, 256)
  );

  // 4. HKDF inputs.
  const auth = base64urlDecode(subscription.keys.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK = HKDF-Extract(auth, ecdhSecret), info = "WebPush: info\0" || ua_public || as_public
  const prkKey = await hkdfExtract(auth, ecdhSecret);

  const info1 = concat(
    new TextEncoder().encode('WebPush: info\0'),
    recipientPubRaw,
    localPubRaw,
  );
  const ikm = await hkdfExpand(prkKey, info1, 32);

  // CEK and nonce: HKDF with new salt
  const prk2 = await hkdfExtract(salt, ikm);
  const cekBytes = await hkdfExpand(prk2, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk2, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const cek = await crypto.subtle.importKey('raw', cekBytes, { name: 'AES-GCM' }, false, ['encrypt']);

  // RFC 8291 padding: append 0x02, then any zeros up to record_size - 17
  const padded = concat(plaintext, new Uint8Array([0x02]));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, padded)
  );

  // Header: salt(16) || rs(4 BE) || idlen(1) || keyid (= ua_public, 65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(localPubRaw, 21);

  return concat(header, ciphertext);
}

async function hkdfExtract(salt, ikm) {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prkBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
  return crypto.subtle.importKey('raw', prkBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function hkdfExpand(prk, info, len) {
  const t = new Uint8Array(info.length + 1);
  t.set(info, 0);
  t[info.length] = 0x01;
  const out = new Uint8Array(await crypto.subtle.sign('HMAC', prk, t));
  return out.subarray(0, len);
}

function concat(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.byteLength; }
  return out;
}

function base64url(input) {
  if (typeof input === 'string') input = new TextEncoder().encode(input);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (s.length % 4)) % 4;
  s += '='.repeat(pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
