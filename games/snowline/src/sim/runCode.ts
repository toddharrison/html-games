// Run codes (SPEC 4.3): a seed and a protagonist in one string to share, shown on the summary screen and
// accepted on the start screen. `SL1.` then the pair as base64url-encoded JSON.

import { protagonistProblems, type Protagonist } from './protagonist.ts';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PREFIX = 'SL1.';

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      c -= 0;
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

function fromUtf8(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    let c: number;
    if (b < 0x80) c = bytes[i++]!;
    else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i + 1]! & 63), (i += 2);
    else if (b < 0xf0) c = ((b & 15) << 12) | ((bytes[i + 1]! & 63) << 6) | (bytes[i + 2]! & 63), (i += 3);
    else c = ((b & 7) << 18) | ((bytes[i + 1]! & 63) << 12) | ((bytes[i + 2]! & 63) << 6) | (bytes[i + 3]! & 63), (i += 4);
    s += String.fromCodePoint(c);
  }
  return s;
}

export function encodeRun(seed: string, p: Protagonist): string {
  const bytes = utf8(JSON.stringify({ s: seed, p }));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 1 >= bytes.length ? 2 : i + 2 >= bytes.length ? 3 : 4;
    for (let k = 0; k < chars; k++) out += ALPHA[(n >> (18 - 6 * k)) & 63];
  }
  return PREFIX + out;
}

/** The seed and protagonist in a run code, or null if it isn't one. */
export function decodeRun(code: string): { seed: string; protagonist: Protagonist } | null {
  const text = code.trim();
  if (!text.startsWith(PREFIX)) return null;
  const body = text.slice(PREFIX.length);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i += 4) {
    const chunk = body.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = k < chunk.length ? ALPHA.indexOf(chunk[k]!) : 0;
      if (v < 0) return null;
      n = (n << 6) | v;
    }
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  try {
    const v = JSON.parse(fromUtf8(bytes)) as { s: string; p: Protagonist };
    if (typeof v.s !== 'string' || protagonistProblems(v.p).length) return null;
    return { seed: v.s, protagonist: v.p };
  } catch {
    return null;
  }
}
