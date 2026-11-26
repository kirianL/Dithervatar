import { hashToColors, hashToSeeds, renderDither } from './core.js';
import { hasWebGL2, renderDitherGL } from './dither-gl.js';

export { hashToColors, hashToSeeds, oklchToCss, oklchToHex, parseTone } from './core.js';
export { hasWebGL2, renderDitherGL } from './dither-gl.js';
export { avatarToSvg } from './svg.js';

export function renderDithervatar(canvas, { hash, size = 64, animated = false, tones } = {}) {
  const h = hash == null ? '' : String(hash);
  const colors = hashToColors(h, tones, 2);
  const seeds = hashToSeeds(h, 4);

  if (hasWebGL2()) {
    const cancel = renderDitherGL(canvas, { size, colors, animated, seeds });
    if (cancel !== false) return typeof cancel === 'function' ? cancel : () => {};
  }

  const cancel2d = renderDither(canvas, { size, colors, animated, seeds });
  return typeof cancel2d === 'function' ? cancel2d : () => {};
}

export function renderDithervatarTo(canvas, hash, options = {}) {
  return renderDithervatar(canvas, { ...options, hash });
}
