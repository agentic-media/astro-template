/* Insieme Salute Toscana — cookie consent + Google Consent Mode v2.
   Refactored from the original wm-static-consent v0.2.0 plugin.
   Self-contained vanilla JS, no framework dependency. */

(function () {
  'use strict';

  var config = window.IST_CONSENT_CONFIG || {};
  if (!config || !config.version) return;

  var STORAGE_KEY = config.storageKey || 'ist_consent';
  var COOKIE_NAME = config.cookieName || 'ist_consent';
  var VERSION = Number(config.version || 1);

  // ── State ───────────────────────────────────────────────────
  function baseState() {
    return {
      version: VERSION,
      timestamp: new Date().toISOString(),
      source: 'default',
      categories: {
        necessary: true,
        preferences: false,
        analytics: false,
        marketing: false,
      },
    };
  }

  // ── Cookie + storage ───────────────────────────────────────
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + (days || 180) * 86400000);
    document.cookie =
      name + '=' + encodeURIComponent(value) +
      '; expires=' + d.toUTCString() +
      '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(prefix) === 0) {
        return decodeURIComponent(parts[i].substring(prefix.length));
      }
    }
    return null;
  }

  function loadState() {
    try {
      var ls = localStorage.getItem(STORAGE_KEY);
      if (ls) {
        var parsed = JSON.parse(ls);
        if (parsed && parsed.version === VERSION) return parsed;
      }
    } catch (e) {}
    var ck = getCookie(COOKIE_NAME);
    if (ck) {
      try {
        var c = JSON.parse(ck);
        if (c && c.version === VERSION) return c;
      } catch (e) {}
    }
    return null;
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    setCookie(COOKIE_NAME, JSON.stringify(state), 180);
  }

  // ── Google Consent Mode v2 ─────────────────────────────────
  function applyGCM(state, mode) {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    window.gtag('consent', mode, {
      ad_storage:              state.categories.marketing   ? 'granted' : 'denied',
      ad_user_data:            state.categories.marketing   ? 'granted' : 'denied',
      ad_personalization:      state.categories.marketing   ? 'granted' : 'denied',
      analytics_storage:       state.categories.analytics   ? 'granted' : 'denied',
      functionality_storage:   state.categories.preferences ? 'granted' : 'denied',
      personalization_storage: state.categories.preferences ? 'granted' : 'denied',
      security_storage:        'granted',
    });
  }

  // Default-deny BEFORE anything else (Google's requirement).
  applyGCM(baseState(), 'default');

  // Restore returning user's signals.
  var initial = loadState();
  if (initial) applyGCM(initial, 'update');

  // ── setConsent / public API ────────────────────────────────
  function setConsent(partial, source) {
    var state = baseState();
    state.source = source || 'preferences';
    state.timestamp = new Date().toISOString();
    var c = partial || {};
    state.categories.preferences = !!c.preferences;
    state.categories.analytics = !!c.analytics;
    state.categories.marketing = !!c.marketing;
    saveState(state);
    applyGCM(state, 'update');
    document.dispatchEvent(new CustomEvent('ist:consent-changed', { detail: state }));
    return state;
  }

  window.istConsent = {
    can: function (cat) {
      var s = loadState();
      return s ? !!s.categories[cat] : false;
    },
    get: function () { return loadState(); },
    open: function () { openModal(); },
    set: setConsent,
  };

  // ── UI helpers ─────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(v, fallback) {
    if (!v || typeof v !== 'string') return fallback;
    if (/^https?:\/\//i.test(v) || v.charAt(0) === '/') return v;
    return fallback;
  }

  // ── Render banner + modal ──────────────────────────────────
  function renderUI() {
    var root = document.getElementById('ist-consent-root');
    if (!root) return;

    var state = loadState();
    var texts = config.texts || {};
    var cats = config.categories || {};
    var policyUrl = safeUrl(config.policyUrl, '/cookie-policy/');
    var privacyUrl = safeUrl(config.privacyUrl, '/privacy-policy/');

    var catKeys = ['necessary', 'preferences', 'analytics', 'marketing'];
    var catsHtml = '';
    for (var i = 0; i < catKeys.length; i++) {
      var key = catKeys[i];
      var cat = cats[key] || {};
      var isChecked = (state && !!state.categories[key]) || !!cat.required;
      catsHtml +=
        '<label class="ist-consent__cat">' +
          '<div class="ist-consent__cat-text">' +
            '<strong>' + escapeHtml(cat.label || key) + '</strong>' +
            '<small>' + escapeHtml(cat.description || '') + '</small>' +
          '</div>' +
          '<input type="checkbox" data-ist-consent-cat="' + escapeHtml(key) + '"' +
            (isChecked ? ' checked' : '') +
            (cat.required ? ' disabled' : '') + '>' +
        '</label>';
    }

    root.innerHTML =
      '<div class="ist-consent__banner"' + (state ? ' hidden' : '') + ' role="dialog" aria-labelledby="ist-consent-title">' +
        '<div class="ist-consent__panel">' +
          '<h2 id="ist-consent-title" class="ist-consent__title">' + escapeHtml(texts.title || 'Preferenze privacy') + '</h2>' +
          '<p class="ist-consent__copy">' + escapeHtml(texts.description || '') + ' ' +
            '<a href="' + escapeHtml(policyUrl) + '">Cookie policy</a> · ' +
            '<a href="' + escapeHtml(privacyUrl) + '">Privacy policy</a>' +
          '</p>' +
          '<div class="ist-consent__actions">' +
            '<button type="button" class="ist-consent__btn ist-consent__btn--primary" data-ist-consent-action="accept">' + escapeHtml(texts.acceptAll || 'Accetta tutto') + '</button>' +
            '<button type="button" class="ist-consent__btn ist-consent__btn--secondary" data-ist-consent-action="reject">' + escapeHtml(texts.rejectAll || 'Rifiuta tutto') + '</button>' +
            '<button type="button" class="ist-consent__btn ist-consent__btn--ghost" data-ist-consent-action="customize">' + escapeHtml(texts.customize || 'Personalizza') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ist-consent__modal" hidden role="dialog" aria-modal="true" aria-labelledby="ist-consent-modal-title">' +
        '<div class="ist-consent__dialog" tabindex="-1">' +
          '<h2 id="ist-consent-modal-title" class="ist-consent__title">' + escapeHtml(texts.title || 'Preferenze privacy') + '</h2>' +
          '<p class="ist-consent__copy">' + escapeHtml(texts.description || '') + '</p>' +
          '<div class="ist-consent__cats">' + catsHtml + '</div>' +
          '<div class="ist-consent__actions">' +
            '<button type="button" class="ist-consent__btn ist-consent__btn--primary" data-ist-consent-action="accept">' + escapeHtml(texts.acceptAll || 'Accetta tutto') + '</button>' +
            '<button type="button" class="ist-consent__btn ist-consent__btn--secondary" data-ist-consent-action="reject">' + escapeHtml(texts.rejectAll || 'Rifiuta tutto') + '</button>' +
            '<button type="button" class="ist-consent__btn ist-consent__btn--primary" data-ist-consent-action="save">' + escapeHtml(texts.save || 'Salva e chiudi') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindUI();
  }

  // ── DOM nav helpers ────────────────────────────────────────
  function getBanner() { return document.querySelector('.ist-consent__banner'); }
  function getModal() { return document.querySelector('.ist-consent__modal'); }
  function getDialog() { return document.querySelector('.ist-consent__dialog'); }

  function openModal() {
    var modal = getModal();
    if (!modal) return;
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

  function hideBanner() {
    var b = getBanner();
    if (b) b.setAttribute('hidden', '');
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  // ── Event wiring ───────────────────────────────────────────
  function bindUI() {
    var root = document.getElementById('ist-consent-root');
    if (!root) return;

    root.addEventListener('click', function (e) {
      var t = e.target;
      var action = t && t.getAttribute && t.getAttribute('data-ist-consent-action');
      if (!action) return;

      if (action === 'accept') {
        setConsent({ preferences: true, analytics: true, marketing: true }, 'banner-accept');
        hideBanner();
        closeModal();
        afterConsent();
        return;
      }
      if (action === 'reject') {
        setConsent({ preferences: false, analytics: false, marketing: false }, 'banner-reject');
        hideBanner();
        closeModal();
        afterConsent();
        return;
      }
      if (action === 'customize') {
        openModal();
        return;
      }
      if (action === 'save') {
        var modal = getModal();
        var picks = {};
        if (modal) {
          var inputs = modal.querySelectorAll('input[data-ist-consent-cat]');
          Array.prototype.forEach.call(inputs, function (input) {
            picks[input.getAttribute('data-ist-consent-cat')] = input.checked;
          });
        }
        setConsent(picks, 'modal-save');
        hideBanner();
        closeModal();
        afterConsent();
        return;
      }
    });

    document.addEventListener('ist:open-consent', openModal);
  }

  // After the user makes any choice, fire a hook so other features
  // (e.g. the push-notifications opt-in) can prompt next.
  function afterConsent() {
    document.dispatchEvent(new CustomEvent('ist:consent-resolved', {
      detail: loadState(),
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderUI);
  } else {
    renderUI();
  }
})();
