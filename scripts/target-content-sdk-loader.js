/*
 * Loader for Target Content Frame SDK.
 * Loads the SDK only when inside Universal Editor (iframe + UE class).
 * No-op on publish — EDS has no author-only head.html mechanism.
 *
 * Opt-out for testing the AEM clientlib SDK without interference:
 *   URL param:    ?disable-project-sdk=true
 *   localStorage: disable-project-sdk = 'true'
 *
 * When disabled, sets window.__TARGET_PROJECT_SDK_DISABLED__ = true
 * and logs a clear message to the console.
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
      setTimeout(() => observer.disconnect(), 5000);
    }
  }
}
