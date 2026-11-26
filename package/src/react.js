import { createElement, useEffect, useRef } from 'react';
import { renderDithervatar } from './index.js';

export function DitherAvatar({
  hash = '',
  size = 64,
  shape = 'circle',
  animated = false,
  tones,
  className,
  style,
  ...rest
}) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const cancel = renderDithervatar(canvas, { hash, size, animated, tones });
    return () => {
      if (typeof cancel === 'function') cancel();
    };
  }, [hash, size, animated, tones]);

  const radius = shape === 'circle' ? '9999px' : shape === 'squircle' ? '28%' : undefined;

  return createElement('canvas', {
    ref,
    width: size,
    height: size,
    className,
    style: { display: 'block', width: size, height: size, borderRadius: radius, ...style },
    ...rest,
  });
}
