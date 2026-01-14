/**
 * Backend API utility for fetching content from custom backend endpoints
 * This library provides a simple interface to call backend APIs
 */

// Backend endpoint URL
const BACKEND_API_URL = 'https://mhast-html-to-json.adobeaem.workers.dev';

// Specific endpoints for different content types
const ENDPOINTS = {
  quiz: '/aemsites/da-frescopa/forms/quiz',
  offer: '/aemsites/da-frescopa/forms/offer',
};

/**
 * Builds the query string from the query parameters object
 * @param {Object} params - The query parameters object
 * @returns {string} The query string
 */
function buildQueryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * Determines which endpoint to use based on the path
 * @param {string} path - The content path
 * @returns {string} The appropriate endpoint
 */
function getEndpoint(path) {
  if (path.includes('/quiz')) {
    return ENDPOINTS.quiz;
  }
  if (path.includes('/offer')) {
    return ENDPOINTS.offer;
  }
  // Default to offer if no match
  return ENDPOINTS.offer;
}

/**
 * Fetches content from the backend API
 * @param {string} path - The content path to fetch
 * @returns {Promise<Object|null>} The response data or null if error occurs
 */
export async function fetchBackendAPI(path) {
  try {
    const endpoint = getEndpoint(path);
    const url = `${BACKEND_API_URL}${endpoint}`;

    console.log('Backend API URL:', url);

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
