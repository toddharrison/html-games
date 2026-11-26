// Placeholder art generated in code (SPEC 12.1): every terrain is a flat colour with a simple glyph, in
// a few variants; features and the survivor are small shapes in the base palette. Drawn sprites
// replace these from M2, through the same atlas, so nothing else changes.

import { PLANTS } from '../content/decks.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import type { Protagonist } from '../sim/protagonist.ts';
import { PALETTE, TERRAIN_COLOR, rgb, type PaletteKey } from './palette.ts';

export const VARIANTS = 4;
const S = 16;

/** A cheap integer hash for the look of things. Render-side only; never feeds the simulation. */
export function rh(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A colour between two palette colours (or hex strings). */
export function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const P = PALETTE;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

type Ctx = CanvasRenderingContext2D;

function px(g: Ctx, x: number, y: number, c: string, w = 1, h = 1): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

// ---- Terrain ----

function speckle(g: Ctx, base: string, v: number, salt: number, n: number, light: string, dark: string): void {
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rh(k, v, salt) * S);
    const y = Math.floor(rh(v, k, salt + 1) * S);
    px(g, x, y, rh(k, k, salt + v) < 0.5 ? light : dark);
  }
}

function tufts(g: Ctx, v: number, salt: number, n: number, c: string): void {
  for (let k = 0; k < n; k++) {
    const x = 1 + Math.floor(rh(k, v, salt) * 13);
    const y = 2 + Math.floor(rh(v, k, salt + 3) * 12);
    px(g, x, y, c);
    px(g, x + 1, y - 1, c);
    px(g, x + 2, y, c);
  }
}

function stones(g: Ctx, v: number, salt: number, n: number, c: string, shade: string): void {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rh(k, v, salt) * 14);
    const y = Math.floor(rh(v, k, salt + 5) * 14);
    px(g, x, y, c, 2, 2);
    px(g, x, y + 1, shade, 2, 1);
  }
}

function paintTerrain(g: Ctx, t: number, v: number): void {
  const base = P[TERRAIN_COLOR[t]!];
  const lighter = mix(base, P.snow, 0.12);
  const darker = mix(base, P.ink, 0.15);
  speckle(g, base, v, t * 7, 12, lighter, darker);
  switch (t) {
    case T.headwall:
    case T.cliff: {
      const stripe = t === T.cliff ? P.slate : P.night;
      for (let x = 1 + v; x < S; x += 4) px(g, x, 2 + ((x * 3) % 5), stripe, 1, 10);
      px(g, 0, 0, mix(base, P.pale, 0.3), S, 2);
      px(g, 0, 14, P.ink, S, 2);
      break;
    }
    case T.deep:
      if (v % 2 === 0) px(g, 3 + v, 6 + v, mix(base, P.water, 0.6), 5, 1);
      break;
    case T.shallows:
      px(g, 2 + v, 4 + v, mix(base, P.foam, 0.4), 4, 1);
      px(g, 9 - v, 11 - v, mix(base, P.foam, 0.3), 3, 1);
      break;
    case T.stream:
    case T.gravel:
      if (t === T.gravel) stones(g, v, 31, 6, P.sandDark, P.stone);
      px(g, 3 + v, 3, mix(base, P.foam, 0.5), 1, 4);
      px(g, 10 - v, 9, mix(base, P.foam, 0.5), 1, 4);
      break;
    case T.waterfall:
      for (let x = 1; x < S; x += 3) px(g, x + (v % 2), 0, mix(P.foam, P.snow, 0.5), 1, S);
      break;
    case T.sand:
      for (let k = 0; k < 6; k++) px(g, Math.floor(rh(k, v, 5) * S), Math.floor(rh(v, k, 6) * S), P.sandDark);
      break;
    case T.reeds:
      for (let k = 0; k < 5; k++) {
        const x = 1 + Math.floor(rh(k, v, 9) * 14);
        const y = 3 + Math.floor(rh(v, k, 9) * 7);
        px(g, x, y, P.meadowLight, 1, 5);
        px(g, x, y - 2, P.bark, 1, 2);
      }
      break;
    case T.marsh:
      px(g, 3 + v, 5, P.water, 4, 2);
      px(g, 9, 11 - v, P.water, 3, 1);
      tufts(g, v, 13, 2, P.reed);
      break;
    case T.meadow:
      tufts(g, v, 17, 3, P.meadowLight);
      break;
    case T.forest:
      for (let k = 0; k < 7; k++) px(g, Math.floor(rh(k, v, 21) * S), Math.floor(rh(v, k, 22) * S), k % 2 ? P.bark : P.pine);
      break;
    case T.highMeadow:
      tufts(g, v, 25, 3, mix(P.meadowLight, P.pale, 0.3));
      if (v % 2) px(g, 5 + v, 9, P.cream);
      break;
    case T.scrub:
      for (let k = 0; k < 3; k++) {
        const x = 2 + Math.floor(rh(k, v, 27) * 11);
        const y = 3 + Math.floor(rh(v, k, 28) * 10);
        px(g, x, y, P.bark, 3, 1);
        px(g, x + 1, y - 1, P.bark);
      }
      break;
    case T.boulders:
      stones(g, v, 33, 4, P.fog, P.slate);
      break;
    case T.talus:
      stones(g, v, 35, 7, P.pale, P.stone);
      break;
    case T.rock:
      px(g, 2 + v, 5, darker, 6, 1);
      px(g, 7 + v, 6, darker, 1, 4);
      break;
    case T.snow:
      px(g, 4, 6 + v, P.pale, 3, 1);
      break;
    case T.scree:
      stones(g, v, 37, 6, P.pale, P.slate);
      for (let k = 0; k < 3; k++) px(g, 2 + k * 5, 13 - k * 5 + v, P.stone, 3, 1);
      break;
    case T.shelter:
      stones(g, v, 39, 3, P.stone, P.ink);
      break;
  }
}

// ---- Features ----

const PLANT_TINT: Record<string, string> = {
  red: P.red,
  blue: P.blue,
  white: P.cream,
  pale: P.cream,
  purple: '#6a4a7a',
  green: P.meadowLight,
  brown: P.wood,
  orange: P.ember,
};
const HERB_TINT = [P.pale, P.reed, P.meadowLight, P.red, P.fog];
const STONE_TINT: [string, string][] = [
  [P.ink, '#4b5a8a'],
  [P.stone, P.pale],
  ['#8a4a32', P.ember],
  [P.stone, P.snow],
  [P.rock, P.ink],
];

function conifer(g: Ctx, top: number, scale: number): void {
  px(g, 7, 13, P.bark, 2, 3);
  for (let row = 0; row < 12 * scale; row++) {
    const y = top + row;
    const half = Math.floor((row % (4 * scale)) / scale) + Math.floor(row / (4 * scale)) + 1;
    px(g, 8 - half, y, P.pine, half * 2, 1);
    px(g, 8 - half, y, P.pineLight, 1, 1);
  }
}

function blob(g: Ctx, cx: number, cy: number, rx: number, ry: number, c: string): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) px(g, cx + x, cy + y, c);
    }
  }
}

function paintFeature(g: Ctx, f: number, data: number): void {
  switch (f) {
    case F.conifer:
      conifer(g, 1, 1);
      break;
    case F.stunted:
      px(g, 7, 13, P.bark, 2, 2);
      for (let row = 0; row < 8; row++) {
        const half = Math.floor(row / 2) + 1;
        px(g, 8 - half, 5 + row, P.pineLight, half * 2, 1);
        px(g, 8 - half, 5 + row, P.pine, 1, 1);
      }
      break;
    case F.aspen:
      px(g, 7, 9, P.cream, 2, 7);
      px(g, 7, 11, P.ink, 1, 1);
      blob(g, 8, 6, 5, 5, P.aspen);
      for (let k = 0; k < 6; k++) px(g, 4 + Math.floor(rh(k, 1, 3) * 8), 2 + Math.floor(rh(1, k, 3) * 8), mix(P.aspen, P.ink, 0.25));
      break;
    case F.boulder:
      blob(g, 8, 10, 6, 4, P.stone);
      blob(g, 7, 9, 3, 2, P.fog);
      px(g, 3, 13, P.slate, 10, 1);
      break;
    case F.bush:
      // Wild rose: a loose, thorny, paler bush with a couple of hips, unlike the dense berry bushes.
      for (let k = 0; k < 6; k++) px(g, 3 + k * 2, 7 + (k % 3), P.scrub, 1, 6 - (k % 3));
      blob(g, 8, 11, 4, 2, P.meadow);
      px(g, 5, 8, P.ember, 1, 1);
      px(g, 11, 9, P.ember, 1, 1);
      break;
    case F.log:
      px(g, 1, 9, P.wood, 14, 4);
      px(g, 1, 9, mix(P.wood, P.cream, 0.3), 14, 1);
      px(g, 13, 9, P.bark, 2, 4);
      break;
    case F.plant: {
      const p = PLANTS[data];
      const tint = PLANT_TINT[p?.tint ?? 'green']!;
      if (!p || p.kind === 'berry') {
        blob(g, 8, 10, 5, 4, P.forest);
        for (let k = 0; k < 7; k++) px(g, 4 + Math.floor(rh(k, data, 5) * 9), 7 + Math.floor(rh(data, k, 5) * 6), tint);
      } else if (p.kind === 'bulb') {
        for (let k = 0; k < 4; k++) px(g, 5 + k * 2, 5 + (k % 2) * 2, P.meadowLight, 1, 7);
        px(g, 6, 12, tint, 5, 2);
      } else if (p.kind === 'greens') {
        blob(g, 8, 11, 5, 3, tint);
        px(g, 8, 8, P.forest, 1, 6);
      } else {
        px(g, 5, 11, P.cream, 1, 3);
        px(g, 10, 10, P.cream, 1, 4);
        blob(g, 5, 10, 2, 1, tint);
        blob(g, 10, 9, 3, 1, tint);
      }
      break;
    }
    case F.herb: {
      const c = HERB_TINT[data] ?? P.pale;
      for (let k = 0; k < 5; k++) px(g, 4 + k * 2, 9 + (k % 2), c, 1, 4);
      px(g, 5, 8, mix(c, P.snow, 0.4), 1, 1);
      px(g, 10, 8, mix(c, P.snow, 0.4), 1, 1);
      break;
    }
    case F.outcrop: {
      const [body, mark] = STONE_TINT[data] ?? [P.stone, P.pale];
      blob(g, 8, 9, 6, 5, body);
      for (let k = 0; k < 5; k++) px(g, 4 + Math.floor(rh(k, data, 7) * 8), 6 + Math.floor(rh(data, k, 7) * 7), mark, 2, 1);
      px(g, 3, 14, P.ink, 10, 1);
      break;
    }
    case F.overhang:
      px(g, 0, 2, P.slate, 16, 12);
      px(g, 0, 2, P.fog, 16, 2);
      px(g, 0, 12, P.ink, 16, 3);
      break;
    case F.crash:
      px(g, 1, 6, P.pale, 14, 6);
      px(g, 1, 6, P.snow, 14, 2);
      px(g, 3, 8, P.ink, 3, 2);
      px(g, 8, 8, P.ink, 3, 2);
      px(g, 12, 4, P.stone, 3, 3);
      px(g, 1, 11, P.slate, 14, 1);
      break;
    case F.tail:
      px(g, 4, 9, P.pale, 10, 4);
      px(g, 9, 1, P.snow, 4, 8);
      px(g, 10, 3, P.ember, 2, 2);
      break;
    case F.snag:
      px(g, 7, 3, P.fog, 2, 13);
      px(g, 5, 2, P.fog, 2, 4);
      px(g, 9, 1, P.fog, 2, 5);
      px(g, 7, 6, P.ink, 1, 8);
      break;
    case F.midden:
      blob(g, 8, 10, 6, 4, P.stone);
      px(g, 5, 9, P.ink, 6, 2);
      for (let k = 0; k < 4; k++) px(g, 4 + k * 2, 7 + (k % 2), P.wood, 3, 1);
      break;
    case F.bones:
      px(g, 3, 10, P.cream, 6, 1);
      px(g, 9, 12, P.cream, 4, 1);
      px(g, 6, 8, P.cream, 1, 5);
      break;
    case F.arch:
      px(g, 1, 3, P.stone, 4, 12);
      px(g, 11, 3, P.stone, 4, 12);
      px(g, 1, 2, P.fog, 14, 3);
      break;
    case F.beaverDam:
      for (let k = 0; k < 6; k++) px(g, 1 + k, 7 + (k % 3), P.wood, 10, 1);
      px(g, 2, 11, P.bark, 12, 2);
      break;
    case F.carcass:
      blob(g, 8, 11, 5, 3, P.bark);
      for (let k = 0; k < 4; k++) px(g, 5 + k * 2, 9, P.cream, 1, 3);
      break;
  }
}

// ---- The survivor ----

const SKIN = ['#f1d0b5', '#e0b28f', '#c68b63', '#9c6644', '#7a4a2e', '#5a3420'];
const HAIR = ['#2b2018', '#4a3020', '#7a4b28', '#b07a3c', '#d9b36a', '#8a2f1c'];
const SHIRT = ['#8a3b32', '#3f5f8a', '#4f7a4a', '#c09a3a', '#6a4a7a', '#b5662f', '#3a6d72', '#9a9a92'];
const PANTS = ['#3b4458', '#4d4436', '#5a5a5a', '#2f3a2f', '#6b5a44'];

/** The survivor, facing `dir` (north, east, south, west), on walk frame 0 or 1. */
function paintPerson(g: Ctx, who: Protagonist, dir: number, frame: number): void {
  const l = who.looks;
  const skin = SKIN[l.skin] ?? SKIN[0]!;
  const hair = HAIR[l.hair] ?? HAIR[0]!;
  const shirt = SHIRT[l.shirt] ?? SHIRT[0]!;
  const pants = PANTS[l.pants] ?? PANTS[0]!;
  // Shadow, legs, body, arms, head.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(4, 14, 8, 2);
  const step = frame === 1 ? 1 : 0;
  px(g, 6, 11, pants, 2, 3 + (step ? 0 : 1));
  px(g, 8, 11, pants, 2, 3 + (step ? 1 : 0));
  px(g, 5, 6, shirt, 6, 6);
  px(g, 4, 7, shirt, 1, 4);
  px(g, 11, 7, shirt, 1, 4);
  px(g, 4, 11, skin, 1, 1);
  px(g, 11, 11, skin, 1, 1);
  px(g, 5, 1, skin, 6, 5);
  px(g, 5, 0, hair, 6, 2);
  if (l.hairStyle === 1) {
    px(g, 4, 1, hair, 1, 6);
    px(g, 11, 1, hair, 1, 6);
  }
  if (dir === 0) {
    px(g, 5, 1, hair, 6, 4);
    if (l.hairStyle === 2) px(g, 7, 5, hair, 2, 3);
  } else if (dir === 2) {
    px(g, 6, 3, P.ink, 1, 1);
    px(g, 9, 3, P.ink, 1, 1);
  } else {
    const front = dir === 1 ? 9 : 6;
    const back = dir === 1 ? 5 : 9;
    px(g, back, 1, hair, 2, 3);
    px(g, front, 3, P.ink, 1, 1);
    if (l.hairStyle === 2) px(g, dir === 1 ? 4 : 11, 2, hair, 1, 3);
  }
}

// ---- The atlas ----

export interface Atlas {
  /** Every terrain in every variant: variant v of terrain t is at (v * 16, t * 16). */
  terrain: HTMLCanvasElement;
  feature(f: number, data: number): HTMLCanvasElement;
  person(who: Protagonist, dir: number, frame: number): HTMLCanvasElement;
}

export function buildAtlas(): Atlas {
  const terrain = makeCanvas(S * VARIANTS, S * TERRAIN.length);
  const tg = terrain.getContext('2d')!;
  for (let t = 0; t < TERRAIN.length; t++) {
    for (let v = 0; v < VARIANTS; v++) {
      tg.save();
      tg.translate(v * S, t * S);
      tg.beginPath();
      tg.rect(0, 0, S, S);
      tg.clip();
      paintTerrain(tg, t, v);
      tg.restore();
    }
  }
  const features = new Map<string, HTMLCanvasElement>();
  const people = new Map<string, HTMLCanvasElement>();
  return {
    terrain,
    feature(f, data) {
      const key = `${f}:${data}`;
      let c = features.get(key);
      if (!c) {
        c = makeCanvas(S, S);
        paintFeature(c.getContext('2d')!, f, data);
        features.set(key, c);
      }
      return c;
    },
    person(who, dir, frame) {
      const key = `${JSON.stringify(who.looks)}:${dir}:${frame}`;
      let c = people.get(key);
      if (!c) {
        c = makeCanvas(S, S);
        paintPerson(c.getContext('2d')!, who, dir, frame);
        people.set(key, c);
      }
      return c;
    },
  };
}

export type { PaletteKey };
