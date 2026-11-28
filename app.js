import { CR_MAP_COUNTRIES } from './cr-map.js';
import {
  hashToColors,
  hashToSeeds,
  oklchToHex,
  renderDithervatarTo,
} from './vendor/core.js';
import { hasWebGL2, renderDitherGL } from './vendor/dither-gl.js';
import { slotText } from './vendor/slot-text/index.js';

const state = {
  mode: 'dither',
  shape: 'circle',
  animated: false,
  tones: [],
  toneInput: '',
  hashInput: 'zeus',
  exportSize: 1024,
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

function bindToggleGroup(el, set, after = renderAll) {
  el.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      set(btn.dataset.value);
      el.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      layoutThumbs();
      after();
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
  if (slot.canvas.parentNode) slot.canvas.replaceWith(c);
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
  return renderDithervatarTo(canvas, {
    hash,
    size,
    mode: st.mode,
    animated: st.animated,
    tones,
  });
}

let resizeTimer = null;
let hashSyncTimer = null;

function readUrlHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) {
    state.hashInput = 'zeus';
    hashInput.value = 'zeus';
    state.shape = 'circle';
    state.exportSize = 1024;
    $('#group-shape')?.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === 'circle'));
    const sel = $('#export-size');
    if (sel) sel.value = '1024';
    return;
  }
  let parts;
  try {
    parts = raw.split('/').map(decodeURIComponent);
  } catch {
    return;
  }
  const [seed, second, third] = parts;
  if (seed) {
    state.hashInput = seed;
    hashInput.value = seed;
  }
  const shapeArg = (second === 'circle' || second === 'squircle' || second === 'square') ? second : null;
  if (shapeArg) {
    state.shape = shapeArg;
    $('#group-shape')?.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === shapeArg));
  }
  const sizeNum = Number(shapeArg ? third : second);
  if ([32, 64, 128, 256, 512, 1024].includes(sizeNum)) {
    state.exportSize = sizeNum;
    const sel = $('#export-size');
    if (sel) sel.value = String(sizeNum);
  }
}

function syncUrlHash() {
  clearTimeout(hashSyncTimer);
  hashSyncTimer = setTimeout(() => {
    const seed = encodeURIComponent(state.hashInput || 'zeus');
    const parts = [seed];
    if (state.shape !== 'circle' || state.exportSize !== 1024) parts.push(state.shape);
    if (state.exportSize !== 1024) parts.push(String(state.exportSize));
    const next = parts.length === 1 && seed === 'zeus' ? location.pathname + location.search : `#${parts.join('/')}`;
    if (location.hash !== (next.startsWith('#') ? next : '')) {
      history.replaceState(null, '', next);
    }
  }, 250);
}

function renderPreview() {
  const hash = state.hashInput || 'default';
  const previewSize = Math.max(64, Math.round(avatarFrame.clientWidth || 280));
  if (previewCancel) { previewCancel(); previewCancel = null; }
  previewCancel = renderAvatar(previewSlot, hash, previewSize, state) || null;
  avatarFrame.className = 'avatar-frame ' + shapeClass(state.shape);
  renderColors();
  syncUrlHash();
}

function renderSamples() {
  const shape = shapeClass(state.shape);
  sampleSlots.forEach((slot, i) => {
    sampleCancels.get(i)?.();
    sampleCancels.set(i, renderAvatar(slot, slot.btn.dataset.value, SAMPLE_SIZE, state) || null);
    slot.frame.className = 'sample-frame' + (shape ? ' ' + shape : '');
  });
}

function renderAll() {
  renderPreview();
  renderSamples();
}

readUrlHash();
window.addEventListener('hashchange', () => {
  readUrlHash();
  layoutThumbs();
  renderAll();
});

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
  if (!navigator.clipboard?.writeText) return Promise.resolve(false);
  return navigator.clipboard.writeText(text).then(() => true, () => false);
}

const colorLabels = [];

function renderColors() {
  const wrap = $('#color-grid');
  const colors = currentColors();
  colorLabels.forEach((label) => label.destroy());
  colorLabels.length = 0;
  wrap.innerHTML = '';
  colors.forEach((color) => {
    const hex = oklchToHex(color);
    const chip = document.createElement('div');
    chip.className = 'color-chip';
    const span = document.createElement('span');
    span.className = 'copyable color-hex';
    span.dataset.raw = hex;
    span.title = 'Click to copy';
    chip.innerHTML = `<span class="color-dot" style="background:${hex}"></span>`;
    chip.appendChild(span);
    wrap.appendChild(chip);
    const label = slotText(span, hex, { stagger: 18, duration: 220 });
    colorLabels.push(label);
    span.addEventListener('click', () => {
      copyText(hex).then((ok) => {
        if (!ok) {
          label.flash('failed', { revertAfter: 900, enter: { direction: 'up' } });
          return;
        }
        label.flash('copied', {
          revertAfter: 900,
          enter: { direction: 'up', color: 'var(--accent)' },
          exit: { direction: 'down' },
        });
      });
    });
  });
}

/* ---------- export ---------- */
const exportSlot = { canvas: document.createElement('canvas'), kind: null };
function staticFrame(hash, size) {
  renderAvatar(exportSlot, hash, size, { ...state, animated: false });
  return exportSlot.canvas;
}

const copyLabel = slotText($('#copy-label'), 'Copy PNG', { stagger: 22, duration: 260 });
const copyButton = $('#btn-copy');
const downloadLabel = slotText($('#download-label'), 'Download PNG', { stagger: 22, duration: 260 });
const downloadButton = $('#btn-download');
const lockExportWidths = () => {
  if (copyButton) copyButton.style.minWidth = `${Math.ceil(copyButton.getBoundingClientRect().width)}px`;
  downloadButton.style.minWidth = `${Math.ceil(downloadButton.getBoundingClientRect().width)}px`;
};
lockExportWidths();
if (document.fonts?.ready) document.fonts.ready.then(lockExportWidths);

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionNote = $('#motion-note');
function syncMotionNote() {
  if (motionNote) motionNote.hidden = !motionQuery.matches;
}
motionQuery.addEventListener?.('change', () => { syncMotionNote(); renderAll(); });
syncMotionNote();

function renderExportPngCanvas(hash, size) {
  const src = staticFrame(hash, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
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
  return canvas;
}

$('#btn-copy').addEventListener('click', async () => {
  const hash = state.hashInput || 'default';
  const canvas = renderExportPngCanvas(hash, Math.min(256, state.exportSize));
  if (canvas && await copyText(canvas.toDataURL('image/png'))) {
    copyLabel.flash('Copied', { revertAfter: 1200, enter: { direction: 'up' } });
  }
});

$('#btn-download').addEventListener('click', () => {
  const size = state.exportSize;
  const hash = state.hashInput || 'default';
  const src = staticFrame(hash, size);
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
  downloadLabel.flash('Saved', { revertAfter: 1200, enter: { direction: 'up' } });
});

$('#export-size').addEventListener('change', (e) => { state.exportSize = Number(e.target.value); syncUrlHash(); });

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
    btn.classList.remove('is-switching');
    void btn.offsetWidth;
    btn.classList.add('is-switching');
    apply(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  });
  btn.addEventListener('animationend', () => btn.classList.remove('is-switching'));
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
    .then((data) => show(tips.npm, `${compact.format(data.downloads)} downloads`))
    .catch(() => show(tips.npm, '0 downloads'));

  request('https://api.github.com/repos/kirianL/Dithervatar')
    .then((data) => show(tips.github, `${compact.format(data.stargazers_count)} stars`))
    .catch(() => show(tips.github, 'GitHub repository'));
})();

/* ---------- copy llms.txt ---------- */
(function initCopyLlms() {
  const triggers = [...document.querySelectorAll('[data-copy-llms]')];
  if (!triggers.length) return;

  const status = document.getElementById('copy-status');
  const labels = new Map();
  let doc = null;

  const announce = (message) => {
    if (status) status.textContent = message;
  };

  const copy = async (el) => {
    const label = labels.get(el);
    try {
      if (!doc) {
        const res = await fetch('llms.txt', { cache: 'no-cache' });
        if (!res.ok) throw new Error(String(res.status));
        doc = (await res.text()).replace(/\r\n/g, '\n');
      }
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(doc);
      label.flash('Copied', {
        revertAfter: 1600,
        enter: { direction: 'up', color: 'var(--accent)' },
        exit: { direction: 'down' },
      });
      announce('llms.txt copied. Paste it into your agent before it touches avatar code.');
    } catch {
      label.flash('Copy failed', {
        revertAfter: 1600,
        enter: { direction: 'up' },
      });
      announce('Could not copy llms.txt.');
    }
  };

  triggers.forEach((el) => {
    const target = el.querySelector('.icon-tip, .copy-label') ?? el;
    labels.set(el, slotText(target, target.textContent.trim(), { stagger: 16, duration: 220 }));
    el.addEventListener('click', () => copy(el));
  });
})();

renderAll();
layoutThumbs();

/* ---------- Costa Rica pencil-circle + map note ---------- */
(function initCostaRicaNote() {
  const word = document.querySelector('.bio-pencil-word');
  const svg = word?.querySelector('.cr-map-svg');
  const note = word?.querySelector('.bio-hand-note');
  const dimmer = document.querySelector('.cr-dimmer');
  if (!word || !svg || !note) return;

  const ns = 'http://www.w3.org/2000/svg';
  const frag = document.createDocumentFragment();
  for (const { cls, d } of CR_MAP_COUNTRIES) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    frag.appendChild(p);
  }
  svg.appendChild(frag);

  let leaveTimer = null;
  const positionNote = (clientX) => {
    const wordRect = word.getBoundingClientRect();
    const noteWidth = note.offsetWidth;
    const vw = document.documentElement.clientWidth;
    const anchorX = clientX !== undefined ? clientX : wordRect.left + wordRect.width / 2;
    const left = Math.min(Math.max(12, anchorX - noteWidth / 2), vw - noteWidth - 12);
    note.style.left = `${left - wordRect.left}px`;
    note.style.transform = 'none';
  };

  const activate = () => {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    positionNote();
    word.classList.remove('is-leaving');
    word.classList.add('is-active');
    document.body.classList.add('is-cr-dimmed');
    word.setAttribute('aria-expanded', 'true');
    note.setAttribute('aria-hidden', 'false');
  };

  const deactivate = () => {
    if (!word.classList.contains('is-active')) return;
    word.classList.remove('is-active');
    document.body.classList.remove('is-cr-dimmed');
    word.setAttribute('aria-expanded', 'false');
    note.setAttribute('aria-hidden', 'true');
    word.classList.add('is-leaving');
    leaveTimer = setTimeout(() => {
      word.classList.remove('is-leaving');
      leaveTimer = null;
    }, 640);
  };

  word.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    positionNote(e.clientX);
    activate();
  });
  word.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' && word.classList.contains('is-active')) {
      positionNote(e.clientX);
    }
  });
  word.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') deactivate();
  });
  word.addEventListener('click', (e) => {
    e.stopPropagation();
    if (word.classList.contains('is-active')) deactivate();
    else activate();
  });
  dimmer?.addEventListener('click', () => {
    deactivate();
    word.blur();
  });
  window.addEventListener('scroll', deactivate, { passive: true });
  window.addEventListener('resize', () => {
    if (word.classList.contains('is-active')) positionNote();
  });
  word.addEventListener('focus', () => {
    if (word.matches(':focus-visible')) activate();
  });
  word.addEventListener('blur', deactivate);
  word.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') deactivate();
  });
})();
