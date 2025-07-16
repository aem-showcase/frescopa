export function decorateAnchor(firstCta, pictureContainer) {
  const a = firstCta.querySelector('a');
  if (!a) {
    return '';
  }
  a.classList.add('cta-link');
  const img = pictureContainer.querySelector('img');
  if (img) {
    a.prepend(img);
  }
  return a;
}

export default async function decorate(block) {
  const props = [...block.children].map((row) => row.firstElementChild);
  const [pictureContainer, firstCta] = props;

  const container = document.createElement('div');
  container.classList.add('sticky-cta');
  container.appendChild(decorateAnchor(firstCta, pictureContainer));
  block.innerHTML = '';
  block.appendChild(container);
}
