import { getAEMPublish, getAEMAuthor } from '../../scripts/endpointconfig.js';

/* eslint-disable no-underscore-dangle */
export default async function decorate(block) {
  const aempublishurl = getAEMPublish();
  const aemauthorurl = getAEMAuthor();
  const persistedquery = '/graphql/execute.json/frescopa/OfferByPath';
  const offerpath = block.querySelector(':scope div:nth-child(1) > div a').innerHTML.trim();
  let variationname = 'main';
  const variationElem = block.querySelector(':scope div:nth-child(2) > div > p');
  if (variationElem && variationElem.innerHTML) {
    variationname = variationElem.innerHTML.trim();
  }

  const targetScopeInput = block.querySelector(':scope div:nth-child(3) > div')?.textContent?.trim() || '';
  const targetScope = /^[A-Za-z0-9._:-]+$/.test(targetScopeInput) ? targetScopeInput : '';
  const targetScopeAttr = targetScope ? ` data-target-scope="${targetScope}"` : '';

  const url = window.location && window.location.origin && window.location.origin.includes('author')
    ? `${aemauthorurl}${persistedquery};path=${offerpath};variation=${variationname};ts=${Math.random() * 1000}`
    : `${aempublishurl}${persistedquery};path=${offerpath};variation=${variationname};ts=${Math.random() * 1000}`;
  const options = { credentials: 'include' };

  const cfReq = await fetch(url, options)
    .then((response) => response.json())
    .then((contentfragment) => {
      let offer = '';
      if (contentfragment.data) {
        offer = contentfragment.data.offerByPath.item;
      }
      return offer;
    });

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
