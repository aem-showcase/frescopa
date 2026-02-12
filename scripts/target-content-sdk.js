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

  // --- Handler registry ---

  const handlers = {};

  function registerHandler(action, handler) {
    handlers[action] = handler;
  }

  // --- Handlers ---

  registerHandler('ping', () => ({ pong: true, mode }));

  registerHandler('detect-activity-scopes', (payload) => {
    const elements = document.querySelectorAll('[data-target-scope]');
    const scopes = new Set();
    elements.forEach((el) => {
      const scope = el.getAttribute('data-target-scope');
      if (scope) {
        scope.split(',').forEach((s) => {
          const trimmed = s.trim();
          if (trimmed) scopes.add(trimmed);
        });
      }
    });

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
