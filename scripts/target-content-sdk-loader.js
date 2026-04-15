/*
 * Target Content Frame SDK — Loader
 * =================================
 * Conditionally loads target-content-sdk.js into the page when the document
 * is running inside Universal Editor (detected by `adobe-ue-edit` or
 * `adobe-ue-preview` on the <html>). A no-op on publish — EDS has no
 * author-only head.html mechanism, so the module import is cheap but the
 * actual SDK script is never appended.
 *
 * Config
 * ------
 * The loader reads prodHost from either:
 *   - window.__TARGET_CONTENT_SDK_CONFIG.prodHost  (preferred, explicit)
 *   - window.PROD_HOST                             (fallback for projects
 *                                                   that already expose it)
 * Production host affects only the `data-is-prod` flag on the injected
 * script tag, which the SDK uses to tighten origin checks.
 *
 * Opt-out (for testing the AEM clientlib SDK without interference)
 * ----------------------------------------------------------------
 *   URL param:    ?disable-project-sdk=true
 *   localStorage: disable-project-sdk = 'true'
 *
 * When disabled, the loader:
 *   - Sets window.__TARGET_PROJECT_SDK_DISABLED__ = true (a signal the
 *     AEM clientlib SDK can read to know it should take over)
 *   - Logs a clear "Project SDK DISABLED" message (orange)
 *   - Skips loading target-content-sdk.js entirely
 *
 * When enabled, logs "Project SDK ENABLED" (green) so the state is always
 * visible in the console.
 */

const sdkConfig = window.__TARGET_CONTENT_SDK_CONFIG || {};
const configuredProdHost = typeof sdkConfig.prodHost === 'string' ? sdkConfig.prodHost.trim() : '';
const globalProdHost = typeof window.PROD_HOST === 'string' ? window.PROD_HOST.trim() : '';
const prodHost = configuredProdHost || globalProdHost;

function getDisableReason() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('disable-project-sdk') === 'true') return 'url-param';
    if (window.localStorage?.getItem('disable-project-sdk') === 'true') return 'localStorage';
  } catch { /* storage may be blocked */ }
  return null;
}

if (window !== window.top) {
  const disableReason = getDisableReason();

  if (disableReason) {
    window.__TARGET_PROJECT_SDK_DISABLED__ = true;
    // eslint-disable-next-line no-console
    console.log(`%c[Target SDK Loader] Project SDK DISABLED via ${disableReason}`, 'color: orange; font-weight: bold');
  } else {
    // eslint-disable-next-line no-console
    console.log('%c[Target SDK Loader] Project SDK ENABLED', 'color: green; font-weight: bold');

    const html = document.documentElement;
    const isProdEnv = prodHost ? window.location.hostname === prodHost : false;

    const getUEMode = () => {
      if (html.classList.contains('adobe-ue-edit')) return 'edit';
      if (html.classList.contains('adobe-ue-preview')) return 'preview';
      return null;
    };

    const loadSDK = (ueMode) => {
      const script = document.createElement('script');
      script.src = `${window.hlx?.codeBasePath || ''}/scripts/target-content-sdk.js`;
      script.dataset.ueMode = ueMode;
      script.dataset.isProd = isProdEnv;
      document.head.appendChild(script);
    };

    const mode = getUEMode();
    if (mode) {
      loadSDK(mode);
    } else {
      const observer = new MutationObserver(() => {
        const detectedMode = getUEMode();
        if (detectedMode) {
          observer.disconnect();
          loadSDK(detectedMode);
        }
      });
      observer.observe(html, { attributes: true, attributeFilter: ['class'] });
      // Stop observing after 5s: UE applies the adobe-ue-edit / adobe-ue-preview
      // class early in its bootstrap. If it hasn't arrived by then we aren't in
      // UE and should release the observer rather than leaking it indefinitely.
      setTimeout(() => observer.disconnect(), 5000);
    }
  }
}
