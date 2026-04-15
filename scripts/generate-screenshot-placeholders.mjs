/**
 * Writes minimal valid PNGs (solid cream + orange top bar) for docs/screenshots/*.png
 * Run: node scripts/generate-screenshot-placeholders.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "docs", "screenshots");

const W = 960;
const H = 540;
const CREAM = { r: 0xfa, g: 0xf7, b: 0xf2 };
const ORANGE = { r: 0xf9, g: 0x73, b: 0x16 };
const BAR = 6;

function crc32(buf) {
  let c = 0xffffffff;
  const table = crc32.table || (crc32.table = makeCrcTable());
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function chunk(type, data) {
  const len = u32(data.length);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = u32(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function buildPng() {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0; // filter None
    const row = y < BAR ? ORANGE : CREAM;
    for (let x = 0; x < W; x++) {
      raw[o++] = row.r;
      raw[o++] = row.g;
      raw[o++] = row.b;
    }
  }
  const compressed = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = chunk("IDAT", compressed);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    idat,
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const names = ["login", "lobby", "dashboard", "game", "profile"];
const png = buildPng();
mkdirSync(OUT_DIR, { recursive: true });
for (const name of names) {
  const p = join(OUT_DIR, `${name}.png`);
  writeFileSync(p, png);
  console.log("wrote", p);
}
