/**
 * Environment detection: isProd matches the logic originally in experiment-loader.js.
 * Use as the single toggle for when to use stage vs prod (e.g. analytics script URL).
 *
 * @param {Object} [config] - Optional config with prodHost for explicit production domain.
 */

export const isProd = (config) => {
    if (config?.prodHost) {
        return window.location.hostname === config.prodHost;
    }
    return !window.location.hostname.endsWith('hlx.page') && window.location.hostname !== 'localhost';
};
  