/**
 * Backend API utility for fetching content from custom backend endpoints
 * This library provides a simple interface to call backend APIs
 */

// Backend endpoint base URL
const BACKEND_API_BASE = 'https://mhast-html-to-json.adobeaem.workers.dev';
const SITE_PATH = '/aemsites/da-frescopa';

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
 * Fetches content from the backend API
 * @param {string} path - The content path to fetch (e.g., '/forms/offer')
 * @returns {Promise<Object|null>} The response data or null if error occurs
 */
export async function fetchBackendAPI(path) {
  try {
    const mode = getMode();
    const url = `${BACKEND_API_BASE}/${mode}${SITE_PATH}${path}`;


    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching from backend API:', error);
    return null;
  }
}
