// Gathering materials (SPEC 8.2): firewood from each kind of tree (the dealt woods), the five dealt
// tinders, bark, green boughs, and plant fibre. Cutting needs the steel tool; each tool is quicker at
// some work than others (SPEC 7.2).

import { BAND, F } from '../content/terrain.ts';
import { CRAFT_MSG } from '../content/fireText.ts';
import { TINDER_SOURCE, TOOL_WORK, WOOD_SOURCE, type Work } from '../content/recipes.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { type ActionDef, deplete, ready } from './actionKit.ts';
import { steelTool } from './fire.ts';
import { toolSlip } from './hazards.ts';
import { give } from './inventory.ts';
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

function collect(s: GameState, k: string, n: number, d: number | undefined, row: 'wood' | 'tinder' | null, ev: SimEvent[], noun: string): number {
  const got = give(s, k, n, d);
  const wh = who(s.protagonist);
  if (row && d !== undefined) see(s, row, d);
  if (got > 0) {
    say(s, CRAFT_MSG.gathered(wh, got, noun), ev);
    ev.push({ type: 'pickup' });
  }
  if (got < n) say(s, `${wh.Their} hands and pockets were full.`, ev);
  return got;
}

const tinderAction = (id: string, label: string, d: number, where: (s: GameState, w: World, t: number) => boolean, regrow: number): ActionDef => ({
  id,
  offer: (s, w, t) => (where(s, w, t) ? label : null),
  minutes: 10,
  skill: 'foraging',
  needsLight: true,
  done: (s, _w, t, ev) => {
    if (!ready(s, t)) return say(s, 'There was nothing more here for now.', ev);
    collect(s, 'tinder', 2 + Math.floor(level(s, 'foraging') / 2), d, 'tinder', ev, `handfuls of ${lookName('tinder', d)}`);
    deplete(s, t, regrow);
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
    minutes: (s) => 30 * toolTime(s, 'wood'),
    done: (s, w, t, ev) => {
      if (!ready(s, t)) return say(s, 'There was no more good wood to cut here for now.', ev);
      const d = woodOf(w, t);
      const n = nextRange(s.rng['skill-checks'], 2, 3);
      const got = give(s, 'firewood', n, d);
      see(s, 'wood', d);
      say(s, CRAFT_MSG.cut(who(s.protagonist), got, `pieces of ${lookName('wood', d)}`, itemDef(steelTool(s)!).name), ev);
      practise(s, 'crafting', 0.5);
      deplete(s, t, 8);
      toolSlip(s, ev);
    },
  },
  {
    id: 'deadfall-wood',
    offer: (_s, w, t) => (w.feature[t] === F.log ? `Break firewood from the deadfall (${lookName('wood', WOOD_SOURCE.deadfall)})` : null),
    minutes: 20,
    done: (s, _w, t, ev) => {
      if (!ready(s, t)) return say(s, 'There was nothing more here for now.', ev);
      collect(s, 'firewood', 2, WOOD_SOURCE.deadfall, 'wood', ev, `pieces of ${lookName('wood', WOOD_SOURCE.deadfall)}`);
      deplete(s, t, 10);
    },
  },
  {
    id: 'boughs',
    offer: (s, w, t) => (w.feature[t] === F.conifer && steelTool(s) ? 'Cut green boughs' : null),
    minutes: (s) => 15 * toolTime(s, 'wood'),
    done: (s, _w, _t, ev) => void collect(s, 'boughs', 2, undefined, null, ev, 'green boughs'),
  },
  {
    id: 'bark',
    offer: (s, w, t) => ((w.feature[t] === F.aspen || w.feature[t] === F.conifer) && steelTool(s) ? 'Strip bark' : null),
    minutes: (s) => 15 * toolTime(s, 'fine'),
    done: (s, _w, t, ev) => {
      if (!ready(s, t)) return say(s, 'The bark here was already stripped.', ev);
      collect(s, 'bark', 2, undefined, null, ev, 'sheets of bark');
      deplete(s, t, 12);
    },
  },
  tinderAction('tinder-bark', `Shred ${lookName('tinder', TINDER_SOURCE.innerBark)}`, TINDER_SOURCE.innerBark, (s, w, t) => w.feature[t] === F.aspen && steelTool(s) !== null, 6),
  tinderAction(
    'tinder-lichen',
    `Gather ${lookName('tinder', TINDER_SOURCE.lichen)}`,
    TINDER_SOURCE.lichen,
    (_s, w, t) => (w.feature[t] === F.stunted || w.feature[t] === F.conifer) && w.band[t]! >= BAND.montane,
    6,
  ),
  tinderAction('tinder-punk', `Pick out ${lookName('tinder', TINDER_SOURCE.punk)}`, TINDER_SOURCE.punk, (_s, w, t) => w.feature[t] === F.log, 8),
];
