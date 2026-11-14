import { deflateSync } from "node:zlib";

/**
 * The extension's icon, drawn in code: a blue rounded square holding an
 * annotation frame with a marker on its corner. Rendering it at build time
 * keeps binary files out of the repository and gives every size the browser
 * asks for from one description.
 */

const ACCENT = [0x00, 0x66, 0xff];
const WHITE = [0xff, 0xff, 0xff];

/** Sub-samples per pixel side, for smooth edges. */
const SAMPLES = 4;

/** Signed distance to a rounded box centred at (cx, cy): negative inside. */
function roundedBox(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x - cx) - (halfWidth - radius);
  const dy = Math.abs(y - cy) - (halfHeight - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

const circle = (x, y, cx, cy, radius) => Math.hypot(x - cx, y - cy) - radius;

/**
 * Colour at a point of the unit square, or `null` outside the icon. Layers
 * from the bottom up: background, frame, a gap around the marker, the
 * marker, its centre.
 */
function colorAt(x, y) {
  if (roundedBox(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return null;
  let color = ACCENT;
  if (Math.abs(roundedBox(x, y, 0.45, 0.43, 0.27, 0.22, 0.07)) <= 0.04) color = WHITE;
  if (circle(x, y, 0.71, 0.66, 0.205) <= 0) color = ACCENT;
  if (circle(x, y, 0.71, 0.66, 0.15) <= 0) color = WHITE;
  if (circle(x, y, 0.71, 0.66, 0.065) <= 0) color = ACCENT;
  return color;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** The icon as a PNG of `size` by `size` pixels. */
export function renderIcon(size) {
  // One filter byte, then RGBA, per row.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = colorAt((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (!color) continue;
          red += color[0];
          green += color[1];
          blue += color[2];
          covered += 1;
        }
      }
      const offset = py * (size * 4 + 1) + 1 + px * 4;
      if (covered > 0) {
        raw[offset] = Math.round(red / covered);
        raw[offset + 1] = Math.round(green / covered);
        raw[offset + 2] = Math.round(blue / covered);
        raw[offset + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const ICON_SIZES = [16, 32, 48, 128];
