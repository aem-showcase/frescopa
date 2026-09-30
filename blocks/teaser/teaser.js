import { createOptimizedPicture } from '../../scripts/aem.js';
import { isSameOriginImage } from '../../scripts/scripts.js';

/* eslint-disable */
export function decorateButtons(...buttons) {
  return buttons
    .map((div) => {
      const a = div.querySelector('a');
      if (a) {
        a.classList.add('button');
        if (a.parentElement.tagName === 'EM') a.classList.add('secondary');
        if (a.parentElement.tagName === 'STRONG') a.classList.add('primary');
        return a.outerHTML;
      }
      return '';
    })
    .join('');
}

export function generateTeaserDOM(props, classes) {
  // Extract properties, always same order as in model, empty string if not set
  const [pictureContainer, eyebrow, title, longDescr, shortDescr, firstCta, secondCta] = props;
  const picture = pictureContainer.querySelector('picture');
  if (picture) {
    const pictureSrc = picture.querySelector('img').src;
    // cross-origin (e.g. delivery-tier) images can't be resized by this site, leave them as-is
    if (isSameOriginImage(pictureSrc)) {
      const optimizedPicture = createOptimizedPicture(pictureSrc, '', false, [{ width: '1360' }]);
      pictureContainer.textContent = '';
      pictureContainer.appendChild(optimizedPicture);
    }
  }
  const hasShortDescr = shortDescr.textContent.trim() !== '';
  // Build DOM
  const teaserDOM = document.createRange().createContextualFragment(`
    <div class='background'>${picture ? picture.outerHTML : ''}</div>
    <div class='foreground'>
      <div class='text'>
        ${
  eyebrow.textContent.trim() !== ''
    ? `<div class='eyebrow'>${eyebrow.textContent.trim().toUpperCase()}</div>`
    : ``
}
        <div class='title'>${title.innerHTML}</div>
        <div class='long-description'>${longDescr.innerHTML}</div>
        <div class='cta'>${decorateButtons(firstCta, secondCta)}</div>
      </div>
      </div>
    </div>
  `);

  // set the mobile background color
  const backgroundColor = [...classes].find((cls) => cls.startsWith('bg-'));
  if (backgroundColor) {
    teaserDOM
      .querySelector('.foreground')
      .style.setProperty('--teaser-background-color', `var(--${backgroundColor.substr(3)})`);
  }

  // add final teaser DOM and classes if used as child component
  return teaserDOM;
}

export default function decorate(block) {
  // get the first and only cell from each row
  const props = [...block.children].map((row) => row.firstElementChild);
  const teaserDOM = generateTeaserDOM(props, block.classList);
  block.textContent = '';
  block.append(teaserDOM);
}
