// Gathering loose things (SPEC 6.7): what lies on a tile, whether it's there now, and the actions that
// pick it up or look at it. The layer itself is generated with the world (worldgen/loose.ts); what has
// been taken is in GameState.regrow under the key `l<tile>` (the tick another lies there), or, for what
// never comes back, GameState.taken under the same key. Wind brings fallen branches and driftwood back early.

import { ANIMALS } from '../content/animals.ts';
import { DENS, LOOSE, TRACKS_TEXT, isTracks, type LooseData } from '../content/loose.ts';
import { WOOD_SOURCE } from '../content/recipes.ts';
import { F } from '../content/terrain.ts';
import { type ActionDef, gather, inSeason } from './actionKit.ts';
import { hasRoom } from './inventory.ts';
import { lookName, see } from './knowledge.ts';
import { say } from './log.ts';
import { remember } from './memory.ts';
import { blewSince } from './weather.ts';
import { nextRange } from './rng.ts';
import { level, practise } from './skills.ts';
import type { GameState } from './state.ts';
import { idx, inBounds, type World } from './world.ts';

const SIZE = 256;

/** What lies loose on a tile right now (an id from content/loose.ts), or 0. */
export function looseAt(s: GameState, w: World, tile: number): number {
  const l = w.loose[tile] ?? 0;
  if (!l) return 0;
  const def = LOOSE[l]!;
  if (def.once && s.taken[`l${tile}`]) return 0;
  const back = s.regrow[`l${tile}`] ?? 0;
  if (back > s.tick && !(def.blows && blewSince(s, back - def.regrow * 14400))) return 0;
  if (def.season && !inSeason(s, def.season)) return 0;
  // A fire laid on the tile, or a stash, covers what was there.
  if (s.fires.some((f) => idx(f.x, f.y) === tile)) return 0;
  return l;
}

/** The nearest tile within `r` (Chebyshev, ties by index) for which `test` holds, or -1. */
function nearest(tile: number, r: number, test: (i: number) => boolean): number {
  const x = tile % SIZE;
  const y = (tile - x) / SIZE;
  let best = -1;
  let bd = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!inBounds(x + dx, y + dy)) continue;
      const i = idx(x + dx, y + dy);
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (test(i) && (d < bd || (d === bd && i < best))) {
        best = i;
        bd = d;
      }
    }
  }
  return best;
}

/** The dealt index a loose thing's item carries: fixed, the nearest tree's wood, or the nearest outcrop's stone. */
export function looseData(w: World, tile: number, d: LooseData): number | undefined {
  if (d === 'outcrop') {
    const o = nearest(tile, 3, (i) => w.feature[i] === F.outcrop);
    return o >= 0 ? w.data[o]! : undefined;
  }
  if (d === 'tree') {
    const t = nearest(tile, 1, (i) => w.feature[i] === F.conifer || w.feature[i] === F.aspen || w.feature[i] === F.stunted);
    if (t < 0) return WOOD_SOURCE.deadfall;
    const f = w.feature[t];
    return f === F.conifer ? WOOD_SOURCE.conifer : f === F.aspen ? WOOD_SOURCE.aspen : WOOD_SOURCE.stunted;
  }
  return d;
}

/** A loose thing's name, as the cursor and the action say it. */
export function looseName(w: World, tile: number, l: number): string {
  const def = LOOSE[l]!;
  if (def.name.includes('{stone}')) {
    const d = looseData(w, tile, 'outcrop');
    return def.name.replace('{stone}', d === undefined ? 'stone' : lookName('stone', d));
  }
  return def.name;
}

export const LOOSE_ACTIONS: ActionDef[] = [
  {
    id: 'gather-loose',
    offer: (s, w, t) => {
      const l = looseAt(s, w, t);
      if (!l || isTracks(l)) return null;
      return `Pick up ${looseName(w, t, l)}`;
    },
    spent: (s, w, t) => {
      const g = LOOSE[looseAt(s, w, t)]?.gives;
      return g && !hasRoom(s, g.k, looseData(w, t, g.d)) ? 'hands full' : null;
    },
    minutes: (s, w, t) => LOOSE[looseAt(s, w, t)]?.minutes ?? 1,
    skill: 'foraging',
    done: (s, w, t, ev) => {
      const l = looseAt(s, w, t);
      const def = LOOSE[l];
      if (!l || !def?.gives) return;
      const g = def.gives;
      const n = nextRange(s.rng['skill-checks'], g.n[0], g.n[1]) + (g.k === 'tinder' ? Math.floor(level(s, 'foraging') / 2) : 0);
      const d = looseData(w, t, g.d);
      if (g.k === 'tinder' && d !== undefined) see(s, 'tinder', d);
      if (g.k === 'firewood' && d !== undefined) see(s, 'wood', d);
      if (g.k === 'stone' && d !== undefined) see(s, 'stone', d);
      gather(s, g.k, n, ev, d, g.k === 'stick' ? 'stick' : undefined);
      if (def.also) {
        const ad = looseData(w, t, def.also.d);
        if (ad !== undefined && def.also.k === 'firewood') see(s, 'wood', ad);
        gather(s, def.also.k, def.also.n, ev, ad);
      }
      practise(s, 'foraging', 0.3);
      if (def.once) s.taken[`l${t}`] = 1;
      else s.regrow[`l${t}`] = s.tick + def.regrow * 14400;
    },
  },
  {
    id: 'look-den',
    offer: (_s, w, t) => (w.feature[t] === F.den ? (DENS[w.data[t]!]?.action ?? null) : null),
    minutes: 4,
    needsLight: true,
    done: (s, w, t, ev) => {
      const den = DENS[w.data[t]!];
      if (!den) return;
      say(s, den.look, ev);
      const danger = ANIMALS[den.animal].danger;
      if (danger !== undefined) see(s, 'temper', danger);
      if (remember(s, `den-${den.animal}`) === 1) {
        s.stats.discoveries++;
        ev.push({ type: 'discovery', key: `den:${den.animal}` });
      }
    },
  },
  {
    id: 'look-tracks',
    offer: (s, w, t) => (isTracks(looseAt(s, w, t)) ? 'Look at the prints' : null),
    minutes: 3,
    needsLight: true,
    done: (s, w, t, ev) => {
      const def = LOOSE[looseAt(s, w, t)];
      if (!def?.animal) return;
      say(s, TRACKS_TEXT[def.animal], ev);
      const danger = ANIMALS[def.animal].danger;
      if (danger !== undefined) see(s, 'temper', danger);
      if (remember(s, `tracks-${def.animal}`) === 1) {
        s.stats.discoveries++;
        ev.push({ type: 'discovery', key: `tracks:${def.animal}` });
      }
    },
  },
];
