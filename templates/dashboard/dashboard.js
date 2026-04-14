import { loadFragment } from '../../blocks/fragment/fragment.js';

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function replacePlaceholders(root, data) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue.includes('{{')) nodes.push(node);
    node = walker.nextNode();
  }
  nodes.forEach((textNode) => {
    textNode.nodeValue = textNode.nodeValue.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
      if (!data) return '';
      const value = resolvePath(data, key.trim());
      return value !== undefined && value !== null ? value : '';
    });
  });
}

async function fetchCrmData(username) {
  try {
    const response = await fetch('https://3374739-frescopab2b.adobeioruntime.net/api/v1/web/frescopa-b2b/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    // eslint-disable-next-line no-console
    console.log('CRM data:', data);
    return data;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch CRM data:', error);
    return null;
  }
}

export default async function decorate(doc) {
  const main = doc.querySelector('main');
  if (!main) return;

  const authResponse = await fetch('/auth/me');
  const auth = authResponse.ok ? await authResponse.json() : null;
  const username = auth?.email ?? null;
  const crmDataPromise = username ? fetchCrmData(username) : Promise.resolve(null);
  // Expose promise so blocks on this template can share the same fetch
  window.frescopaData = crmDataPromise;

  // Build sidebar from content fragment
  const sidebar = document.createElement('aside');
  sidebar.className = 'dashboard-sidebar';
  const fragment = await loadFragment('/dashboard-sidebar');
  if (fragment) {
    sidebar.append(...fragment.childNodes);
  }

  // Wrap existing main content
  const content = document.createElement('div');
  content.className = 'dashboard-content';
  while (main.firstChild) content.append(main.firstChild);

  const layout = document.createElement('div');
  layout.className = 'dashboard-layout';
  layout.append(sidebar, content);
  main.append(layout);

  const crmData = await crmDataPromise;
  replacePlaceholders(main, crmData);
  if (crmData?.company) {
    const portalTitle = `Frescopa Portal for ${crmData.company}`;
    document.title = portalTitle;
    ['og:title', 'twitter:title'].forEach((property) => {
      const meta = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
      if (meta) meta.setAttribute('content', portalTitle);
    });
  }
}
