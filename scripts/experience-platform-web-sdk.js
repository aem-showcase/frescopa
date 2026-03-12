/* eslint-disable import/no-cycle */
import { isProd } from './env.js';
import { EXPERIENCE_PLATFORM_WEB_SDK_PROD, EXPERIENCE_PLATFORM_WEB_SDK_STAGE } from './constants.js';
import { experimentationConfig } from './scripts.js';

export function injectExperiencePlatformWebSDK() {
  const head = document.head || document.documentElement;
  if (!head) return;

  const isAlreadyInjected = [...head.querySelectorAll('script[src]')].some(
    (s) => s.src === EXPERIENCE_PLATFORM_WEB_SDK_PROD
      || s.src === EXPERIENCE_PLATFORM_WEB_SDK_STAGE,
  );
  if (isAlreadyInjected) return;

  // TODO: Enable Web SDK in prod — remove this guard and use the conditional below.
  if (isProd(experimentationConfig)) return;

  const script = document.createElement('script');

  // script.src = isProd(experimentationConfig)
  //   ? EXPERIENCE_PLATFORM_WEB_SDK_PROD
  //   : EXPERIENCE_PLATFORM_WEB_SDK_STAGE;
  script.src = EXPERIENCE_PLATFORM_WEB_SDK_STAGE;

  script.async = true;
  head.appendChild(script);
}
