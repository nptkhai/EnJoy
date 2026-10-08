// Generate PNG icons from icons/icon.svg with zero dependencies (only node:fs + node:zlib).
//
//   npm run icons
//
// This is a tiny rasteriser for the SVG subset used by icon.svg — not a general SVG renderer:
//   <rect x y width height rx>, <circle cx cy r>, <polygon points>, fill="#rrggbb" (+ fill-opacity).
// Shapes are drawn in document order with 4×4 supersampled anti-aliasing.
// The background must be the element with id="bg"; everything else goes in <g id="fg">.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'icons', 'icon.svg');
const SAMPLES = 4; // per axis → 16 samples per pixel

const OUTPUTS = [
  // rounded: transparent corners like the SVG. fullBleed: square background, foreground scaled to `scale`.
  { file: 'icon-192.png', size: 192, fullBleed: false, scale: 1 },
  { file: 'icon-512.png', size: 512, fullBleed: false, scale: 1 },
  // Maskable: content must sit inside the central 80 % "safe zone".
  { file: 'icon-maskable-512.png', size: 512, fullBleed: true, scale: 0.8 },
  // iOS / home-screen: opaque, the OS rounds the corners itself.
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true, scale: 0.9 },
];

// ---------- SVG subset parsing ----------

function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

function parseColor(hex, opacity = 1) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || '');
  if (!m) throw new Error(`Unsupported fill "${hex}" — use #rgb or #rrggbb`);
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.max(0, Math.min(1, opacity))];
}

export function parseSvg(text) {
  const vb = /viewBox="([\d.\s-]+)"/.exec(text);
  const [, , vbW, vbH] = vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 512, 512];
  if (vbW !== vbH) throw new Error('icon.svg must be square');

  const body = text.replace(/<!--[\s\S]*?-->/g, '');
  const fgStart = body.search(/<g\b[^>]*id="fg"[^>]*>/);
  const fgEnd = fgStart >= 0 ? body.indexOf('</g>', fgStart) : -1;

  const shapes = [];
  for (const m of body.matchAll(/<(rect|circle|polygon)\b([^>]*?)\/?>/g)) {
    const a = parseAttrs(m[2]);
    const shape = {
      type: m[1],
      id: a.id,
      fg: fgStart >= 0 && m.index > fgStart && m.index < fgEnd,
      color: parseColor(a.fill, a['fill-opacity'] !== undefined ? Number(a['fill-opacity']) : 1),
    };
    if (shape.type === 'rect') {
      Object.assign(shape, {
        x: +a.x || 0, y: +a.y || 0, w: +a.width, h: +a.height,
        rx: Math.min(+(a.rx ?? a.ry ?? 0), +a.width / 2, +a.height / 2),
      });
    } else if (shape.type === 'circle') {
      Object.assign(shape, { cx: +a.cx, cy: +a.cy, r: +a.r });
    } else {
      const nums = a.points.trim().split(/[\s,]+/).map(Number);
      shape.points = [];
      for (let i = 0; i < nums.length; i += 2) shape.points.push([nums[i], nums[i + 1]]);
    }
    shape.bbox = bbox(shape);
    shapes.push(shape);
  }
  if (!shapes.some((s) => s.id === 'bg')) throw new Error('icon.svg needs a background element with id="bg"');
  return { size: vbW, shapes };
}

function bbox(s) {
  if (s.type === 'rect') return [s.x, s.y, s.x + s.w, s.y + s.h];
  if (s.type === 'circle') return [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r];
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ---------- Geometry ----------

function inside(s, x, y) {
  const [x0, y0, x1, y1] = s.bbox;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (s.type === 'circle') return (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r * s.r;
  if (s.type === 'rect') {
    const r = s.rx;
    if (r <= 0) return true;
    const cx = Math.max(x0 + r, Math.min(x, x1 - r));
    const cy = Math.max(y0 + r, Math.min(y, y1 - r));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }
  // polygon, even-odd rule
  let hit = false;
  const p = s.points;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// ---------- Rendering ----------

export function render(svg, { size, fullBleed = false, scale = 1 }) {
  const shapes = svg.shapes.map((s) =>
    fullBleed && s.id === 'bg' ? { ...s, rx: 0, x: 0, y: 0, w: svg.size, h: svg.size, bbox: [0, 0, svg.size, svg.size] } : s);
  const c = svg.size / 2;
  const k = svg.size / size;
  const out = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0; // premultiplied accumulators
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) * k;
          const y = (py + (sy + 0.5) / SAMPLES) * k;
          // Foreground is scaled around the centre: sample the inverse-transformed point.
          const fx = c + (x - c) / scale;
          const fy = c + (y - c) / scale;
          let cr = 0, cg = 0, cb = 0, ca = 0;
          for (const s of shapes) {
            if (!(s.fg ? inside(s, fx, fy) : inside(s, x, y))) continue;
            const [sr, sg, sb, so] = s.color;
            cr = sr * so + cr * (1 - so);
            cg = sg * so + cg * (1 - so);
            cb = sb * so + cb * (1 - so);
            ca = so + ca * (1 - so);
          }
          r += cr; g += cg; b += cb; a += ca;
        }
      }
      const n = SAMPLES * SAMPLES;
      const i = (py * size + px) * 4;
      const alpha = a / n;
      out[i] = alpha ? Math.round(r / n / alpha) : 0;
      out[i + 1] = alpha ? Math.round(g / n / alpha) : 0;
      out[i + 2] = alpha ? Math.round(b / n / alpha) : 0;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

// ---------- PNG encoding ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Main ----------

const svg = parseSvg(fs.readFileSync(SOURCE, 'utf8'));
for (const out of OUTPUTS) {
  const png = encodePng(render(svg, out), out.size);
  fs.writeFileSync(path.join(ROOT, 'icons', out.file), png);
  console.log(`✓ icons/${out.file} (${out.size}×${out.size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
