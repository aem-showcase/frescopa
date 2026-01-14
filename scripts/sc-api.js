/**
 * Backend API utility for fetching content from custom backend endpoints
 * This library provides a simple interface to call backend APIs
 */

// Backend endpoint URL
const BACKEND_API_URL = 'https://mhast-html-to-json.adobeaem.workers.dev/aemsites/da-frescopa';

/**
 * Fetches content from the backend API
 * @param {string} path - The content path to fetch (e.g., '/forms/offer')
 * @returns {Promise<Object|null>} The response data or null if error occurs
 */
export async function fetchBackendAPI(path) {
  try {
    const url = `${BACKEND_API_URL}${path}`;

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
