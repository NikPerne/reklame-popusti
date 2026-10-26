// Generates the app icons (a white "%" on red) as PNGs without any dependencies:
//   node client/scripts/generate-icons.mjs
// "any" icons are rounded squares; "maskable" icons fill the square and keep the glyph
// inside the 80 % safe zone, as Android crops them into circles or other shapes.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const RED = [214, 0, 28];
const WHITE = [255, 255, 255];
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const OUT = new URL('../public/icons/', import.meta.url);

const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

function distanceToSegment(px, py, ax, ay, bx, by) {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2),
    ),
  );
  return dist(px, py, ax + t * (bx - ax), ay + t * (by - ay));
}

/** Is (x, y) in unit coordinates part of the "%" glyph, scaled by `scale` around the centre? */
function inGlyph(x, y, scale) {
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  const ring = (cx, cy) => {
    const d = dist(u, v, cx, cy);
    return d <= 0.13 && d >= 0.06;
  };
  return (
    ring(0.33, 0.31) || ring(0.67, 0.69) || distanceToSegment(u, v, 0.7, 0.2, 0.3, 0.8) <= 0.045
  );
}

/** Is (x, y) inside a square with rounded corners of radius r? */
function inRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return dist(x, y, cx, cy) <= r;
}

function render(size, maskable) {
  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (maskable || inRoundedSquare(x, y, 0.2)) {
            bg++;
            if (inGlyph(x, y, maskable ? 0.62 : 0.8)) fg++;
          }
        }
      }
      const n = samples * samples;
      const alpha = bg / n;
      const mix = bg ? fg / bg : 0;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(RED[c] * (1 - mix) + WHITE[c] * mix);
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, pixels);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of SIZES)
  writeFileSync(new URL(`icon-${size}x${size}.png`, OUT), render(size, false));
for (const size of MASKABLE_SIZES)
  writeFileSync(new URL(`maskable-${size}x${size}.png`, OUT), render(size, true));
writeFileSync(new URL('favicon-32x32.png', OUT), render(32, false));
writeFileSync(new URL('../public/apple-touch-icon.png', import.meta.url), render(180, true));
console.log('icons written');
