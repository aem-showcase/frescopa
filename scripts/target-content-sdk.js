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

  // --- Highlight overlays ---

  const HIGHLIGHT_CONTAINER_ID = 'target-content-sdk-highlights';
  const HIGHLIGHT_CLASS = 'target-content-sdk-highlight';
  const HIGHLIGHT_LABEL_CLASS = 'target-content-sdk-highlight-label';
  const HIGHLIGHT_LABEL_CARET_CLASS = 'target-content-sdk-highlight-label-caret';
  const HIGHLIGHT_DEBOUNCE_MS = 80;

  const highlightState = {
    entries: [],
    container: null,
    debounceTimer: null,
    rafId: null,
    isListening: false,
  };

  function ensureHighlightContainer() {
    if (highlightState.container && document.body.contains(highlightState.container)) {
      return highlightState.container;
    }

    const existing = document.getElementById(HIGHLIGHT_CONTAINER_ID);
    if (existing) {
      highlightState.container = existing;
      return existing;
    }

    const container = document.createElement('div');
    container.id = HIGHLIGHT_CONTAINER_ID;
    container.style.position = 'fixed';
    container.style.inset = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483000';
    document.body.appendChild(container);
    highlightState.container = container;
    return container;
  }

  function teardownHighlightListeners() {
    if (!highlightState.isListening) return;
    window.removeEventListener('scroll', scheduleHighlightReposition, true);
    window.removeEventListener('resize', scheduleHighlightReposition);
    highlightState.isListening = false;
  }

  function clearScheduledReposition() {
    if (highlightState.debounceTimer !== null) {
      window.clearTimeout(highlightState.debounceTimer);
      highlightState.debounceTimer = null;
    }
    if (highlightState.rafId !== null) {
      window.cancelAnimationFrame(highlightState.rafId);
      highlightState.rafId = null;
    }
  }

  function removeHighlights() {
    clearScheduledReposition();
    teardownHighlightListeners();
    highlightState.entries = [];
    if (highlightState.container) {
      highlightState.container.remove();
      highlightState.container = null;
    }
  }

  function isElementVisibleRect(rect) {
    return rect.width > 0 && rect.height > 0;
  }

  function updateLabelPlacement(entry, rect) {
    if (!entry.label) return;

    const label = entry.label;
    const caret = entry.caret;
    const labelHeight = label.offsetHeight || 28;
    const placeAbove = rect.top >= (labelHeight + 10);

    if (placeAbove) {
      label.style.top = `-${labelHeight + 8}px`;
      label.style.bottom = '';

      if (caret) {
        caret.style.top = '100%';
        caret.style.bottom = '';
        caret.style.borderTop = '6px solid #3b63f3';
        caret.style.borderBottom = '0';
      }
      return;
    }

    label.style.top = '8px';
    label.style.bottom = '';

    if (caret) {
      caret.style.top = '-6px';
      caret.style.bottom = '';
      caret.style.borderTop = '0';
      caret.style.borderBottom = '6px solid #3b63f3';
    }
  }

  function updateOverlayPosition(entry) {
    const rect = entry.target.getBoundingClientRect();
    const overlay = entry.overlay;

    if (!isElementVisibleRect(rect)) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'block';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    updateLabelPlacement(entry, rect);
  }

  function repositionHighlights() {
    highlightState.entries.forEach(updateOverlayPosition);
  }

  function scheduleHighlightReposition() {
    if (highlightState.debounceTimer !== null) {
      window.clearTimeout(highlightState.debounceTimer);
    }

    highlightState.debounceTimer = window.setTimeout(() => {
      highlightState.debounceTimer = null;
      if (highlightState.rafId !== null) return;

      highlightState.rafId = window.requestAnimationFrame(() => {
        highlightState.rafId = null;
        repositionHighlights();
      });
    }, HIGHLIGHT_DEBOUNCE_MS);
  }

  function getTextSlotContent(node) {
    if (!node) return '';

    const textEl = node.matches?.('[data-rsp-slot="text"]')
      ? node
      : node.querySelector?.('[data-rsp-slot="text"]');
    return textEl?.textContent?.trim() || '';
  }

  function getOverlayLabel(target) {
    const directText = getTextSlotContent(target);
    if (directText) return directText;

    const editable = target.closest?.('[data-editable="true"]');
    const editableText = getTextSlotContent(editable);
    if (editableText) return editableText;

    return target.getAttribute('data-prop')
      || editable?.getAttribute('data-prop')
      || target.getAttribute('data-target-scope')
      || target.getAttribute('data-resource')
      || editable?.getAttribute('data-resource')
      || '';
  }

  function createOverlayForTarget(target, selector) {
    const overlay = document.createElement('div');
    overlay.className = HIGHLIGHT_CLASS;
    overlay.dataset.selector = selector;
    overlay.style.position = 'fixed';
    overlay.style.boxSizing = 'border-box';
    overlay.style.border = '2px solid #3f64f4';
    overlay.style.borderRadius = '8px';
    overlay.style.background = 'transparent';
    overlay.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.9) inset';
    overlay.style.pointerEvents = 'none';

    let label = null;
    let caret = null;

    const labelText = getOverlayLabel(target);
    if (labelText) {
      label = document.createElement('div');
      label.className = HIGHLIGHT_LABEL_CLASS;
      label.textContent = labelText;
      label.style.position = 'absolute';
      label.style.top = '-36px';
      label.style.left = '-2px';
      label.style.maxWidth = 'min(280px, calc(100vw - 24px))';
      label.style.minHeight = '28px';
      label.style.display = 'inline-flex';
      label.style.alignItems = 'center';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.padding = '4px 10px';
      label.style.borderRadius = '8px';
      label.style.background = '#3b63f3';
      label.style.color = '#f7f9ff';
      label.style.font = '600 14px/18px "Adobe Clean", "AdobeClean", sans-serif';
      label.style.letterSpacing = '0';
      label.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.16)';

      caret = document.createElement('div');
      caret.className = HIGHLIGHT_LABEL_CARET_CLASS;
      caret.style.position = 'absolute';
      caret.style.left = '14px';
      caret.style.top = '100%';
      caret.style.width = '0';
      caret.style.height = '0';
      caret.style.borderLeft = '6px solid transparent';
      caret.style.borderRight = '6px solid transparent';
      caret.style.borderTop = '6px solid #3b63f3';
      label.appendChild(caret);

      overlay.appendChild(label);
    }

    return { overlay, label, caret };
  }

  function highlightElements(selectors) {
    removeHighlights();

    if (!Array.isArray(selectors) || selectors.length === 0) {
      return { overlays: 0, matchedElements: 0 };
    }

    const sanitizedSelectors = selectors.map(sanitizeSelector).filter(Boolean);
    if (sanitizedSelectors.length === 0) {
      return { overlays: 0, matchedElements: 0 };
    }

    const seenTargets = new Set();
    const entries = [];
    const container = ensureHighlightContainer();

    sanitizedSelectors.forEach((selector) => {
      let matches = [];
      try {
        matches = Array.from(document.querySelectorAll(selector));
      } catch {
        matches = [];
      }

      matches.forEach((target) => {
        if (seenTargets.has(target)) return;
        seenTargets.add(target);

        const overlayEntry = createOverlayForTarget(target, selector);
        container.appendChild(overlayEntry.overlay);
        entries.push({
          selector,
          target,
          overlay: overlayEntry.overlay,
          label: overlayEntry.label,
          caret: overlayEntry.caret,
        });
      });
    });

    highlightState.entries = entries;

    if (entries.length > 0) {
      if (!highlightState.isListening) {
        window.addEventListener('scroll', scheduleHighlightReposition, true);
        window.addEventListener('resize', scheduleHighlightReposition);
        highlightState.isListening = true;
      }
      scheduleHighlightReposition();
    }

    return { overlays: entries.length, matchedElements: entries.length };
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

  registerHandler('highlightElements', (payload) => {
    const selectors = Array.isArray(payload?.selectors) ? payload.selectors : [];
    return highlightElements(selectors);
  });

  registerHandler('clearHighlight', () => {
    removeHighlights();
    return { cleared: true };
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
      const result = handler(payload);

      if (!messageId || !event.source) return;
      event.source.postMessage({
        source: SDK_SOURCE,
        action: `${action}:response`,
        messageId,
        payload: result,
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

  window.addEventListener('beforeunload', removeHighlights);

  // eslint-disable-next-line no-console
  console.log(`[Target SDK] Initialized in ${mode} mode`);
}());
