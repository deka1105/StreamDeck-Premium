// Generates the menu-bar tray icon as a black + alpha PNG "template image"
// (macOS recolors template images to match light/dark menu bars). Dependency-free
// minimal PNG encoder — draws a rounded tile with a 2x2 grid of holes so it reads
// as a little button deck. Run: npm run gen:icon

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// 8-bit grayscale + alpha PNG (color type 4). gray is fixed black; alphaAt draws.
function encodePng(size, alphaAt) {
  const raw = Buffer.alloc(size * (1 + size * 2));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[o++] = 0; // gray = black
      raw[o++] = alphaAt(x, y);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 4; // color type: grayscale + alpha
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const insideRR = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

function tileAlpha(size) {
  const pad = size * 0.1;
  const x0 = pad, y0 = pad, x1 = size - pad, y1 = size - pad;
  const rectR = size * 0.24;

  const gap = size * 0.1;
  const inX0 = x0 + gap, inY0 = y0 + gap, inX1 = x1 - gap, inY1 = y1 - gap;
  const cellGap = size * 0.08;
  const cellW = (inX1 - inX0 - cellGap) / 2;
  const cellH = (inY1 - inY0 - cellGap) / 2;
  const cellR = Math.min(cellW, cellH) * 0.3;

  const holes = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const hx0 = inX0 + c * (cellW + cellGap);
      const hy0 = inY0 + r * (cellH + cellGap);
      holes.push([hx0, hy0, hx0 + cellW, hy0 + cellH, cellR]);
    }
  }

  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    if (!insideRR(px, py, x0, y0, x1, y1, rectR)) return 0;
    for (const [a, b, c, d, r] of holes) if (insideRR(px, py, a, b, c, d, r)) return 0;
    return 255;
  };
}

// 8-bit truecolor + alpha PNG (color type 6), for the colored app icon.
function encodePngRGBA(size, rgbaAt) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgbaAt(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// App icon: a rounded-square blue gradient with a 2x2 grid of light tiles.
function appIcon(size) {
  const top = [56, 189, 248]; // sky-400
  const bot = [29, 78, 216]; // blue-700
  const bgR = size * 0.225;

  const pad = size * 0.2;
  const inX0 = pad, inY0 = pad, inX1 = size - pad, inY1 = size - pad;
  const cellGap = size * 0.06;
  const cellW = (inX1 - inX0 - cellGap) / 2;
  const cellR = cellW * 0.26;
  const tiles = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const tx0 = inX0 + c * (cellW + cellGap);
      const ty0 = inY0 + r * (cellW + cellGap);
      tiles.push([tx0, ty0, tx0 + cellW, ty0 + cellW, cellR]);
    }
  }

  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    if (!insideRR(px, py, 0, 0, size, size, bgR)) return [0, 0, 0, 0];
    const t = py / size;
    const bg = [
      Math.round(top[0] + (bot[0] - top[0]) * t),
      Math.round(top[1] + (bot[1] - top[1]) * t),
      Math.round(top[2] + (bot[2] - top[2]) * t),
    ];
    for (const [a, b, c, d, r] of tiles) {
      if (insideRR(px, py, a, b, c, d, r)) {
        const w = 0.92; // light tile, slightly tinted by the gradient
        return [
          Math.round(255 * w + bg[0] * (1 - w)),
          Math.round(255 * w + bg[1] * (1 - w)),
          Math.round(255 * w + bg[2] * (1 - w)),
          255,
        ];
      }
    }
    return [bg[0], bg[1], bg[2], 255];
  };
}

mkdirSync(join(__dirname, "..", "assets"), { recursive: true });
for (const [name, size] of [["trayTemplate.png", 22], ["trayTemplate@2x.png", 44]]) {
  writeFileSync(join(__dirname, "..", "assets", name), encodePng(size, tileAlpha(size)));
}

mkdirSync(join(__dirname, "..", "build"), { recursive: true });
writeFileSync(join(__dirname, "..", "build", "icon.png"), encodePngRGBA(1024, appIcon(1024)));

console.log("wrote assets/trayTemplate.png, assets/trayTemplate@2x.png, build/icon.png");
