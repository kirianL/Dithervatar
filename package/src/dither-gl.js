import { oklchToHex } from './core.js';

const VS = `#version 300 es
in vec2 aPosition;
out vec2 vUV;
void main() {
  vUV = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform vec3 uBg;
uniform vec3 uMid;
uniform vec3 uDot;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

float fbmWarp(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

float bayer4x4(vec2 pos) {
  int x = int(mod(pos.x, 4.0));
  int y = int(mod(pos.y, 4.0));
  int v = (((x & 1) ^ (y & 1)) << 3)
        | ((y & 1) << 2)
        | ((((x >> 1) & 1) ^ ((y >> 1) & 1)) << 1)
        | ((y >> 1) & 1);
  return float(v) / 16.0;
}

void main() {
  vec2 fragCoord = vUV * uResolution;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float t = uTime * 0.28;
  vec2 p = vec2((vUV.x - 0.5) * aspect, vUV.y - 0.5) * 2.8 + uOffset + vec2(t * 0.06, 0.0);

  vec2 q = vec2(
    fbmWarp(p + vec2(0.0, 0.0) + t * 0.4),
    fbmWarp(p + vec2(5.2, 1.3) - t * 0.3)
  );
  vec2 r = vec2(
    fbmWarp(p + 3.2 * q + vec2(1.7, 9.2) + t * 0.25),
    fbmWarp(p + 3.2 * q + vec2(8.3, 2.8) - t * 0.2)
  );
  float f = fbm(p + 2.6 * r);

  float vFade = smoothstep(0.0, 0.55, vUV.y);
  float intensity = clamp(pow(f * 1.25, 1.35) * (0.45 + 0.65 * vFade), 0.0, 1.0);

  vec2 cellCoord = floor(fragCoord / 3.0);
  float threshold = bayer4x4(cellCoord);
  float quantized = step(threshold, intensity * 0.92);

  vec3 glow = mix(uBg, uMid, intensity * 0.78);
  vec3 dotColor = mix(uMid, uDot, smoothstep(0.45, 0.88, intensity));
  vec3 col = mix(glow, dotColor, quantized * 0.92);

  finalColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function hexToRgb01(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function setupGL(canvas) {
  if (canvas.__ditherGL) return canvas.__ditherGL;
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    powerPreference: 'low-power',
    desynchronized: true,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(prog, 'aPosition');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const ctx = {
    gl,
    prog,
    uTime: gl.getUniformLocation(prog, 'uTime'),
    uRes: gl.getUniformLocation(prog, 'uResolution'),
    uOffset: gl.getUniformLocation(prog, 'uOffset'),
    uBg: gl.getUniformLocation(prog, 'uBg'),
    uMid: gl.getUniformLocation(prog, 'uMid'),
    uDot: gl.getUniformLocation(prog, 'uDot'),
  };
  canvas.__ditherGL = ctx;
  return ctx;
}

let _gl2ok = null;
export function hasWebGL2() {
  if (_gl2ok !== null) return _gl2ok;
  try {
    const c = document.createElement('canvas');
    _gl2ok = !!c.getContext('webgl2');
  } catch {
    _gl2ok = false;
  }
  return _gl2ok;
}

export function renderDitherGL(canvas, { size, colors, animated = false, seeds = [0.5, 0.5, 0.5, 0.5] }) {
  const ctx = setupGL(canvas);
  if (!ctx) return false;
  const { gl, prog } = ctx;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(prog);

  gl.uniform2f(ctx.uRes, size, size);
  gl.uniform2f(ctx.uOffset, (seeds[0] - 0.5) * 24, (seeds[1] - 0.5) * 24);

  const bg = hexToRgb01(oklchToHex(colors[Math.min(1, colors.length - 1)]));
  const dot = hexToRgb01(oklchToHex(colors[0]));
  const mid = mix3(bg, dot, 0.5);
  gl.uniform3f(ctx.uBg, bg[0], bg[1], bg[2]);
  gl.uniform3f(ctx.uMid, mid[0], mid[1], mid[2]);
  gl.uniform3f(ctx.uDot, dot[0], dot[1], dot[2]);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const draw = (now) => {
    gl.uniform1f(ctx.uTime, reducedMotion ? 12.0 : now);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  if (!animated || reducedMotion) {
    draw(0);
    return null;
  }

  let rafId = 0;
  const start = performance.now();
  const tick = (now) => {
    draw((now - start) * 0.001);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}
