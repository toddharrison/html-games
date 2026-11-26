// Eating, tasting, and drinking (SPEC 7.3, 7.4, 6.6). What a dealt plant does comes from
// GameState.rules; what the survivor learns from it goes in GameState.known.

import { DRINK, FOUL_RISK, PLANT_NUTRITION, TASTE_DELAY, WATER_ONSET_DAYS, WATER_RISK } from '../content/balance.ts';
import { WATER_SOURCES } from '../content/decks.ts';
import { itemDef } from '../content/items.ts';
import { MSG, who } from '../content/messages.ts';
import { BAND, WATER } from '../content/terrain.ts';
import { addCondition } from './body.ts';
import { takeFromSlot } from './inventory.ts';
import { learn, lookName, see } from './knowledge.ts';
import { say } from './log.ts';
import { chance, nextRange } from './rng.ts';
import type { GameState, Item, SimEvent } from './state.ts';
import type { World } from './world.ts';

const clamp = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

/** The name an item shows: a dealt plant or herb by its look and what is known of it. */
export function itemName(s: GameState, it: Item): string {
  if (it.k === 'plant' && it.d !== undefined) return lookName('plant', it.d);
  if (it.k === 'herb' && it.d !== undefined) return lookName('remedy', it.d);
  if ((it.k === 'stone' || it.k === 'tinder' || it.k === 'firewood') && it.d !== undefined) {
    return lookName(it.k === 'stone' ? 'stone' : it.k === 'tinder' ? 'tinder' : 'wood', it.d);
  }
  void s;
  return itemDef(it.k).name;
}

/** Eat one from a slot. */
export function eat(s: GameState, slot: number, events: SimEvent[]): void {
  const it = takeFromSlot(s, slot, 1);
  if (!it) return;
  const def = itemDef(it.k);
  const w = who(s.protagonist);
  const v = s.vitals;
  events.push({ type: 'eat' });
  s.stats.meals++;
  if (it.k === 'plant' && it.d !== undefined) {
    const outcome = s.rules.plants[it.d]!;
    v.nutrition = clamp(v.nutrition + PLANT_NUTRITION[outcome]);
    v.hydration = clamp(v.hydration + 1);
    say(s, MSG.eat(w, lookName('plant', it.d)), events);
    // The whole effect shows within the half hour.
    s.pending.push({ t: s.tick + 300, kind: 'eat', d: it.d });
    return;
  }
  const food = def.food;
  if (!food) return;
  v.nutrition = clamp(v.nutrition + food.nutrition);
  v.hydration = clamp(v.hydration + food.hydration);
  say(s, MSG.eat(w, def.name), events);
  if (food.rawRisk && chance(s.rng.health, food.rawRisk * stomach(s))) {
    addCondition(s, 'food-poisoning', 30 * stomach(s), 90);
    say(s, MSG.rawIll(w));
  }
  if (s.protagonist.trait === 'picky-eater' && !['candy-bar', 'granola', 'gum'].includes(it.k)) {
    v.morale = clamp(v.morale - 2);
  }
}

/** The weak stomach trait makes food illness worse (SPEC 4.2). */
function stomach(s: GameState): number {
  return s.protagonist.trait === 'weak-stomach' ? 1.5 : 1;
}

/** A small taste of a dealt plant: a mild dose, and an answer in an hour (SPEC 6.6). */
export function taste(s: GameState, slot: number, events: SimEvent[]): void {
  const it = s.inventory[slot];
  if (!it || it.k !== 'plant' || it.d === undefined) return;
  takeFromSlot(s, slot, 1);
  say(s, MSG.taste(who(s.protagonist), lookName('plant', it.d)), events);
  s.pending.push({ t: s.tick + TASTE_DELAY * 10, kind: 'taste', d: it.d });
}

/** Deliver what's due: a taste's answer, a meal's full effect, an illness from old water. */
export function resolvePending(s: GameState, events: SimEvent[]): void {
  const due = s.pending.filter((p) => p.t <= s.tick && (p.kind === 'taste' || p.kind === 'eat' || p.kind === 'water-ill'));
  if (!due.length) return;
  s.pending = s.pending.filter((p) => !due.includes(p));
  const w = who(s.protagonist);
  for (const p of due) {
    if (p.kind === 'taste') {
      const name = lookName('plant', p.d);
      const o = s.rules.plants[p.d]!;
      if (o === 'nourishing' || o === 'poor') {
        say(s, MSG.tasteSafe(w, name), events);
        learn(s, 'plant', p.d, 'suspected', 'safe', 'a taste did no harm', events);
      } else if (o === 'sickening') {
        addCondition(s, 'nausea', 50 * stomach(s));
        say(s, MSG.tasteSick(w, name), events);
        learn(s, 'plant', p.d, 'known', 'sickening', 'a taste turned the stomach', events);
        events.push({ type: 'sick' });
      } else {
        addCondition(s, 'nausea', 90 * stomach(s));
        say(s, MSG.tasteDeadly(w, name), events);
        learn(s, 'plant', p.d, 'known', 'deadly', 'a taste numbed the tongue', events);
        events.push({ type: 'sick' });
      }
    } else if (p.kind === 'eat') {
      const name = lookName('plant', p.d);
      const o = s.rules.plants[p.d]!;
      if (o === 'nourishing') {
        say(s, MSG.eatGood(w, name), events);
        learn(s, 'plant', p.d, 'known', 'nourishing', 'eaten', events);
      } else if (o === 'poor') {
        say(s, MSG.eatPoor(w, name), events);
        learn(s, 'plant', p.d, 'known', 'poor', 'eaten', events);
      } else if (o === 'sickening') {
        addCondition(s, 'food-poisoning', 45 * stomach(s));
        say(s, MSG.eatSick(w, name), events);
        learn(s, 'plant', p.d, 'known', 'sickening', 'it made me sick', events);
        events.push({ type: 'sick' });
      } else {
        addCondition(s, 'deadly-poisoning', 100);
        say(s, MSG.eatDeadly(w, name), events);
        learn(s, 'plant', p.d, 'known', 'deadly', 'it poisoned me', events);
        events.push({ type: 'sick' });
      }
    } else if (p.kind === 'water-ill') {
      addCondition(s, 'waterborne', 60);
      say(s, MSG.waterIll(w), events);
      events.push({ type: 'sick' });
      suspectWater(s, events);
    }
  }
}

/** After waterborne illness, the survivor suspects the water they drank most of in the days before. */
function suspectWater(s: GameState, events: SimEvent[]): void {
  const from = s.tick - (WATER_ONSET_DAYS[1] + 2) * 14400;
  const counts = [0, 0, 0];
  for (const d of s.drinks) if (d.t >= from && d.w >= 0 && d.w < 3) counts[d.w]!++;
  let most = -1;
  for (let i = 0; i < 3; i++) if (counts[i]! > 0 && (most < 0 || counts[i]! > counts[most]!)) most = i;
  if (most < 0) return;
  say(s, MSG.suspectWater(who(s.protagonist), WATER_SOURCES[most]!.name));
  learn(s, 'water', most, 'suspected', 'foul', 'I fell ill after drinking it', events);
}

/** The dealt water source a water body belongs to (lake 0, near stream 1, far stream 2), or -1. */
export function sourceOf(waterBody: number): number {
  return waterBody === WATER.lake ? 0 : waterBody === WATER.streamA ? 1 : waterBody === WATER.streamB ? 2 : -1;
}

/** Drink at a water tile (SPEC 7.3): hydration now, and perhaps illness days later. */
export function drinkAt(s: GameState, w: World, tile: number, events: SimEvent[]): void {
  const body = w.water[tile]!;
  const src = sourceOf(body);
  const who_ = who(s.protagonist);
  if (s.vitals.hydration >= 99) {
    say(s, MSG.notThirsty(who_), events);
    return;
  }
  s.vitals.hydration = clamp(s.vitals.hydration + DRINK);
  events.push({ type: 'drink' });
  const name = src >= 0 ? WATER_SOURCES[src]!.name : 'the tarn';
  say(s, MSG.drink(who_, name), events);
  if (src >= 0) see(s, 'water', src);
  s.drinks.push({ w: src, t: s.tick });
  if (s.drinks.length > 60) s.drinks.splice(0, s.drinks.length - 60);
  waterRisk(s, w, body, w.band[tile]! >= BAND.subalpine);
}

/** Roll for waterborne illness from one drink of untreated water from a water body (SPEC 7.3). */
export function waterRisk(s: GameState, w: World, body: number, highUp: boolean): void {
  void w;
  const src = sourceOf(body);
  const high = body === WATER.tarn || highUp;
  let risk = high ? WATER_RISK.high : body === WATER.lake ? WATER_RISK.lake : WATER_RISK.stream;
  if (src >= 0 && s.rules.water[src] === 'foul') risk *= FOUL_RISK;
  const alreadyIll = s.pending.some((p) => p.kind === 'water-ill') || s.conditions.some((c) => c.id === 'waterborne');
  if (!alreadyIll && chance(s.rng.health, risk)) {
    const days = nextRange(s.rng.health, WATER_ONSET_DAYS[0], WATER_ONSET_DAYS[1]);
    s.pending.push({ t: s.tick + days * 14400, kind: 'water-ill', d: src });
  }
}

/** Throw out food that has gone bad, carried or on the ground (SPEC 7.5). */
export function spoil(s: GameState, events: SimEvent[]): void {
  const bad = (it: Item) => {
    const f = itemDef(it.k).food;
    return !!f && f.spoils > 0 && it.t !== undefined && s.tick - it.t >= f.spoils * 10;
  };
  const w = who(s.protagonist);
  for (let i = s.inventory.length - 1; i >= 0; i--) {
    const it = s.inventory[i]!;
    if (!bad(it)) continue;
    say(s, MSG.spoiled(w, itemName(s, it)), events);
    s.inventory.splice(i, 1);
    s.memory.spoiled = (s.memory.spoiled ?? 0) + 1;
  }
  for (const st of s.stashes) st.items = st.items.filter((it) => !bad(it));
  s.stashes = s.stashes.filter((st) => st.items.length);
}

