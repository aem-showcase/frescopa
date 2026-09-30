# Fixing Delivery-Tier Images ("Dynamic Media") Rendering as Links

## The problem

When an author picks an image asset that lives on AEM's **delivery tier** (for example, an
Adobe Stock asset served through the AEM Assets Delivery API, or any DAM path the authoring
pipeline doesn't resolve into markup at author/publish time), Edge Delivery Services (EDS)
does not turn the reference into a `<picture>` element. Instead it emits a plain link:

```html
<div class="teaser left">
  <div>
    <div>
      <a href="https://delivery-p149891-e1546482.adobeaemcloud.com/adobe/assets/urn:aaid:aem:.../as/AdobeStock_112960749.avif">
        Young woman sitting on couch at home and drinking coffee
      </a>
    </div>
  </div>
  ...
</div>
```

Blocks (and default content) that expect a `<picture>`/`<img>` structure for images silently
render nothing, because their decoration code looks for `block.querySelector('picture')` and
finds none.

This is a project-wide issue: **any** field of type `image`/`reference` can be filled with a
delivery-tier asset, in any block, not just `teaser`. See
https://www.aem.live/docs/media for the background and the two officially documented ways to
resolve it.

## The two documented fixes

### Approach A — Built-in Media Bus Delivery (preferred, requires authoring changes)

The asset is copied/ingested into AEM's **Media Bus** at paste/preview time, and the page is
delivered with real `<picture>` markup generated server-side — no client-side workaround
needed.

To opt an image field into this, the Universal Editor's asset picker needs a companion
`<field>MimeType` field next to the image reference field. When an author selects an asset,
the Custom Content Advisor extension auto-populates that field with the asset's MIME type; if
it's `image/*`, the page pipeline publishes the reference through Media Bus as `<picture>`
markup instead of a link.

Model changes required per image field (see `component-models.json`, generated from the
per-block `_<blockname>.json` files under `blocks/*/` and `models/`):

```jsonc
{
  "component": "custom-asset-namespace:custom-asset",
  "valueType": "string",
  "name": "image",
  "label": "Image",
  "configUrl": "https://main--<repo>--<owner>.aem.live/tools/assets-selector/image.config.json"
},
{
  "component": "custom-asset-namespace:custom-asset-mimetype",
  "valueType": "string",
  "name": "imageMimeType",
  "label": "Image Mime Type"
}
```

`custom-asset-namespace` is the extension's default namespace (used unless an org has
explicitly configured a different `asset-namespace` extension parameter) — no per-org lookup
is required to use it. `MimeType` is a native AEM/xwalk field-collapse suffix (like `Alt`,
`Title`, `Type`, `Text`), so the convention itself works even without the Custom Content
Advisor extension; the *auto-population on asset selection* behavior specifically comes from
that extension.

This requires a picker config file, referenced via `configUrl`, e.g.
`tools/assets-selector/image.config.json`:

```json
{
  "repositoryId": "delivery-p149891-e1546482.adobeaemcloud.com",
  "aemTierType": "delivery",
  "filterSchema": { "type": "image/*" }
}
```

This is a **content-model / authoring change**, not application code — see
https://www.aem.live/developer/component-model-definitions#images.

> Applying this project-wide (switching every image field's component and adding the sibling
> `MimeType` field) was tested on `aem-showcase/frescopa-stage` (see PR
> https://github.com/aem-showcase/frescopa-stage/pull/9). Full end-to-end confirmation that
> this specific org's Universal Editor recognizes `custom-asset-namespace:custom-asset` for a
> given block still requires a manual authoring test in the Universal Editor.

### Approach B — Asset Management Delivery / client-side rewrite (implemented in this repo)

The asset stays an external link; a small, **officially documented** client-side rewrite (see
https://www.aem.live/docs/media) converts any `<a>` pointing directly at an image file into a
real `<picture>` element before the rest of the page decoration runs. This works regardless of
authoring/model configuration and requires no author-facing changes, so it was implemented
first as the baseline fix in this repo.

Implementation lives in `scripts/scripts.js`:

```js
const IMAGE_HREF_RE = /\.(?:avif|webp|png|jpe?g|gif|svg)$/i;

export function decorateLinkedPictures(main) {
  main.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    const url = new URL(href, window.location.href);
    if (!IMAGE_HREF_RE.test(url.pathname)) return;

    const alt = link.textContent.trim();
    let picture;
    if (url.origin === window.location.origin) {
      // same-origin assets can be routed through the site's own image optimizer
      picture = createOptimizedPicture(url.pathname, alt);
    } else {
      // cross-origin (e.g. delivery tier) assets can't be resized by this site, use as-is
      picture = document.createElement('picture');
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = alt;
      img.src = href;
      picture.append(img);
    }
    moveInstrumentation(link, picture);
    link.replaceWith(picture);
  });
}
```

Key points:

- Called **first** in `decorateMain()` (and before `decorateLinks(main)` in this repo, since
  `decorateLinks` performs store-path localization that would otherwise mangle absolute image
  URLs before this check runs).
- Same-origin image links (e.g. already-published assets on this site) are routed through
  `createOptimizedPicture` to get responsive `srcset`/breakpoints. Cross-origin links (delivery
  tier, external DAM) are rendered as a plain `<picture><img>` since this site can't resize
  assets it doesn't own.
- `moveInstrumentation(link, picture)` copies the Universal Editor authoring attributes
  (`data-aue-*`, `data-richtext-*`) from the original `<a>` onto the generated `<picture>`
  **before** the swap, so UE selection/overlays keep working for the converted field. Without
  this, an author would lose the ability to select/re-edit that field in the Universal Editor
  after the client-side conversion ran.

## Status in this repo

- Approach B (`decorateLinkedPictures` + `moveInstrumentation`) is implemented in
  `scripts/scripts.js` and merged to `main` (PRs #74, #75).
- Approach A has **not** been ported to this repo yet. It was implemented and tested for all
  image fields on `aem-showcase/frescopa-stage` (see PR #9 there); if this repo's authors want
  server-side Media Bus delivery instead of (or in addition to) the client-side fallback, port
  the same per-block model changes here and add
  `tools/assets-selector/image.config.json` with this org's actual author/delivery repository
  hostnames.
- Both approaches can coexist: Approach A handles the common case server-side, and Approach B
  acts as a safety net for any image reference that Approach A doesn't catch (e.g. fields not
  yet migrated to the `custom-asset` component).
