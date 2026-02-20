/* eslint-disable import/no-cycle */
import { getConfigValue } from './configs.js';
import { getUserTokenCookie } from './initializers/index.js';
import { getConsent, experimentationConfig } from './scripts.js';
import { loadScript } from './aem.js';
import { isProd } from './env.js';
import { EXPERIENCE_PLATFORM_WEB_SDK_PROD, EXPERIENCE_PLATFORM_WEB_SDK_STAGE } from './constants.js';

/**
 * Injects the Experience Platform Web SDK script
 * Currently stage only; prod injection is disabled below.
 */
function injectExperiencePlatformWebSDK() {
  console.log('injectExperiencePlatformWebSDK');
  const head = document.head || document.documentElement;
  console.log('head', head);
  if (!head) return;

  const alreadyInjected = [...head.querySelectorAll('script[src]')].some(
    (s) => s.src === EXPERIENCE_PLATFORM_WEB_SDK_PROD || s.src === EXPERIENCE_PLATFORM_WEB_SDK_STAGE,
  );
  console.log('alreadyInjected', alreadyInjected);
  if (alreadyInjected) return;

  // TODO: Enable Web SDK in prod — remove the next line and use the conditional below for script.src.
  console.log('isProd(experimentationConfig)', isProd(experimentationConfig));
  if (isProd(experimentationConfig)) return;
  const script = document.createElement('script');

  // script.src = isProd(experimentationConfig) ? EXPERIENCE_PLATFORM_WEB_SDK_PROD : EXPERIENCE_PLATFORM_WEB_SDK_STAGE;
  script.src = EXPERIENCE_PLATFORM_WEB_SDK_STAGE;

  script.async = true;
  console.log('script', script);
  head.appendChild(script);
  console.log('script appended');
}

async function initAnalytics() {
  console.log('initAnalytics');
  try {
    injectExperiencePlatformWebSDK();
  } catch (error) {
    console.warn('Error injecting Experience Platform Web SDK script', error);
  }
  try {
    // Load Commerce events SDK and collector
    // only if "analytics" has been added to the config.
    const config = getConfigValue('analytics');

    if (config && getConsent('commerce-collection')) {
      const csHeaders = getConfigValue('headers.cs');

      window.adobeDataLayer.push(
        {
          storefrontInstanceContext: {
            baseCurrencyCode: config['base-currency-code'],
            environment: config.environment,
            environmentId: csHeaders['Magento-Environment-Id'],
            storeCode: csHeaders['Magento-Store-Code'],
            storefrontTemplate: 'EDS',
            storeId: parseInt(config['store-id'], 10),
            storeName: config['store-name'],
            storeUrl: config['store-url'],
            storeViewCode: csHeaders['Magento-Store-View-Code'],
            storeViewCurrencyCode: config['base-currency-code'],
            storeViewId: parseInt(config['store-view-id'], 10),
            storeViewName: config['store-view-name'],
            websiteCode: csHeaders['Magento-Website-Code'],
            websiteId: parseInt(config['website-id'], 10),
            websiteName: config['website-name'],
          },
        },
        { eventForwardingContext: { commerce: true, aep: false } },
        {
          shopperContext: {
            shopperId: getUserTokenCookie() ? 'logged-in' : 'guest',
          },
        },
      );

      // Load events SDK and collector
      import('./commerce-events-sdk.js');
      import('./commerce-events-collector.js');
    }
  } catch (error) {
    console.warn('Error initializing analytics', error);
  }
}

if (document.prerendering) {
  document.addEventListener('prerenderingchange', initAnalytics, {
    once: true,
  });
  document.addEventListener('prerenderingchange', initAnalytics, { once: true });
} else {
  initAnalytics();
}

// add delayed functionality here
// add more delayed functionality here
const map = document.querySelector('#locator-map');
if (map) {
  loadScript('/blocks/store-locator/location-init.js', { defer: true });
}

document.dispatchEvent(new Event('delayed-phase'));
Window.DELAYED_PHASE = true;

const testLoad = () => {
  console.log('testLoad');
}

testLoad();