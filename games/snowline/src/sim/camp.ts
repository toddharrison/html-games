// Camp actions (SPEC 7.6): using what has been built. The hanging cache keeps food out of reach of pack
// rats, jays, and bears (M4); a signal pile is lit like any fire (M5).

import { CRAFT_MSG } from '../content/fireText.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import type { ActionDef } from './actionKit.ts';
import { give } from './inventory.ts';
import { say } from './log.ts';
import type { Build, GameState } from './state.ts';

export function buildAt(s: GameState, tile: number, kind: string): Build | null {
  const x = tile % 256;
  const y = Math.floor(tile / 256);
  return s.builds.find((b) => b.kind === kind && b.x === x && b.y === y) ?? null;
}

export const CAMP_ACTIONS: ActionDef[] = [
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
