// Trout in the water (SPEC 7.4, 9): a few fish near the survivor, drawn where they are. How many a stretch
// of water holds is fishHere, as before (the line and the weir use it too); fish are placed by it, hold near a home
// spot, dart away from a survivor walking up, and settle back. Fish are kept only within reach of the
// survivor, so the valley's water isn't simulated fish by fish where nobody is looking.

import { T, WATER } from '../content/terrain.ts';
import { TROUT_RUN } from '../content/animals.ts';
import { chance, nextFloat, nextInt } from './rng.ts';
import type { Fish, GameState, SimEvent } from './state.ts';
import { cheb } from './animals.ts';
import { idx, inBounds, type World } from './world.ts';
import { clock } from './time.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

/** Fish are placed within this many tiles of the survivor and dropped beyond FISH_KEEP. */
export const FISH_REACH = 12;
const FISH_KEEP = 18;
const FISH_MAX = 9;
/** Fish per unit of fishHere summed over the water in reach. */
const FISH_PER_DENSITY = 0.3;

export function fishWater(w: World, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const t = w.terrain[idx(x, y)];
  return t === T.shallows || t === T.stream || t === T.gravel;
}

/** How many fish a water tile holds, 0–1 (SPEC 7.4): the spawning gravel best, the run doubling the stream. */
export function fishHere(s: GameState, w: World, tile: number): number {
  const t = w.terrain[tile]!;
  const day = clock(s.tick).day;
  const run = day >= TROUT_RUN[0] && day <= TROUT_RUN[1];
  let d = t === T.gravel ? 0.5 : t === T.stream ? 0.32 : t === T.shallows ? (w.water[tile] === WATER.tarn ? 0.1 : 0.22) : 0;
  if (run && (t === T.gravel || (t === T.stream && w.water[tile] === WATER.streamA))) d *= 2;
  return Math.min(0.95, d);
}


/** The fish on a tile (the oldest, if more than one), or null. */
export function fishOn(s: GameState, tile: number): Fish | null {
  for (const f of s.fish) if (idx(f.x, f.y) === tile) return f;
  return null;
}

/** Startle the fish within `r` of (x, y): each darts away with chance `p`. */
export function spookFish(s: GameState, x: number, y: number, r: number, p: number): number {
  let n = 0;
  for (const f of s.fish) {
    if (cheb(f.x, f.y, x, y) > r || !chance(s.rng.fish, p)) continue;
    f.spook = 3 + nextInt(s.rng.fish, 3);
    f.t = 1;
    n++;
  }
  return n;
}

/** Every tick: a step started near fish may startle them; fish whose time has come move. */
export function fishTick(s: GameState, w: World, ev: SimEvent[]): void {
  if (!s.fish.length) return;
  const p = s.player;
  if (p.stepLeft > 0 && p.stepLeft === p.stepTotal) {
    const near = spookFish(s, p.x, p.y, 1, 0.55) + spookFish(s, p.x, p.y, 2, 0.2);
    if (near) ev.push({ type: 'fish', what: 'spooked' });
  }
  for (const f of s.fish) {
    if (--f.t > 0) continue;
    if (f.spook > 0) {
      f.spook--;
      moveFish(w, f, (x, y) => -cheb(x, y, p.x, p.y) * 4 - (x === f.x && y === f.y ? 0 : 1));
      f.t = 3;
      continue;
    }
    if (cheb(f.x, f.y, f.hx, f.hy) > 1) moveFish(w, f, (x, y) => cheb(x, y, f.hx, f.hy));
    else if (chance(s.rng.fish, 0.35)) {
      const d = nextInt(s.rng.fish, 4);
      const nx = f.x + DX[d]!;
      const ny = f.y + DY[d]!;
      if (fishWater(w, nx, ny) && cheb(nx, ny, f.hx, f.hy) <= 2) {
        f.x = nx;
        f.y = ny;
      }
    }
    f.t = 30 + nextInt(s.rng.fish, 90);
  }
}

/** Move a fish to the neighbouring water (or stay) where `score` is lowest; ties go to the first direction. */
function moveFish(w: World, f: Fish, score: (x: number, y: number) => number): void {
  let bx = f.x;
  let by = f.y;
  let best = score(f.x, f.y);
  for (let d = 0; d < 4; d++) {
    const nx = f.x + DX[d]!;
    const ny = f.y + DY[d]!;
    if (!fishWater(w, nx, ny)) continue;
    const v = score(nx, ny);
    if (v < best) {
      best = v;
      bx = nx;
      by = ny;
    }
  }
  f.x = bx;
  f.y = by;
}

/** Every game minute: drop fish left far behind, and place new ones in the water in reach. */
export function fishMinute(s: GameState, w: World): void {
  const p = s.player;
  s.fish = s.fish.filter((f) => cheb(f.x, f.y, p.x, p.y) <= FISH_KEEP);
  const tiles: number[] = [];
  const dens: number[] = [];
  let total = 0;
  for (let y = p.y - FISH_REACH; y <= p.y + FISH_REACH; y++) {
    for (let x = p.x - FISH_REACH; x <= p.x + FISH_REACH; x++) {
      if (!fishWater(w, x, y)) continue;
      const d = fishHere(s, w, idx(x, y));
      total += d;
      // New fish turn up out of the survivor's immediate notice.
      if (cheb(x, y, p.x, p.y) < 4) continue;
      tiles.push(idx(x, y));
      dens.push(d);
    }
  }
  const target = Math.min(FISH_MAX, Math.floor(total * FISH_PER_DENSITY));
  if (s.fish.length >= target || !tiles.length || !chance(s.rng.fish, 0.5)) return;
  let sum = 0;
  for (const d of dens) sum += d;
  let r = nextFloat(s.rng.fish) * sum;
  let at = tiles[tiles.length - 1]!;
  for (let k = 0; k < tiles.length; k++) {
    r -= dens[k]!;
    if (r < 0) {
      at = tiles[k]!;
      break;
    }
  }
  const x = at % 256;
  const y = (at - x) / 256;
  s.fish.push({ id: s.nextFish++, x, y, hx: x, hy: y, t: 1 + nextInt(s.rng.fish, 60), spook: 0 });
}
