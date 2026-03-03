import { getAEMPublish, getAEMAuthor } from '../../scripts/endpointconfig.js';

/* eslint-disable no-underscore-dangle */
export default async function decorate(block) {
  const aempublishurl = getAEMPublish();
  const aemauthorurl = getAEMAuthor();
  const persistedquery = '/graphql/execute.json/frescopa/OfferByPath';

  const getValueCell = (rowIndex) => block.querySelector(`:scope > div:nth-child(${rowIndex}) > div:last-child`);

  const offerPathCell = getValueCell(1);
  const offerPathLink = offerPathCell?.querySelector('a');
  const offerpath = (
    offerPathLink?.getAttribute('href')
    || offerPathLink?.textContent
    || offerPathCell?.textContent
    || ''
  ).trim();

  let variationname = 'main';
  const variationElem = getValueCell(2);
  if (variationElem && variationElem.textContent) {
    variationname = variationElem.textContent.trim();
  }

  const targetScopeInput = getValueCell(3)?.textContent?.trim() || '';
  const targetScope = /^[A-Za-z0-9._:-]+$/.test(targetScopeInput) ? targetScopeInput : '';
  const targetScopeAttr = targetScope ? ` data-target-scope="${targetScope}"` : '';
  if (targetScope) {
    block.setAttribute('data-target-scope', targetScope);
  }

  if (!offerpath) {
    // Keep block editable in UE, but skip CF fetch if path is missing.
    return;
  }

  const url = window.location && window.location.origin && window.location.origin.includes('author')
    ? `${aemauthorurl}${persistedquery};path=${offerpath};variation=${variationname};ts=${Math.random() * 1000}`
    : `${aempublishurl}${persistedquery};path=${offerpath};variation=${variationname};ts=${Math.random() * 1000}`;
  const options = { credentials: 'include' };

  let cfReq;
  try {
    cfReq = await fetch(url, options)
      .then((response) => response.json())
      .then((contentfragment) => contentfragment?.data?.offerByPath?.item || null);
  } catch (error) {
    // Don't throw in authoring; keep block visible/editable.
    // eslint-disable-next-line no-console
    console.warn('[offer] Failed to fetch content fragment data.', error);
    return;
  }

  if (!cfReq) {
    return;
  }

  const itemId = `urn:aemconnection:${offerpath}/jcr:content/data/master`;

  block.innerHTML = `
  <div class='offer-content' data-aue-resource=${itemId} data-aue-label="offer content fragment" data-aue-type="reference" data-aue-filter="cf"${targetScopeAttr}>
      <div class='offer-left'>
          <h4 data-aue-prop="headline" data-aue-label="headline" data-aue-type="text" class='headline'>${cfReq.headline}</h4>
          <p data-aue-prop="detail" data-aue-label="detail" data-aue-type="richtext" class='detail'>${cfReq.detail.plaintext}</p>
      </div>
      <div class='offer-right'>
         <a href="${cfReq.ctaUrl}" data-aue-prop="callToAction" data-aue-label="Call to Action" data-aue-type="text" class='button secondary'>${cfReq.callToAction}</a>
      </div>
  </div>
`;
}
