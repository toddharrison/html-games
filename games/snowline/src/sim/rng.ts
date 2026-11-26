// The one source of randomness (SPEC 11.3, rules 1 and 2). A seed string is hashed (cyrb128) to start
// an sfc32 generator. Every system draws from its own named stream, so a new draw in one system never
// shifts another's results. A stream's state is plain data, so it can be saved and compared.

/** The named streams. Each one is seeded from the world seed and its own name. */
export const STREAMS = ['worldgen', 'rules', 'protagonist', 'weather', 'animals', 'skill-checks', 'health', 'events', 'fish'] as const;
export type StreamName = (typeof STREAMS)[number];

/** One stream: sfc32's four words, and how many numbers it has handed out (the debug overlay shows it). */
export interface RngState {
  s: [number, number, number, number];
  n: number;
}

/** cyrb128: a string to four 32-bit words. */
export function hashString(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A fresh stream for `seed` and `name`. `name` may carry a suffix (`protagonist:2`) for a sub-stream. */
export function makeRng(seed: string, name: string): RngState {
  const r: RngState = { s: hashString(`${seed}/${name}`), n: 0 };
  for (let i = 0; i < 12; i++) nextU32(r);
  r.n = 0;
  return r;
}

/** Every named stream for a seed. */
export function makeStreams(seed: string): Record<StreamName, RngState> {
  const out = {} as Record<StreamName, RngState>;
  for (const name of STREAMS) out[name] = makeRng(seed, name);
  return out;
}

/** sfc32: the next 32-bit unsigned integer. Advances `r` in place. */
export function nextU32(r: RngState): number {
  const s = r.s;
  let a = s[0];
  let b = s[1];
  let c = s[2];
  let d = s[3];
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  r.n++;
  return t >>> 0;
}

/** A float in [0, 1). */
export function nextFloat(r: RngState): number {
  return nextU32(r) / 4294967296;
}

/** An integer in [0, n). */
export function nextInt(r: RngState, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

/** An integer in [lo, hi], inclusive. */
export function nextRange(r: RngState, lo: number, hi: number): number {
  return lo + nextInt(r, hi - lo + 1);
}

/** True with probability `p`. */
export function chance(r: RngState, p: number): boolean {
  return nextFloat(r) < p;
}

/** One element of a non-empty array. */
export function pick<T>(r: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from an empty list');
  return items[nextInt(r, items.length)]!;
}

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(r: RngState, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(r, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** A copy of a stream, for saves and look-ahead. */
export function cloneRng(r: RngState): RngState {
  return { s: [r.s[0], r.s[1], r.s[2], r.s[3]], n: r.n };
}

// ---- Position-hashed randomness (rule 2): a tile's result never depends on visiting order. ----

/** A 32-bit hash of a seed word, a tile, and a salt that tells uses apart. */
export function hash2(seed: number, x: number, y: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) | 0;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

/** `hash2` as a float in [0, 1). */
export function hash2f(seed: number, x: number, y: number, salt: number): number {
  return hash2(seed, x, y, salt) / 4294967296;
}
