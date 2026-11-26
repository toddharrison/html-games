// Loose things on the ground (SPEC 6.7): the last stage of generation, after the trails. Each tile's
// choice is position-hashed (SPEC 11.3, rule 2) from the ground and features around it, never the deal.
// It doesn't affect validation; it only decides what lies where.

import { L } from '../../content/loose.ts';
import { BAND, F, FEATURES, FLAG, T, TERRAIN, WATER } from '../../content/terrain.ts';
import { hash2f } from '../rng.ts';
import { type Gen, xOf, yOf } from './gen.ts';
import { N } from './grid.ts';

const SIZE = 256;

/** Chances per tile, before the ground decides. Tuned so a camp's surroundings run thin in a few days. */
const CHANCE = {
  branch: 0.03,
  cones: 0.06,
  twigs: 0.1,
  driftlog: 0.04,
  driftwood: 0.16,
  chip: 0.35,
  stones: 0.07,
  grass: 0.045,
  fluff: 0.16,
  stalks: 0.1,
  feather: 0.004,
  tracks: 0.08,
  tracksTrail: 0.16,
  /** Prints on firm ground show only here and there. */
  tracksFirm: 0.02,
  hare: 0.03,
} as const;

export function scatterLoose(g: Gen): Uint8Array {
  const out = new Uint8Array(N);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : y * SIZE + x);
  const around = (i: number, test: (n: number) => boolean): boolean => {
    const x = xOf(i);
    const y = yOf(i);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = at(x + dx, y + dy);
        if (n >= 0 && test(n)) return true;
      }
    }
    return false;
  };
  const isTree = (n: number) => {
    const f = g.feature[n];
    return f === F.conifer || f === F.aspen || f === F.stunted || f === F.snag;
  };
  const isLake = (n: number) => g.water[n] === WATER.lake && TERRAIN[g.terrain[n]!]!.water;
  const isWater = (n: number) => TERRAIN[g.terrain[n]!]!.water;
  const territory = (i: number, kind: 'bear' | 'elk' | 'cougar') => {
    const t = g.territories.find((tt) => tt.animal === kind);
    if (!t) return false;
    return Math.max(Math.abs(xOf(i) - t.x), Math.abs(yOf(i) - t.y)) <= t.r;
  };
  const outcropNear = (i: number) => g.outcrops.some((o) => Math.max(Math.abs(xOf(o.at) - xOf(i)), Math.abs(yOf(o.at) - yOf(i))) <= 2);

  for (let i = 0; i < N; i++) {
    const t = g.terrain[i]!;
    const f = g.feature[i]!;
    if (f !== F.none || !TERRAIN[t]!.passable || FEATURES[f]!.blocks || t === T.shelter) continue;
    if (i === g.start || i === g.crash) continue;
    const x = xOf(i);
    const y = yOf(i);
    const roll = (salt: number, p: number) => hash2f(g.word, x, y, 900 + salt) < p;
    const soft = t === T.sand || t === T.marsh || t === T.snow || t === T.reeds;
    const trail = (g.flags[i]! & FLAG.trail) !== 0;
    let l: number = L.none;

    {
      const p = trail ? CHANCE.tracksTrail : soft ? CHANCE.tracks : CHANCE.tracksFirm;
      if (territory(i, 'bear') && roll(1, p)) l = L.tracksBear;
      else if (territory(i, 'cougar') && roll(2, p * 0.6)) l = L.tracksCougar;
      else if (territory(i, 'elk') && roll(3, p)) l = L.tracksElk;
      else if ((soft || trail) && g.band[i] === BAND.floor && roll(4, trail ? CHANCE.hare * 2 : CHANCE.hare)) l = L.tracksHare;
    }
    if (!l && outcropNear(i) && roll(5, CHANCE.chip)) l = L.chip;
    if (!l && (t === T.sand || t === T.reeds || t === T.marsh) && around(i, isLake)) {
      if (roll(6, CHANCE.driftlog)) l = L.driftlog;
      else if (roll(7, CHANCE.driftwood)) l = L.driftwood;
    }
    if (!l && around(i, isTree)) {
      if (around(i, (n) => g.feature[n] === F.conifer) && roll(8, CHANCE.cones)) l = L.cones;
      else if (around(i, (n) => g.feature[n] !== F.snag && isTree(n)) && roll(9, CHANCE.branch)) l = L.branch;
      else if (roll(10, CHANCE.twigs)) l = L.twigs;
    }
    if (!l) {
      const stony = t === T.talus || t === T.boulders || t === T.scree || t === T.rock || t === T.gravel || (t === T.sand && around(i, isWater));
      if (stony && roll(11, CHANCE.stones)) l = L.stones;
      else if ((t === T.meadow || t === T.highMeadow) && roll(12, CHANCE.grass)) l = L.grass;
      else if (t === T.reeds && roll(13, CHANCE.fluff)) l = L.fluff;
      else if ((t === T.reeds || t === T.marsh || t === T.highMeadow) && roll(14, t === T.highMeadow ? CHANCE.stalks * 0.5 : CHANCE.stalks)) l = L.stalks;
      else if ((t === T.meadow || t === T.forest || t === T.highMeadow) && roll(15, CHANCE.feather)) l = L.feather;
    }
    out[i] = l;
  }
  return out;
}
