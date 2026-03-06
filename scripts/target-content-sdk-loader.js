/*
 * Loader for Target Content Frame SDK.
 * Loads the SDK only when inside Universal Editor (iframe + UE class).
 * No-op on publish — EDS has no author-only head.html mechanism.
 */

const sdkConfig = window.__TARGET_CONTENT_SDK_CONFIG || {};
const configuredProdHost = typeof sdkConfig.prodHost === 'string' ? sdkConfig.prodHost.trim() : '';
const globalProdHost = typeof window.PROD_HOST === 'string' ? window.PROD_HOST.trim() : '';
const prodHost = configuredProdHost || globalProdHost;

if (window !== window.top) {
  const html = document.documentElement;
  const isProdEnv = prodHost ? window.location.hostname === prodHost : true;

  function getUEMode() {
    if (html.classList.contains('adobe-ue-edit')) return 'edit';
    if (html.classList.contains('adobe-ue-preview')) return 'preview';
    return null;
  }

  function loadSDK(ueMode) {
    const script = document.createElement('script');
    script.src = `${window.hlx?.codeBasePath || ''}/scripts/target-content-sdk.js`;
    script.dataset.ueMode = ueMode;
    script.dataset.isProd = isProdEnv;
    document.head.appendChild(script);
  }

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
