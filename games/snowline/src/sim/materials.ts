// Gathering materials (SPEC 8.2): firewood from each kind of tree (the dealt woods), the five dealt
// tinders, bark, and green boughs. Cutting needs the steel tool; each tool is quicker at
// some work than others (SPEC 7.2).

import { BAND, F } from '../content/terrain.ts';
import { CRAFT_MSG } from '../content/fireText.ts';
import { TINDER_SOURCE, TOOL_WORK, WOOD_SOURCE, type Work } from '../content/recipes.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { SUPPLY } from '../content/balance.ts';
import { type ActionDef, receive, spentWhenUsedUp, supplyLeft, useSupply } from './actionKit.ts';
import { steelTool } from './fire.ts';
import { toolSlip } from './hazards.ts';
import { lookName, see } from './knowledge.ts';
import { say } from './log.ts';
import { nextRange } from './rng.ts';
import { level, practise } from './skills.ts';
import type { GameState, SimEvent } from './state.ts';
import type { World } from './world.ts';

/** Time multiplier for a kind of work with the steel tool carried (1 without one). */
export function toolTime(s: GameState, work: Work): number {
  const t = steelTool(s);
  return t ? TOOL_WORK[t]![work] : 1;
}

/** Which wood a tree or deadfall gives, or -1. */
export function woodOf(w: World, tile: number): number {
  const f = w.feature[tile]!;
  if (f === F.conifer) return WOOD_SOURCE.conifer;
  if (f === F.aspen) return WOOD_SOURCE.aspen;
  if (f === F.stunted) return WOOD_SOURCE.stunted;
  if (f === F.log) return WOOD_SOURCE.deadfall;
  return -1;
}

/** Gather `n`; what doesn't fit is set down at the survivor's feet. */
function collect(s: GameState, k: string, n: number, d: number | undefined, row: 'wood' | 'tinder' | null, ev: SimEvent[], noun: string): void {
  if (row && d !== undefined) see(s, row, d);
  say(s, CRAFT_MSG.gathered(who(s.protagonist), n, noun), ev);
  ev.push({ type: 'pickup' });
  receive(s, k, n, ev, d);
}

// None of these grow back within a run (SPEC 8.2): each tree or deadfall gives a few times, then it's
// used up for good (`SUPPLY`), so the woods near camp thin out. The keys in `GameState.taken`:
const WOOD = 'w'; // a tree's limbs, or a deadfall's breakable wood
const BARK = 'b'; // a tree's bark, stripped or shredded for tinder
const LICHEN = 'li';
const PUNK = 'p';

/** A tinder that is used up after a few handfuls. */
const tinderAction = (
  id: string,
  label: string,
  d: number,
  where: (s: GameState, w: World, t: number) => boolean,
  kind: string,
  supply: number,
  why: string,
): ActionDef => ({
  id,
  offer: (s, w, t) => (where(s, w, t) ? label : null),
  spent: spentWhenUsedUp(why, kind, supply),
  minutes: 10,
  skill: 'foraging',
  needsLight: true,
  done: (s, _w, t, ev) => {
    if (!supplyLeft(s, t, kind, supply)) return say(s, 'There was nothing more here.', ev);
    collect(s, 'tinder', 2 + Math.floor(level(s, 'foraging') / 2), d, 'tinder', ev, `handfuls of ${lookName('tinder', d)}`);
    useSupply(s, t, kind);
  },
});

const isTree = (w: World, t: number) => {
  const f = w.feature[t]!;
  return f === F.conifer || f === F.aspen || f === F.stunted;
};

export const MATERIAL_ACTIONS: ActionDef[] = [
  {
    id: 'cut-wood',
    offer: (s, w, t) => (isTree(w, t) && steelTool(s) ? `Cut firewood (${lookName('wood', woodOf(w, t))})` : null),
    spent: spentWhenUsedUp('no good limbs left', WOOD, SUPPLY.wood),
    minutes: (s) => 30 * toolTime(s, 'wood'),
    done: (s, w, t, ev) => {
      if (!supplyLeft(s, t, WOOD, SUPPLY.wood)) return say(s, 'There were no good limbs left to cut on this tree.', ev);
      const d = woodOf(w, t);
      const n = nextRange(s.rng['skill-checks'], 2, 3);
      see(s, 'wood', d);
      say(s, CRAFT_MSG.cut(who(s.protagonist), n, `pieces of ${lookName('wood', d)}`, itemDef(steelTool(s)!).name), ev);
      receive(s, 'firewood', n, ev, d);
      practise(s, 'crafting', 0.5);
      useSupply(s, t, WOOD);
      toolSlip(s, ev);
    },
  },
  {
    id: 'deadfall-wood',
    offer: (_s, w, t) => (w.feature[t] === F.log ? `Break firewood from the deadfall (${lookName('wood', WOOD_SOURCE.deadfall)})` : null),
    spent: spentWhenUsedUp('only the trunk is left', WOOD, SUPPLY.deadfall),
    minutes: 20,
    done: (s, _w, t, ev) => {
      if (!supplyLeft(s, t, WOOD, SUPPLY.deadfall)) return say(s, 'Only the trunk was left, too big to break.', ev);
      collect(s, 'firewood', 2, WOOD_SOURCE.deadfall, 'wood', ev, `pieces of ${lookName('wood', WOOD_SOURCE.deadfall)}`);
      useSupply(s, t, WOOD);
    },
  },
  {
    id: 'boughs',
    offer: (s, w, t) => (w.feature[t] === F.conifer && steelTool(s) ? 'Cut green boughs' : null),
    minutes: (s) => 15 * toolTime(s, 'wood'),
    done: (s, _w, _t, ev) => collect(s, 'boughs', 2, undefined, null, ev, 'green boughs'),
  },
  {
    id: 'bark',
    offer: (s, w, t) => ((w.feature[t] === F.aspen || w.feature[t] === F.conifer) && steelTool(s) ? 'Strip bark' : null),
    spent: spentWhenUsedUp('already stripped', BARK, SUPPLY.bark),
    minutes: (s) => 15 * toolTime(s, 'fine'),
    done: (s, _w, t, ev) => {
      if (!supplyLeft(s, t, BARK, SUPPLY.bark)) return say(s, 'The bark here was already stripped.', ev);
      collect(s, 'bark', 2, undefined, null, ev, 'sheets of bark');
      useSupply(s, t, BARK);
    },
  },
  tinderAction(
    'tinder-bark',
    `Shred ${lookName('tinder', TINDER_SOURCE.innerBark)}`,
    TINDER_SOURCE.innerBark,
    (s, w, t) => w.feature[t] === F.aspen && steelTool(s) !== null,
    BARK,
    SUPPLY.bark,
    'already stripped',
  ),
  tinderAction(
    'tinder-lichen',
    `Gather ${lookName('tinder', TINDER_SOURCE.lichen)}`,
    TINDER_SOURCE.lichen,
    (_s, w, t) => (w.feature[t] === F.stunted || w.feature[t] === F.conifer) && w.band[t]! >= BAND.montane,
    LICHEN,
    SUPPLY.lichen,
    'none left on it',
  ),
  tinderAction('tinder-punk', `Pick out ${lookName('tinder', TINDER_SOURCE.punk)}`, TINDER_SOURCE.punk, (_s, w, t) => w.feature[t] === F.log, PUNK, SUPPLY.punk, 'none left in it'),
];

/** Does this tree or deadfall still have firewood to give? */
export const woodLeft = (s: GameState, w: World, tile: number): boolean => supplyLeft(s, tile, WOOD, w.feature[tile] === F.log ? SUPPLY.deadfall : SUPPLY.wood) > 0;

/** Has this tree's bark been stripped at all (for drawing it)? */
export const barkStripped = (s: GameState, tile: number): boolean => (s.taken[`${BARK}${tile}`] ?? 0) > 0;
