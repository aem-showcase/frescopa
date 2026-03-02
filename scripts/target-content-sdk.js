/*
 * Target Content Frame SDK
 *
 * Loaded by target-content-sdk-loader.js inside Universal Editor.
 * Provides postMessage handlers for the UE extension wrapper.
 *
 * Message contract:
 *   source: 'target-content-sdk' (outbound) / 'ue-wrapper' (inbound)
 *   action: handler name | handler:response
 *   messageId: request/response correlation
 *   payload: action-specific data
 */
(function sdk() {
  const SDK_SOURCE = 'target-content-sdk';
  const WRAPPER_SOURCE = 'ue-wrapper';

  const scriptTag = document.currentScript;
  const mode = scriptTag?.dataset.ueMode || 'edit';
  const prodMode = scriptTag?.dataset.isProd === 'true';

  // --- Origin validation ---

  const ALLOWED_ORIGINS = [
    'https://experience.adobe.com',
    'https://experience-stage.adobe.com',
    'https://experience-qa.adobe.com',
  ];

  function isAllowedOrigin(origin) {
    if (ALLOWED_ORIGINS.some((allowed) => origin === allowed)) return true;
    if (origin.endsWith('.adobeioruntime.net')) return true;
    if (!prodMode && (origin.startsWith('https://localhost:') || origin.startsWith('http://localhost:'))) return true;
    return false;
  }

  // --- Selector sanitization ---

  function sanitizeSelector(selector) {
    if (typeof selector !== 'string') return null;
    const trimmed = selector.trim();
    if (!trimmed) return null;
    if (/<|javascript:/i.test(trimmed)) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed)) return null;
    return trimmed;
  }

  // --- Mbox scope tracking ---

  const runtimeMboxScopes = new Set();

  function addMboxScope(rawScope, scopes = runtimeMboxScopes) {
    if (typeof rawScope !== 'string') return;
    const scope = rawScope.trim();
    if (!scope || scope.length > 256) return;
    scopes.add(scope);
  }

  function collectScopesFromDelimitedValue(rawValue, scopes) {
    if (typeof rawValue !== 'string') return;
    rawValue.split(',').forEach((part) => addMboxScope(part, scopes));
  }

  function collectMboxScopesFromUrl(rawUrl, scopes) {
    if (!rawUrl) return;
    try {
      const parsedUrl = new URL(String(rawUrl), window.location.href);

      parsedUrl.searchParams.getAll('mbox').forEach((value) => collectScopesFromDelimitedValue(value, scopes));
      parsedUrl.searchParams.getAll('decisionScope').forEach((value) => collectScopesFromDelimitedValue(value, scopes));

      const mboxesValue = parsedUrl.searchParams.get('mboxes');
      if (!mboxesValue) return;

      try {
        const parsed = JSON.parse(mboxesValue);
        if (Array.isArray(parsed)) {
          parsed.forEach((value) => addMboxScope(String(value), scopes));
          return;
        }
      } catch {
        // Fall back to comma-separated text parsing.
      }

      collectScopesFromDelimitedValue(mboxesValue, scopes);
    } catch {
      // Ignore invalid URLs.
    }
  }

  function extractMboxScopesFromObject(node, scopes, seen = new Set()) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((item) => extractMboxScopesFromObject(item, scopes, seen));
      return;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (key === 'mbox') {
        if (typeof value === 'string') {
          addMboxScope(value, scopes);
        } else if (value && typeof value === 'object' && typeof value.name === 'string') {
          addMboxScope(value.name, scopes);
        }
      }

      if (key === 'mboxes' && Array.isArray(value)) {
        value.forEach((entry) => {
          if (typeof entry === 'string') {
            addMboxScope(entry, scopes);
          } else if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
            addMboxScope(entry.name, scopes);
          }
        });
      }

      if (key === 'decisionScope' && typeof value === 'string') {
        addMboxScope(value, scopes);
      }

      if (key === 'decisionScopes') {
        if (Array.isArray(value)) {
          value.forEach((entry) => addMboxScope(String(entry), scopes));
        } else if (typeof value === 'string') {
          collectScopesFromDelimitedValue(value, scopes);
        }
      }

      if (value && typeof value === 'object') {
        extractMboxScopesFromObject(value, scopes, seen);
      }
    });
  }

  function collectMboxScopesFromBody(body, scopes) {
    if (!body) return;

    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        extractMboxScopesFromObject(parsed, scopes);
        return;
      } catch {
        // Fall back to URL-encoded parsing.
      }

      const params = new URLSearchParams(body);
      params.getAll('mbox').forEach((value) => collectScopesFromDelimitedValue(value, scopes));
      const mboxesValue = params.get('mboxes');
      if (mboxesValue) {
        collectScopesFromDelimitedValue(mboxesValue, scopes);
      }
      return;
    }

    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      body.getAll('mbox').forEach((value) => collectScopesFromDelimitedValue(value, scopes));
      const mboxesValue = body.get('mboxes');
      if (mboxesValue) {
        collectScopesFromDelimitedValue(mboxesValue, scopes);
      }
      return;
    }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      body.getAll('mbox').forEach((value) => collectScopesFromDelimitedValue(String(value), scopes));
      body.getAll('mboxes').forEach((value) => collectScopesFromDelimitedValue(String(value), scopes));
      return;
    }

    if (typeof body === 'object') {
      extractMboxScopesFromObject(body, scopes);
    }
  }

  function isLikelyTargetRequest(rawUrl) {
    if (!rawUrl) return false;
    try {
      const parsedUrl = new URL(String(rawUrl), window.location.href);
      const path = parsedUrl.pathname.toLowerCase();
      const host = parsedUrl.hostname.toLowerCase();

      if (path.includes('/rest/v1/delivery') || path.includes('/rest/v1/mbox')) return true;
      if (path.includes('/mbox/')) return true;
      if (path.includes('/ee/v1/interact') || path.includes('/ee/v2/interact')) return true;
      if (host.includes('tt.omtrdc.net')) return true;
      if (host.includes('edge.adobedc.net') || host.endsWith('.adobedc.net')) return true;
      if (parsedUrl.searchParams.has('mbox') || parsedUrl.searchParams.has('mboxes')) return true;
      if (parsedUrl.searchParams.has('decisionScope') || parsedUrl.searchParams.has('decisionScopes')) return true;

      return false;
    } catch {
      return false;
    }
  }

  function collectMboxScopesFromRequest(rawUrl, body) {
    if (!isLikelyTargetRequest(rawUrl)) return;
    collectMboxScopesFromUrl(rawUrl, runtimeMboxScopes);
    collectMboxScopesFromBody(body, runtimeMboxScopes);
  }

  function collectMboxScopesFromDom() {
    const scopes = new Set();
    const elements = document.querySelectorAll('[data-target-scope]');
    elements.forEach((el) => {
      const scope = el.getAttribute('data-target-scope');
      if (scope) {
        collectScopesFromDelimitedValue(scope, scopes);
      }
    });
    return scopes;
  }

  function collectMboxScopesFromPerformance() {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return;
    }

    const entries = performance.getEntriesByType('resource');
    entries.forEach((entry) => {
      if (entry && entry.name) {
        collectMboxScopesFromRequest(entry.name, null);
      }
    });
  }

  function installNetworkScopeTracking() {
    const FETCH_PATCH_FLAG = '__targetContentSdkFetchPatch__';
    const XHR_OPEN_PATCH_FLAG = '__targetContentSdkXhrOpenPatch__';
    const XHR_SEND_PATCH_FLAG = '__targetContentSdkXhrSendPatch__';
    const XHR_URL_KEY = '__targetContentSdkRequestUrl__';

    if (typeof window.fetch === 'function' && !window.fetch[FETCH_PATCH_FLAG]) {
      const nativeFetch = window.fetch.bind(window);
      const patchedFetch = function patchedFetch(input, init) {
        const requestUrl = typeof input === 'string'
          ? input
          : (input && typeof input.url === 'string' ? input.url : String(input || ''));

        collectMboxScopesFromRequest(requestUrl, init?.body);

        if ((!init || !('body' in init)) && typeof Request !== 'undefined' && input instanceof Request) {
          try {
            input
              .clone()
              .text()
              .then((body) => collectMboxScopesFromRequest(requestUrl, body))
              .catch(() => {});
          } catch {
            // Ignore non-readable request bodies.
          }
        }

        return nativeFetch(input, init);
      };
      patchedFetch[FETCH_PATCH_FLAG] = true;
      window.fetch = patchedFetch;
    }

    if (typeof XMLHttpRequest !== 'undefined') {
      if (!XMLHttpRequest.prototype.open[XHR_OPEN_PATCH_FLAG]) {
        const nativeOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...args) {
          this[XHR_URL_KEY] = url;
          return nativeOpen.call(this, method, url, ...args);
        };
        XMLHttpRequest.prototype.open[XHR_OPEN_PATCH_FLAG] = true;
      }

      if (!XMLHttpRequest.prototype.send[XHR_SEND_PATCH_FLAG]) {
        const nativeSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function patchedSend(body) {
          collectMboxScopesFromRequest(this[XHR_URL_KEY], body);
          return nativeSend.call(this, body);
        };
        XMLHttpRequest.prototype.send[XHR_SEND_PATCH_FLAG] = true;
      }
    }
  }

  function installTargetEventScopeTracking() {
    const targetEvents = ['at-request-start', 'at-request-succeeded'];
    targetEvents.forEach((eventName) => {
      document.addEventListener(eventName, (event) => {
        if (event?.detail && typeof event.detail === 'object') {
          extractMboxScopesFromObject(event.detail, runtimeMboxScopes);
        }
      });
    });
  }

  // --- Handler registry ---

  const handlers = {};

  function registerHandler(action, handler) {
    handlers[action] = handler;
  }

  // --- Handlers ---

  registerHandler('ping', () => ({ pong: true, mode }));

  registerHandler('detect-activity-scopes', (payload) => {
    collectMboxScopesFromPerformance();

    const scopes = collectMboxScopesFromDom();
    runtimeMboxScopes.forEach((scope) => scopes.add(scope));

    const selectorMatches = {};
    const selectors = Array.isArray(payload?.selectors) ? payload.selectors : [];
    selectors.forEach((raw) => {
      const selector = sanitizeSelector(raw);
      if (!selector) {
        selectorMatches[raw] = false;
        return;
      }
      try {
        selectorMatches[raw] = document.querySelector(selector) !== null;
      } catch {
        selectorMatches[raw] = false;
      }
    });

    return { mboxScopes: Array.from(scopes), selectorMatches };
  });

  installNetworkScopeTracking();
  installTargetEventScopeTracking();
  collectMboxScopesFromPerformance();

  // --- Message listener ---

  function handleMessage(event) {
    if (!event.data || event.data.source !== WRAPPER_SOURCE) return;
    if (!isAllowedOrigin(event.origin)) return;

    const { action, messageId, payload } = event.data;
    const handler = handlers[action];

    if (handler) {
      if (!messageId || !event.source) return;
      event.source.postMessage({
        source: SDK_SOURCE,
        action: `${action}:response`,
        messageId,
        payload: handler(payload),
      }, event.origin);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[Target SDK] Unknown action: ${action}`);
    }
  }

  window.addEventListener('message', handleMessage);

  // Handshake — notify wrapper that SDK is ready
  try {
    window.parent.postMessage({ source: SDK_SOURCE, action: 'sdk-ready', mode }, '*');
  } catch { /* cross-origin parent */ }

  // eslint-disable-next-line no-console
  console.log(`[Target SDK] Initialized in ${mode} mode`);
}());
