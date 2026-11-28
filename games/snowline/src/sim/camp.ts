// Camp actions (SPEC 7.6): using what has been built. The hanging cache keeps food out of reach of pack
// rats, jays, and bears (M4); a signal pile is lit like any fire (M5).

import { CRAFT_MSG } from '../content/fireText.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import type { ActionDef } from './actionKit.ts';
import { T } from '../content/terrain.ts';
import { give } from './inventory.ts';
import { say } from './log.ts';
import type { Build, GameState } from './state.ts';
import { lieDown } from './rest.ts';
import { clock, minutesUntil } from './time.ts';
import { idx, type World } from './world.ts';

/** What the survivor would be sleeping in or on, standing on `tile`: a lean-to, a bed, the overhang; or null. */
function bedPlace(s: GameState, w: World, tile: number): string | null {
  if (tile !== idx(s.player.x, s.player.y)) return null;
  if (buildAt(s, tile, 'lean-to')) return 'in the lean-to';
  if (buildAt(s, tile, 'bed')) return 'on the bough bed';
  if (w.terrain[tile] === T.shelter) return 'under the overhang';
  return null;
}

/** Evening, night, or worn out: a time to go to bed. */
const bedtime = (s: GameState) => {
  const h = clock(s.tick).hour;
  return h >= 17 || h < 6 || s.vitals.rest < 50;
};

export function buildAt(s: GameState, tile: number, kind: string): Build | null {
  const x = tile % 256;
  const y = Math.floor(tile / 256);
  return s.builds.find((b) => b.kind === kind && b.x === x && b.y === y) ?? null;
}

export const CAMP_ACTIONS: ActionDef[] = [
  // A shelter or bed clicked: walk onto it and lie down (sim/reach.ts ON_TILE). Sleep is offered when it's
  // time for bed; resting out of the weather, any time.
  {
    id: 'sleep-in',
    offer: (s, w, t) => {
      const place = bedPlace(s, w, t);
      return place && bedtime(s) ? `Sleep ${place} till morning` : null;
    },
    minutes: 1,
    done: (s, w, t, ev) => {
      const place = bedPlace(s, w, t);
      if (!place) return;
      lieDown(s, minutesUntil(s.tick, 6, 30), false, ev, `${who(s.protagonist).name} lay down ${place} to sleep.`);
    },
  },
  {
    id: 'rest-in',
    // Not on the overhang's open floor: every click there would ask instead of walking.
    offer: (s, w, t) => {
      const place = bedPlace(s, w, t);
      return place && place !== 'under the overhang' ? `Rest ${place} for an hour` : null;
    },
    minutes: 1,
    done: (s, w, t, ev) => {
      const place = bedPlace(s, w, t);
      if (!place) return;
      lieDown(s, 60, true, ev, `${who(s.protagonist).name} sat ${place} and rested.`);
    },
  },
  {
    id: 'cache-store',
    offer: (s, _w, t) => (buildAt(s, t, 'cache') && s.inventory.some((i) => itemDef(i.k).food) ? 'Hang the food in the cache' : null),
    minutes: 5,
    done: (s, _w, t, ev) => {
      const c = buildAt(s, t, 'cache');
      if (!c) return;
      const food = s.inventory.filter((i) => itemDef(i.k).food);
      s.inventory = s.inventory.filter((i) => !itemDef(i.k).food);
      c.items = [...(c.items ?? []), ...food];
      say(s, CRAFT_MSG.stored(who(s.protagonist)), ev);
    },
  },
  {
    id: 'cache-take',
    offer: (s, _w, t) => (buildAt(s, t, 'cache')?.items?.length ? 'Take the food down from the cache' : null),
    minutes: 5,
    done: (s, _w, t, ev) => {
      const c = buildAt(s, t, 'cache');
      if (!c?.items) return;
      for (const it of c.items) it.n -= give(s, it.k, it.n, it.d, it.t);
      c.items = c.items.filter((i) => i.n > 0);
      say(s, CRAFT_MSG.unstored(who(s.protagonist)), ev);
    },
  },
];
