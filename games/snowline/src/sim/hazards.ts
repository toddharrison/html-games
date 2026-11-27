// Illness, injury, and the traits that complicate things (SPEC 7.7, 4.2, 9: other dangers), the plant
// remedies whose uses are dealt (6.6), and the coming of winter (5.1).

import { HAZARD_TEXT } from '../content/hazardText.ts';
import { who } from '../content/messages.ts';
import { BAND, F, FLAG, T } from '../content/terrain.ts';
import { WEATHER_TEXT } from '../content/weatherText.ts';
import type { ItemActionDef } from './actionKit.ts';
import { addCondition, hasCondition, treat } from './body.ts';
import { takeFromSlot } from './inventory.ts';
import { fact, learn, lookName } from './knowledge.ts';
import { say } from './log.ts';
import { recall, remember } from './memory.ts';
import { chance } from './rng.ts';
import type { GameState, SimEvent } from './state.ts';
import { burning } from './surroundings.ts';
import { clock, daylight } from './time.ts';
import { snowBand, weatherAt } from './weather.ts';
import { idx, type World } from './world.ts';

/** The run ends in winter on this day if nothing else has ended it (SPEC 10). */
export const WINTER_DAY = 72;

function nearWater(w: World, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const t = w.terrain[idx(Math.max(0, Math.min(255, x + dx)), Math.max(0, Math.min(255, y + dy)))]!;
    if (t === T.shallows || t === T.stream || t === T.gravel || t === T.marsh || t === T.reeds) return true;
  }
  return false;
}

/** An insect remedy plant within a tile: the insects keep away from it (SPEC 6.6, observation). */
function repelPlantNear(s: GameState, w: World, x: number, y: number): number {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = idx(Math.max(0, Math.min(255, x + dx)), Math.max(0, Math.min(255, y + dy)));
    if (w.feature[i] === F.herb && s.rules.remedies[w.data[i]!] === 'insects') return w.data[i]!;
  }
  return -1;
}

/** Each game minute. */
export function hazardsMinute(s: GameState, w: World, ev: SimEvent[]): void {
  const c = clock(s.tick);
  const p = s.player;
  const wh = who(s.protagonist);
  const here = idx(p.x, p.y);
  const awake = !s.sleep || s.sleep.awake;

  // Mosquitoes and blackflies: dawn and dusk, near water, low down, before the cold (SPEC 9).
  const insectHour = (c.hour >= 5 && c.hour < 8) || (c.hour >= 19 && c.hour < 22);
  if (insectHour && c.day < 45 && w.band[here]! <= BAND.montane && nearWater(w, p.x, p.y) && !weatherAt(s).includes('rain')) {
    const smoke = s.fires.some((f) => burning(f) && Math.abs(f.x - p.x) <= 3 && Math.abs(f.y - p.y) <= 3);
    const repelled = (s.memory['repel-until'] ?? 0) > s.tick;
    const plant = repelPlantNear(s, w, p.x, p.y);
    if (plant >= 0 && !fact(s, 'remedy', plant) && c.minute % 30 === 0) {
      say(s, HAZARD_TEXT.insectsAvoid(lookName('remedy', plant)), ev);
      learn(s, 'remedy', plant, 'suspected', 'insects', 'the insects kept away from it', ev);
    } else if (!smoke && !repelled && plant < 0 && chance(s.rng.health, 1 / 25)) {
      const first = !hasCondition(s, 'bites');
      addCondition(s, 'bites', 25);
      if (first) say(s, HAZARD_TEXT.bitten(wh), ev);
    }
  }

  // Sunburn high up on a clear day (SPEC 7.7).
  if (awake && w.band[here]! >= BAND.subalpine && weatherAt(s) === 'clear' && c.hour >= 11 && c.hour < 16 && !hasCondition(s, 'sunburn') && chance(s.rng.health, 1 / 240)) {
    addCondition(s, 'sunburn', 45);
    say(s, HAZARD_TEXT.sunburn(wh), ev);
  }

  // Exhaustion from going on with nothing left.
  if (awake && s.vitals.rest < 5 && !hasCondition(s, 'exhaustion')) {
    addCondition(s, 'exhaustion', 70);
    say(s, HAZARD_TEXT.exhausted(wh), ev);
  }

  // A wound left uncleaned for half a day goes bad (SPEC 7.7).
  const wound = hasCondition(s, 'wound');
  if (wound && !recall(s, `cleaned:${wound.since}`) && s.tick - wound.since > 7200 && !recall(s, `infected:${wound.since}`)) {
    remember(s, `infected:${wound.since}`);
    if (chance(s.rng.health, 0.55)) {
      addCondition(s, 'infection', 55);
      say(s, HAZARD_TEXT.infection(wh), ev);
    }
  }

  // At midnight: the restless trait counts the day; the snowline creeps down.
  if (c.minute === 0) {
    if (s.protagonist.trait === 'restless') {
      const walked = s.stats.distance - (s.memory['walked-at-midnight'] ?? 0);
      if (walked < 30 && c.day > 1) {
        s.vitals.morale = Math.max(0, s.vitals.morale - 10);
        say(s, HAZARD_TEXT.restless(wh), ev);
      }
    }
    s.memory['walked-at-midnight'] = s.stats.distance;
    const band = snowBand(s.tick);
    if (band !== snowBand(s.tick - 14400)) {
      say(s, band === 0 ? WEATHER_TEXT.winter : WEATHER_TEXT.snowFirst, ev);
      ev.push({ type: 'snow', band });
    }
    if (c.day >= WINTER_DAY && !s.over) {
      s.over = { kind: 'death', cause: 'winter', tick: s.tick };
      say(s, HAZARD_TEXT.winterEnd(wh), ev);
      ev.push({ type: 'over', kind: 'death' });
    }
  }
}

/** After each step: falls on rough ground and in the dark, and a poor swimmer's slips (SPEC 7.7, 4.2). */
export function stepHazards(s: GameState, w: World, tile: number, ev: SimEvent[]): void {
  const t = w.terrain[tile]!;
  const wh = who(s.protagonist);
  const rough = t === T.talus || t === T.scree || t === T.boulders || t === T.snow;
  const dark = daylight(s.tick) < 15 && !s.fires.some((f) => burning(f) && Math.abs(f.x - s.player.x) <= 6 && Math.abs(f.y - s.player.y) <= 6);
  let p = 0;
  if (rough) p += t === T.scree ? 0.006 : 0.002;
  if (dark) p += rough ? 0.02 : 0.003;
  if (s.vitals.rest < 20) p *= 2;
  if (p > 0 && !hasCondition(s, 'sprain') && chance(s.rng.health, p)) {
    addCondition(s, 'sprain', 55);
    s.vitals.health = Math.max(0, s.vitals.health - 5);
    say(s, HAZARD_TEXT.fall(wh), ev);
    if (s.protagonist.trait === 'glasses' && !s.memory['glasses-broken'] && chance(s.rng.health, 0.3)) {
      s.memory['glasses-broken'] = 1;
      say(s, HAZARD_TEXT.glasses(wh), ev);
    }
  }
  // A fallen tree across a stream: in the dark, or worn out, a foot can go wrong, and into the water.
  if (w.flags[tile]! & FLAG.bridge) {
    const slip = (dark ? 0.08 : 0) + (s.vitals.rest < 20 ? 0.05 : 0);
    if (slip > 0 && chance(s.rng.health, slip)) {
      s.player.wet = 100;
      s.vitals.warmth = Math.max(0, s.vitals.warmth - 8);
      s.vitals.morale = Math.max(0, s.vitals.morale - 4);
      say(s, HAZARD_TEXT.offLog(wh), ev);
    }
    return;
  }
  if (s.protagonist.trait === 'poor-swimmer' && (t === T.stream || t === T.shallows) && chance(s.rng.health, 0.03)) {
    s.player.wet = 100;
    s.vitals.warmth = Math.max(0, s.vitals.warmth - 15);
    s.vitals.morale = Math.max(0, s.vitals.morale - 6);
    say(s, HAZARD_TEXT.slipped(wh), ev);
  }
}

/** Working with a blade while exhausted risks a slip (SPEC 7.7). Called after steel work. */
export function toolSlip(s: GameState, ev: SimEvent[]): void {
  if (s.vitals.rest >= 20 && !hasCondition(s, 'exhaustion')) return;
  if (!chance(s.rng.health, 0.1)) return;
  addCondition(s, 'wound', 30);
  say(s, HAZARD_TEXT.slip(who(s.protagonist)), ev);
}

type Use = 'stomach' | 'wound' | 'insects';
const COMPLAINT: Record<Use, (s: GameState) => boolean> = {
  stomach: (s) => !!(hasCondition(s, 'food-poisoning') || hasCondition(s, 'waterborne') || hasCondition(s, 'nausea')),
  wound: (s) => !!(hasCondition(s, 'wound') || hasCondition(s, 'infection')),
  insects: () => true,
};
const USE_LABEL: Record<Use, string> = { stomach: 'Chew the {x} for the stomach', wound: 'Press the {x} on the wound', insects: 'Rub the {x} on against insects' };

/** Try a herb for a complaint (SPEC 7.7, 6.6): the right plant works faster than rest; the wrong one does nothing or a little harm. */
function useHerb(s: GameState, slot: number, use: Use, ev: SimEvent[]): void {
  const it = s.inventory[slot];
  if (!it || it.d === undefined) return;
  const d = it.d;
  takeFromSlot(s, slot, 1);
  const o = s.rules.remedies[d]!;
  const name = lookName('remedy', d);
  const wh = who(s.protagonist);
  if (o === use) {
    if (use === 'stomach') {
      treat(s, 'food-poisoning', 45);
      treat(s, 'waterborne', 45);
      treat(s, 'nausea', 60);
    } else if (use === 'wound') {
      treat(s, 'wound', 40);
      treat(s, 'infection', 40);
    } else s.memory['repel-until'] = s.tick + 6 * 600;
    say(s, HAZARD_TEXT.herbWorked(wh, name, use), ev);
    learn(s, 'remedy', d, 'known', use, 'it worked', ev);
  } else if (o === 'irritant') {
    addCondition(s, 'nausea', 25);
    s.vitals.morale = Math.max(0, s.vitals.morale - 3);
    say(s, HAZARD_TEXT.herbIrritant(wh, name), ev);
    learn(s, 'remedy', d, 'known', 'irritant', 'it stung and made me queasy', ev);
  } else {
    say(s, HAZARD_TEXT.herbNothing(name), ev);
    const n = remember(s, `herb-nothing:${d}`);
    if (!fact(s, 'remedy', d) || fact(s, 'remedy', d)!.level === 'suspected') {
      learn(s, 'remedy', d, n >= 2 && o === 'nothing' ? 'known' : 'suspected', n >= 2 && o === 'nothing' ? 'nothing' : `not for the ${use === 'insects' ? 'insects' : use}`, 'it did nothing', ev);
    }
  }
}

export const HAZARD_ITEM_ACTIONS: ItemActionDef[] = [
  ...(['stomach', 'wound', 'insects'] as const).map(
    (use): ItemActionDef => ({
      id: `herb-${use}`,
      offer: (s, _w, slot) => {
        const it = s.inventory[slot];
        if (it?.k !== 'herb' || it.d === undefined || !COMPLAINT[use](s)) return null;
        return USE_LABEL[use].replace('{x}', lookName('remedy', it.d));
      },
      minutes: 5,
      done: (s, _w, slot, ev) => useHerb(s, slot, use, ev),
    }),
  ),
  {
    id: 'clean-wound',
    offer: (s, _w, slot) => {
      const k = s.inventory[slot]?.k;
      return (k === 'boiled-water' || k === 'pot-boiled') && hasCondition(s, 'wound') ? 'Clean the wound with the boiled water' : null;
    },
    minutes: 10,
    done: (s, _w, slot, ev) => {
      const it = s.inventory[slot];
      const wound = hasCondition(s, 'wound');
      if (!it || !wound) return;
      takeFromSlot(s, slot, 1);
      s.inventory.push({ k: it.k === 'pot-boiled' ? 'pot' : 'bark-vessel', n: 1 });
      remember(s, `cleaned:${wound.since}`);
      treat(s, 'wound', 20);
      say(s, HAZARD_TEXT.cleaned(who(s.protagonist)), ev);
    },
  },
  {
    id: 'first-aid',
    offer: (s, _w, slot) => (s.inventory[slot]?.k === 'first-aid' && (hasCondition(s, 'wound') || hasCondition(s, 'infection') || hasCondition(s, 'sprain')) ? 'Use the first-aid kit' : null),
    minutes: 15,
    done: (s, _w, slot, ev) => {
      takeFromSlot(s, slot, 1);
      const wound = hasCondition(s, 'wound');
      if (wound) remember(s, `cleaned:${wound.since}`);
      treat(s, 'wound', 70);
      treat(s, 'infection', 70);
      treat(s, 'sprain', 40);
      say(s, HAZARD_TEXT.firstAid(who(s.protagonist)), ev);
    },
  },
];

