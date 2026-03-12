export const PerformanceObserverEvents = {
  ELEMENT: 'element',
  EVENT: 'event',
  FIRST_INPUT: 'first-input',
  LARGEST_CONTENTFUL_PAINT: 'largest-contentful-paint',
  LAYOUT_SHIFT: 'layout-shift',
  LONG_ANIMATION_FRAME: 'long-animation-frame',
  LONG_TASK: 'longtask',
  MARK: 'mark',
  MEASURE: 'measure',
  NAVIGATION: 'navigation',
  PAINT: 'paint',
  RESOURCE: 'resource',
  VISIBILITY_STATE: 'visibility-state',
};

function normalizeConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') return {};

  return Object.entries(rawConfig).reduce((acc, [entryType, fns]) => {
    if (!Array.isArray(fns) || fns.length === 0) return acc;
    const validFns = fns.filter((fn) => typeof fn === 'function');
    if (validFns.length) {
      acc[entryType] = validFns;
    }
    return acc;
  }, {});
}

function createLogger(logger, enableLogging) {
  return (...args) => {
    if (!enableLogging) return;
    logger.log('[performance-scheduler]', ...args);
  };
}

function runAllHandlersWithFallback(entriesConfig, fallbackDelay, log, logger, startTime) {
  log('PerformanceObserver not available, using fallback for all handlers');
  window.setTimeout(() => {
    Object.entries(entriesConfig).forEach(([entryType, fns]) => {
      const now = performance.now();
      const sinceStart = (now - startTime).toFixed(2);
      log(`Running handlers for ${entryType} via fallbackDelay (${fallbackDelay}ms), +${sinceStart}ms since schedulePerformanceEvents`);
      fns.forEach((fn) => {
        const fnName = fn.name || 'anonymous';
        log(`→ handler: ${fnName}`);
        try {
          fn();
        } catch (e) {
          logger.warn('Error in performance fallback handler', e);
        }
      });
    });
  }, fallbackDelay);
}

function createRunHandlers(entryType, handlers, log, logger, startTime) {
  let fired = false;

  return (reason) => {
    if (fired) return;
    fired = true;

    const now = performance.now();
    const sinceStart = (now - startTime).toFixed(2);

    log(`Running handlers for ${entryType} (reason: ${reason}), +${sinceStart}ms since schedulePerformanceEvents`);
    handlers.forEach((fn) => {
      const fnName = fn.name || 'anonymous';
      log(`→ handler: ${fnName}`);
      try {
        fn();
      } catch (e) {
        logger.warn(`Error in handler for ${entryType}`, e);
      }
    });
  };
}

function observeEntryType(entryType, handlers, options) {
  const {
    fallbackDelay,
    hardTimeout,
    log,
    logger,
    supportedTypes,
    startTime,
  } = options;

  const runHandlers = createRunHandlers(entryType, handlers, log, logger, startTime);

  if (!supportedTypes.includes(entryType)) {
    log(`Entry type ${entryType} not supported, using fallbackDelay (${fallbackDelay}ms)`);
    window.setTimeout(
      () => runHandlers('unsupported-entryType-fallback'),
      fallbackDelay,
    );
    return;
  }

  let observer;

  try {
    observer = new PerformanceObserver((list) => {
      if (entryType === PerformanceObserverEvents.LARGEST_CONTENTFUL_PAINT) {
        const entries = list.getEntries();
        if (!entries || entries.length === 0) return;
        const last = entries[entries.length - 1];
        if (!last) return;
        observer.disconnect();
        runHandlers('lcp-entry');
        return;
      }

      const entries = list.getEntries();
      if (!entries || entries.length === 0) return;
      observer.disconnect();
      runHandlers('first-entry');
    });

    observer.observe({ type: entryType, buffered: true });
    log(`Observing entryType ${entryType}`);
  } catch (e) {
    logger.warn(`Error observing ${entryType}, using fallback`, e);
    window.setTimeout(
      () => runHandlers('observe-error-fallback'),
      fallbackDelay,
    );
    return;
  }

  window.setTimeout(() => {
    observer.disconnect();
    runHandlers('hard-timeout');
  }, hardTimeout);
}

/**
 * Schedule functions to run when performance events occur.
 */
export function schedulePerformanceEvents(config = {}, options = {}) {
  const {
    fallbackDelay = 1500,
    hardTimeout = 3000,
    logger = console,
    enableLogging = false,
  } = options;

  const entriesConfig = normalizeConfig(config);
  if (!Object.keys(entriesConfig).length) return;

  const startTime = performance.now();
  const log = createLogger(logger, enableLogging);

  const supportedTypes = Array.isArray(PerformanceObserver?.supportedEntryTypes)
    ? PerformanceObserver.supportedEntryTypes
    : [];

  if (typeof PerformanceObserver === 'undefined' || !supportedTypes.length) {
    runAllHandlersWithFallback(entriesConfig, fallbackDelay, log, logger, startTime);
    return;
  }

  Object.entries(entriesConfig).forEach(([entryType, handlers]) => {
    observeEntryType(entryType, handlers, {
      fallbackDelay,
      hardTimeout,
      log,
      logger,
      supportedTypes,
      startTime,
    });
  });
}
