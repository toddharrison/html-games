// The body (SPEC 7.1, 7.7): temperature, warmth, the vitals' drains and healing, conditions, morale,
// and death. Runs once per game minute.

import {
  BAND_COOLING,
  COLD_LOSS,
  COMFORT,
  DAY_CURVE,
  DRAIN,
  DRYING,
  EMPTY_HARM,
  EXERTION,
  FIRE_WARMTH,
  HEAL_ABOVE,
  HEAL_RATE,
  MORALE_DRIFT,
  NIGHT_POOLING,
  SEASON_BASE,
  SEASON_COOLING,
  SLEEP_DRAIN,
  SLEEP_GAIN,
  SUN_WARMTH,
  WARM_GAIN,
  WET_CHILL,
} from '../content/balance.ts';
import { CONDITIONS, type ConditionId } from '../content/conditions.ts';
import { MSG, who } from '../content/messages.ts';
import { FLAG, T } from '../content/terrain.ts';
import { say } from './log.ts';
import type { Condition, GameState, SimEvent } from './state.ts';
import { clock } from './time.ts';
import { idx, type World } from './world.ts';
import { shelterAt, warmthNear, weatherHere } from './surroundings.ts';

/** Air temperature in °C at a tile now (SPEC 6.5): season, time of day, weather, and height. */
export function airTemp(s: GameState, w: World, x: number, y: number): number {
  const c = clock(s.tick);
  const h = c.hour;
  const m = c.minute - h * 60;
  const curve = DAY_CURVE[h]! + ((DAY_CURVE[h + 1]! - DAY_CURVE[h]!) * m) / 60;
  const band = w.band[idx(x, y)]!;
  const night = h < 6 || h >= 21;
  const days = (s.tick / 14400) | 0;
  return SEASON_BASE - SEASON_COOLING * days + curve - BAND_COOLING * band - (night && band === 0 ? NIGHT_POOLING : 0) + weatherHere(s).temp;
}

// ---- Conditions ----

export function hasCondition(s: GameState, id: ConditionId): Condition | null {
  return s.conditions.find((c) => c.id === id && c.since <= s.tick) ?? null;
}

/** Start a condition (or make an existing one worse). `delay` is minutes before it shows. */
export function addCondition(s: GameState, id: ConditionId, sev: number, delay = 0): Condition {
  const def = CONDITIONS[id];
  const since = s.tick + delay * 10;
  const old = s.conditions.find((c) => c.id === id);
  if (old) {
    old.sev = Math.min(100, old.sev + sev * 0.6);
    old.until = Math.max(old.until, since + Math.round((def.minutes * old.sev) / 100) * 10);
    return old;
  }
  const c: Condition = { id, sev: Math.min(100, sev), since, until: since + Math.round((def.minutes * Math.min(100, sev)) / 100) * 10 };
  s.conditions.push(c);
  s.conditions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return c;
}

/** Ease a condition: lower its severity and shorten it. */
export function treat(s: GameState, id: ConditionId, by: number): void {
  const c = s.conditions.find((x) => x.id === id);
  if (!c) return;
  c.sev = Math.max(0, c.sev - by);
  c.until = Math.max(s.tick, c.until - Math.round(by * 6) * 10);
}

/** Steps take this many times longer, from conditions, exhaustion, and load. */
export function slowFactor(s: GameState): number {
  let f = 1;
  for (const c of s.conditions) {
    if (c.since > s.tick) continue;
    const slow = CONDITIONS[c.id].slow;
    if (slow) f *= 1 + ((slow - 1) * c.sev) / 100;
  }
  if (s.vitals.rest < 10) f *= 1.3;
  if (s.vitals.warmth < 10) f *= 1.3;
  return f;
}

/** Work takes this many times longer, from conditions, low morale, and hunger. */
export function clumsyFactor(s: GameState): number {
  let f = 1;
  for (const c of s.conditions) {
    if (c.since > s.tick) continue;
    const k = CONDITIONS[c.id].clumsy;
    if (k) f *= 1 + ((k - 1) * c.sev) / 100;
  }
  if (s.vitals.morale < 25) f *= 1.25;
  if (s.vitals.nutrition <= 0) f *= 1.4;
  if (s.vitals.warmth < 10) f *= 1.3;
  return f;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

export interface MinuteContext {
  /** The survivor walked or worked this minute. */
  exerting: boolean;
}

/** One game minute of the body. */
export function bodyMinute(s: GameState, w: World, ctx: MinuteContext, events: SimEvent[]): void {
  const v = s.vitals;
  const p = s.player;
  const asleep = s.sleep !== null && !s.sleep.awake;
  const resting = s.sleep !== null;
  const ex = ctx.exerting ? EXERTION : 1;
  const sl = asleep ? SLEEP_DRAIN : 1;
  const here = idx(p.x, p.y);
  const shelter = shelterAt(s, w, p.x, p.y);
  const weather = weatherHere(s, w);

  // Water and food.
  v.hydration = clamp(v.hydration - DRAIN.hydration * ex * sl * (weather.hot ? 1.3 : 1));
  const air = airTemp(s, w, p.x, p.y);
  v.nutrition = clamp(v.nutrition - DRAIN.nutrition * ex * sl * (air < 5 ? 1.25 : 1));

  // Warmth: lost below comfort (faster when wet or in wind, slower in shelter), gained above, and by fire.
  const fire = warmthNear(s, p.x, p.y);
  let feel = air + fire * 12;
  if (shelter.insulation > 0) feel += 3 * shelter.insulation;
  if (asleep) feel += shelter.bed ? 2 : -2;
  if (feel < COMFORT) {
    let loss = (COMFORT - feel) * COLD_LOSS;
    if (p.wet > 20) loss *= 1 + ((WET_CHILL - 1) * p.wet) / 100;
    if (weather.wind > 0) loss *= 1 + weather.wind * 0.6 * (1 - shelter.wind);
    if (s.inventory.some((i) => i.k === 'warm-layers')) loss *= 0.55;
    v.warmth = clamp(v.warmth - loss);
  } else {
    v.warmth = clamp(v.warmth + (feel - COMFORT) * WARM_GAIN);
  }
  if (weather.hot && shelter.rain < 0.5) v.warmth = clamp(v.warmth + SUN_WARMTH);
  if (fire > 0) v.warmth = clamp(v.warmth + FIRE_WARMTH * fire);

  // Drying out: by a fire, in the sun, or slowly anywhere out of the rain.
  const inWater = (w.terrain[here] === T.shallows || w.terrain[here] === T.stream) && !(w.flags[here]! & FLAG.bridge);
  if (!inWater && !weather.wetting) {
    const dry = fire > 0 ? DRYING.fire : clock(s.tick).hour >= 8 && clock(s.tick).hour < 19 ? DRYING.day : DRYING.night;
    p.wet = Math.max(0, p.wet - dry);
  } else if (weather.wetting && shelter.rain < 0.5) {
    p.wet = Math.min(100, p.wet + 0.8);
  }

  // Rest.
  if (asleep) v.rest = clamp(v.rest + SLEEP_GAIN * sleepQuality(s, w));
  else if (resting) v.rest = clamp(v.rest + SLEEP_GAIN * 0.15 - DRAIN.rest * 0.3);
  else v.rest = clamp(v.rest - DRAIN.rest * (ctx.exerting ? 1.3 : 1));

  // Conditions: their drains, then expiry.
  let harm = 0;
  let worst = '';
  let worstHarm = 0;
  for (const c of s.conditions) {
    if (c.since > s.tick) continue;
    const d = CONDITIONS[c.id];
    const k = c.sev / 100;
    v.hydration = clamp(v.hydration - (d.hydration ?? 0) * k);
    v.nutrition = clamp(v.nutrition - (d.nutrition ?? 0) * k);
    v.rest = clamp(v.rest - (d.rest ?? 0) * k);
    v.morale = clamp(v.morale - (d.morale ?? 0) * k);
    const h = (d.health ?? 0) * k;
    harm += h;
    if (h > worstHarm) {
      worstHarm = h;
      worst = c.id;
    }
    if (resting && d.restHeals) c.sev = Math.max(0, c.sev - d.restHeals);
    if (v.hydration > 60 && (c.id === 'food-poisoning' || c.id === 'waterborne')) c.sev = Math.max(0, c.sev - 0.02);
  }
  const ending = s.conditions.filter((c) => c.since <= s.tick && (c.until <= s.tick || c.sev <= 0));
  for (const c of ending) say(s, CONDITIONS[c.id].ends, events);
  s.conditions = s.conditions.filter((c) => !ending.includes(c));

  // Empty vitals hurt.
  const empty: [number, string][] = [];
  if (v.hydration <= 0) empty.push([EMPTY_HARM.hydration, 'thirst']);
  if (v.nutrition <= 0) empty.push([EMPTY_HARM.nutrition, 'hunger']);
  if (v.warmth <= 0) empty.push([EMPTY_HARM.warmth, 'cold']);
  for (const [h, cause] of empty) {
    harm += h;
    if (h > worstHarm) {
      worstHarm = h;
      worst = cause;
    }
  }
  if (harm > 0) {
    v.health = clamp(v.health - harm);
  } else if (v.hydration > HEAL_ABOVE && v.nutrition > HEAL_ABOVE && v.warmth > HEAL_ABOVE && v.rest > 10) {
    v.health = clamp(v.health + HEAL_RATE * (resting ? 2 : 1));
  }

  // Morale drifts toward what the situation says it should be (SPEC 7.1).
  v.morale = clamp(v.morale + (moraleTarget(s, w, fire > 0) - v.morale) * MORALE_DRIFT);

  if (v.health <= 0 && !s.over) {
    s.over = { kind: 'death', cause: worst || 'exhaustion', tick: s.tick };
    say(s, MSG.death(who(s.protagonist), worst || 'exhaustion'), events);
    events.push({ type: 'over', kind: 'death' });
  }
}

/** Sleep quality 0–1 (SPEC 7.6): shelter, warmth, a bed, and the trait that makes it worse. */
export function sleepQuality(s: GameState, w: World): number {
  const p = s.player;
  const sh = shelterAt(s, w, p.x, p.y);
  let q = 0.55 + 0.2 * sh.rain + 0.1 * sh.wind + (sh.bed ? 0.2 : 0);
  if (s.vitals.warmth < 30) q -= 0.25;
  if (s.vitals.hydration < 15 || s.vitals.nutrition < 10) q -= 0.15;
  if (s.protagonist.trait === 'light-sleeper' && sh.security < 0.5) q -= 0.2;
  if (s.vitals.morale < 25) q -= 0.1;
  if (hasCondition(s, 'bites')) q -= 0.15;
  return Math.max(0.15, Math.min(1, q));
}

function moraleTarget(s: GameState, _w: World, nearFire: boolean): number {
  const v = s.vitals;
  const c = clock(s.tick);
  const dark = c.hour < 6 || c.hour >= 21;
  let t = 55;
  if (nearFire) t += 15;
  if (v.nutrition > 60) t += 5;
  else if (v.nutrition < 20) t -= 15;
  if (v.hydration < 20) t -= 10;
  if (v.warmth < 25) t -= 10;
  if (v.health < 40) t -= 12;
  if (dark && !nearFire) t -= s.protagonist.trait === 'afraid-dark' ? 22 : 5;
  t -= 5 * s.conditions.filter((x) => x.since <= s.tick).length;
  if (s.protagonist.background === 'reader') t += 5;
  return t;
}
