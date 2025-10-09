/**
 * Checks if experimentation is enabled.
 * @returns {boolean} True if experimentation is enabled, false otherwise.
 */
const isExperimentationEnabled = () => document.head.querySelector('[name^="experiment"],[name^="campaign-"],[name^="audience-"],[property^="campaign:"],[property^="audience:"]')
|| [...document.querySelectorAll('.section-metadata div')].some((d) => d.textContent.match(/Experiment|Campaign|Audience/i));
[...document.querySelectorAll('.section-metadata div')].some((d) => d.textContent.match(/Experiment|Campaign|Audience/i));

const isProd = (config) => {
  if (config?.prodHost) {
    return window.location.hostname === config.prodHost;
  }
  return !window.location.hostname.endsWith('hlx.page') && window.location.hostname !== 'localhost';
};

/**
 * Loads the experimentation module (eager).
 * @param {Document} document The document object.
 * @returns {Promise<void>} A promise that resolves when the experimentation module is loaded.
 */
export async function runExperimentation(document, config) {
  if (!isExperimentationEnabled()) {
    window.addEventListener('message', async (event) => {
      if (event.data?.type === 'hlx:experimentation-get-config') {
        event.source.postMessage({
          type: 'hlx:experimentation-config',
          config: { experiments: [], audiences: [], campaigns: [] },
          source: 'no-experiments'
        }, '*');
      }
    });
    return null;
  }

  try {
    const { loadEager } = await import(
    // eslint-disable-next-line import/no-relative-packages
      '../plugins/experimentation/src/index.js'
    );
    return loadEager(document, config);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation module (eager):', error);
    return null;
  }
}

/**
 * Loads the experimentation module (lazy).
 * @param {Document} document The document object.
 * @param {Object} config The experimentation configuration object.
 * @returns {Promise<void>} A promise that resolves when the experimentation module is loaded.
 */
export async function showExperimentationRail(document, config) {
  if (!isExperimentationEnabled()) {
    return null;
  }

  if (isProd(config)) {
    return null;
  }

  try {
    const { loadLazy } = await import(
    // eslint-disable-next-line import/no-relative-packages
      '../plugins/experimentation/src/index.js'
    );
    await loadLazy(document, config);

    const loadSidekickHandler = () => import('../tools/sidekick/aem-experimentation.js');

    if (document.querySelector('helix-sidekick, aem-sidekick')) {
      await loadSidekickHandler();
    } else {
      await new Promise((resolve) => {
        document.addEventListener(
          'sidekick-ready',
          () => {
            loadSidekickHandler().then(resolve);
          },
          { once: true },
        );
      });
    }

    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation module (lazy):', error);
    return null;
  }
}
