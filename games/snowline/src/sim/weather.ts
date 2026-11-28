// Weather (SPEC 6.5). The whole forecast is drawn at the start of a run from the seed's `weather` stream:
// a state for every three hours, from the transition odds adjusted for the time of day and the week,
// with the severe storm placed once in its window. It never depends on what the player does, so tests
// can say "seed X rains on day 4". Signs before storms are dealt (6.6): some foretell, some are noise,
// and the journal tallies each against what followed.

import { SIGNS } from '../content/decks.ts';
import { WEATHER_TEXT } from '../content/weatherText.ts';
import {
  FORECAST_DAYS,
  PERIOD_HOURS,
  SEVERE_WINDOW,
  SIGN_LEAD,
  SNOW_FROM,
  SNOW_STEP,
  STORMY,
  TRANSITIONS,
  WEATHER,
  WEATHER_IDS,
  type WeatherId,
} from '../content/weather.ts';
import { BLOWING, HOUR, MIN, START_MINUTE } from '../content/balance.ts';
import { T } from '../content/terrain.ts';
import { learn, see } from './knowledge.ts';
import { say } from './log.ts';
import { recall, remember } from './memory.ts';
import { chance, nextFloat, nextRange, type RngState } from './rng.ts';
import type { Fire, GameState, SimEvent } from './state.ts';
import { clock } from './time.ts';
import { idx, type World } from './world.ts';

/** Every weather id, in the order the forecast stores them. */
export const ALL: readonly WeatherId[] = [...WEATHER_IDS, 'severe'];
const PERIOD_TICKS = PERIOD_HOURS * HOUR;

/** The forecast for a run: one weather per three-hour period from midnight before day 1. */
export function makeForecast(rng: RngState): { f: number[]; severeDay: number } {
  const periods = FORECAST_DAYS * (24 / PERIOD_HOURS);
  const f: number[] = [];
  let cur: WeatherId = 'clear';
  for (let p = 0; p < periods; p++) {
    const hour = (p * PERIOD_HOURS) % 24;
    const week = Math.floor(p / (7 * 8));
    const odds = TRANSITIONS[cur as Exclude<WeatherId, 'severe'>];
    const options: [WeatherId, number][] = [];
    for (const id of WEATHER_IDS) {
      let w = odds[id] ?? 0;
      if (w === 0) continue;
      if (hour >= 12 && hour < 18 && (id === 'thunderstorm' || id === 'cloudy')) w *= 2;
      if (hour >= 6 && hour < 12 && id === 'clear') w *= 1.6;
      if (hour >= 3 && hour < 9 && id === 'fog') w *= 1.8;
      if (id === 'rain' || id === 'drizzle' || id === 'wind') w *= 1 + week * 0.12;
      options.push([id, w]);
    }
    let total = 0;
    for (const [, w] of options) total += w;
    let r = nextFloat(rng) * total;
    let pick: WeatherId = options[0]![0];
    for (const [id, w] of options) {
      r -= w;
      if (r < 0) {
        pick = id;
        break;
      }
    }
    cur = pick;
    f.push(ALL.indexOf(cur));
  }
  // The severe storm: an afternoon and night in its window.
  const severeDay = nextRange(rng, SEVERE_WINDOW[0], SEVERE_WINDOW[1]);
  const first = (severeDay - 1) * 8 + 5;
  for (let p = first; p < first + 4 && p < periods; p++) f[p] = ALL.indexOf('severe');
  // Before it, the sky builds.
  if (first - 1 >= 0) f[first - 1] = ALL.indexOf('cloudy');
  return { f, severeDay };
}

/** Did the wind blow hard (BLOWING) in any forecast period after the one holding `since`, up to now? */
export function blewSince(s: GameState, since: number): boolean {
  const f = s.weather.f;
  const last = Math.min(f.length - 1, periodAt(s.tick));
  for (let p = periodAt(since) + 1; p <= last; p++) if (WEATHER[ALL[f[p]!]!].wind >= BLOWING) return true;
  return false;
}

/** The forecast period at a tick. */
export function periodAt(tick: number): number {
  return Math.floor((START_MINUTE * MIN + tick) / PERIOD_TICKS);
}

export function weatherAt(s: GameState, tick = s.tick): WeatherId {
  const f = s.weather.f;
  const v = f[Math.min(f.length - 1, periodAt(tick))];
  return ALL[v ?? 0]!;
}

/** The lowest band with lying snow and snowfall: 4 is none yet, 0 is snow down to the lake (SPEC 6.5). */
export function snowBand(tick: number): number {
  const day = clock(tick).day;
  if (day < SNOW_FROM) return 4;
  return Math.max(0, 3 - Math.floor((day - SNOW_FROM) / SNOW_STEP));
}

/** The weather where the survivor stands. */
export function weatherNow(s: GameState, w?: World): { temp: number; wind: number; wetting: boolean; hot: boolean; snow: boolean; fog: number } {
  const id = weatherAt(s);
  const def = WEATHER[id];
  const h = clock(s.tick).hour;
  const night = h < 6 || h >= 21;
  const band = w ? w.band[idx(s.player.x, s.player.y)]! : 0;
  const snow = def.wet && band >= snowBand(s.tick);
  return {
    temp: (night ? def.night : def.day) - (snow ? 3 : 0),
    wind: def.wind * (1 + band * 0.15),
    wetting: def.wet,
    hot: id === 'clear' && h >= 10 && h < 17,
    snow,
    fog: def.fog,
  };
}

/** Is this fire out in the rain? A fire under the overhang or a lean-to is covered. */
export function rainOn(s: GameState, w: World, f: Fire): boolean {
  if (!WEATHER[weatherAt(s)].wet) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = f.x + dx;
      const y = f.y + dy;
      if (w.terrain[idx(x, y)] === T.shelter && Math.abs(dx) + Math.abs(dy) <= 1) return false;
      if (s.builds.some((b) => b.kind === 'lean-to' && b.x === x && b.y === y)) return false;
    }
  }
  return true;
}

function stormWithin(s: GameState, fromTick: number, hours: number): boolean {
  for (let t = fromTick; t <= fromTick + hours * HOUR; t += PERIOD_TICKS / 3) if (STORMY.includes(weatherAt(s, t))) return true;
  return false;
}

/** Each game minute: signs, lightning, and a thunderstorm's toll at night. */
export function weatherMinute(s: GameState, w: World, ev: SimEvent[], strike: () => void): void {
  const c = clock(s.tick);
  const id = weatherAt(s);
  const awake = !s.sleep || s.sleep.awake;

  // A new period: the sky changes, and signs may show.
  if (periodAt(s.tick) !== periodAt(s.tick - MIN)) {
    const prev = weatherAt(s, s.tick - MIN);
    if (prev !== id && awake) say(s, WEATHER_TEXT.change[id], ev);
    ev.push({ type: 'weather', id });
    if (awake && c.hour >= 5 && c.hour < 22) showSigns(s, ev);
  }

  // Lightning in a thunderstorm; it may set the split snag smouldering (captured fire, SPEC 8.3).
  if ((id === 'thunderstorm' || id === 'severe') && chance(s.rng.weather, 1 / 40)) {
    ev.push({ type: 'lightning' });
    if (!s.smoulder && chance(s.rng.weather, 0.12)) strike();
  }
  if (id === 'thunderstorm' && (c.hour >= 21 || c.hour < 5)) s.vitals.morale = Math.max(0, s.vitals.morale - 0.03);

  // Signs come due: did a storm follow?
  const due = s.pending.filter((p) => p.kind === 'sign' && p.t <= s.tick);
  if (due.length) {
    s.pending = s.pending.filter((p) => !due.includes(p));
    for (const p of due) judgeSign(s, p.d, p.t - (SIGN_LEAD + 3) * HOUR, ev);
  }
  void w;
}

function showSigns(s: GameState, ev: SimEvent[]): void {
  const storm = stormWithin(s, s.tick + HOUR, SIGN_LEAD);
  SIGNS.forEach((_, i) => {
    const foretells = s.rules.signs[i] === 'foretells';
    const p = foretells ? (storm ? 0.7 : 0.04) : 0.1;
    if (!chance(s.rng.weather, p)) return;
    see(s, 'sign', i);
    say(s, WEATHER_TEXT.sign[i]!, ev);
    s.pending.push({ t: s.tick + (SIGN_LEAD + 3) * HOUR, kind: 'sign', d: i });
  });
}

/** The journal's tally for a sign (SPEC 6.5): after a few, a suspicion; after more, it's known. */
function judgeSign(s: GameState, i: number, seenAt: number, ev: SimEvent[]): void {
  const hit = stormWithin(s, seenAt, SIGN_LEAD + 3);
  remember(s, hit ? `sign-hit:${i}` : `sign-miss:${i}`);
  const hits = recall(s, `sign-hit:${i}`);
  const misses = recall(s, `sign-miss:${i}`);
  const n = hits + misses;
  if (n < 2) return;
  const value = hits > misses ? 'foretells' : 'noise';
  const sure = n >= 4 && (value === 'foretells' ? misses <= 1 : hits <= 1);
  learn(s, 'sign', i, sure ? 'known' : 'suspected', value, `${hits} of ${n} times a storm followed`, ev);
}
