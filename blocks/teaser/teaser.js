import { createOptimizedPicture } from '../../scripts/aem.js';

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

function optimizePictureInContainer(container) {
  const picture = container?.querySelector('picture');
  if (picture) {
    const img = picture.querySelector('img');
    if (img?.src) {
      const optimizedPicture = createOptimizedPicture(img.src, '', false, [{ width: '1360' }]);
      container.textContent = '';
      container.appendChild(optimizedPicture);
      return container.querySelector('picture');
    }
  }
  return null;
}

export function generateTeaserDOM(props, classes) {
  // Extract properties: same order as in model; optional 8th = second hero image
  const pictureContainer = props[0];
  const eyebrow = props[1];
  const title = props[2];
  const longDescr = props[3];
  const shortDescr = props[4];
  const firstCta = props[5];
  const secondCta = props[6];
  const secondPictureContainer = props[7];

  const picture = optimizePictureInContainer(pictureContainer);
  const secondPicture = secondPictureContainer
    ? optimizePictureInContainer(secondPictureContainer)
    : null;
  const hasSecondHero = Boolean(secondPicture);

  const foregroundHTML = `
    <div class='foreground'>
      <div class='text'>
        ${
  eyebrow?.textContent?.trim() !== ''
    ? `<div class='eyebrow'>${eyebrow.textContent.trim().toUpperCase()}</div>`
    : ''
}
        <div class='title'>${title?.innerHTML ?? ''}</div>
        <div class='long-description'>${longDescr?.innerHTML ?? ''}</div>
        <div class='cta'>${decorateButtons(...[firstCta, secondCta].filter(Boolean))}</div>
      </div>
    </div>
  `;

  let innerHTML;
  if (hasSecondHero) {
    innerHTML = `
      <div class='background'>${picture ? picture.outerHTML : ''}</div>
      <div class='teaser-inner'>
        ${foregroundHTML}
        <div class='second-hero'>${secondPicture.outerHTML}</div>
      </div>
    `;
  } else {
    innerHTML = `
      <div class='background'>${picture ? picture.outerHTML : ''}</div>
      ${foregroundHTML}
    `;
  }

  const teaserDOM = document.createRange().createContextualFragment(innerHTML);

  const foreground = teaserDOM.querySelector('.foreground');
  const backgroundColor = [...classes].find((cls) => cls.startsWith('bg-'));
  if (backgroundColor && foreground) {
    foreground.style.setProperty('--teaser-background-color', `var(--${backgroundColor.substr(3)})`);
  }

  return { fragment: teaserDOM, hasSecondHero };
}

export default function decorate(block) {
  const props = [...block.children].map((row) => row.firstElementChild);
  const { fragment: teaserDOM, hasSecondHero } = generateTeaserDOM(props, block.classList);
  block.textContent = '';
  block.append(teaserDOM);
  if (hasSecondHero) {
    block.classList.add('has-second-hero');
  }
}
