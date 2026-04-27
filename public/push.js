/* Insieme Salute Toscana — push notifications opt-in.
 *
 * Flow:
 *  1. Cookie consent resolves → dispatch 'ist:consent-resolved'.
 *     Show the push opt-in modal IF the user hasn't already decided.
 *  2. End-of-article CTA (rendered server-side) opens the same modal
 *     when clicked.
 *  3. Modal shows topic checkboxes ("Tutte" default checked, plus per-
 *     topic overrides). On submit:
 *      - registers /sw.js
 *      - calls Notification.requestPermission()
 *      - subscribes via PushManager with VAPID public key
 *      - POSTs subscription + topics to PUSH_API
 *  4. Decision is remembered in localStorage so we don't nag.
 *
 * iOS Safari: Web Push only works in standalone PWA mode (Add to
 * Home Screen). We detect navigator.standalone and either show the
 * normal flow or display install instructions instead.
 */

(function () {
  'use strict';

  var config = window.IST_PUSH_CONFIG || {};
  var VAPID_KEY = config.vapidPublicKey || '';
  var PUSH_API  = config.pushApi || '/api/push/subscribe';
  var STORAGE_KEY = 'ist_push_decision';

  var TOPICS = config.topics || [
    { slug: 'all',                label: 'Tutte le novità',           default: true  },
    { slug: 'relazioni',          label: 'Relazioni e comunicazione', default: false },
    { slug: 'famiglia',           label: 'Famiglia e genitorialità',  default: false },
    { slug: 'benessere-mentale',  label: 'Benessere mentale',         default: false },
    { slug: 'lavoro',             label: 'Lavoro e identità',         default: false },
    { slug: 'vita-digitale',      label: 'Vita digitale',             default: false },
    { slug: 'mezza-eta',          label: 'Mezza età',                 default: false },
    { slug: 'adolescenza',        label: 'Adolescenza e giovani',     default: false },
    { slug: 'salute-corpo',       label: 'Salute e corpo',            default: false },
  ];

  // ── Capability detection ──────────────────────────────────
  var supportsPush =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  var iosNotInstalled = isIOS && !isStandalone;

  function loadDecision() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveDecision(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ── Modal rendering ───────────────────────────────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildModal() {
    var root = document.getElementById('ist-push-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ist-push-root';
      document.body.appendChild(root);
    }
    if (root.dataset.built === '1') return root;

    var topicsHtml = TOPICS
      .map(function (t) {
        return (
          '<label class="ist-push__topic">' +
            '<input type="checkbox" data-ist-push-topic="' + escapeHtml(t.slug) + '"' +
              (t.default ? ' checked' : '') + '>' +
            '<span>' + escapeHtml(t.label) + '</span>' +
          '</label>'
        );
      })
      .join('');

    var iosBanner = iosNotInstalled
      ? '<div class="ist-push__ios-tip">' +
          'Per ricevere notifiche su iPhone, prima aggiungi questo sito ' +
          'alla schermata Home: tocca il pulsante <b>Condividi</b> nella ' +
          'barra di Safari, poi <b>«Aggiungi alla schermata Home»</b>. ' +
          'Riapri il sito dall’icona e potrai attivare gli aggiornamenti.' +
        '</div>'
      : '';

    root.innerHTML =
      '<div class="ist-push__modal" hidden role="dialog" aria-modal="true" aria-labelledby="ist-push-title">' +
        '<div class="ist-push__dialog" tabindex="-1">' +
          '<h2 id="ist-push-title" class="ist-push__title">Aggiornamenti via notifica</h2>' +
          '<p class="ist-push__copy">Scegli gli argomenti su cui vuoi essere avvisato. Lasciamo «Tutte» selezionato di default — puoi sempre cambiare scelta in seguito.</p>' +
          iosBanner +
          '<div class="ist-push__topics">' + topicsHtml + '</div>' +
          '<div class="ist-push__actions">' +
            '<button type="button" class="ist-push__btn ist-push__btn--primary" data-ist-push-action="subscribe"' +
              (iosNotInstalled ? ' disabled' : '') + '>Attiva notifiche</button>' +
            '<button type="button" class="ist-push__btn ist-push__btn--secondary" data-ist-push-action="dismiss">Non ora</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    root.dataset.built = '1';
    bindModal(root);
    return root;
  }

  function getModal()  { return document.querySelector('.ist-push__modal'); }
  function getDialog() { return document.querySelector('.ist-push__dialog'); }

  function openModal() {
    if (!supportsPush) return;
    var root = buildModal();
    var modal = root.querySelector('.ist-push__modal');
    modal.removeAttribute('hidden');
    var d = getDialog();
    if (d) requestAnimationFrame(function () { d.focus(); });
    document.addEventListener('keydown', onKeydown);
  }

  function closeModal() {
    var modal = getModal();
    if (modal) modal.setAttribute('hidden', '');
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  function selectedTopics() {
    var modal = getModal();
    if (!modal) return ['all'];
    var inputs = modal.querySelectorAll('input[data-ist-push-topic]:checked');
    var out = [];
    Array.prototype.forEach.call(inputs, function (input) {
      out.push(input.getAttribute('data-ist-push-topic'));
    });
    if (out.indexOf('all') !== -1) return ['all'];
    return out.length ? out : ['all'];
  }

  // ── Service worker + subscription ─────────────────────────
  function urlBase64ToUint8Array(b64) {
    var padding = '='.repeat((4 - (b64.length % 4)) % 4);
    var base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) throw new Error('SW not supported');
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  async function subscribe(topics) {
    if (!VAPID_KEY) throw new Error('VAPID public key not configured');
    var reg = await registerSW();
    await navigator.serviceWorker.ready;

    var permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      saveDecision({ status: 'permission-denied', at: Date.now() });
      throw new Error('Permission not granted');
    }

    var existing = await reg.pushManager.getSubscription();
    var subscription =
      existing ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      }));

    var body = JSON.stringify({
      subscription: subscription.toJSON(),
      topics: topics,
      lang: 'it-IT',
      userAgent: navigator.userAgent.slice(0, 200),
    });

    await fetch(PUSH_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body,
      keepalive: true,
    });

    saveDecision({ status: 'subscribed', topics: topics, at: Date.now() });
    return subscription;
  }

  // ── Wiring ────────────────────────────────────────────────
  function bindModal(root) {
    root.addEventListener('click', async function (e) {
      var t = e.target;
      var action = t && t.getAttribute && t.getAttribute('data-ist-push-action');
      if (!action) return;

      if (action === 'dismiss') {
        saveDecision({ status: 'dismissed', at: Date.now() });
        closeModal();
        return;
      }

      if (action === 'subscribe') {
        var btn = t;
        btn.disabled = true;
        btn.textContent = 'Attivazione…';
        try {
          await subscribe(selectedTopics());
          btn.textContent = 'Attivato ✓';
          setTimeout(closeModal, 800);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Attiva notifiche';
          // The browser will show its own permission-denied state; we do
          // a quiet fallback message.
          console.warn('[push]', err);
        }
      }
    });

    document.addEventListener('ist:open-push', openModal);
  }

  function shouldOfferPush() {
    if (!supportsPush) return false;
    var d = loadDecision();
    if (!d) return true;
    // Re-prompt one week after a dismiss; never re-prompt if subscribed/denied.
    if (d.status === 'dismissed' && Date.now() - d.at > 7 * 86400000) return true;
    return false;
  }

  // After cookie consent is resolved, offer push (unless already decided).
  document.addEventListener('ist:consent-resolved', function () {
    if (shouldOfferPush()) {
      // small delay so the consent banner has time to slide away
      setTimeout(openModal, 600);
    }
  });

  // End-of-article CTA: server renders <button data-ist-push-open>;
  // hook every instance.
  function bindCTA() {
    var btns = document.querySelectorAll('[data-ist-push-open]');
    Array.prototype.forEach.call(btns, function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCTA);
  } else {
    bindCTA();
  }

  // Public API for ad-hoc triggering.
  window.istPush = {
    open: openModal,
    decision: loadDecision,
    isSupported: function () { return supportsPush; },
  };
})();
