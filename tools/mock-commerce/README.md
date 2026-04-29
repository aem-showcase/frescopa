# Mock Commerce — offline product data

Lets `/coffee`, `/tea`, and other commerce-driven pages render without
network access to Adobe Commerce or the AEM image delivery service.

## How it works

1. You record a real browsing session as a HAR file (`localhost.har` in the
   project root).
2. `tools/mock-commerce/build-mocks.mjs` extracts every GraphQL response and
   image from the HAR, saving them under:
   - `tools/mock-commerce/responses/<sig>.json` — one file per unique
     GraphQL request signature
   - `mock-assets/<file>` — image bytes
   - `tools/mock-commerce/manifest.json` — index used at runtime
3. `scripts/mock-commerce.js` is loaded by `head.html` before the dropins.
   It overrides `window.fetch`, computes the same signature for each
   commerce GraphQL call, looks up the recorded response, and returns it.
4. Image URLs in the saved responses use `__MOCK_ORIGIN__/mock-assets/...`,
   which the runtime substitutes with `window.location.origin` so
   `<img src>` works.

The block code is unchanged except for one tiny patch in
`blocks/product-list-page-custom/ProductList.js` that skips the
"force https" line when the URL host is `localhost` — needed because
aem-cli serves http only.

## Rebuilding from a new HAR

1. In Chrome DevTools, **Network tab → tick "Disable cache"** and click
   the record button if it's not red.
2. Visit each page you want to make offline (`/coffee`, `/tea`,
   `/machines`, individual product pages, etc.). Wait for them to fully
   load — the persisted-query GETs need to actually hit the network.
3. Right-click in the network panel → **Save all as HAR with content**.
4. Save the file as `localhost.har` in the project root.
5. Run:

   ```bash
   node tools/mock-commerce/build-mocks.mjs
   ```

6. Restart `aem up` (the manifest is loaded once per page, so a hard
   refresh in the browser is enough; no server restart strictly needed).

## What works today (from the captured HAR)

- `/coffee` — bagged-coffee + coffee-pods product lists ✅
- `/tea` — tea product list ✅
- The hero/teaser/footer rendering on those pages ✅
- `/products/<urlKey>/<sku>` — product detail pages ✅ (synthesized;
  see "Synthesized PDP responses" below)

## Synthesized PDP responses

The captured HAR did not contain real `GET_PRODUCT_DATA` responses (Chrome
served them from disk cache). To make detail pages clickable, a second
script — `synthesize-pdp.mjs` — reads the productView entries already
present in the recorded `ProductSearch` responses and writes synthetic
`GET_PRODUCT_DATA` JSON files (with name, sku, urlKey, shortDescription,
images, price filled in; attributes/options empty). Both upper- and
lowercased SKUs are covered so the GET_PRODUCT_DATA signature matches
whether the page derives the SKU from page metadata (uppercase) or from
the URL path (lowercased by `getProductLink`).

Run it manually with `node tools/mock-commerce/synthesize-pdp.mjs`, or
just `npm run build:mocks` (which runs the extractor + synthesizer).

If you ever recapture a HAR with real PDP data (Chrome DevTools → Disable
cache, then visit each product page), `build-mocks.mjs` will record the
authoritative responses and the synthesizer's entries will be overwritten
in the manifest by the real ones on the next run (real entries are
written first, but synthesizer overwrites on collision; reorder if you
want recordings to win — for now they're equivalent for these fields).

## Known limitations

- **Product detail pages (`/products/<sku>`)** don't render product data
  yet because the captured HAR was recorded with Chrome's HTTP cache
  enabled. The `GET_PRODUCT_DATA` responses came from disk cache, so
  Chrome wrote 0-byte placeholders into the HAR for those entries. To fix:
  recapture with **Disable cache** turned on (see step 1 above).
- **`/machines`** and any non-coffee/tea category pages aren't in the HAR.
  Browse them in a fresh capture and rebuild.
- The article block on `/coffee` makes a CORS-protected GraphQL call to
  `publish-p190061-e1982485.adobeaemcloud.com` that this mock doesn't
  cover. The page renders correctly — only the article snippet is missing.
- Cart, checkout, login, and other interactive commerce flows aren't
  mocked. They make many cross-call mutations that would need a more
  involved fixture system.

## Files in this folder

- `build-mocks.mjs` — extraction script
- `responses/` — recorded GraphQL response bodies (one JSON file per
  unique request signature)
- `manifest.json` — sig → response mapping consumed by the runtime
- `README.md` — this file
