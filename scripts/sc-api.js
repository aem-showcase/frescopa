/**
 * Backend API utility for fetching content from custom backend endpoints
 * This library provides a simple interface to call backend APIs
 */

// Backend endpoint base URL
const BACKEND_API_BASE = 'https://da-sc.adobeaem.workers.dev';

/**
 * Parses authored backend path: `SITE_PATH#CONTENT_PATH` (e.g. `/aemsites/frescopa#/forms/offer`).
 * @param {string} authoredPath - Full string from authoring
 * @returns {{ sitePath: string, contentPath: string }}
 */
function parseBackendPath(authoredPath) {
  const hash = authoredPath.indexOf('#');
  if (hash === -1) {
    throw new Error(
      'fetchBackendAPI: path must include site and content as SITE_PATH#CONTENT_PATH '
      + '(e.g. /aemsites/frescopa#/forms/offer).',
    );
  }
  const sitePath = authoredPath.slice(0, hash).trim();
  const contentPath = authoredPath.slice(hash + 1).trim();
  if (!sitePath || !contentPath) {
    throw new Error(
      'fetchBackendAPI: SITE_PATH and content path must both be non-empty around "#".',
    );
  }
  return { sitePath, contentPath };
}

/**
 * Determines if the site is in preview or live mode based on the domain
 * @returns {string} 'preview' or 'live'
 */
function getMode() {
  const hostname = window?.location?.hostname || '';

  if (hostname.endsWith('.aem.page')) {
    return 'preview';
  }

  if (hostname.endsWith('.aem.live')) {
    return 'live';
  }

  // Fallback to live for any other case
  return 'live';
}

/**
 * Unwraps API responses that use a { metadata, data } envelope.
 *
 * Structured content authored on /formsref returns that envelope:
 * `metadata` describes the schema (e.g. offer) and `data` holds the fields blocks consume.
 * The older implementation of responses are still a flat JSON object with those fields at the root.
 * We return `data` only when both keys exist so callers always receive the same payload shape.
 *
 * @param {unknown} body - Parsed JSON body
 * @returns {unknown} The inner `data` when both roots exist, otherwise the body unchanged
 */
function unwrapBackendResponse(body) {
  if (body && typeof body === 'object' && 'metadata' in body && 'data' in body) {
    return body.data;
  }
  return body;
}

/**
 * Fetches content from the backend API
 * @param {string} path - Authored path: `SITE_PATH#CONTENT_PATH` (e.g. `/aemsites/frescopa#/forms/offer`)
 * @returns {Promise<Object|null>} The response data or null if error occurs
 */
export async function fetchBackendAPI(path) {
  try {
    const { sitePath, contentPath } = parseBackendPath(path);
    const mode = getMode();
    const url = `${BACKEND_API_BASE}/${mode}${sitePath}${contentPath}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    return unwrapBackendResponse(json);
  } catch (error) {
    console.error('Error fetching from backend API:', error);
    return null;
  }
}
