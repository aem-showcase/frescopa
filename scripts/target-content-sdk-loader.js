/*
 * Loader for Target Content Frame SDK.
 * Loads the SDK only when inside Universal Editor (iframe + UE class).
 * No-op on publish — EDS has no author-only head.html mechanism.
 */
import { PROD_HOST } from './scripts.js';

if (window !== window.top) {
  const html = document.documentElement;
  const isProdEnv = window.location.hostname === PROD_HOST;

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
