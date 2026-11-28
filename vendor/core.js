// src/hash.ts
function fnv1a(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = hash * 16777619 >>> 0;
  }
  return hash;
}
function seededRng(seed) {
  let s = seed;
  return () => {
    s |= 0;
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashToSeeds(hash, count) {
  const base = fnv1a(hash.toLowerCase().trim());
  const rng = seededRng(base);
  return Array.from({ length: count }, () => rng());
}

// src/color.ts
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function linearize(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function rgbToOklch(r, g, b) {
  const rl = linearize(r), gl = linearize(g), bl = linearize(b);
  const x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl;
  const lm = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const mm = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const sm = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);
  const L = 0.2104542553 * lm + 0.793617785 * mm - 0.0040720468 * sm;
  const a = 1.9779984951 * lm - 2.428592205 * mm + 0.4505937099 * sm;
  const bk = 0.0259040371 * lm + 0.7827717662 * mm - 0.808675766 * sm;
  return { l: L, c: Math.sqrt(a * a + bk * bk), h: (Math.atan2(bk, a) * 180 / Math.PI + 360) % 360 };
}
function oklchToHex({ l, c, h }) {
  const hRad = h * Math.PI / 180;
  const a = c * Math.cos(hRad), b = c * Math.sin(hRad);
  const lm = l + 0.3963377774 * a + 0.2158037573 * b;
  const mm = l - 0.1055613458 * a - 0.0638541728 * b;
  const sm = l - 0.0894841775 * a - 1.291485548 * b;
  const L3 = lm * lm * lm, M3 = mm * mm * mm, S3 = sm * sm * sm;
  const rl = 4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3;
  const gl = -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3;
  const bl = -0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3;
  const toSrgb = (v) => {
    const cv = Math.max(0, Math.min(1, v));
    return cv <= 31308e-7 ? cv * 12.92 : 1.055 * Math.pow(cv, 1 / 2.4) - 0.055;
  };
  return "#" + [rl, gl, bl].map((v) => Math.round(toSrgb(v) * 255).toString(16).padStart(2, "0")).join("");
}
function oklchToCss({ l, c, h }) {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}
function parseTone(tone) {
  const t = tone.trim();
  if (/^[a-zA-Z]+$/.test(t)) {
    if (typeof document === "undefined") return null;
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = 1;
    const ctx = tmp.getContext("2d");
    ctx.fillStyle = t;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    if (r + g + b > 0 || t.toLowerCase() === "black") return rgbToOklch(r, g, b);
    return null;
  }
  if (t.startsWith("#") || /^[0-9a-f]{3,6}$/i.test(t)) {
    const rgb = hexToRgb(t.startsWith("#") ? t : "#" + t);
    return rgbToOklch(...rgb);
  }
  const m = t.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)/i);
  if (m) {
    const l = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return { l, c: parseFloat(m[2]), h: parseFloat(m[3]) };
  }
  return null;
}
function generateColor(seed, lSeed, cSeed, tones, isSecondary = false, baseHue) {
  let h, l, c;
  if (tones && tones.length > 0) {
    const ti = Math.floor(seed * tones.length) % tones.length;
    const tone = tones[ti];
    h = (tone.h + (seed * 2 - 1) * 30 + 360) % 360;
    l = isSecondary ? 0.22 + lSeed * 0.18 : 0.52 + lSeed * 0.22;
    c = isSecondary ? Math.max(tone.c * 0.5, 0.06) + cSeed * 0.08 : Math.max(tone.c * 0.8, 0.14) + cSeed * 0.1;
  } else {
    const hue = baseHue ?? seed * 360;
    h = (hue + 360) % 360;
    if (isSecondary) {
      l = 0.18 + cSeed * 0.2;
      c = 0.08 + lSeed * 0.12;
    } else {
      l = 0.55 + lSeed * 0.22;
      c = 0.18 + cSeed * 0.18;
    }
  }
  return { l, c: Math.min(c, 0.37), h };
}

// src/gradient.ts
var SHAPES = [
  [[0.85, 0.5], [0.75, 0.18], [0.38, 0.22], [0.18, 0.52], [0.38, 0.82], [0.72, 0.78]],
  [[0.22, 0.32], [0.78, 0.28], [0.82, 0.62], [0.5, 0.88], [0.18, 0.68], [0.28, 0.48]],
  [[0.5, 0.12], [0.88, 0.45], [0.72, 0.88], [0.28, 0.82], [0.12, 0.42], [0.35, 0.18]],
  [[0.62, 0.25], [0.9, 0.55], [0.65, 0.9], [0.25, 0.7], [0.1, 0.4], [0.35, 0.15]],
  [[0.15, 0.2], [0.55, 0.08], [0.92, 0.35], [0.78, 0.75], [0.4, 0.92], [0.2, 0.6]],
  [[0.45, 0.08], [0.82, 0.3], [0.7, 0.85], [0.3, 0.88], [0.08, 0.5], [0.25, 0.25]]
];
var _filterSupported = null;
function hasFilterBlur() {
  if (_filterSupported !== null) return _filterSupported;
  try {
    const c = document.createElement("canvas");
    c.width = 30;
    c.height = 30;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 30, 30);
    x.filter = "blur(6px)";
    x.fillStyle = "#000";
    x.fillRect(12, 12, 4, 4);
    _filterSupported = x.getImageData(22, 22, 1, 1).data[0] < 255;
    x.filter = "none";
  } catch {
    _filterSupported = false;
  }
  return _filterSupported;
}
function boxBlurCanvas(ctx, w, h, radius, passes = 3) {
  const r = Math.max(1, Math.round((Math.sqrt(4 * radius * radius + 1) - 1) / 2));
  const imgData = ctx.getImageData(0, 0, w, h);
  const s = imgData.data;
  const d = new Uint8ClampedArray(s.length);
  const diam = r * 2 + 1;
  const inv = 1 / diam;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let rs = 0, gs = 0, bs = 0, as = 0;
      for (let dx = -r; dx <= r; dx++) {
        const i = row + Math.max(0, Math.min(w - 1, dx)) << 2;
        rs += s[i];
        gs += s[i | 1];
        bs += s[i | 2];
        as += s[i | 3];
      }
      for (let x = 0; x < w; x++) {
        const o = row + x << 2;
        d[o] = rs * inv;
        d[o | 1] = gs * inv;
        d[o | 2] = bs * inv;
        d[o | 3] = as * inv;
        const ai = row + Math.min(w - 1, x + r + 1) << 2;
        const ri = row + Math.max(0, x - r) << 2;
        rs += s[ai] - s[ri];
        gs += s[ai | 1] - s[ri | 1];
        bs += s[ai | 2] - s[ri | 2];
        as += s[ai | 3] - s[ri | 3];
      }
    }
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0;
      for (let dy = -r; dy <= r; dy++) {
        const i = Math.max(0, Math.min(h - 1, dy)) * w + x << 2;
        rs += d[i];
        gs += d[i | 1];
        bs += d[i | 2];
        as += d[i | 3];
      }
      for (let y = 0; y < h; y++) {
        const o = y * w + x << 2;
        s[o] = rs * inv;
        s[o | 1] = gs * inv;
        s[o | 2] = bs * inv;
        s[o | 3] = as * inv;
        const ai = Math.min(h - 1, y + r + 1) * w + x << 2;
        const ri = Math.max(0, y - r) * w + x << 2;
        rs += d[ai] - d[ri];
        gs += d[ai | 1] - d[ri | 1];
        bs += d[ai | 2] - d[ri | 2];
        as += d[ai | 3] - d[ri | 3];
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
function drawShape(ctx, path, size, tx, ty, rotate, scale, fillStyle, offsetX, offsetY) {
  const cx = size / 2;
  const cy = size / 2;
  ctx.save();
  ctx.translate(offsetX + cx, offsetY + cy);
  ctx.translate(tx, ty);
  ctx.rotate(rotate);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.beginPath();
  ctx.moveTo(path[0][0] * size, path[0][1] * size);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i][0] * size, path[i][1] * size);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}
function getDevicePixelRatio() {
  if (typeof window === "undefined" || !window.devicePixelRatio) return 1;
  return Math.min(window.devicePixelRatio, 3);
}
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderGradient(canvas, { size, colors, animated = false, seeds }) {
  const still = !animated || prefersReducedMotion();
  if (colors.length < 4) return null;
  const dpr = getDevicePixelRatio();
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const mix = seeds[0].toString() + seeds[1].toString() + seeds[2].toString() + seeds[3].toString();
  const allSeeds = hashToSeeds(mix, 24);
  const layers = [0, 1, 2, 3, 4, 5].map((i) => {
    const j = i * 4;
    return {
      tx: (allSeeds[j] - 0.5) * size * 0.35,
      ty: (allSeeds[j + 1] - 0.5) * size * 0.35,
      rotate: (allSeeds[j + 2] - 0.5) * Math.PI * 1.2,
      scale: 0.85 + allSeeds[j + 3] * 0.5
    };
  });
  const hex0 = oklchToHex(colors[0]);
  const hexColors = [oklchToHex(colors[1]), oklchToHex(colors[2]), oklchToHex(colors[3])];
  const LAYER_OPTS = [
    { composite: "source-over", alpha: 0.9 },
    { composite: "overlay", alpha: 0.48 },
    { composite: "soft-light", alpha: 0.7 },
    { composite: "source-over", alpha: 0.78 },
    { composite: "overlay", alpha: 0.4 },
    { composite: "soft-light", alpha: 0.6 }
  ];
  const blur = Math.max(2, Math.round(size * 0.21));
  const pad = Math.ceil(blur * 1.9);
  const useFilter = hasFilterBlur();
  const ROT_SPEEDS = [0.5, 0.6, 0.45, 0.55, 0.5, 0.65];
  const DRIFT_AMP = size * 0.18;
  const DRIFT_FREQS = [0.5, 0.45, 0.4, 0.48, 0.52, 0.38];
  const DRIFT_PHASE_OFFSETS = [0, 1, 2, 0.5, 1.5, 3];
  const PHASE_SPEED = 1.2;
  const w = size + pad * 2;
  const h = size + pad * 2;
  const animResScale = !useFilter && !still ? 0.5 : 1;
  const offCanvas = document.createElement("canvas");
  offCanvas.width = w * dpr * animResScale;
  offCanvas.height = h * dpr * animResScale;
  const offCtx = offCanvas.getContext("2d");
  offCtx.scale(dpr * animResScale, dpr * animResScale);
  const draw = (phase2) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = hex0;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6; i++) {
      const layer = layers[i];
      const rot = layer.rotate + (animated ? phase2 * ROT_SPEEDS[i] : 0);
      const driftX = animated ? DRIFT_AMP * Math.sin(phase2 * DRIFT_FREQS[i] + DRIFT_PHASE_OFFSETS[i]) : 0;
      const driftY = animated ? DRIFT_AMP * Math.sin(phase2 * DRIFT_FREQS[(i + 2) % 6] + DRIFT_PHASE_OFFSETS[i] * 1.3) : 0;
      const scalePulse = animated ? 1 + 0.15 * Math.sin(phase2 * 0.9 + i * 0.7) : 1;
      const scale = layer.scale * scalePulse;
      const opts = LAYER_OPTS[i];
      const hex = hexColors[i % 3];
      offCtx.clearRect(0, 0, w, h);
      drawShape(offCtx, SHAPES[i], size, layer.tx + driftX, layer.ty + driftY, rot, scale, hex, pad, pad);
      if (useFilter) {
        ctx.save();
        ctx.filter = `blur(${blur * dpr}px)`;
        ctx.globalCompositeOperation = opts.composite;
        ctx.globalAlpha = opts.alpha;
        ctx.drawImage(offCanvas, 0, 0, offCanvas.width, offCanvas.height, -pad, -pad, w, h);
        ctx.restore();
      } else {
        boxBlurCanvas(offCtx, offCanvas.width, offCanvas.height, blur * dpr * 1.4 * animResScale, animResScale < 1 ? 2 : 3);
        ctx.save();
        ctx.globalCompositeOperation = opts.composite;
        ctx.globalAlpha = opts.alpha;
        ctx.drawImage(offCanvas, 0, 0, offCanvas.width, offCanvas.height, -pad, -pad, w, h);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };
  if (still) {
    draw(0);
    return null;
  }
  let raf;
  let phase = 0;
  let lastTime = 0;
  const tick = (now) => {
    if (lastTime) phase += (now - lastTime) * 1e-3 * PHASE_SPEED;
    lastTime = now;
    draw(phase);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// src/dither.ts
var BAYER8 = (() => {
  const m = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];
  return m.map((r) => r.map((v) => v / 64));
})();
function hexToRgb2(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
}
function getDevicePixelRatio2() {
  if (typeof window === "undefined" || !window.devicePixelRatio) return 1;
  return Math.min(window.devicePixelRatio, 3);
}
function renderDither(canvas, { size, colors, dotScale: dotScaleOpt, animated = false, seeds }) {
  const still = !animated || prefersReducedMotion();
  const dpr = getDevicePixelRatio2();
  const sizePx = Math.round(size * dpr);
  canvas.width = sizePx;
  canvas.height = sizePx;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  const dotScaleLogical = dotScaleOpt ?? Math.max(1, Math.round(size / 35));
  const dotScale = Math.max(1, Math.round(dotScaleLogical * dpr));
  const colA = hexToRgb2(oklchToHex(colors[0]));
  const colB = hexToRgb2(oklchToHex(colors[Math.min(1, colors.length - 1)]));
  const baseAngle = seeds[0] * Math.PI * 2;
  const falloff = 0.55 + seeds[1] * 0.25;
  const swirlSpeed = 0.45;
  const padding = 1;
  const gridSize = Math.ceil(sizePx / dotScale) + padding * 2;
  const cellPhase = (gx, gy) => ((gx * 31 + gy * 17) * (seeds[2] * 1e3 + 1) + (seeds[3] * 1e3 | 0)) % 1e3 / 1e3 * Math.PI * 2;
  const cellAmp = (gx, gy) => 0.035 + (gx * 7 + gy * 13 + seeds[2] * 50 | 0) % 55 / 1100;
  const draw = (phase2) => {
    const img = ctx.createImageData(sizePx, sizePx);
    const d = img.data;
    const angle = baseAngle + (animated ? phase2 * swirlSpeed : 0);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    for (let i = 0; i < sizePx * sizePx * 4; i += 4) {
      d[i] = colB.r;
      d[i + 1] = colB.g;
      d[i + 2] = colB.b;
      d[i + 3] = 255;
    }
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const nx = (gx - padding + 0.5) / (gridSize - padding * 2);
        const ny = (gy - padding + 0.5) / (gridSize - padding * 2);
        const proj = (nx - 0.5) * cosA + (ny - 0.5) * sinA;
        let drift = 0;
        if (animated) {
          const p = cellPhase(gx, gy);
          const a = cellAmp(gx, gy);
          drift = a * Math.sin(phase2 * 0.3 + p) + a * 0.55 * Math.sin(phase2 * 0.1 + p * 1.7) + 0.012 * Math.sin(phase2 * 0.2);
        }
        const tRaw = (proj - drift + falloff) / (falloff * 2);
        const tClamp = Math.max(0, Math.min(1, tRaw));
        const t = tClamp * tClamp * (3 - 2 * tClamp);
        const bayer = BAYER8[gy % 8][gx % 8];
        if (t > bayer) continue;
        for (let py = 0; py < dotScale; py++) {
          for (let px = 0; px < dotScale; px++) {
            const x = (gx - padding) * dotScale + px;
            const y = (gy - padding) * dotScale + py;
            if (x < 0 || y < 0 || x >= sizePx || y >= sizePx) continue;
            const idx = (y * sizePx + x) * 4;
            d[idx] = colA.r;
            d[idx + 1] = colA.g;
            d[idx + 2] = colA.b;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  };
  if (still) {
    draw(0);
    return null;
  }
  let raf;
  let phase = 0;
  let lastTime = 0;
  const SPEED = 0.55;
  const tick = (now) => {
    if (lastTime) phase += (now - lastTime) * 1e-3 * SPEED;
    lastTime = now;
    draw(phase);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// src/index.ts
function hashToColors(hash, tones, count = 2) {
  const seeds = hashToSeeds(hash, count * 3);
  const parsed = tones?.map(parseTone).filter((t) => t !== null);
  const toneList = parsed?.length ? parsed : void 0;
  const baseHue = toneList ? void 0 : seeds[0] * 360 % 360;
  return Array.from(
    { length: count },
    (_, i) => generateColor(seeds[i * 3], seeds[i * 3 + 1], seeds[i * 3 + 2], toneList, i > 0, baseHue)
  );
}
function createDithervatar(options) {
  const {
    hash,
    size = 64,
    mode = "gradient",
    animated = false,
    dotScale,
    tones
  } = options;
  const canvas = document.createElement("canvas");
  const colorCount = mode === "gradient" ? 4 : 2;
  const colors = hashToColors(hash, tones, colorCount);
  const seeds = hashToSeeds(hash, 4);
  let cancel = null;
  if (mode === "dither") {
    cancel = renderDither(canvas, { size, colors, dotScale, animated, seeds });
  } else {
    cancel = renderGradient(canvas, { size, colors, animated, seeds });
  }
  return {
    canvas,
    colors,
    destroy: () => cancel?.()
  };
}
function renderDithervatarTo(canvas, options) {
  const {
    hash,
    size = 64,
    mode = "gradient",
    animated = false,
    dotScale,
    tones
  } = options;
  const colorCount = mode === "gradient" ? 4 : 2;
  const colors = hashToColors(hash, tones, colorCount);
  const seeds = hashToSeeds(hash, 4);
  let cancel = null;
  if (mode === "dither") {
    cancel = renderDither(canvas, { size, colors, dotScale, animated, seeds });
  } else {
    cancel = renderGradient(canvas, { size, colors, animated, seeds });
  }
  return () => cancel?.();
}
export {
  createDithervatar,
  hashToColors,
  hashToSeeds,
  oklchToCss,
  oklchToHex,
  parseTone,
  renderDither,
  renderGradient,
  renderDithervatarTo
};
