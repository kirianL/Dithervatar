# dithervatar

Deterministic dithered avatars from any string. Paste a wallet address, username, or any seed — get the same unique avatar every time.

- **WebGL2 renderer**: organic fbm field + domain warp + closed-form Bayer 4×4 halftone, ported from the Portfolio-Kirian banner aesthetic
- **Zero dependencies**: pure ESM, no runtime deps, works in any framework or vanilla JS
- **Automatic fallback**: if WebGL2 is unavailable it falls back to a 2D canvas dither renderer
- **Deterministic**: same string → same avatar, always

## Install

```bash
npm install dithervatar
```

## Usage

### Vanilla JS

```js
import { renderDithervatar } from 'dithervatar';

const canvas = document.querySelector('#avatar');
const cancel = renderDithervatar(canvas, {
  hash: '0x742d35cc6634c0532925a3b844bc454e4438f44e',
  size: 128,
  animated: false,
});

// later: cancel() stops the animation loop (no-op when static)
```

### React

```jsx
import { useEffect, useRef } from 'react';
import { renderDithervatar } from 'dithervatar';

export function Avatar({ hash, size = 64, animated = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    return renderDithervatar(ref.current, { hash, size, animated });
  }, [hash, size, animated]);
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} />;
}
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `hash` | `string` | `''` | Any string. Determines colors, field offset and seeds. |
| `size` | `number` | `64` | Square canvas size in CSS px. |
| `animated` | `boolean` | `false` | Animate the dither field with `requestAnimationFrame`. Respects `prefers-reduced-motion`. |
| `tones` | `string[]` | — | Optional palette override: hex, `oklch()`, or CSS color names. |

### Helpers

```js
import { hashToColors, hashToSeeds, oklchToHex, oklchToCss, parseTone, hasWebGL2 } from 'dithervatar';
```

## Notes

- The canvas is square and transparent-friendly; apply your own `border-radius`/clip for circles, squircles, etc.
- `renderDithervatar` returns a cancel function — call it on unmount or when the hash changes.
- If the canvas already has a 2D context, pass a fresh `<canvas>` element (a canvas can only hold one context type).

## Credits

Hash-seeding, oklch color generation and the 2D dither fallback are adapted from [hashvatar](https://github.com/medhychabour/hashvatar) (MIT). The WebGL2 Bayer halftone renderer is original, ported from the Portfolio-Kirian banner.

## License

MIT © Kirian Luna
