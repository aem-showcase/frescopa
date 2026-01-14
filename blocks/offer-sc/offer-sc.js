import { fetchBackendAPI } from '../../scripts/sc-api.js';

/* eslint-disable no-underscore-dangle */
export default async function decorate(block) {
  // Extract the path parameter from the block content (same as original offer block)
  const offerPathElement = block.querySelector(':scope div:nth-child(1) > div a');
  if (!offerPathElement) {
    return; // Let default decoration happen
  }

  const offerpath = offerPathElement.innerHTML.trim();

  // Call the backend API to get content
  const response = await fetchBackendAPI(offerpath);

  // Validate response and required fields - return early to let default decoration happen
  if (!response?.headline || !response?.detail || !response?.cta?.label || !response?.cta?.url) {
    return;
  }

  // Map the response structure to match the original offer structure
  const cfReq = {
    headline: response.headline,
    detail: {
      plaintext: response.detail,
    },
    callToAction: response.cta.label,
    ctaUrl: response.cta.url,
  };

  // Create the itemId for AEM data attributes (keeping same format as original)
  const itemId = `urn:aemconnection:${offerpath}/jcr:content/data/master`;

  // Generate the exact same HTML as the original offer block
  block.innerHTML = `
  <div class='offer-content' data-aue-resource=${itemId} data-aue-label="offer content fragment" data-aue-type="reference" data-aue-filter="cf">
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
