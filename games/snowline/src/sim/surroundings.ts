// What the survivor's surroundings give them: shelter (SPEC 7.6), a fire's warmth (8.3), and the weather
// where they stand (6.5). Each later system adds to these.

import { T } from '../content/terrain.ts';
import type { GameState } from './state.ts';
import { idx, type World } from './world.ts';

export interface Shelter {
  /** 0–1 ratings (SPEC 7.6). */
  rain: number;
  wind: number;
  insulation: number;
  security: number;
  bed: boolean;
}

const NONE: Shelter = { rain: 0, wind: 0, insulation: 0, security: 0, bed: false };

/** The shelter at a tile: the overhang's floor to begin with. */
export function shelterAt(s: GameState, w: World, x: number, y: number): Shelter {
  if (w.terrain[idx(x, y)] !== T.shelter) return NONE;
  void s;
  return { rain: 0.8, wind: 0.25, insulation: 0, security: 0.2, bed: false };
}

/** How much a fire warms this tile, 0–1: full beside it, fading to nothing at its reach. */
export function warmthNear(s: GameState, x: number, y: number): number {
  let best = 0;
  for (const l of s.lights) {
    const dx = l.x - x;
    const dy = l.y - y;
    const d2 = dx * dx + dy * dy;
    const reach = 3;
    if (d2 > reach * reach) continue;
    best = Math.max(best, 1 - d2 / (reach * reach + 1));
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

export function weatherHere(s: GameState): WeatherHere {
  void s;
  return { temp: 0, wind: 0, wetting: false, hot: false };
}
