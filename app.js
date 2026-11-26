import {
  hashToColors,
  hashToSeeds,
  oklchToHex,
  renderHashvatar,
} from './vendor/hashvatar.js';
import { hasWebGL2, renderDitherGL } from './vendor/dither-gl.js';

const state = {
  mode: 'dither',
  shape: 'circle',
  animated: false,
  tones: [],
  toneInput: '',
  hashInput: 'zeus',
  exportSize: 1024,
  copiedId: null,
};

/* ---------- logo scramble ---------- */
(function initLogo() {
  const el = $('#logo');
  if (!el) return;
  const text = el.textContent;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const hovered = new Set();
  const scrambled = {};
  let timer = null;

  el.innerHTML = '';
  [...text].forEach((ch, i) => {
    const span = document.createElement('span');
    span.textContent = ch;
    span.addEventListener('mouseenter', () => {
      hovered.add(i);
      if (!timer) {
        const tick = () => {
          if (hovered.size === 0) { timer = null; return; }
          hovered.forEach((idx) => {
            scrambled[idx] = chars[Math.floor(Math.random() * chars.length)] ?? text[idx];
          });
          render();
        };
        tick();
        timer = setInterval(tick, 60);
      }
    });
    span.addEventListener('mouseleave', () => {
      hovered.delete(i);
      delete scrambled[i];
      render();
      if (hovered.size === 0 && timer) { clearInterval(timer); timer = null; }
    });
    el.appendChild(span);
  });

  function render() {
    [...el.children].forEach((span, i) => {
      span.textContent = hovered.has(i) ? (scrambled[i] ?? text[i]) : text[i];
    });
  }
})();

function $(sel) { return document.querySelector(sel); }

/* ---------- controls ---------- */
const hashHistory = new Set([
  'zeus',
  'athena',
  'apollo',
  'artemis',
]);

function layoutThumbs() {
  document.querySelectorAll('.seg').forEach((seg) => {
    const thumb = seg.querySelector('.seg-thumb');
    const active = seg.querySelector('.seg-btn.active');
    if (!thumb || !active) return;
    const innerW = seg.clientWidth - 8;
    thumb.style.transform =
      `translateX(${active.offsetLeft - 4}px) scaleX(${active.offsetWidth / innerW})`;
  });
}

function bindToggleGroup(el, set) {
  el.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      set(btn.dataset.value);
      el.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      layoutThumbs();
      renderAll();
    });
  });
}

bindToggleGroup($('#group-shape'), (v) => { state.shape = v; });
bindToggleGroup($('#group-animated'), (v) => { state.animated = v === 'on'; });

const hashInput = $('#hash-input');
hashInput.addEventListener('input', () => {
  state.hashInput = hashInput.value;
  if (hashInput.value.trim()) hashHistory.add(hashInput.value.trim());
  renderAll();
});
$('#btn-shuffle').addEventListener('click', () => {
  let next;
  do {
    next = Math.random().toString(36).slice(2, 10);
  } while (hashHistory.has(next));
  hashHistory.add(next);
  state.hashInput = next;
  hashInput.value = state.hashInput;
  renderAll();
});

/* ---------- avatars & colors ---------- */
const previewSlot = { canvas: $('#preview-canvas'), kind: null };
const avatarFrame = $('#avatar-frame');
let previewCancel = null;
const sampleCancels = new Map();
const sampleSlots = [...document.querySelectorAll('.sample-btn')].map((btn) => ({
  btn,
  frame: btn.querySelector('.sample-frame'),
  canvas: btn.querySelector('canvas'),
  kind: null,
}));
const SAMPLE_SIZE = 56;

function shapeClass(shape) {
  return shape === 'square' ? 'shape-square' : shape === 'squircle' ? 'shape-squircle' : '';
}

function canvasFor(slot, kind) {
  if (slot.kind === kind) return slot.canvas;
  const c = document.createElement('canvas');
  c.className = slot.canvas.className;
  if (slot.canvas.id) c.id = slot.canvas.id;
  slot.canvas.replaceWith(c);
  slot.canvas = c;
  slot.kind = kind;
  return c;
}

function renderAvatar(slot, hash, size, st) {
  const tones = st.tones.length ? st.tones : undefined;
  if (st.mode === 'dither' && hasWebGL2()) {
    const canvas = canvasFor(slot, 'gl');
    const colors = hashToColors(hash, tones, 2);
    const seeds = hashToSeeds(hash, 4);
    const cancel = renderDitherGL(canvas, { size, colors, animated: st.animated, seeds });
    if (cancel !== false) return typeof cancel === 'function' ? cancel : () => {};
  }
  const canvas = canvasFor(slot, '2d');
  return renderHashvatar(canvas, {
    hash,
    size,
    mode: st.mode,
    animated: st.animated,
    tones,
  });
}

let resizeTimer = null;
function renderAll() {
  const hash = state.hashInput || 'default';
  const previewSize = Math.max(64, Math.round(avatarFrame.clientWidth || 280));

  if (previewCancel) { previewCancel(); previewCancel = null; }
  previewCancel = renderAvatar(previewSlot, hash, previewSize, state) || null;

  sampleSlots.forEach((slot, i) => {
    sampleCancels.get(i)?.();
    sampleCancels.set(i, renderAvatar(slot, slot.btn.dataset.value, SAMPLE_SIZE, state) || null);
  });

  avatarFrame.className = 'avatar-frame ' + shapeClass(state.shape);
  const shape = shapeClass(state.shape);
  sampleSlots.forEach((slot) => {
    slot.frame.className = 'sample-frame' + (shape ? ' ' + shape : '');
  });

  renderColors();
}

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { layoutThumbs(); renderAll(); }, 150);
});
if (document.fonts?.ready) document.fonts.ready.then(layoutThumbs);

function currentColors() {
  return hashToColors(
    state.hashInput || 'default',
    state.tones.length ? state.tones : undefined,
    state.mode === 'gradient' ? 4 : 2
  );
}

function copyText(text) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
}

function renderColors() {
  const wrap = $('#color-grid');
  const colors = currentColors();
  wrap.innerHTML = '';
  colors.forEach((color, i) => {
    const hex = oklchToHex(color);
    const chip = document.createElement('div');
    chip.className = 'color-chip';
    const span = document.createElement('span');
    span.className = 'copyable color-hex';
    span.dataset.vid = `hex-${i}`;
    span.dataset.raw = hex;
    span.title = 'Click to copy';
    span.textContent = hex;
    if (state.copiedId === span.dataset.vid) {
      const inner = document.createElement('span');
      inner.className = 'text-copied';
      inner.textContent = 'copied';
      span.textContent = '';
      span.appendChild(inner);
    }
    span.addEventListener('click', () => {
      copyText(hex);
      state.copiedId = span.dataset.vid;
      renderColors();
      setTimeout(() => {
        if (state.copiedId === span.dataset.vid) {
          state.copiedId = null;
          renderColors();
        }
      }, 600);
    });
    chip.innerHTML = `<span class="color-dot" style="background:${hex}"></span>`;
    chip.appendChild(span);
    wrap.appendChild(chip);
  });
}

/* ---------- export ---------- */
$('#btn-download').addEventListener('click', () => {
  const size = state.exportSize;
  const src = previewSlot.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  if (state.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (state.shape === 'squircle') {
    const r = 0.28 * size;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, r);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(size - r, 0); ctx.arcTo(size, 0, size, r, r);
      ctx.lineTo(size, size - r); ctx.arcTo(size, size, size - r, size, r);
      ctx.lineTo(r, size); ctx.arcTo(0, size, 0, size - r, r);
      ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r);
      ctx.fill();
    }
  } else {
    ctx.fillRect(0, 0, size, size);
  }
  const a = document.createElement('a');
  a.download = 'dithervatar.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

$('#export-size').addEventListener('change', (e) => { state.exportSize = Number(e.target.value); });

/* ---------- samples ---------- */
document.querySelectorAll('.sample-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.hashInput = btn.dataset.value;
    hashInput.value = state.hashInput;
    hashHistory.add(state.hashInput);
    renderAll();
  });
});

/* ---------- theme toggle ---------- */
(function initTheme() {
  const btn = $('#theme-toggle');
  if (!btn) return;
  const apply = (t, instant) => {
    const root = document.documentElement;
    if (instant) root.classList.add('no-anim');
    root.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#f4f3ef' : '#0a0a0a';
    try { localStorage.setItem('dithervatar-theme', t); } catch {}
    if (instant) {
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-anim')));
    }
  };
  const meta = document.querySelector('meta[name="theme-color"]');
  const syncMeta = () => {
    if (meta) meta.content = document.documentElement.dataset.theme === 'light' ? '#f4f3ef' : '#0a0a0a';
  };
  syncMeta();
  btn.addEventListener('click', () => {
    apply(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  });
})();

/* ---------- icon tooltips ---------- */
(function initLinkTips() {
  const nav = document.querySelector('.toplinks');
  if (!nav) return;

  const tips = {
    npm: nav.querySelector('[data-stat="npm"]'),
    github: nav.querySelector('[data-stat="github"]'),
  };
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  let warm = null;
  let cool = null;
  nav.addEventListener('mouseover', () => {
    clearTimeout(cool);
    cool = null;
    if (nav.dataset.instant || warm) return;
    warm = setTimeout(() => {
      nav.dataset.instant = 'true';
      warm = null;
    }, 260);
  });
  nav.addEventListener('mouseleave', () => {
    clearTimeout(warm);
    warm = null;
    cool = setTimeout(() => {
      delete nav.dataset.instant;
      cool = null;
    }, 260);
  });

  const request = (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    return fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .finally(() => clearTimeout(timer));
  };
  const show = (el, text) => {
    if (el) el.textContent = text;
  };

  request('https://api.npmjs.org/downloads/point/last-week/dithervatar')
    .then((data) => show(tips.npm, `${compact.format(data.downloads)} downloads this week`))
    .catch(() => show(tips.npm, 'npm package'));

  request('https://api.github.com/repos/kirianL/Dithervatar')
    .then((data) => show(tips.github, `${compact.format(data.stargazers_count)} stars`))
    .catch(() => show(tips.github, 'GitHub repository'));
})();

renderAll();
layoutThumbs();
