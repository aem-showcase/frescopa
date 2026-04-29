/* Mock Commerce — replays previously-captured GraphQL responses so that
 * /coffee, /tea, /machines, and product detail pages render offline.
 *
 * Loads /tools/mock-commerce/manifest.json on first matching call and
 * intercepts window.fetch for known commerce hosts. Image URLs in saved
 * responses already point to /mock-assets/, served from the project root.
 */

const GQL_HOSTS = new Set([
  'catalog-service-sandbox.adobe.io',
  'www.aemshop.net',
  'commerce.adobedc.net',
]);

let manifestPromise = null;

async function getManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      // Use the original fetch so we don't recurse through our own override.
      const res = await window.__realFetch('/tools/mock-commerce/manifest.json');
      if (!res.ok) throw new Error(`mock manifest load failed: ${res.status}`);
      return res.json();
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[mock-commerce] manifest load failed; passing through.', err);
      manifestPromise = null;
      return null;
    });
  }
  return manifestPromise;
}

async function sha1Hex(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canonicalJSON(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

async function signatureFor({ method, host, pathname, query, body }) {
  let opName = query.operationName || '';
  let variables = {};
  if (method === 'GET') {
    if (query.variables) {
      try { variables = JSON.parse(query.variables); } catch { /* */ }
    }
    if (!opName && query.query) {
      const m = /^\s*(?:query|mutation|subscription)\s+(\w+)/m.exec(query.query);
      if (m) opName = m[1];
    }
  } else if (body) {
    try {
      const j = JSON.parse(body);
      opName = j.operationName || opName;
      variables = j.variables || {};
    } catch { /* */ }
  }
  const canonicalVars = canonicalJSON(variables);
  const raw = `${method}|${host}|${pathname}|${opName}|${canonicalVars}`;
  const full = await sha1Hex(raw);
  return full.slice(0, 16);
}

function jsonResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json', 'x-mock-source': 'mock-commerce' },
  });
}

function emptyResponse(status = 204) {
  return new Response('', { status, headers: { 'x-mock-source': 'mock-commerce' } });
}

async function tryMock(input, init = {}) {
  const url = typeof input === 'string' || input instanceof URL ? new URL(input, window.location.href) : new URL(input.url, window.location.href);
  const host = url.hostname;
  if (!GQL_HOSTS.has(host)) return null;

  const method = (init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();

  // CORS preflights: just succeed.
  if (method === 'OPTIONS') return emptyResponse(204);

  // Analytics collector: return 200 empty.
  if (host === 'commerce.adobedc.net') return jsonResponse('{}', 200);

  const manifest = await getManifest();
  if (!manifest) return null;

  const query = Object.fromEntries(url.searchParams);
  let body = '';
  if (init.body) {
    body = typeof init.body === 'string' ? init.body : '';
  } else if (input instanceof Request && method !== 'GET') {
    try { body = await input.clone().text(); } catch { /* */ }
  }

  const sig = await signatureFor({
    method, host, pathname: url.pathname, query, body,
  });

  const entry = manifest.responses[sig];
  if (!entry) {
    // eslint-disable-next-line no-console
    console.warn(`[mock-commerce] no recorded response for ${method} ${host}${url.pathname} sig=${sig}`);
    // Return an empty data envelope so downstream code doesn't crash.
    return jsonResponse('{"data":null,"errors":[{"message":"mock not recorded","extensions":{"sig":"' + sig + '"}}]}', 200);
  }

  const res = await window.__realFetch(`/tools/mock-commerce/responses/${entry.file}`);
  if (!res.ok) return jsonResponse('{"data":null}', 200);
  const raw = await res.text();
  const text = raw.replaceAll('__MOCK_ORIGIN__', window.location.origin);
  return jsonResponse(text, entry.status || 200);
}

// Install the override exactly once.
if (!window.__realFetch) {
  window.__realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    try {
      const mocked = await tryMock(input, init);
      if (mocked) return mocked;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[mock-commerce] interceptor error; passing through.', err);
    }
    return window.__realFetch(input, init);
  };
  // eslint-disable-next-line no-console
  console.info('[mock-commerce] fetch interceptor installed');
}
