// Actions (SPEC 5.2, 12.4): what the survivor can do to the tile they face or stand on, and with what
// they carry. An action takes game minutes and moving cancels it. The UI lists what's on offer with
// `availableActions` and `itemActions`; the sim checks again when the command arrives, so a stale menu
// can never do anything the rules don't allow.

import { REGROW_DAYS } from '../content/balance.ts';
import { PLANTS } from '../content/decks.ts';
import { itemDef } from '../content/items.ts';
import { MSG, who } from '../content/messages.ts';
import { F, T } from '../content/terrain.ts';
import { clumsyFactor } from './body.ts';
import { drinkAt, eat, itemName, taste } from './food.ts';
import { drop, give, stashAt, tidyStashes } from './inventory.ts';
import {
  type ActionDef,
  type ActionOption,
  type ItemActionDef,
  canSee,
  deplete,
  frontTile,
  gather,
  inSeason,
  ready,
  yieldRoll,
} from './actionKit.ts';
import { learn, lookName, see, thingName } from './knowledge.ts';
import { say } from './log.ts';
import { nextRange } from './rng.ts';
import { practise, speedAt } from './skills.ts';
import type { GameState, SimEvent } from './state.ts';
import { idx, type World } from './world.ts';
import { SYSTEM_ACTIONS, SYSTEM_ITEM_ACTIONS } from './systemActions.ts';
import { finishCraft } from './craft.ts';
import { remember } from './memory.ts';

export type { ActionOption } from './actionKit.ts';
export { frontTile } from './actionKit.ts';

const isWater = (w: World, tile: number) => {
  const t = w.terrain[tile]!;
  return t === T.shallows || t === T.stream || t === T.gravel;
};

export const ACTIONS: ActionDef[] = [
  {
    id: 'drink',
    offer: (_s, w, t) => (isWater(w, t) ? 'Drink' : null),
    minutes: 3,
    done: (s, w, t, ev) => drinkAt(s, w, t, ev),
  },
  {
    id: 'pick-up',
    offer: (s, w, t) => {
      void w;
      const st = stashAt(s, t % 256, Math.floor(t / 256));
      return st && st.items.length ? `Pick up ${st.items.map((i) => itemName(s, i)).join(', ')}` : null;
    },
    minutes: 1,
    done: (s, _w, t, ev) => {
      const st = stashAt(s, t % 256, Math.floor(t / 256));
      if (!st) return;
      const w = who(s.protagonist);
      for (const it of st.items) {
        const got = give(s, it.k, it.n, it.d, it.t);
        if (got > 0) say(s, MSG.picked(w, got, itemName(s, it)), ev);
        it.n -= got;
        if (it.n > 0) say(s, MSG.full(w), ev);
      }
      tidyStashes(s);
      ev.push({ type: 'pickup' });
    },
  },
  {
    id: 'pick',
    offer: (s, w, t) => (w.feature[t] === F.plant ? `Pick ${thingName(s, 'plant', w.data[t]!)}` : null),
    minutes: 10,
    skill: 'foraging',
    needsLight: true,
    done: (s, w, t, ev) => {
      const d = w.data[t]!;
      const kind = PLANTS[d]!.kind;
      see(s, 'plant', d);
      if (!inSeason(s, kind)) return say(s, MSG.outOfSeason(lookName('plant', d)), ev);
      if (!ready(s, t)) return say(s, MSG.nothingLeft(), ev);
      gather(s, 'plant', yieldRoll(s, 2, 4, 'foraging'), ev, d);
      practise(s, 'foraging', 1);
      deplete(s, t, REGROW_DAYS.plant);
    },
  },
  {
    id: 'watch',
    offer: (_s, w, t) => (w.feature[t] === F.plant ? `Watch the ${lookName('plant', w.data[t]!)} for a while` : null),
    minutes: 40,
    needsLight: true,
    done: (s, w, t, ev) => {
      const d = w.data[t]!;
      const o = s.rules.plants[d]!;
      const name = lookName('plant', d);
      if (o === 'nourishing' || o === 'poor') {
        say(s, MSG.watchSafe(name), ev);
        learn(s, 'plant', d, 'suspected', 'safe', 'jays ate them', ev);
      } else {
        say(s, MSG.watchUnsafe(name), ev);
        learn(s, 'plant', d, 'suspected', 'unsafe', 'the birds left them alone', ev);
      }
    },
  },
  {
    id: 'pick-herb',
    offer: (s, w, t) => (w.feature[t] === F.herb ? `Pick ${thingName(s, 'remedy', w.data[t]!)}` : null),
    minutes: 8,
    skill: 'foraging',
    needsLight: true,
    done: (s, w, t, ev) => {
      const d = w.data[t]!;
      see(s, 'remedy', d);
      if (!ready(s, t)) return say(s, MSG.nothingLeft(), ev);
      gather(s, 'herb', yieldRoll(s, 2, 3, 'foraging'), ev, d);
      deplete(s, t, REGROW_DAYS.plant);
    },
  },
  {
    id: 'dig-cattail',
    offer: (_s, w, t) => (w.terrain[t] === T.reeds ? 'Dig cattail roots' : null),
    minutes: 25,
    skill: 'foraging',
    needsLight: true,
    done: (s, _w, t, ev) => {
      if (!ready(s, t)) return say(s, MSG.nothingLeft(), ev);
      gather(s, 'cattail-root', yieldRoll(s, 1, 2, 'foraging'), ev);
      practise(s, 'foraging', 1);
      s.player.wet = Math.min(100, s.player.wet + 15);
      deplete(s, t, REGROW_DAYS.reeds);
    },
  },
  {
    id: 'feel-shallows',
    offer: (_s, w, t) => (w.terrain[t] === T.shallows ? 'Feel for crayfish and mussels' : null),
    minutes: 30,
    skill: 'foraging',
    needsLight: true,
    done: (s, _w, t, ev) => {
      s.player.wet = 100;
      if (!ready(s, t)) return say(s, MSG.nothingLeft(), ev);
      const crayfish = nextRange(s.rng['skill-checks'], 0, 1) === 0;
      gather(s, crayfish ? 'crayfish' : 'mussels', yieldRoll(s, 1, 3, 'foraging'), ev);
      remember(s, 'shallows');
      practise(s, 'foraging', 1);
      deplete(s, t, REGROW_DAYS.shallows);
    },
  },
  {
    id: 'rose-hips',
    offer: (s, w, t) => (w.feature[t] === F.bush ? (inSeason(s, 'rose-hips') ? 'Pick rose hips' : null) : null),
    minutes: 10,
    skill: 'foraging',
    needsLight: true,
    done: (s, _w, t, ev) => {
      if (!ready(s, t)) return say(s, MSG.nothingLeft(), ev);
      gather(s, 'rose-hips', yieldRoll(s, 2, 4, 'foraging'), ev);
      deplete(s, t, REGROW_DAYS.bush);
    },
  },
  {
    id: 'examine-cause',
    offer: (_s, w, t) => (w.feature[t] === F.beaverDam ? 'Look at the dam' : w.feature[t] === F.carcass ? 'Look at the carcass' : null),
    minutes: 5,
    needsLight: true,
    done: (s, w, t, ev) => {
      const k = w.waterCauseSites.findIndex((p) => idx(p.x, p.y) === t);
      if (k < 0) return;
      const name = lookName('water', k);
      say(s, w.feature[t] === F.beaverDam ? MSG.causeBeaver(name) : MSG.causeCarcass(name), ev);
      learn(s, 'water', k, 'known', 'foul', w.feature[t] === F.beaverDam ? 'a beaver dam upstream' : 'a carcass in the water', ev);
    },
  },
  {
    id: 'search-crash',
    offer: (_s, w, t) => (w.feature[t] === F.crash ? 'Search the wreck' : null),
    minutes: 5,
    done: (s, _w, _t, ev) => say(s, MSG.crash(who(s.protagonist)), ev),
  },
  ...SYSTEM_ACTIONS,
];

export const ITEM_ACTIONS: ItemActionDef[] = [
  {
    id: 'eat',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      if (!it || !itemDef(it.k).food) return null;
      return it.k === 'plant' ? `Eat a handful of ${itemName(s, it)}` : `Eat ${itemName(s, it)}`;
    },
    minutes: 3,
    done: (s, _w, slot, ev) => eat(s, slot, ev),
  },
  {
    id: 'taste',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      return it && it.k === 'plant' ? `Taste a little of the ${itemName(s, it)}` : null;
    },
    minutes: 2,
    done: (s, _w, slot, ev) => taste(s, slot, ev),
  },
  ...SYSTEM_ITEM_ACTIONS,
  {
    id: 'drop',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      return it ? `Put down ${itemName(s, it)}` : null;
    },
    minutes: 1,
    done: (s, _w, slot, ev) => {
      const it = s.inventory[slot];
      if (!it) return;
      s.inventory.splice(slot, 1);
      drop(s, s.player.x, s.player.y, it);
      say(s, MSG.dropped(who(s.protagonist), itemName(s, it)), ev);
    },
  },
];

function targets(s: GameState): number[] {
  const here = idx(s.player.x, s.player.y);
  const front = frontTile(s);
  return front >= 0 ? [front, here] : [here];
}

/** Everything the survivor could do right now to the faced tile or their own. */
export function availableActions(s: GameState, w: World): ActionOption[] {
  if (s.over || s.sleep) return [];
  const out: ActionOption[] = [];
  const front = frontTile(s);
  for (const t of targets(s)) {
    for (const a of ACTIONS) {
      const label = a.offer(s, w, t, t === front);
      if (!label) continue;
      if (out.some((o) => o.action === a.id && o.label === label)) continue;
      out.push({ action: a.id, tile: t, label, minutes: minutesFor(s, w, a, t) });
    }
  }
  return out;
}

export function itemActions(s: GameState, w: World, slot: number): ActionOption[] {
  if (s.over || s.sleep) return [];
  const out: ActionOption[] = [];
  for (const a of ITEM_ACTIONS) {
    const label = a.offer(s, w, slot);
    if (label) out.push({ action: a.id, tile: slot, label, minutes: a.minutes });
  }
  return out;
}

function minutesFor(s: GameState, w: World, a: ActionDef, t: number): number {
  const base = typeof a.minutes === 'number' ? a.minutes : a.minutes(s, w, t);
  return Math.max(1, Math.round(base * clumsyFactor(s) * (a.skill ? speedAt(s, a.skill) : 1)));
}

/** Start an action on a tile, if it is really on offer. */
export function startAction(s: GameState, w: World, action: string, tile: number, events: SimEvent[]): void {
  if (s.over || s.sleep || s.task) return;
  if (!targets(s).includes(tile)) return;
  const a = ACTIONS.find((x) => x.id === action);
  if (!a || !a.offer(s, w, tile, tile === frontTile(s))) return;
  if (a.needsLight && !canSee(s)) {
    say(s, MSG.tooDark(), events);
    return;
  }
  const ticks = minutesFor(s, w, a, tile) * 10;
  s.task = { action, tile, slot: -1, left: ticks, total: ticks };
  events.push({ type: 'task-start', action });
}

export function startUse(s: GameState, w: World, action: string, slot: number, events: SimEvent[]): void {
  if (s.over || s.sleep || s.task) return;
  const a = ITEM_ACTIONS.find((x) => x.id === action);
  if (!a || !a.offer(s, w, slot)) return;
  const ticks = Math.max(1, Math.round(a.minutes * clumsyFactor(s))) * 10;
  s.task = { action: `item:${action}`, tile: -1, slot, left: ticks, total: ticks };
  events.push({ type: 'task-start', action });
}

/** Run the current task for a tick; finish it when its time is up. */
export function workTask(s: GameState, w: World, events: SimEvent[]): void {
  const task = s.task;
  if (!task) return;
  task.left--;
  if (task.left > 0) return;
  s.task = null;
  if (task.action.startsWith('craft:')) {
    finishCraft(s, w, task.action.slice(6), task.tile, events);
  } else if (task.action.startsWith('item:')) {
    const a = ITEM_ACTIONS.find((x) => x.id === task.action.slice(5));
    if (a && a.offer(s, w, task.slot)) a.done(s, w, task.slot, events);
  } else {
    const a = ACTIONS.find((x) => x.id === task.action);
    if (a && a.offer(s, w, task.tile, task.tile === frontTile(s))) {
      a.done(s, w, task.tile, events);
      if (a.skill) practise(s, a.skill, 0.5);
    }
  }
  events.push({ type: 'task-done', action: task.action });
}

