/**
 * Dynamic Media Open API video in Franklin:
 * - `/play` URLs → Dynamic Media video player: embed with <iframe>, preserve full query string.
 * - Direct progressive URLs (e.g. …/as/…mp4) → native <video>.
 */

function getFirstUrlFromText(text) {
  if (!text) return '';
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : '';
}

function getUrlFromRow(row) {
  if (!row) return '';

  const anchor = row.querySelector('a[href]');
  if (anchor?.href) return anchor.href;

  const source = row.querySelector('source[srcset]');
  if (source?.srcset) {
    const firstCandidate = source.srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (firstCandidate) return firstCandidate;
  }

  const image = row.querySelector('img[src]');
  if (image?.src) return image.src;

  const video = row.querySelector('video[src]');
  if (video?.src) return video.src;

  return getFirstUrlFromText(row.textContent?.trim());
}

/**
 * Prefer <picture><img> for poster — stable JPEG/PNG, not webp from first <source>.
 * @param {Element | undefined} row
 * @returns {string}
 */
function getPosterUrlFromRow(row) {
  if (!row) return '';
  const imgInPicture = row.querySelector('picture img[src]');
  if (imgInPicture?.src) return imgInPicture.src;
  return getUrlFromRow(row);
}

/**
 * `/play` → iframe with full href. Direct media → native <video>.
 * @param {string} rawUrl
 * @returns {{ href: string, mode: 'progressive' | 'iframe' }}
 */
function resolveDmVideoDelivery(rawUrl) {
  try {
    const u = new URL(rawUrl, window.location.href);
    const path = u.pathname;

    if (/\/play\/?$/i.test(path) || path.endsWith('/play')) {
      return { href: u.href, mode: 'iframe' };
    }

    if (path.includes('/as/') && /\.(mp4|webm|ogg|ogv)(\?|$)/i.test(path)) {
      u.searchParams.delete('wid');
      u.searchParams.delete('dpr');
      u.searchParams.delete('resMode');
      u.searchParams.delete('sdk');
      return { href: u.href, mode: 'progressive' };
    }

    if (/\.(mp4|webm|ogg|ogv)(\?|$)/i.test(path)) {
      return { href: u.href, mode: 'progressive' };
    }

    return { href: rawUrl, mode: 'progressive' };
  } catch (e) {
    return { href: rawUrl, mode: 'progressive' };
  }
}

function getMimeTypeFromUrl(url) {
  try {
    const pathname = new URL(url, window.location.href).pathname.toLowerCase();
    if (pathname.endsWith('.mp4')) return 'video/mp4';
    if (pathname.endsWith('.webm')) return 'video/webm';
    if (pathname.endsWith('.ogg') || pathname.endsWith('.ogv')) return 'video/ogg';
  } catch (e) {
    // Ignore
  }
  return '';
}

export default function decorate(block) {
  const rows = [...block.children];
  const thumbnailUrl = getPosterUrlFromRow(rows[0]);
  const rawVideoUrl = getUrlFromRow(rows[1]);

  if (!rawVideoUrl) {
    return;
  }

  const { href: videoHref, mode } = resolveDmVideoDelivery(rawVideoUrl);

  block.textContent = '';

  if (mode === 'iframe') {
    const wrap = document.createElement('div');
    wrap.className = 'dm-video-iframe-wrap';
    const iframe = document.createElement('iframe');
    iframe.className = 'dm-video-iframe';
    iframe.src = videoHref;
    iframe.title = 'Video';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    );
    wrap.append(iframe);
    block.append(wrap);
    return;
  }

  const video = document.createElement('video');
  video.className = 'dm-video-player';
  video.controls = true;
  video.preload = 'metadata';
  video.playsInline = true;

  if (thumbnailUrl) {
    video.poster = thumbnailUrl;
  }

  const source = document.createElement('source');
  source.src = videoHref;
  const mimeType = getMimeTypeFromUrl(videoHref);
  if (mimeType) source.type = mimeType;
  video.append(source);

  const fallback = document.createElement('p');
  const fallbackLink = document.createElement('a');
  fallbackLink.href = videoHref;
  fallbackLink.textContent = 'View video';
  fallback.append('Your browser does not support embedded videos. ', fallbackLink);
  video.append(fallback);

  block.append(video);
}
