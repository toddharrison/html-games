// What the survivor's surroundings give them: shelter (SPEC 7.6), fire's light and warmth (8.3), and the
// weather where they stand (6.5).

import { FIRE_LIGHT } from '../content/balance.ts';
import { T } from '../content/terrain.ts';
import type { Fire, GameState } from './state.ts';
import { idx, type World } from './world.ts';
import { weatherNow } from './weather.ts';

export interface Shelter {
  /** 0–1 ratings (SPEC 7.6). */
  rain: number;
  wind: number;
  insulation: number;
  security: number;
  bed: boolean;
}

/** The shelter at a tile: the overhang's floor, or a lean-to, plus a wall and a bed if built. */
export function shelterAt(s: GameState, w: World, x: number, y: number): Shelter {
  const sh: Shelter = { rain: 0, wind: 0, insulation: 0, security: 0, bed: false };
  if (w.terrain[idx(x, y)] === T.shelter) {
    sh.rain = 0.8;
    sh.wind = 0.25;
    sh.security = 0.2;
  }
  for (const b of s.builds) {
    if (b.x !== x || b.y !== y) continue;
    if (b.kind === 'lean-to') {
      sh.rain = Math.max(sh.rain, 0.6);
      sh.wind = Math.max(sh.wind, 0.3);
      sh.security = Math.max(sh.security, 0.1);
    } else if (b.kind === 'wall') {
      sh.wind = Math.min(1, sh.wind + 0.5);
      sh.security = Math.min(1, sh.security + 0.55);
      sh.insulation = Math.min(1, sh.insulation + 0.2);
    } else if (b.kind === 'bed') {
      sh.bed = true;
      sh.insulation = Math.min(1, sh.insulation + 0.35);
    }
  }
  return sh;
}

export function burning(f: Fire): boolean {
  return f.fuel > 0 && !f.banked;
}

/** Everything giving light: burning fires light FIRE_LIGHT tiles; glowing coals one. */
export function lightsOf(s: GameState): { x: number; y: number; radius: number }[] {
  const out: { x: number; y: number; radius: number }[] = [];
  for (const f of s.fires) {
    if (burning(f)) out.push({ x: f.x, y: f.y, radius: FIRE_LIGHT });
    else if (f.coals > 0 && !f.banked) out.push({ x: f.x, y: f.y, radius: 1 });
  }
  return out;
}

/** A burning fire within `r` tiles (Chebyshev), or null. */
export function fireNear(s: GameState, x: number, y: number, r = 1): Fire | null {
  return s.fires.find((f) => burning(f) && Math.abs(f.x - x) <= r && Math.abs(f.y - y) <= r) ?? null;
}

/** How much a fire warms this tile, 0–1.3: full beside it, fading to nothing at its reach; reflector stones push it further. */
export function warmthNear(s: GameState, x: number, y: number): number {
  let best = 0;
  for (const f of s.fires) {
    if (!burning(f)) continue;
    const reflect = s.builds.some((b) => b.kind === 'reflector' && b.x === f.x && b.y === f.y);
    const reach = reflect ? 4 : 3;
    const dx = f.x - x;
    const dy = f.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;
    best = Math.max(best, (1 - d2 / (reach * reach + 1)) * (reflect ? 1.3 : 1));
  }
  return best;
}

export interface WeatherHere {
  /** Added to the air temperature. */
  temp: number;
  /** 0–1. */
  wind: number;
  /** Rain or snow falling on the survivor. */
  wetting: boolean;
  hot: boolean;
}

export function weatherHere(s: GameState, w?: World): WeatherHere {
  return weatherNow(s, w);
}
