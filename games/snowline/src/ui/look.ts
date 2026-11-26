// What's under the mouse (SPEC 12.4): its name, the cursor to show, and what a click would do. Reads the
// state and the world; the choices themselves come from sim/reach.ts, so a click offers only what the
// rules allow. Only what the survivor has seen is named.

import { ANIMALS } from '../content/animals.ts';
import { isTracks } from '../content/loose.ts';
import { F, FEATURES, T, TERRAIN } from '../content/terrain.ts';
import { itemName } from '../sim/food.ts';
import { lookName, thingName } from '../sim/knowledge.ts';
import { looseAt, looseName } from '../sim/loose.ts';
import { actionsAt, type Reach } from '../sim/reach.ts';
import type { GameState } from '../sim/state.ts';
import { canEnter, isExplored, sightCircles } from '../sim/step.ts';
import { burning } from '../sim/surroundings.ts';
import { idx, inBounds, type World } from '../sim/world.ts';

export type Cursor = 'hand' | 'eye' | 'walk' | 'none';

export interface Look {
  x: number;
  y: number;
  name: string;
  cursor: Cursor;
  /** What a left-click does: an action, or walking there (`action` null), or nothing. */
  primary: Reach | null;
  walk: boolean;
  options: Reach[];
}

/** The obvious thing to do, when a tile offers several (SPEC 12.4: click does the obvious thing). */
const OBVIOUS = [
  'gather-loose',
  'pick-up',
  'spear-fish',
  'look-tracks',
  'watch-fish',
  'search-crash',
  'examine-cause',
  'pick',
  'pick-herb',
  'rose-hips',
  'drink',
  'weir-take',
  'snare-take',
  'cache-take',
];
const WATCHING = new Set(['watch-fish', 'look-tracks', 'watch', 'examine-cause']);

const BUILD_NAMES: Record<string, string> = {
  'lean-to': 'the lean-to',
  bed: 'the bough bed',
  wall: 'the wall',
  reflector: 'the reflector stones',
  woodpile: 'the woodpile',
  cache: 'the hanging cache',
  weir: 'the weir',
  signal: 'the signal pile',
  snare: 'a snare',
};

/** Can the survivor see this tile now: by day in their sight, or in firelight. */
export function seen(s: GameState, x: number, y: number): boolean {
  return sightCircles(s).some((c) => (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) <= (c.r + 0.5) * (c.r + 0.5));
}

export function nameAt(s: GameState, w: World, x: number, y: number): string {
  const i = idx(x, y);
  const visible = seen(s, x, y);
  if (visible) {
    if (s.fish.some((f) => f.x === x && f.y === y)) return 'a trout';
    const a = s.animals.find((an) => an.x === x && an.y === y && an.mode !== 'gone');
    if (a && (a.kind !== 'grouse' || a.mode === 'flee')) return ANIMALS[a.kind].name;
  }
  const fire = s.fires.find((f) => f.x === x && f.y === y);
  if (fire) return burning(fire) ? 'the fire' : fire.coals > 0 ? 'the embers' : 'a cold fire';
  const st = s.stashes.find((t) => t.x === x && t.y === y);
  if (st?.items.length) return st.items.map((it) => itemName(s, it)).join(', ');
  const b = s.builds.find((bd) => bd.x === x && bd.y === y);
  if (b) return BUILD_NAMES[b.kind] ?? b.kind;
  const l = looseAt(s, w, i);
  if (l) {
    if (isTracks(l)) return `prints in the ${TERRAIN[w.terrain[i]!]!.name}`;
    return looseName(w, i, l);
  }
  const f = s.arc.felled[i] ? F.log : w.feature[i]!;
  if (f === F.plant) return thingName(s, 'plant', w.data[i]!);
  if (f === F.herb) return thingName(s, 'remedy', w.data[i]!);
  if (f === F.outcrop) return `an outcrop of ${lookName('stone', w.data[i]!)}`;
  if (f) return FEATURES[f]!.name;
  return TERRAIN[w.terrain[i]!]!.name;
}

export function lookAt(s: GameState, w: World, x: number, y: number): Look | null {
  if (!inBounds(x, y) || !isExplored(s, idx(x, y))) return null;
  const options = actionsAt(s, w, x, y);
  const primary = OBVIOUS.map((id) => options.find((o) => o.action === id)).find((o) => o) ?? (options.length === 1 ? options[0]! : null);
  const here = x === s.player.x && y === s.player.y;
  const walk = !here && canEnter(s, w, x, y) && w.terrain[idx(x, y)] !== T.deep;
  const cursor: Cursor = primary ? (WATCHING.has(primary.action) ? 'eye' : 'hand') : options.length ? 'hand' : walk ? 'walk' : 'none';
  return { x, y, name: nameAt(s, w, x, y), cursor, primary, walk, options };
}
