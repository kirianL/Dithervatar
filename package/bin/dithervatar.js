#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { hashToColors, hashToSeeds, oklchToHex } from '../src/core.js';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: dithervatar <hash> [--size 256] [--grid 64] [--shape circle|squircle|square] [--out avatar.svg]');
  process.exit(0);
}

const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const hash = args.find((a) => !a.startsWith('-')) ?? '';
const size = Math.max(16, Number(getArg('--size', 256)) || 256);
const grid = Math.max(16, Math.min(128, Number(getArg('--grid', 64)) || 64));
const shape = getArg('--shape', 'circle');
const out = getArg('--out', '');

const [dotHex, bgHex] = hashToColors(hash, undefined, 2).map(oklchToHex);
const [s0, s1, s2, s3] = hashToSeeds(hash, 4);

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const angle = s0 * Math.PI * 2;
const ca = Math.cos(angle);
const sa = Math.sin(angle);
const freq = 1.6 + s1 * 1.4;

let path = '';
for (let y = 0; y < grid; y++) {
  let x = 0;
  const ny = (y / grid) * 2 - 1;
  while (x < grid) {
    const nx = (x / grid) * 2 - 1;
    const rx = nx * ca - ny * sa;
    const ry = nx * sa + ny * ca;
    const wave = Math.sin(rx * freq + s2 * 6.28) * 0.35 + Math.cos(ry * freq + s3 * 6.28) * 0.35;
    const v = Math.max(0, Math.min(1, 0.5 + wave));
    const threshold = (BAYER4[y & 3][x & 3] + 0.5) / 16;
    if (v <= threshold) { x++; continue; }
    let run = 1;
    while (x + run < grid) {
      const nx2 = ((x + run) / grid) * 2 - 1;
      const rx2 = nx2 * ca - ny * sa;
      const ry2 = nx2 * sa + ny * ca;
      const w2 = Math.sin(rx2 * freq + s2 * 6.28) * 0.35 + Math.cos(ry2 * freq + s3 * 6.28) * 0.35;
      const v2 = Math.max(0, Math.min(1, 0.5 + w2));
      const t2 = (BAYER4[y & 3][(x + run) & 3] + 0.5) / 16;
      if (v2 <= t2) break;
      run++;
    }
    path += `M${x} ${y}h${run}v1h-${run}z`;
    x += run;
  }
}

const clip = shape === 'circle'
  ? `<defs><clipPath id="c"><circle cx="${grid / 2}" cy="${grid / 2}" r="${grid / 2}"/></clipPath></defs>`
  : shape === 'squircle'
    ? `<defs><clipPath id="c"><rect width="${grid}" height="${grid}" rx="${(0.28 * grid).toFixed(2)}"/></clipPath></defs>`
    : '';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${grid} ${grid}" shape-rendering="crispEdges">`
  + clip
  + `<g${clip ? ' clip-path="url(#c)"' : ''}><rect width="${grid}" height="${grid}" fill="${bgHex}"/>`
  + (path ? `<path d="${path}" fill="${dotHex}"/>` : '')
  + `</g></svg>`;

if (out) {
  writeFileSync(out, svg, 'utf8');
  console.log(`Wrote ${out}`);
} else {
  process.stdout.write(svg + '\n');
}
