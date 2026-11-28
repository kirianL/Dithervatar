// Synced with package/src/svg.js
import { hashToColors, oklchToHex } from './core.js';

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Trace a rendered avatar canvas into a two-tone SVG.
 */
export function avatarToSvg(source, { hash = '', tones, palette, size = 256, shape = 'square', grid = 64 } = {}) {
  const res = Math.max(32, Math.min(128, Math.round(grid)));
  const [dotHex, bgHex] = hashToColors(hash, tones, 2).map(oklchToHex);
  const outBg = palette?.[0] ?? bgHex;
  const outDot = palette?.[1] ?? dotHex;
  const dot = hexToRgb(dotHex);
  const bg = hexToRgb(bgHex);

  const probe = document.createElement('canvas');
  probe.width = probe.height = res;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, res, res);
  const d = ctx.getImageData(0, 0, res, res).data;

  const near = (i) => {
    const dr = d[i] - dot[0], dg = d[i + 1] - dot[1], db = d[i + 2] - dot[2];
    const br = d[i] - bg[0], bgg = d[i + 1] - bg[1], bb = d[i + 2] - bg[2];
    return dr * dr + dg * dg + db * db < br * br + bgg * bgg + bb * bb;
  };

  let path = '';
  for (let y = 0; y < res; y++) {
    let x = 0;
    while (x < res) {
      if (!near((y * res + x) * 4)) { x++; continue; }
      let run = 1;
      while (x + run < res && near((y * res + x + run) * 4)) run++;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }

  const clip = shape === 'circle'
    ? `<defs><clipPath id="c"><circle cx="${res / 2}" cy="${res / 2}" r="${res / 2}"/></clipPath></defs>`
    : shape === 'squircle'
      ? `<defs><clipPath id="c"><rect width="${res}" height="${res}" rx="${(0.28 * res).toFixed(2)}"/></clipPath></defs>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${res} ${res}" shape-rendering="crispEdges">`
    + clip
    + `<g${clip ? ' clip-path="url(#c)"' : ''}><rect width="${res}" height="${res}" fill="${outBg}"/>`
    + (path ? `<path d="${path}" fill="${outDot}"/>` : '')
    + `</g></svg>`;
}
