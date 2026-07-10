/**
 * Genera íconos PWA placeholder (PNG) en /public.
 * Reemplazá estos archivos por tu logo definitivo cuando lo tengas.
 *
 * Uso:  node scripts/gen-pwa-icons.mjs
 *
 * Dibuja el fondo de marca (#060a12) con un círculo verde (#22c55e) centrado
 * — funciona como ícono normal y "maskable" (el círculo queda en la zona segura).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
mkdirSync(PUBLIC, { recursive: true });

// ── CRC32 (tabla) ──────────────────────────────────────────────
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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function makePNG(size, { bg, fg, circle = true }) {
  const [br, bgc, bb] = hex(bg);
  const [fr, fgc, fb] = hex(fg);
  const cx = size / 2, cy = size / 2, r = size * 0.30;

  // Raw RGBA con filtro 0 por scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      let R = br, G = bgc, B = bb;
      if (circle) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) { R = fr; G = fgc; B = fb; }
      }
      raw[p++] = R; raw[p++] = G; raw[p++] = B; raw[p++] = 255;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const BG = '#060a12', FG = '#22c55e';
const files = [
  ['pwa-192.png',           192, { bg: BG, fg: FG }],
  ['pwa-512.png',           512, { bg: BG, fg: FG }],
  ['pwa-maskable-512.png',  512, { bg: BG, fg: FG }], // círculo dentro de zona segura
  ['apple-touch-icon.png',  180, { bg: BG, fg: FG }],
];

for (const [name, size, opts] of files) {
  writeFileSync(join(PUBLIC, name), makePNG(size, opts));
  console.log('✓', name, `(${size}x${size})`);
}
console.log('Listo. Reemplazá estos placeholders por tu logo cuando lo tengas.');
