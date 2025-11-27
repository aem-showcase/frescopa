import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // Language root detection and path adjustment
  const supportedLocales = ['es', 'fr', 'jp', 'de'];
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let langRoot = '';
  if (pathParts.length > 0 && supportedLocales.includes(pathParts[0])) {
    langRoot = `/${pathParts[0]}`;
  }
  const footerMeta = getMetadata('footer');
  let footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  if (langRoot && !footerPath.startsWith(`${langRoot}/`)) {
    footerPath = `${langRoot}${footerPath}`;
  }
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  // Add accessibility labels to all footer links without text content
  const footerLinks = footer.querySelectorAll('a');
  footerLinks.forEach((link) => {
    if (!link.textContent.trim() && !link.getAttribute('aria-label')) {
      // Check if link contains an image to determine appropriate label
      const img = link.querySelector('img');
      if (img) {
        const altText = img.getAttribute('alt');
        link.setAttribute('aria-label', altText || 'Home - Frescopa');
      } else {
        link.setAttribute('aria-label', 'Home - Frescopa');
      }
    }
  });

  block.append(footer);
}
