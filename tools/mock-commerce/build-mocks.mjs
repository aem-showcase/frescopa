#!/usr/bin/env node
/* eslint-disable no-console */
// Reads localhost.har in the project root and extracts:
//   - GraphQL responses to mock-commerce/responses/<sha>.json
//   - Image bytes to mock-assets/<original-filename-or-sha>
//   - manifest.json mapping GraphQL request signature -> response file
// Image URLs in saved GraphQL responses are rewritten to local /mock-assets/...

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
// Use any HAR paths passed on the CLI; otherwise pick up every *.har in the
// project root. Lets us layer multiple capture sessions (e.g. one for /coffee
// + /tea, another for /machines) without juggling files.
const CLI_HARS = process.argv.slice(2);
const HAR_PATHS = CLI_HARS.length
  ? CLI_HARS.map((p) => (path.isAbsolute(p) ? p : path.join(ROOT, p)))
  : fs.readdirSync(ROOT).filter((f) => f.endsWith('.har')).map((f) => path.join(ROOT, f));
const OUT_RESP = path.join(ROOT, 'tools/mock-commerce/responses');
const OUT_ASSETS = path.join(ROOT, 'mock-assets');
const MANIFEST = path.join(ROOT, 'tools/mock-commerce/manifest.json');

// Hosts whose GraphQL responses we record.
const GQL_HOSTS = new Set([
  'catalog-service-sandbox.adobe.io',
  'www.aemshop.net',
  'commerce.adobedc.net',
]);

// Hosts whose images we save locally.
const IMG_HOSTS = new Set([
  'delivery-p149891-e1546481.adobeaemcloud.com',
  'delivery-p149891-e1546482.adobeaemcloud.com',
  'publish-p190061-e1982485.adobeaemcloud.com',
]);

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

// Recursive canonical JSON serializer — must match the runtime version in
// scripts/mock-commerce.js exactly so build and runtime produce identical sigs.
function canonicalJSON(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

// Canonical signature for a GraphQL request. Same opName + same variables
// (regardless of param order or extensions) -> same signature.
function signatureFromRequest({ method, host, pathname, query, body }) {
  let opName = '';
  let variables = {};
  if (method === 'GET') {
    opName = query.operationName || '';
    if (query.variables) {
      try { variables = JSON.parse(query.variables); } catch { /* */ }
    }
    if (!opName && query.query) {
      const m = /^\s*(?:query|mutation|subscription)\s+(\w+)/m.exec(query.query);
      if (m) [, opName] = m;
    }
  } else if (body) {
    try {
      const j = JSON.parse(body);
      opName = j.operationName || '';
      variables = j.variables || {};
    } catch { /* */ }
  }
  const canonicalVars = canonicalJSON(variables);
  const raw = `${method}|${host}|${pathname}|${opName}|${canonicalVars}`;
  return { sig: sha1(raw).slice(0, 16), opName, variables };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// Map of MIME type -> file extension. Images need correct extensions so the
// dev server returns the right Content-Type when serving from /mock-assets.
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

function detectExtFromBytes(buf) {
  if (buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return '.jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return '.png';
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  if (buf.length >= 6 && buf.slice(0, 6).toString().startsWith('GIF8')) return '.gif';
  if (buf.length >= 5 && buf.slice(0, 5).toString() === '<?xml') return '.svg';
  return '';
}

function rewriteImageUrls(text, urlToLocal) {
  // Replace any reference to the AEM delivery hosts with their local path.
  return text.replace(
    /https:\/\/(delivery-p149891-e154648[12]|publish-p190061-e1982485)\.adobeaemcloud\.com\/[^"'\s)]+/g,
    (url) => {
      const stripped = url.split('?')[0];
      const local = urlToLocal.get(stripped);
      // Use a placeholder host so callers that do `new URL(image)` succeed.
      // Runtime replaces __MOCK_ORIGIN__ with window.location.origin.
      return local ? `__MOCK_ORIGIN__/mock-assets/${local}` : url;
    },
  );
}

function safeBaseName(url) {
  try {
    const u = new URL(url);
    const lastSeg = u.pathname.split('/').filter(Boolean).pop() || sha1(url).slice(0, 12);
    return lastSeg.replace(/[^A-Za-z0-9._-]/g, '_');
  } catch {
    return sha1(url).slice(0, 12);
  }
}

function main() {
  if (HAR_PATHS.length === 0) {
    console.error('No HAR files found in project root (and none passed on CLI)');
    process.exit(1);
  }
  const entries = [];
  for (const p of HAR_PATHS) {
    if (!fs.existsSync(p)) {
      console.error(`HAR not found at ${p}`);
      process.exit(1);
    }
    const har = JSON.parse(fs.readFileSync(p, 'utf8'));
    entries.push(...har.log.entries);
    console.log(`  loaded ${har.log.entries.length} entries from ${path.relative(ROOT, p)}`);
  }

  ensureDir(OUT_RESP);
  ensureDir(OUT_ASSETS);

  const manifest = {
    generatedFrom: HAR_PATHS.map((p) => path.basename(p)),
    generatedAt: new Date().toISOString(),
    graphqlHosts: [...GQL_HOSTS],
    imageHosts: [...IMG_HOSTS],
    responses: {}, // sig -> { method, host, path, opName, variables, file, status }
    images: {},    // original-url -> local filename
  };

  let gqlSaved = 0;
  let gqlSkippedNoBody = 0;
  let imgSaved = 0;
  let imgSkippedNoBody = 0;

  // Pass 1 — save images, build URL -> local-filename map.
  const urlToLocal = new Map();
  for (const e of entries) {
    const url = e.request.url;
    let u;
    try { u = new URL(url); } catch { continue; }
    const host = u.hostname;
    const content = e.response.content || {};
    const text = content.text;
    const encoding = content.encoding;
    const mime = content.mimeType || '';
    if (!IMG_HOSTS.has(host) && !mime.startsWith('image/')) continue;
    if (!text) { imgSkippedNoBody += 1; continue; }
    const buf = encoding === 'base64' ? Buffer.from(text, 'base64') : Buffer.from(text, 'utf8');
    let base = safeBaseName(url);
    if (!path.extname(base)) {
      const ext = MIME_EXT[mime] || detectExtFromBytes(buf);
      if (ext) base += ext;
    }
    const dest = path.join(OUT_ASSETS, base);
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== buf.length) {
      fs.writeFileSync(dest, buf);
    }
    const stripped = url.split('?')[0];
    urlToLocal.set(stripped, base);
    manifest.images[stripped] = base;
    imgSaved += 1;
  }

  // Pass 2 — save GraphQL responses, rewriting image URLs to local paths.
  for (const e of entries) {
    const url = e.request.url;
    let u;
    try { u = new URL(url); } catch { continue; }
    const host = u.hostname;
    const method = e.request.method;
    const status = e.response.status;
    const content = e.response.content || {};
    const text = content.text;
    const encoding = content.encoding;
    if (!GQL_HOSTS.has(host) || method === 'OPTIONS') continue;
    if (!text) { gqlSkippedNoBody += 1; continue; }
    const query = Object.fromEntries(u.searchParams);
    const body = e.request.postData ? e.request.postData.text : '';
    const { sig, opName, variables } = signatureFromRequest({
      method, host, pathname: u.pathname, query, body,
    });
    if (manifest.responses[sig]) continue;
    const decoded = encoding === 'base64' ? Buffer.from(text, 'base64').toString('utf8') : text;
    const rewritten = rewriteImageUrls(decoded, urlToLocal);
    const file = `${sig}.json`;
    fs.writeFileSync(path.join(OUT_RESP, file), rewritten);
    manifest.responses[sig] = {
      method, host, path: u.pathname, opName, variables, status, file,
    };
    gqlSaved += 1;
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  console.log('mock-commerce build complete');
  console.log(`  GraphQL responses saved : ${gqlSaved}`);
  console.log(`  GraphQL skipped (no body): ${gqlSkippedNoBody}`);
  console.log(`  Images saved            : ${imgSaved}`);
  console.log(`  Images skipped (no body): ${imgSkippedNoBody}`);
  console.log(`  Manifest                : ${path.relative(ROOT, MANIFEST)}`);
}

main();
