// Gradient noise built only from + − × and Math.floor, so it gives the same result in every engine
// (SPEC 11.3, rule 5). The gradient at each lattice point comes from the position hash.

import { hash2 } from '../rng.ts';

const S = 0.7071067811865476;
const GX = [1, -1, 0, 0, S, -S, S, -S];
const GY = [0, 0, 1, -1, S, S, -S, -S];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(seed: number, ix: number, iy: number, dx: number, dy: number): number {
  const h = hash2(seed, ix, iy, 7) & 7;
  return GX[h]! * dx + GY[h]! * dy;
}

/** 2D gradient noise, roughly in [-0.7, 0.7]. */
export function perlin(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fade(fx);
  const v = fade(fy);
  const n00 = grad(seed, ix, iy, fx, fy);
  const n10 = grad(seed, ix + 1, iy, fx - 1, fy);
  const n01 = grad(seed, ix, iy + 1, fx, fy - 1);
  const n11 = grad(seed, ix + 1, iy + 1, fx - 1, fy - 1);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

/** Layered noise: `octaves` layers, each at twice the frequency and half the amplitude. Roughly [-1, 1]. */
export function fbm(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += perlin((seed + o * 1013) | 0, x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return (sum / norm) * 1.4;
}
