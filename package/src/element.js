import { renderDithervatar } from './index.js';

const ATTRS = ['hash', 'size', 'shape', 'animated'];

export class DitherAvatarElement extends HTMLElement {
  static get observedAttributes() {
    return ATTRS;
  }

  constructor() {
    super();
    this._cancel = null;
    this._canvas = document.createElement('canvas');
    this._canvas.style.display = 'block';
    const root = this.attachShadow({ mode: 'open' });
    root.appendChild(this._canvas);
  }

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    if (this._cancel) {
      this._cancel();
      this._cancel = null;
    }
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    if (this._cancel) {
      this._cancel();
      this._cancel = null;
    }
    const hash = this.getAttribute('hash') ?? '';
    const size = Math.max(16, Number(this.getAttribute('size')) || 64);
    const shape = this.getAttribute('shape') || 'circle';
    const animated = this.hasAttribute('animated') && this.getAttribute('animated') !== 'false';

    this._canvas.style.width = `${size}px`;
    this._canvas.style.height = `${size}px`;
    this._canvas.style.borderRadius = shape === 'circle' ? '9999px' : shape === 'squircle' ? '28%' : '0';

    this._cancel = renderDithervatar(this._canvas, { hash, size, animated });
  }
}

export function defineDitherAvatar(tag = 'dither-avatar') {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, DitherAvatarElement);
  }
}

defineDitherAvatar();
