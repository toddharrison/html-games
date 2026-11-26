// Seed inspector: generates valleys in Node and writes each as a PNG, with a line of facts per seed.
//
//   npm run inspect -- [--scale N] [--out dir] seed [seed ...]
//
//   --scale  pixels per tile (default 3)
//   --out    where the PNGs go (default renders/inspect, git-ignored)
//
// Markers: red the start, orange the overhang, white the wreckage, yellow viewpoints, pink the signal
// knoll, cyan animal territories, magenta the rockslide gap.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { dealRules } from '../src/sim/rules.ts';
import { generateWorld } from '../src/sim/worldgen/index.ts';
import { mapImage } from '../src/tools/mapImage.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = args[i + 1] ?? fallback;
  args.splice(i, 2);
  return value;
};
const scale = Number(flag('scale', '3'));
const outDir = resolve(import.meta.dirname, '..', flag('out', 'renders/inspect'));
const seeds = args.length ? args : ['first-light'];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head.subarray(4), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head.subarray(0, 4), body, crc]);
}
function png(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const seed of seeds) {
  const t0 = performance.now();
  const world = generateWorld(seed, dealRules(seed));
  const ms = Math.round(performance.now() - t0);
  const small = mapImage(world);
  const n = world.size * scale;
  const big = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const s = (Math.floor(y / scale) * world.size + Math.floor(x / scale)) * 4;
      big.set(small.subarray(s, s + 4), (y * n + x) * 4);
    }
  const file = join(outDir, `${seed.replace(/[^\w.-]+/g, '_')}.png`);
  writeFileSync(file, png(n, n, big));
  console.log(`${seed}: ${ms} ms, ${world.attempts} tries, start ${world.start.x},${world.start.y} -> ${file}`);
  for (const f of world.failures) console.log(`  failed ${f}`);
}
