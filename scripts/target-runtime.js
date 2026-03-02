/*
 * Adobe Target runtime bootstrap (at.js)
 *
 * Purpose:
 * - Load at.js when Target config is present.
 * - Trigger mbox requests so runtime scopes are detectable in UE.
 *
 * This script is config-driven and no-ops when required config is missing.
 */
import { loadScript } from './aem.js';
import { initializeConfig, getConfigValue } from './configs.js';

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_GLOBAL_MBOX = 'target-global-mbox';
const AT_JS_FILE = 'at.js';

function readConfig(path, fallback = undefined) {
  try {
    const value = getConfigValue(path);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function getUEMode() {
  const html = document.documentElement;
  if (!html) return null;
  if (html.classList.contains('adobe-ue-edit')) return 'edit';
  if (html.classList.contains('adobe-ue-preview')) return 'preview';
  return null;
}

function waitForUEContext(timeoutMs = 5000) {
  const detected = getUEMode();
  if (detected) {
    return Promise.resolve(detected);
  }

  return new Promise((resolve) => {
    const html = document.documentElement;
    if (!html) {
      resolve(null);
      return;
    }

    const observer = new MutationObserver(() => {
      const mode = getUEMode();
      if (mode) {
        observer.disconnect();
        resolve(mode);
      }
    });

    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

function buildAtJsUrl(clientCode) {
  return `https://${clientCode}.tt.omtrdc.net/${AT_JS_FILE}`;
}

function buildTargetGlobalSettings({
  clientCode,
  imsOrgId,
  serverDomain,
  timeoutMs,
  globalMboxName,
}) {
  const settings = {
    clientCode,
    timeout: timeoutMs,
    globalMboxName,
  };

  if (imsOrgId) {
    settings.imsOrgId = imsOrgId;
  }

  if (serverDomain) {
    settings.serverDomain = serverDomain;
  }

  return settings;
}

function requestMbox(mboxName, timeoutMs) {
  return new Promise((resolve) => {
    if (!window.adobe?.target?.getOffer) {
      resolve(false);
      return;
    }

    let completed = false;
    const finish = (result) => {
      if (completed) return;
      completed = true;
      resolve(result);
    };

    const timeoutId = setTimeout(() => finish(false), timeoutMs);

    try {
      window.adobe.target.getOffer({
        mbox: mboxName,
        success: () => {
          clearTimeout(timeoutId);
          finish(true);
        },
        error: () => {
          clearTimeout(timeoutId);
          finish(false);
        },
      });
    } catch {
      clearTimeout(timeoutId);
      finish(false);
    }
  });
}

async function warmUpMboxes(mboxNames, timeoutMs) {
  if (!window.adobe?.target?.getOffer) {
    return;
  }

  const uniqueMboxes = Array.from(new Set(mboxNames));
  await Promise.all(uniqueMboxes.map((mbox) => requestMbox(mbox, timeoutMs)));
}

async function initializeTargetRuntime() {
  // Avoid duplicate initialization when script is loaded multiple times.
  if (window.frescopaTargetRuntimeInitialized) {
    return;
  }
  window.frescopaTargetRuntimeInitialized = true;

  await initializeConfig();

  const enabled = readConfig('target.enabled', true);
  if (enabled === false || enabled === 'false') {
    return;
  }

  const ueOnly = readConfig('target.ueOnly', false);
  if (ueOnly === true || ueOnly === 'true') {
    const mode = await waitForUEContext();
    if (!mode) {
      return;
    }
  }

  const clientCode = readConfig('target.clientCode', '');
  if (!clientCode) {
    return;
  }

  const imsOrgId = readConfig('target.imsOrgId', '');
  const configuredServerDomain = readConfig('target.serverDomain', '');
  const timeoutMs = Number(readConfig('target.timeoutMs', DEFAULT_TIMEOUT_MS)) || DEFAULT_TIMEOUT_MS;
  const globalMboxName = readConfig('target.globalMboxName', DEFAULT_GLOBAL_MBOX);
  const configuredMboxes = toStringArray(readConfig('target.mboxes', []));

  const mboxNames = [globalMboxName, ...configuredMboxes].filter(Boolean);
  if (mboxNames.length === 0) {
    return;
  }

  window.targetGlobalSettings = buildTargetGlobalSettings({
    clientCode,
    imsOrgId,
    serverDomain: configuredServerDomain || `${clientCode}.tt.omtrdc.net`,
    timeoutMs,
    globalMboxName,
  });

  try {
    await loadScript(buildAtJsUrl(clientCode), {
      async: 'true',
      crossorigin: 'anonymous',
    });
  } catch {
    return;
  }

  await warmUpMboxes(mboxNames, timeoutMs);
}

initializeTargetRuntime();
