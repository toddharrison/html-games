// What's under the mouse (SPEC 12.4): its name, the cursor to show, and what a click would do. Reads the
// state and the world; the choices themselves come from sim/reach.ts, so a click offers only what the
// rules allow. Only what the survivor has seen is named.

import { ANIMALS } from '../content/animals.ts';
import { DENS, isTracks } from '../content/loose.ts';
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
  /** Everything on offer here, including what can't be done again yet (`spent`). */
  options: Reach[];
}

/** The obvious thing to do, when a tile offers several (SPEC 12.4: click does the obvious thing). */
const OBVIOUS = [
  'gather-loose',
  'pick-up',
  'spear-fish',
  'look-tracks',
  'look-den',
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
  // A build begun: bring what it needs, and build it once that's everything.
  'site-work',
  // A laid fire: finish laying it, then light it the best way to hand.
  'lay-fire',
  'fire-match',
  'fire-embers',
  'fire-sparks',
  'fire-drill',
  // A rock: strike it to see what it does (offered only until that's known), then pry a piece loose.
  'strike-outcrop',
];
const WATCHING = new Set(['watch-fish', 'look-tracks', 'look-den', 'watch', 'examine-cause']);

const BUILD_NAMES: Record<string, string> = {
  'lean-to': 'the lean-to',
  bed: 'the bough bed',
  wall: 'the wall',
  reflector: 'the reflector stones',
  woodpile: 'the woodpile',
  cache: 'the hanging cache',
  weir: 'the weir',
  signal: 'the signal pile',
  'fire-lay': 'a fire, laid but not lit',
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
  // A build begun is named first: it's what the spot needs next.
  const here = s.builds.filter((bd) => bd.x === x && bd.y === y);
  const b = here.find((bd) => bd.kind.startsWith('site:')) ?? here[0];
  if (b?.kind.startsWith('site:')) return `${BUILD_NAMES[b.kind.slice(5)] ?? b.kind.slice(5)}, not finished`;
  if (b) return BUILD_NAMES[b.kind] ?? b.kind;
  const l = looseAt(s, w, i);
  if (l) {
    if (isTracks(l)) return `${looseName(w, i, l)} in the ${TERRAIN[w.terrain[i]!]!.name}`;
    return looseName(w, i, l);
  }
  const f = s.arc.felled[i] ? F.log : w.feature[i]!;
  if (f === F.plant) return thingName(s, 'plant', w.data[i]!);
  if (f === F.herb) return thingName(s, 'remedy', w.data[i]!);
  if (f === F.outcrop) return `an outcrop of ${lookName('stone', w.data[i]!)}`;
  if (f === F.den) return DENS[w.data[i]!]?.name ?? 'a den';
  if (f) return FEATURES[f]!.name;
  return TERRAIN[w.terrain[i]!]!.name;
}

/** A menu row for an action: how long it takes, or greyed out with why it can't be done again yet. */
export function offered(o: { label: string; minutes: number; spent?: string }): { label: string; hint: string; disabled?: boolean } {
  return o.spent ? { label: o.label, hint: o.spent, disabled: true } : { label: o.label, hint: `${o.minutes} min` };
}

/** The hint under the name: what a click does, or why nothing here can be done again yet. */
export function lookHint(l: Look): string {
  const live = l.options.filter((o) => !o.spent);
  if (l.primary) return `${l.primary.label}${live.length > 1 || live.length < l.options.length ? ' · right-click for more' : ''}`;
  if (live.length) return 'right-click to choose';
  const spent = l.options[0];
  return spent ? `${spent.label}: ${spent.spent}` : '';
}

export function lookAt(s: GameState, w: World, x: number, y: number): Look | null {
  if (!inBounds(x, y) || !isExplored(s, idx(x, y))) return null;
  const options = actionsAt(s, w, x, y);
  const live = options.filter((o) => !o.spent);
  const primary = OBVIOUS.map((id) => live.find((o) => o.action === id)).find((o) => o) ?? (live.length === 1 ? live[0]! : null);
  const here = x === s.player.x && y === s.player.y;
  const walk = !here && canEnter(s, w, x, y) && w.terrain[idx(x, y)] !== T.deep;
  const cursor: Cursor = primary ? (WATCHING.has(primary.action) ? 'eye' : 'hand') : live.length ? 'hand' : walk ? 'walk' : 'none';
  return { x, y, name: nameAt(s, w, x, y), cursor, primary, walk, options };
}
