#!/usr/bin/env node
/* eslint-disable no-console */
// Synthesizes GET_PRODUCT_DATA mock responses from the productView data
// already captured in the recorded ProductSearch responses. The HAR didn't
// include real PDP responses (Chrome cache served them); this fills the gap
// so /products/<urlKey>/<sku> renders offline using the same image + text
// the listing pages already have.
//
// Run after build-mocks.mjs.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_RESP = path.join(ROOT, 'tools/mock-commerce/responses');
const MANIFEST = path.join(ROOT, 'tools/mock-commerce/manifest.json');

const PDP_HOST = 'catalog-service-sandbox.adobe.io';
const PDP_PATH = '/graphql';
const OP_NAME = 'GET_PRODUCT_DATA';

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }

function canonicalJSON(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

function sigFor(variables) {
  const raw = `GET|${PDP_HOST}|${PDP_PATH}|${OP_NAME}|${canonicalJSON(variables)}`;
  return sha1(raw).slice(0, 16);
}

// Build a SimpleProductView shape that satisfies the PDP transformer
// (see scripts/__dropins__/storefront-pdp/chunks/isProductConfigurationValid.js
// function X — it reads name, sku, isBundle, addToCartAllowed, inStock,
// shortDescription, metaDescription, metaKeyword, metaTitle, description,
// images, price, attributes, options, optionUIDs, url, urlKey, externalId,
// externalParentId, variantSku, __typename).
function synthesize(pv) {
  const description = pv.shortDescription || pv.name || '';
  return {
    __typename: 'SimpleProductView',
    id: pv.sku,
    sku: pv.sku,
    externalId: pv.sku,
    externalParentId: null,
    variantSku: null,
    name: pv.name,
    urlKey: pv.urlKey,
    url: `/products/${pv.urlKey}/${pv.sku}`.toLowerCase(),
    inStock: true,
    addToCartAllowed: true,
    shortDescription: pv.shortDescription || '',
    description,
    metaDescription: pv.shortDescription || '',
    metaKeyword: '',
    metaTitle: pv.name,
    images: (pv.images || []).map((img) => ({ url: img.url, label: pv.name, roles: ['image'] })),
    attributes: [],
    options: [],
    optionUIDs: [],
    price: pv.price,
  };
}

function collectProductViews() {
  const seen = new Map();
  const files = fs.readdirSync(OUT_RESP).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    let json;
    try { json = JSON.parse(fs.readFileSync(path.join(OUT_RESP, f), 'utf8')); } catch { continue; }
    const items = json?.data?.productSearch?.items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const pv = it?.productView;
      if (pv?.sku && !seen.has(pv.sku)) seen.set(pv.sku, pv);
    }
  }
  return [...seen.values()];
}

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`manifest not found at ${MANIFEST} — run build-mocks.mjs first`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const pvs = collectProductViews();
  if (pvs.length === 0) {
    console.warn('no productView entries found in recorded responses');
    return;
  }

  let written = 0;
  for (const pv of pvs) {
    const product = synthesize(pv);
    const body = JSON.stringify({ data: { products: [product] } });
    // Cover both casings the page may request — metadata-driven SKU is
    // typically uppercase, URL-derived SKU is lowercased by getProductLink.
    const skuVariants = new Set([pv.sku, pv.sku.toLowerCase(), pv.sku.toUpperCase()]);
    for (const skuVar of skuVariants) {
      const variables = { skus: [skuVar] };
      const sig = sigFor(variables);
      const file = `${sig}.json`;
      fs.writeFileSync(path.join(OUT_RESP, file), body);
      manifest.responses[sig] = {
        method: 'GET',
        host: PDP_HOST,
        path: PDP_PATH,
        opName: OP_NAME,
        variables,
        status: 200,
        file,
        synthesized: true,
      };
      written += 1;
    }
  }

  manifest.synthesizedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`synthesized ${written} GET_PRODUCT_DATA responses for ${pvs.length} products`);
  console.log(`SKUs: ${pvs.map((p) => p.sku).join(', ')}`);
}

main();
