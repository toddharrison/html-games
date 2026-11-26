// The arc of a run (SPEC 5.3, 10). Nothing here is scripted to the player: the flights, the storm, and
// the slide are fixed by the seed at the start, and what happens when they come depends on what the
// survivor has done. Three ways out: a search aircraft seeing a smoky signal fire (hard, early), the
// beacon in the tail wreckage once the storm's rockslide opens a way up, or a late aircraft crossing
// the range after day 40.

import { ARC_TEXT, BEACON_DAYS, FLIGHT_MINUTES, LATE_FROM, LATE_GAP, SEARCH_DAYS, SEARCH_FLIGHTS, WRECK_ITEMS } from '../content/arc.ts';
import { START_MINUTE } from '../content/balance.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { F, FLAG, TERRAIN } from '../content/terrain.ts';
import { technique } from '../content/insights.ts';
import { type ActionDef, type ItemActionDef, frontTile } from './actionKit.ts';
import { addCondition } from './body.ts';
import { buildAt } from './camp.ts';
import { drop, give, has, take, takeFromSlot } from './inventory.ts';
import { fact, learnTechnique } from './knowledge.ts';
import { say } from './log.ts';
import { chance, nextInt, nextRange } from './rng.ts';
import type { GameState, SimEvent } from './state.ts';
import { burning, shelterAt } from './surroundings.ts';
import { daylight } from './time.ts';
import { weatherAt } from './weather.ts';
import { idx, inBounds, passableAt, type World } from './world.ts';

const MIN = 10;
const DAY = 14400;

export interface Arc {
  /** Ticks when an aircraft is overhead; `late` ones from day 40 see less. */
  flights: { t: number; late: boolean }[];
  /** The severe storm has hit the camp, and its rockslide has opened the way to the wreckage. */
  stormHit: boolean;
  slide: boolean;
  searched: boolean;
  /** When rescue will come (beacon, or an aircraft that saw the smoke), or -1. */
  rescueAt: number;
  rescueBy: string;
  /** Trees the storm brought down: tile -> 1. Looked up, never iterated. */
  felled: Record<string, number>;
}

function tickAt(day: number, minuteOfDay: number): number {
  return ((day - 1) * 1440 + minuteOfDay - START_MINUTE) * MIN;
}

/** Plan the flights at the start of a run, from the seed's `events` stream. */
export function planArc(s: GameState): Arc {
  const r = s.rng.events;
  const flights: { t: number; late: boolean }[] = [];
  const n = nextRange(r, SEARCH_FLIGHTS[0], SEARCH_FLIGHTS[1]);
  const days: number[] = [];
  while (days.length < n) {
    const d = nextRange(r, SEARCH_DAYS[0], SEARCH_DAYS[1]);
    if (!days.includes(d)) days.push(d);
  }
  for (const d of days.sort((a, b) => a - b)) flights.push({ t: tickAt(d, nextRange(r, 9 * 60, 17 * 60)), late: false });
  for (let d = LATE_FROM + nextRange(r, 0, 4); d < 72; d += nextRange(r, LATE_GAP[0], LATE_GAP[1])) {
    flights.push({ t: tickAt(d, nextRange(r, 10 * 60, 16 * 60)), late: true });
  }
  return { flights, stormHit: false, slide: false, searched: false, rescueAt: -1, rescueBy: '', felled: {} };
}

/** An aircraft is overhead now. */
export function flightNow(s: GameState): { t: number; late: boolean } | null {
  return s.arc.flights.find((f) => s.tick >= f.t && s.tick < f.t + FLIGHT_MINUTES * MIN) ?? null;
}

/** The chance an aircraft sees the survivor now (SPEC 10): smoke, how high and open the site is. */
export function signalChance(s: GameState, w: World): number {
  let best = 0;
  for (const f of s.fires) {
    if (!burning(f)) continue;
    const i = idx(f.x, f.y);
    let p = f.smoke > 0 ? 0.25 + 0.12 * w.band[i]! : 0.03;
    if (f.smoke > 0) {
      if (Math.abs(f.x - w.knoll.x) <= 2 && Math.abs(f.y - w.knoll.y) <= 2) p += 0.3;
      if (f.signal) p += 0.1;
      let trees = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = f.x + dx;
        const y = f.y + dy;
        if (!inBounds(x, y)) continue;
        const ft = w.feature[idx(x, y)];
        if (ft === F.conifer || ft === F.aspen || ft === F.stunted) trees++;
      }
      if (trees === 0) p += 0.08;
      else p -= trees * 0.03;
    }
    best = Math.max(best, p);
  }
  if ((s.memory['mirror-at'] ?? -1e9) >= s.tick - FLIGHT_MINUTES * MIN && weatherAt(s) === 'clear') best += 0.25;
  return Math.max(0, Math.min(0.95, best));
}

/** Each game minute: flights come over, the storm strikes and the mountain comes down, rescue arrives. */
export function arcMinute(s: GameState, w: World, ev: SimEvent[]): void {
  const wh = who(s.protagonist);
  const awake = !s.sleep || s.sleep.awake;
  for (const f of s.arc.flights) {
    if (s.tick === f.t - 20 * MIN && awake) say(s, ARC_TEXT.droneFar(), ev);
    if (s.tick === f.t) {
      if (awake) say(s, ARC_TEXT.overhead(), ev);
      ev.push({ type: 'aircraft' });
    }
    if (s.tick === f.t + FLIGHT_MINUTES * MIN) {
      const p = signalChance(s, w) * (f.late ? 0.7 : 1);
      if (p > 0 && s.arc.rescueAt < 0 && chance(s.rng.events, p)) {
        say(s, ARC_TEXT.seen(wh), ev);
        s.arc.rescueAt = s.tick + 150 * MIN;
        s.arc.rescueBy = f.late ? 'late aircraft' : 'search aircraft';
        s.vitals.morale = 100;
      } else if (s.arc.rescueAt < 0 && !f.late) {
        say(s, awake ? ARC_TEXT.missed(wh) : ARC_TEXT.missedAsleep(), ev);
        s.vitals.morale = Math.max(0, s.vitals.morale - 18);
      }
    }
  }

  const id = weatherAt(s);
  if (id === 'severe' && !s.arc.stormHit) storm(s, w, ev);
  if (s.arc.stormHit && !s.arc.slide && id !== 'severe') {
    s.arc.slide = true;
    say(s, ARC_TEXT.slide(), ev);
    ev.push({ type: 'slide' });
  }
  if (s.arc.slide && !s.memory['slide-seen']) {
    const g = w.slideGap[0];
    if (g && Math.abs(g.x - s.player.x) <= 14 && Math.abs(g.y - s.player.y) <= 14 && daylight(s.tick) > 30) {
      s.memory['slide-seen'] = 1;
      say(s, ARC_TEXT.slideSeen(), ev);
    }
  }

  if (s.arc.rescueAt >= 0 && s.tick >= s.arc.rescueAt && !s.over) {
    s.over = { kind: 'rescue', cause: s.arc.rescueBy, tick: s.tick };
    say(s, s.arc.rescueBy === 'beacon' ? ARC_TEXT.rescueBeacon(wh) : ARC_TEXT.rescueAircraft(wh), ev);
    ev.push({ type: 'over', kind: 'rescue' });
  }
}

/** The severe storm (SPEC 6.5): wrecks the camp, scatters what's left out, kills fires, fells trees. */
function storm(s: GameState, w: World, ev: SimEvent[]): void {
  const r = s.rng.events;
  const wh = who(s.protagonist);
  s.arc.stormHit = true;
  const fragile = ['lean-to', 'wall', 'bed', 'woodpile', 'signal', 'snare'];
  const lost = s.builds.filter((b) => fragile.includes(b.kind)).map((b) => b.kind);
  s.builds = s.builds.filter((b) => !fragile.includes(b.kind));
  for (const f of s.fires) {
    if (!f.banked || chance(r, 0.6)) {
      f.fuel = 0;
      f.coals = 0;
      f.banked = false;
    }
  }
  s.fires = s.fires.filter((f) => f.coals > 0);
  // Things left lying out are flung about.
  const old = s.stashes;
  s.stashes = [];
  for (const st of old) {
    let x = st.x;
    let y = st.y;
    for (let k = 0; k < 6; k++) {
      const nx = st.x + nextInt(r, 11) - 5;
      const ny = st.y + nextInt(r, 11) - 5;
      if (inBounds(nx, ny) && passableAt(w, idx(nx, ny)) && !TERRAIN[w.terrain[idx(nx, ny)]!]!.water) {
        x = nx;
        y = ny;
        break;
      }
    }
    for (const it of st.items) drop(s, x, y, it);
  }
  // Trees come down all over the valley: deadfall to burn, new ways through.
  for (let k = 0; k < 1200; k++) {
    const i = nextInt(r, 65536);
    const f = w.feature[i];
    if (f === F.conifer || f === F.aspen || f === F.stunted) s.arc.felled[i] = 1;
  }
  say(s, ARC_TEXT.stormDamage(wh), ev);
  if (lost.length) say(s, ARC_TEXT.stormBuilds([...new Set(lost)].map((k) => (k === 'bed' ? 'bough bed' : k === 'wall' ? 'woven wall' : k)).join(', ')), ev);
  if (old.length) say(s, ARC_TEXT.stormScatter(), ev);
  say(s, ARC_TEXT.stormTrees(), ev);
  const sh = shelterAt(s, w, s.player.x, s.player.y);
  s.player.wet = 100;
  s.vitals.morale = Math.max(0, s.vitals.morale - 15);
  if (sh.rain < 0.5) {
    s.vitals.warmth = Math.max(0, s.vitals.warmth - 20);
    if (chance(r, 0.3)) addCondition(s, 'wound', 25);
  }
  ev.push({ type: 'storm' });
}

/** Whether the arc opens a tile the map blocks (the slide's gap) or a felled tree. Null for no change. */
export function arcOpens(s: GameState, w: World, i: number): boolean {
  if (s.arc.slide && (w.flags[i]! & FLAG.slideGap) !== 0) return true;
  return s.arc.felled[i] === 1;
}

/** Light the signal pile with whatever the survivor can make fire with. */
function canIgnite(s: GameState): boolean {
  if (has(s, 'ember-pouch') || has(s, 'matches')) return true;
  const spark = s.inventory.some((it) => it.k === 'stone' && it.d !== undefined && fact(s, 'stone', it.d)?.value === 'sparks');
  return spark && has(s, 'tinder') && (has(s, 'hatchet') || has(s, 'knife') || has(s, 'multitool'));
}

export const ARC_ACTIONS: ActionDef[] = [
  {
    id: 'light-signal',
    offer: (s, _w, t) => (t === frontTile(s) && buildAt(s, t, 'signal') && canIgnite(s) ? 'Light the signal fire' : null),
    minutes: 10,
    done: (s, _w, t, ev) => {
      if (!take(s, 'matches', 1) && !take(s, 'ember-pouch', 1)) take(s, 'tinder', 1);
      s.builds = s.builds.filter((b) => !(b.kind === 'signal' && idx(b.x, b.y) === t));
      s.fires.push({ x: t % 256, y: Math.floor(t / 256), fuel: 300, coals: 0, banked: false, smoke: 300, signal: true });
      s.fires.sort((a, b) => a.y - b.y || a.x - b.x);
      say(s, ARC_TEXT.lightSignal(who(s.protagonist)), ev);
      ev.push({ type: 'fire-lit', x: t % 256, y: Math.floor(t / 256) });
    },
  },
  {
    id: 'search-tail',
    offer: (_s, w, t) => (w.feature[t] === F.tail ? 'Search the tail wreckage' : null),
    minutes: 20,
    done: (s, _w, _t, ev) => {
      const wh = who(s.protagonist);
      if (s.arc.searched) return say(s, ARC_TEXT.tailEmpty(), ev);
      s.arc.searched = true;
      say(s, ARC_TEXT.searchTail(wh), ev);
      for (const it of WRECK_ITEMS) {
        const got = give(s, it.k, it.n, undefined, itemDef(it.k).food ? s.tick : undefined);
        if (got < it.n) drop(s, s.player.x, s.player.y, { k: it.k, n: it.n - got });
      }
      s.vitals.morale = Math.min(100, s.vitals.morale + 25);
      s.stats.discoveries++;
      ev.push({ type: 'discovery', key: 'wreck' });
    },
  },
  {
    id: 'flash-mirror',
    offer: (s, _w, t) => (t === idx(s.player.x, s.player.y) && has(s, 'mirror') && flightNow(s) && daylight(s.tick) > 50 ? 'Flash the mirror at the aircraft' : null),
    minutes: 2,
    done: (s, _w, _t, ev) => {
      s.memory['mirror-at'] = s.tick;
      say(s, ARC_TEXT.mirror(who(s.protagonist)), ev);
    },
  },
];

export const ARC_ITEM_ACTIONS: ItemActionDef[] = [
  {
    id: 'beacon-on',
    offer: (s, _w, slot) => (s.inventory[slot]?.k === 'beacon' && s.arc.rescueAt < 0 ? 'Switch on the beacon' : null),
    minutes: 2,
    done: (s, _w, slot, ev) => {
      takeFromSlot(s, slot, 0);
      const days = nextRange(s.rng.events, BEACON_DAYS[0], BEACON_DAYS[1]);
      s.arc.rescueAt = s.tick + days * DAY + nextRange(s.rng.events, 0, 600) * MIN;
      s.arc.rescueBy = 'beacon';
      s.vitals.morale = 100;
      say(s, ARC_TEXT.beaconOn(who(s.protagonist)), ev);
      if (!s.known.techniques.includes('signal')) learnTechnique(s, 'signal', technique('signal').learned, ev);
    },
  },
];

