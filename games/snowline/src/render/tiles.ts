// Placeholder art generated in code (SPEC 12.1): every terrain is a flat colour with a simple glyph, in
// a few variants; features and the survivor are small shapes in the base palette. Drawn sprites
// replace these from M2, through the same atlas, so nothing else changes.

import { PLANTS } from '../content/decks.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import type { Protagonist } from '../sim/protagonist.ts';
import { PALETTE, TERRAIN_COLOR, rgb, type PaletteKey } from './palette.ts';
import { ANIMAL_SPRITES, SPRITES, paint, personSprite } from './sprites.ts';

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

function paintFeature(g: Ctx, f: number, data: number): void {
  switch (f) {
    case F.conifer:
      paint(g, SPRITES.conifer!);
      break;
    case F.stunted:
      paint(g, SPRITES.stunted!);
      break;
    case F.aspen:
      paint(g, SPRITES.aspen!);
      break;
    case F.boulder:
      paint(g, SPRITES.boulder!);
      break;
    case F.bush:
      // Wild rose: a loose, thorny, paler bush with a couple of hips, unlike the dense berry bushes.
      paint(g, SPRITES.bush!);
      break;
    case F.log:
      paint(g, SPRITES.log!);
      break;
    case F.plant: {
      const p = PLANTS[data];
      const tint = PLANT_TINT[p?.tint ?? 'green']!;
      if (!p || p.kind === 'berry') {
        paint(g, SPRITES.berries!, 0, 0, { x: tint });
      } else if (p.kind === 'bulb') {
        paint(g, SPRITES.bulb!, 0, 0, { x: tint });
      } else if (p.kind === 'greens') {
        paint(g, SPRITES.greens!, 0, 0, { x: p.id === 'feathery-greens' ? P.meadowLight : tint });
      } else {
        paint(g, SPRITES.mushroom!, 0, 0, { x: tint, y: mix(tint, P.snow, 0.35) });
      }
      break;
    }
    case F.herb:
      paint(g, SPRITES.herb!, 0, 0, { x: HERB_TINT[data] ?? P.pale });
      break;
    case F.outcrop: {
      const [body, mark] = STONE_TINT[data] ?? [P.stone, P.pale];
      paint(g, SPRITES.outcrop!, 0, 0, { b: body, m: mark });
      break;
    }
    case F.overhang:
      paint(g, SPRITES.overhang!);
      break;
    case F.crash:
      paint(g, SPRITES.crash!);
      break;
    case F.tail:
      paint(g, SPRITES.tail!);
      break;
    case F.snag:
      paint(g, SPRITES.snag!);
      break;
    case F.midden:
      paint(g, SPRITES.midden!);
      break;
    case F.den:
      paint(g, SPRITES[`den${data}`] ?? SPRITES.den0!);
      break;
    case F.bones:
      paint(g, SPRITES.bones!);
      break;
    case F.arch:
      paint(g, SPRITES.arch!);
      break;
    case F.beaverDam:
      paint(g, SPRITES.beaverDam!);
      break;
    case F.carcass:
      paint(g, SPRITES.carcass!);
      break;
  }
}

// ---- The atlas ----

export interface Atlas {
  /** Every terrain in every variant: variant v of terrain t is at (v * 16, t * 16). */
  terrain: HTMLCanvasElement;
  feature(f: number, data: number): HTMLCanvasElement;
  /** The survivor facing `dir` on walk frame 0 or 1; dir -1 is asleep. */
  person(who: Protagonist, dir: number, frame: number): HTMLCanvasElement;
  /** A named sprite from SPRITES (the stash bundle, ...). */
  sprite(name: string): HTMLCanvasElement;
  /** An animal, facing left or right. */
  animal(kind: string, mirror: boolean): HTMLCanvasElement;
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
  const named = new Map<string, HTMLCanvasElement>();
  const beasts = new Map<string, HTMLCanvasElement>();
  return {
    animal(kind, mirror) {
      const key = `${kind}:${mirror}`;
      let c = beasts.get(key);
      if (!c) {
        c = makeCanvas(S, S);
        const def = ANIMAL_SPRITES[kind];
        if (def) paint(c.getContext('2d')!, def, 0, 0, {}, mirror);
        beasts.set(key, c);
      }
      return c;
    },
    sprite(name) {
      let c = named.get(name);
      if (!c) {
        c = makeCanvas(S, S);
        const def = SPRITES[name];
        if (def) paint(c.getContext('2d')!, def);
        named.set(name, c);
      }
      return c;
    },
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
        const g = c.getContext('2d')!;
        if (dir !== -1) {
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.fillRect(4, 14, 8, 2);
        }
        const pose = dir === -1 ? 'asleep' : dir === 0 ? 'north' : dir === 2 ? 'south' : 'east';
        // The figure on its own canvas, then a dark outline round it, so the survivor
        // reads against any ground; then the figure over the shadow.
        const fig = makeCanvas(S, S);
        const fg = fig.getContext('2d')!;
        paint(fg, personSprite(who.looks, pose, frame), 0, 0, {}, dir === 3);
        const d = fg.getImageData(0, 0, S, S).data;
        const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && d[(y * S + x) * 4 + 3]! > 0;
        g.fillStyle = 'rgba(22,18,16,0.85)';
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            if (solid(x, y)) continue;
            if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) g.fillRect(x, y, 1, 1);
          }
        }
        g.drawImage(fig, 0, 0);
        people.set(key, c);
      }
      return c;
    },
  };
}

export type { PaletteKey };
