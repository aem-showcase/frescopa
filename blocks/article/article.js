import { getAEMPublish, getAEMAuthor } from '../../scripts/endpointconfig.js';

/* eslint-disable no-underscore-dangle */
export default async function decorate(block) {
  const aempublishurl = getAEMPublish();
  const aemauthorurl = getAEMAuthor();
  const persistedquery = '/graphql/execute.json/frescopa/ArticleByPath';
  const articlepath = block.querySelector(':scope div:nth-child(1) > div a').innerHTML.trim();
  let variationname = block.querySelector(':scope div:nth-child(2) > div').innerHTML.trim();
  if (!variationname) {
    variationname = 'main';
  }

  const targetScopeInput = block.querySelector(':scope div:nth-child(3) > div')?.textContent?.trim() || '';
  const targetScope = /^[A-Za-z0-9._:-]+$/.test(targetScopeInput) ? targetScopeInput : '';
  const targetScopeAttr = targetScope ? ` data-target-scope="${targetScope}"` : '';

  const url = window.location && window.location.origin && window.location.origin.includes('author')
    ? `${aemauthorurl}${persistedquery};path=${articlepath};variation=${variationname};ts=${Math.random() * 1000}`
    : `${aempublishurl}${persistedquery};path=${articlepath};variation=${variationname};ts=${Math.random() * 1000}`;
  const options = { credentials: 'include' };

  const cfReq = await fetch(url, options)
    .then((response) => response.json())
    .then((contentfragment) => {
      let path = '';
      if (contentfragment.data) {
        path = contentfragment.data.articleByPath.item;
      }
      return path;
    });

  const itemId = `urn:aemconnection:${articlepath}/jcr:content/data/master`;

  block.innerHTML = `
  <div class='article-content' data-aue-resource=${itemId} data-aue-label="article content fragment" data-aue-type="reference" data-aue-filter="cf"${targetScopeAttr}>
      <div>
          <h4 data-aue-prop="headline" data-aue-label="headline" data-aue-type="text" class='headline'>${cfReq.title}</h4>
          <p data-aue-prop="detail" data-aue-label="detail" data-aue-type="richtext" class='detail'>${cfReq.content.plaintext}</p>
      </div>
  </div>
`;
}
