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

  const DEFAULT_HIGHLIGHT_THEME = {
    overlay: {
      borderColor: '#3b63fb',
      borderWidth: 2,
      borderRadius: 8,
      insetColor: 'rgba(255, 255, 255, 0.9)',
    },
    chips: {
      gap: 6,
      maxWidth: 240,
      minHeight: 20,
      paddingX: 7,
      paddingY: 1,
      borderRadius: 7,
    },
    componentChip: {
      backgroundColor: '#3b63fb',
      textColor: '#f7f9ff',
      icon: 'fileText',
    },
    audienceChip: {
      backgroundColor: '#E9E9EA',
      textColor: '#2B2B2B',
      icon: 'userGroup',
    },
  };

  function sanitizeThemeColor(value, fallback) {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue || normalizedValue.length > 64) return fallback;
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('color', normalizedValue)) {
      return fallback;
    }
    return normalizedValue;
  }

  function sanitizeThemeNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function sanitizeThemeIcon(value, fallback, allowedValues) {
    if (typeof value !== 'string') return fallback;
    return allowedValues.includes(value) ? value : fallback;
  }

  function sanitizeHighlightTheme(rawTheme) {
    const theme = (!rawTheme || typeof rawTheme !== 'object' || Array.isArray(rawTheme)) ? {} : rawTheme;
    const overlay = (!theme.overlay || typeof theme.overlay !== 'object' || Array.isArray(theme.overlay))
      ? {}
      : theme.overlay;
    const chips = (!theme.chips || typeof theme.chips !== 'object' || Array.isArray(theme.chips))
      ? {}
      : theme.chips;
    const componentChip = (!theme.componentChip || typeof theme.componentChip !== 'object' || Array.isArray(theme.componentChip))
      ? {}
      : theme.componentChip;
    const audienceChip = (!theme.audienceChip || typeof theme.audienceChip !== 'object' || Array.isArray(theme.audienceChip))
      ? {}
      : theme.audienceChip;

    return {
      overlay: {
        borderColor: sanitizeThemeColor(overlay.borderColor, DEFAULT_HIGHLIGHT_THEME.overlay.borderColor),
        borderWidth: sanitizeThemeNumber(overlay.borderWidth, DEFAULT_HIGHLIGHT_THEME.overlay.borderWidth, 1, 8),
        borderRadius: sanitizeThemeNumber(overlay.borderRadius, DEFAULT_HIGHLIGHT_THEME.overlay.borderRadius, 0, 20),
        insetColor: sanitizeThemeColor(overlay.insetColor, DEFAULT_HIGHLIGHT_THEME.overlay.insetColor),
      },
      chips: {
        gap: sanitizeThemeNumber(chips.gap, DEFAULT_HIGHLIGHT_THEME.chips.gap, 0, 16),
        maxWidth: sanitizeThemeNumber(chips.maxWidth, DEFAULT_HIGHLIGHT_THEME.chips.maxWidth, 120, 420),
        minHeight: sanitizeThemeNumber(chips.minHeight, DEFAULT_HIGHLIGHT_THEME.chips.minHeight, 16, 40),
        paddingX: sanitizeThemeNumber(chips.paddingX, DEFAULT_HIGHLIGHT_THEME.chips.paddingX, 2, 20),
        paddingY: sanitizeThemeNumber(chips.paddingY, DEFAULT_HIGHLIGHT_THEME.chips.paddingY, 0, 12),
        borderRadius: sanitizeThemeNumber(chips.borderRadius, DEFAULT_HIGHLIGHT_THEME.chips.borderRadius, 0, 16),
      },
      componentChip: {
        backgroundColor: sanitizeThemeColor(
          componentChip.backgroundColor,
          DEFAULT_HIGHLIGHT_THEME.componentChip.backgroundColor
        ),
        textColor: sanitizeThemeColor(componentChip.textColor, DEFAULT_HIGHLIGHT_THEME.componentChip.textColor),
        icon: sanitizeThemeIcon(componentChip.icon, DEFAULT_HIGHLIGHT_THEME.componentChip.icon, ['fileText', 'none']),
      },
      audienceChip: {
        backgroundColor: sanitizeThemeColor(
          audienceChip.backgroundColor,
          DEFAULT_HIGHLIGHT_THEME.audienceChip.backgroundColor
        ),
        textColor: sanitizeThemeColor(audienceChip.textColor, DEFAULT_HIGHLIGHT_THEME.audienceChip.textColor),
        icon: sanitizeThemeIcon(audienceChip.icon, DEFAULT_HIGHLIGHT_THEME.audienceChip.icon, ['userGroup', 'none']),
      },
    };
  }

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
    const primaryCaretColor = entry.primaryCaretColor || DEFAULT_HIGHLIGHT_THEME.componentChip.backgroundColor;
    const labelHeight = label.offsetHeight || 24;
    const placeAbove = rect.top >= (labelHeight + 4);

    if (placeAbove) {
      label.style.top = `-${labelHeight + 3}px`;
      label.style.bottom = '';

      if (caret) {
        caret.style.top = '100%';
        caret.style.bottom = '';
        caret.style.borderTop = `6px solid ${primaryCaretColor}`;
        caret.style.borderBottom = '0';
      }
      return;
    }

    label.style.top = '4px';
    label.style.bottom = '';

    if (caret) {
      caret.style.top = '-6px';
      caret.style.bottom = '';
      caret.style.borderTop = '0';
      caret.style.borderBottom = `6px solid ${primaryCaretColor}`;
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

    if (node.matches?.('[data-rsp-slot="text"]')) {
      return node.textContent?.replace(/\s+/g, ' ').trim() || '';
    }

    if (typeof node.querySelectorAll === 'function') {
      const textSlots = Array.from(node.querySelectorAll('[data-rsp-slot="text"]'));
      for (let i = textSlots.length - 1; i >= 0; i -= 1) {
        const text = textSlots[i]?.textContent?.replace(/\s+/g, ' ').trim();
        if (text) {
          return text;
        }
      }
    }

    return '';
  }

  function getMeaningfulElementText(node) {
    if (!node) return '';

    const raw = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';

    // Ignore long/path-like strings so labels remain human-readable.
    if (raw.length > 80) return '';
    if (raw.startsWith('/content/')) return '';
    if (/^\/[A-Za-z0-9_./:-]+$/.test(raw)) return '';

    return raw;
  }

  function getAuthoringOverlayTextAtTarget(target) {
    if (!target || typeof document.elementsFromPoint !== 'function') {
      return '';
    }

    const rect = target.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return '';
    }

    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + (rect.width / 2)));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + (rect.height / 2)));

    const stack = document.elementsFromPoint(x, y);
    for (const element of stack) {
      const editable = element?.closest?.('[data-editable="true"]') || null;
      const overlayText = getTextSlotContent(editable);
      if (overlayText) {
        return overlayText;
      }
    }

    return '';
  }

  function getOverlayLabel(target) {
    const directText = getTextSlotContent(target);
    if (directText) return directText;

    const editable = target.closest?.('[data-editable="true"]');
    const editableText = getTextSlotContent(editable);
    if (editableText) return editableText;

    const overlayText = getAuthoringOverlayTextAtTarget(target);
    if (overlayText) return overlayText;

    // For VEC absolute selectors, target is often an anchor/button in content frame.
    const semanticTargetText = getMeaningfulElementText(target);
    if (semanticTargetText) return semanticTargetText;

    if (target.matches?.('[data-editable="true"]')) {
      const textFromContent = target.textContent?.replace(/\s+/g, ' ').trim();
      if (textFromContent) {
        return textFromContent.slice(0, 80);
      }
    }

    return target.getAttribute('data-prop')
      || editable?.getAttribute('data-prop')
      || target.getAttribute('data-target-scope')
      || editable?.getAttribute('data-target-scope')
      || '';
  }

  function getLabelFromSelector(selector) {
    if (typeof selector !== 'string' || !selector.trim()) {
      return '';
    }

    const trimmed = selector.trim();
    const mboxMatch = trimmed.match(/\[data-target-scope=["']([^"']+)["']\]/);
    if (mboxMatch?.[1]) {
      return mboxMatch[1];
    }

    const propMatch = trimmed.match(/\[data-prop=["']([^"']+)["']\]/);
    if (propMatch?.[1]) {
      return propMatch[1];
    }

    return '';
  }

  function isScopeSelector(selector) {
    return typeof selector === 'string' && /\[data-target-scope=/.test(selector);
  }

  function pickBestDescendantEditable(root) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return null;
    }

    const candidates = Array.from(root.querySelectorAll('[data-editable="true"]'));
    if (candidates.length === 0) {
      return null;
    }

    const score = (node) => {
      const rect = node.getBoundingClientRect();
      const area = Math.max(1, rect.width * rect.height);
      const hasText = getTextSlotContent(node) ? 0 : 200;
      const hasProp = node.getAttribute('data-prop') ? 0 : 120;
      return Math.sqrt(area) + hasText + hasProp;
    };

    candidates.sort((a, b) => score(a) - score(b));
    return candidates[0] || null;
  }

  function resolveHighlightTarget(node, selector) {
    if (!node || typeof node.closest !== 'function') {
      return node;
    }

    // For mbox selectors, keep the matched scoped element exactly.
    if (isScopeSelector(selector) && node.matches?.('[data-target-scope]')) {
      return node;
    }

    if (node.matches?.('[data-editable="true"]')) {
      return node;
    }

    const ancestorEditable = node.closest('[data-editable="true"]');
    if (ancestorEditable) {
      return ancestorEditable;
    }

    const descendantEditable = pickBestDescendantEditable(node);
    if (descendantEditable) {
      return descendantEditable;
    }

    if (node.matches?.('[data-target-scope]')) {
      return node;
    }

    const ancestorScoped = node.closest('[data-target-scope]');
    if (ancestorScoped) {
      return ancestorScoped;
    }

    return node;
  }

  function createOverlayChipIcon(iconName = 'none', iconColor = 'currentColor') {
    if (!iconName || iconName === 'none') {
      return null;
    }

    const svgNs = 'http://www.w3.org/2000/svg';
    const icon = document.createElement('span');
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.width = '14px';
    icon.style.height = '14px';
    icon.style.flex = '0 0 14px';
    icon.style.color = iconColor;
    icon.setAttribute('aria-hidden', 'true');

    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'currentColor');

    const appendPath = (d, fillRule = 'evenodd') => {
      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill-rule', fillRule);
      svg.appendChild(path);
    };

    if (iconName === 'userGroup') {
      // Spectrum 2 icon path: UserGroup (20)
      appendPath('m12.25293,11.94922c-2.27637,0-4.12793-1.94629-4.12793-4.33887s1.85156-4.33887,4.12793-4.33887,4.12793,1.94629,4.12793,4.33887-1.85156,4.33887-4.12793,4.33887Zm0-7.17773c-1.44922,0-2.62793,1.27344-2.62793,2.83887s1.17871,2.83887,2.62793,2.83887,2.62793-1.27344,2.62793-2.83887-1.17871-2.83887-2.62793-2.83887Zm-5.37598,12.84082c.21484-1.99219,2.57617-3.55273,5.37598-3.55273,2.82324,0,5.18457,1.55664,5.37598,3.54492.04004.41309.41602.72656.81836.67383.41211-.03906.71387-.40527.67383-.81836-.26367-2.74805-3.28125-4.90039-6.86816-4.90039-3.61426,0-6.56641,2.10352-6.86816,4.89258-.04395.41113.25391.78125.66602.82617.02734.00293.05371.00391.08105.00391.37793,0,.70312-.28516.74512-.66992Zm.24023-7.89355c.16895-.37793.00098-.82227-.37695-.99219-.98535-.44238-1.62109-1.47168-1.62109-2.62207,0-1.56543,1.17871-2.83887,2.62793-2.83887.15234,0,.30078.01465.44629.04102.40234.08105.7998-.19238.87402-.60059.0752-.40723-.19336-.79883-.60059-.87402-.2334-.04395-.47363-.06641-.71973-.06641-2.27637,0-4.12793,1.94629-4.12793,4.33887,0,1.74023.9834,3.30664,2.50586,3.99121.09961.04395.2041.06543.30762.06543.28613,0,.55957-.16504.68457-.44238Zm-4.74609,6.38867c.20508-1.90234,2.36914-3.42676,5.03223-3.5459.41406-.01855.73438-.36816.71582-.78223-.01758-.40234-.34961-.7168-.74805-.7168-.01172,0-.02344,0-.03418.00098-3.45312.1543-6.16797,2.20703-6.45801,4.88184-.04395.41211.25391.78223.66504.82715.02832.00293.05469.00391.08203.00391.37793,0,.70312-.28516.74512-.66895Z');
    } else if (iconName === 'fileText') {
      // Spectrum 2 icon path: FileText (20)
      appendPath('m16.34082,5.2959l-3.62109-3.62207c-.41895-.41895-.99902-.65918-1.59082-.65918h-5.87891c-1.24023,0-2.25,1.00977-2.25,2.25v12.4834c0,1.24023,1.00977,2.25,2.25,2.25h9.5c1.24023,0,2.25-1.00977,2.25-2.25V6.88672c0-.60059-.23438-1.16602-.65918-1.59082Zm-1.06055,1.06055c.04614.04614.07397.10352.10596.1582h-3.13623c-.41309,0-.75-.33691-.75-.75v-3.13623c.05542.03223.11353.0603.15918.10596l3.62109,3.62207Zm-.53027,10.1416H5.25c-.41309,0-.75-.33691-.75-.75V3.26465c0-.41309.33691-.75.75-.75h4.75v3.25c0,1.24023,1.00977,2.25,2.25,2.25h3.25v7.7334c0,.41309-.33691.75-.75.75Z');
      appendPath('m13,11.49805h-6c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h6c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z');
      appendPath('m13,14.49805h-6c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h6c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z');
    } else {
      return null;
    }

    icon.appendChild(svg);
    return icon;
  }

  function createOverlayLabelChip(text, chipTheme = {}, chipsTheme = {}) {
    const chip = document.createElement('div');
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = `${chipsTheme.gap}px`;
    chip.style.maxWidth = `${chipsTheme.maxWidth}px`;
    chip.style.minHeight = `${chipsTheme.minHeight}px`;
    chip.style.padding = `${chipsTheme.paddingY}px ${chipsTheme.paddingX}px`;
    chip.style.borderRadius = `${chipsTheme.borderRadius}px`;
    chip.style.whiteSpace = 'nowrap';
    chip.style.overflow = 'hidden';
    chip.style.textOverflow = 'ellipsis';
    chip.style.font = '600 11px/13px "Adobe Clean", "AdobeClean", sans-serif';
    chip.style.letterSpacing = '0';
    chip.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.16)';
    chip.style.background = chipTheme.backgroundColor || DEFAULT_HIGHLIGHT_THEME.componentChip.backgroundColor;
    chip.style.color = chipTheme.textColor || DEFAULT_HIGHLIGHT_THEME.componentChip.textColor;

    const icon = createOverlayChipIcon(chipTheme.icon, chip.style.color);
    if (icon) {
      chip.appendChild(icon);
    }

    const chipText = document.createElement('span');
    chipText.textContent = text;
    chipText.style.minWidth = '0';
    chipText.style.overflow = 'hidden';
    chipText.style.textOverflow = 'ellipsis';
    chipText.style.whiteSpace = 'nowrap';
    chip.appendChild(chipText);

    return chip;
  }

  function createOverlayForTarget(
    target,
    selector,
    labelHint = "",
    audienceLabelHint = "",
    highlightTheme = DEFAULT_HIGHLIGHT_THEME
  ) {
    const overlayTheme = highlightTheme.overlay || DEFAULT_HIGHLIGHT_THEME.overlay;
    const chipsTheme = highlightTheme.chips || DEFAULT_HIGHLIGHT_THEME.chips;
    const componentChipTheme = highlightTheme.componentChip || DEFAULT_HIGHLIGHT_THEME.componentChip;
    const audienceChipTheme = highlightTheme.audienceChip || DEFAULT_HIGHLIGHT_THEME.audienceChip;

    const overlay = document.createElement('div');
    overlay.className = HIGHLIGHT_CLASS;
    overlay.dataset.selector = selector;
    overlay.style.position = 'fixed';
    overlay.style.boxSizing = 'border-box';
    overlay.style.border = `${overlayTheme.borderWidth}px solid ${overlayTheme.borderColor}`;
    overlay.style.borderRadius = `${overlayTheme.borderRadius}px`;
    overlay.style.background = 'transparent';
    overlay.style.boxShadow = `0 0 0 1px ${overlayTheme.insetColor} inset`;
    overlay.style.pointerEvents = 'none';

    let label = null;
    let caret = null;

    const normalizedLabelHint = typeof labelHint === 'string' ? labelHint.replace(/\s+/g, ' ' ).trim() : "";
    const labelText = normalizedLabelHint || getOverlayLabel(target) || getLabelFromSelector(selector);
    const normalizedAudienceLabelHint = typeof audienceLabelHint === 'string'
      ? audienceLabelHint.replace(/\s+/g, ' ').trim()
      : "";
    if (labelText) {
      label = document.createElement('div');
      label.className = HIGHLIGHT_LABEL_CLASS;
      label.style.position = 'absolute';
      label.style.top = '-31px';
      label.style.left = '-2px';
      const labelMaxWidth = Math.min(420, (chipsTheme.maxWidth * 2) + chipsTheme.gap + 24);
      label.style.maxWidth = `min(${labelMaxWidth}px, calc(100vw - 24px))`;
      label.style.display = 'inline-flex';
      label.style.alignItems = 'center';
      label.style.gap = `${chipsTheme.gap}px`;
      label.style.pointerEvents = 'none';

      const primaryChip = createOverlayLabelChip(labelText, componentChipTheme, chipsTheme);
      label.appendChild(primaryChip);

      if (normalizedAudienceLabelHint) {
        const secondaryChip = createOverlayLabelChip(normalizedAudienceLabelHint, audienceChipTheme, chipsTheme);
        label.appendChild(secondaryChip);
      }

      caret = document.createElement('div');
      caret.className = HIGHLIGHT_LABEL_CARET_CLASS;
      caret.style.position = 'absolute';
      caret.style.left = '14px';
      caret.style.top = '100%';
      caret.style.width = '0';
      caret.style.height = '0';
      caret.style.borderLeft = '6px solid transparent';
      caret.style.borderRight = '6px solid transparent';
      caret.style.borderTop = `6px solid ${componentChipTheme.backgroundColor}`;
      primaryChip.style.position = 'relative';
      primaryChip.appendChild(caret);

      overlay.appendChild(label);
    }

    return {
      overlay,
      label,
      caret,
      primaryCaretColor: componentChipTheme.backgroundColor,
    };
  }

  function querySelectorSafe(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function buildSelectorFallbacks(selector) {
    if (typeof selector !== 'string') return [];

    const trimmed = selector.trim();
    const fallbacks = [];

    if (/^html\s*>\s*body\s*>/i.test(trimmed)) {
      fallbacks.push(trimmed.replace(/^html\s*>\s*body\s*>\s*/i, ''));
    }

    if (trimmed.includes('>')) {
      const parts = trimmed.split('>').map((part) => part.trim()).filter(Boolean);
      for (let i = 1; i < parts.length - 1; i += 1) {
        fallbacks.push(parts.slice(i).join(' > '));
      }
    }

    return Array.from(new Set(fallbacks.filter(Boolean)));
  }

  function querySelectorAllWithFallback(selector) {
    const candidates = [selector, ...buildSelectorFallbacks(selector)];

    for (const candidate of candidates) {
      const matches = querySelectorSafe(candidate);
      if (matches.length > 0) {
        return { matches, matchedSelector: candidate };
      }
    }

    return { matches: [], matchedSelector: selector };
  }

  function highlightElements(
    selectors,
    labelsBySelector = {},
    audienceLabelsBySelector = {},
    audienceLabel = '',
    highlightTheme = DEFAULT_HIGHLIGHT_THEME
  ) {
    removeHighlights();

    if (!Array.isArray(selectors) || selectors.length === 0) {
      return { overlays: 0, matchedElements: 0 };
    }

    const sanitizedSelectors = selectors.map(sanitizeSelector).filter(Boolean);
    if (sanitizedSelectors.length === 0) {
      return { overlays: 0, matchedElements: 0 };
    }

    const resolvedHighlightTheme = sanitizeHighlightTheme(highlightTheme);

    const seenTargets = new Set();
    const entries = [];
    const container = ensureHighlightContainer();

    sanitizedSelectors.forEach((selector) => {
      const { matches, matchedSelector } = querySelectorAllWithFallback(selector);
      const labelHint = typeof labelsBySelector?.[selector] === 'string'
        ? labelsBySelector[selector]
        : (typeof labelsBySelector?.[matchedSelector] === 'string' ? labelsBySelector[matchedSelector] : '');
      const audienceLabelHint = typeof audienceLabelsBySelector?.[selector] === 'string'
        ? audienceLabelsBySelector[selector]
        : (typeof audienceLabelsBySelector?.[matchedSelector] === 'string'
          ? audienceLabelsBySelector[matchedSelector]
          : audienceLabel);

      matches.forEach((target) => {
        const resolvedTarget = resolveHighlightTarget(target, matchedSelector);
        if (!resolvedTarget || seenTargets.has(resolvedTarget)) return;
        seenTargets.add(resolvedTarget);

        const overlayEntry = createOverlayForTarget(
          resolvedTarget,
          selector,
          labelHint,
          audienceLabelHint,
          resolvedHighlightTheme
        );
        container.appendChild(overlayEntry.overlay);
        entries.push({
          selector,
          target: resolvedTarget,
          overlay: overlayEntry.overlay,
          label: overlayEntry.label,
          caret: overlayEntry.caret,
          primaryCaretColor: overlayEntry.primaryCaretColor,
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

    const parseLabelMap = (rawLabelMap) => {
      if (!rawLabelMap || typeof rawLabelMap !== 'object' || Array.isArray(rawLabelMap)) {
        return {};
      }
      return Object.entries(rawLabelMap).reduce((acc, [selector, label]) => {
        if (typeof selector !== 'string' || typeof label !== 'string') {
          return acc;
        }
        const normalizedSelector = selector.trim();
        const normalizedLabel = label.replace(/\s+/g, ' ').trim();
        if (!normalizedSelector || !normalizedLabel) {
          return acc;
        }
        acc[normalizedSelector] = normalizedLabel;
        return acc;
      }, {});
    };

    const labelsBySelector = parseLabelMap(payload?.labelsBySelector);
    const audienceLabelsBySelector = parseLabelMap(payload?.audienceLabelsBySelector);
    const audienceLabel = typeof payload?.audienceLabel === 'string'
      ? payload.audienceLabel.replace(/\s+/g, ' ').trim()
      : '';
    const highlightTheme = payload?.highlightTheme;

    return highlightElements(
      selectors,
      labelsBySelector,
      audienceLabelsBySelector,
      audienceLabel,
      highlightTheme
    );
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
