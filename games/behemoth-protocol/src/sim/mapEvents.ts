import { ADDONS } from '../content/addons';
import { ARMOR_ARCS } from '../content/chassis';
import { MAP_EVENTS, type EventEffect, type EventPart, type MapEventId } from '../content/mapEvents';
import { moduleLoads, TRAILER_MODULES } from '../content/trailer';
import { WEAPONS } from '../content/weapons';
import { coreMax, fittedChassis } from './depot';
import { Rng, hashSeed } from './rng';
import type { BehemothSnapshot, RunState } from './run';
import { nodeAt, onRouteFrom, reachable, revealSector, type MapPos, type SectorMap } from './sectorMap';

/**
 * Events on the sector map (SPEC §8.3; content/mapEvents.ts): the player picks an option and its
 * outcome is drawn from the event's seed and the option, so a reload can't change it. Choosing
 * applies the effects at once and sends the run back to the map; `RunState.lastEvent` keeps what
 * happened for the result screen and the map's panel.
 */

export interface EventReport {
  id: MapEventId;
  option: number;
  outcome: number;
}

/** No part is taken below this share of its integrity by an event. */
const DAMAGE_FLOOR = 0.05;

/** The event node the run is at, or null. */
export function currentEvent(run: RunState): { id: MapEventId; seed: number } | null {
  const node = run.at ? nodeAt(run.map, run.at) : undefined;
  return node?.event ?? null;
}

/** Whether the run can take an option (it can pay for it). */
export function canChoose(run: RunState, option: number): boolean {
  const ev = currentEvent(run);
  const opt = ev && MAP_EVENTS[ev.id].options[option];
  return !!opt && run.salvage >= (opt.cost ?? 0);
}

/** The outcome an option draws, by its index in the option's outcomes. */
export function drawOutcome(seed: number, id: MapEventId, option: number): number {
  const outcomes = MAP_EVENTS[id].options[option]?.outcomes ?? [];
  const rng = new Rng(hashSeed(seed, 0x0e7c, option));
  const i = rng.weighted(
    outcomes.map((_, k) => k),
    (k) => outcomes[k]!.weight,
  );
  return i ?? 0;
}

/**
 * Takes an option at the event the run is at: pays its cost, draws its outcome, applies the
 * effects, and returns to the map. The run comes back unchanged if it isn't at an event, or can't
 * pay.
 */
export function chooseEventOption(run: RunState, option: number): RunState {
  const ev = currentEvent(run);
  if (run.next !== 'event' || !ev || !canChoose(run, option)) return run;
  const opt = MAP_EVENTS[ev.id].options[option]!;
  const outcome = drawOutcome(ev.seed, ev.id, option);
  let next: RunState = {
    ...run,
    next: 'map',
    salvage: run.salvage - (opt.cost ?? 0),
    behemoth: structuredClone(run.behemoth),
    map: structuredClone(run.map),
    lastEvent: { id: ev.id, option, outcome },
  };
  for (const effect of opt.outcomes[outcome]!.effects) next = applyEffect(next, effect);
  return next;
}

function applyEffect(run: RunState, e: EventEffect): RunState {
  switch (e.kind) {
    case 'salvage':
      return { ...run, salvage: Math.max(0, run.salvage + e.amount), earned: run.earned + Math.max(0, e.amount) };
    case 'damage':
      changePart(run.behemoth, e.part, -e.share);
      return run;
    case 'repair':
      changePart(run.behemoth, e.part, e.share);
      return run;
    case 'rearm':
      rearmAll(run.behemoth);
      return run;
    case 'cache':
      return { ...run, cache: run.cache + e.actions };
    case 'reveal':
      if (run.at) revealSector(run.map, run.at.sector);
      return run;
    case 'threat':
      shiftThreat(run.map, run.at, e.amount, e.scope);
      return run;
  }
}

/**
 * Repairs (`share` > 0) or damages (< 0) a part by a share of its full integrity: each tread set by
 * its own size; armor over every zone (and the trailer's), a repair re-plating that share of what's
 * missing; sensors. Damage stops at `DAMAGE_FLOOR`.
 */
export function changePart(s: BehemothSnapshot, part: EventPart, share: number): void {
  const c = fittedChassis(s);
  const shift = (hp: number, max: number) => {
    if (share > 0) return Math.min(max, hp + share * max);
    return Math.min(hp, Math.max(DAMAGE_FLOOR * max, hp + share * max));
  };
  if (part === 'treads') {
    s.treads = shift(s.treads, c.treadHp);
    for (const a of s.addons) {
      const def = ADDONS[a.id];
      if (def.kind === 'treads' && a.hp !== null) a.hp = shift(a.hp, def.hp);
    }
  } else if (part === 'sensors') {
    s.sensors = shift(s.sensors, coreMax(c, 'sensors'));
  } else {
    // Armor: a repair re-plates a share of what each zone is missing; damage takes a share of each zone.
    const plate = (hp: number, max: number) => (share > 0 ? hp + share * Math.max(0, max - hp) : shift(hp, max));
    for (const arc of ARMOR_ARCS) s.armor[arc] = plate(s.armor[arc], c.armor[arc]);
    const t = s.addons.find((a) => ADDONS[a.id].kind === 'trailer');
    const tdef = t && ADDONS[t.id];
    if (s.trailer && tdef?.kind === 'trailer') s.trailer.armor = plate(s.trailer.armor, tdef.armor);
  }
}

/** Every munitions weapon and ammo bunker full; drones aren't ammo. */
export function rearmAll(s: BehemothSnapshot): void {
  for (const h of s.hardpoints) {
    const full = h.weapon ? WEAPONS[h.weapon].ammo : undefined;
    if (full !== undefined && h.ammo !== null) h.ammo = full;
  }
  for (const bay of s.trailer?.bays ?? []) {
    const def = bay && TRAILER_MODULES[bay.module];
    const full = def && moduleLoads(def);
    if (bay && def?.kind === 'bunker' && full != null) bay.loads = full;
  }
}

/**
 * Shifts the threat of battles ahead: the first battle on every route out of here, looking past
 * depots and events (`next`), or every battle still ahead in the sector (`sector`). Threat stays at
 * least 1; `shift` keeps the running total for the intel panel.
 */
export function shiftThreat(map: SectorMap, at: MapPos | null, amount: number, scope: 'next' | 'sector'): void {
  const ahead = scope === 'next' ? nextBattles(map, at) : at ? map.sectors[at.sector]!.nodes.map((n) => ({ sector: at.sector, node: n.id })).filter((p) => onRouteFrom(map, at, p)) : [];
  for (const pos of ahead) {
    const intel = nodeAt(map, pos)?.battle;
    if (!intel) continue;
    const before = intel.threat;
    intel.threat = Math.max(1, intel.threat + amount);
    const shift = (intel.shift ?? 0) + intel.threat - before;
    if (shift === 0) delete intel.shift;
    else intel.shift = shift;
  }
}

/** The first battle on every route out of `at`, past any depots and events on the way. */
export function nextBattles(map: SectorMap, at: MapPos | null): MapPos[] {
  const out: MapPos[] = [];
  const seen = new Set<string>();
  const frontier = reachable(map, at);
  while (frontier.length > 0) {
    const pos = frontier.pop()!;
    const key = `${pos.sector}:${pos.node}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (nodeAt(map, pos)?.kind === 'battle') out.push(pos);
    else frontier.push(...reachable(map, pos));
  }
  return out;
}

/** What an outcome did, a short line per effect, for the result screen and the map's panel. */
export function effectLines(effects: readonly EventEffect[]): string[] {
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const PART: Record<EventPart, string> = { treads: 'Treads', armor: 'Armor', sensors: 'Sensors' };
  return effects.map((e) => {
    switch (e.kind) {
      case 'salvage':
        return `${e.amount >= 0 ? '+' : ''}${e.amount} salvage`;
      case 'damage':
        return `${PART[e.part]} -${pct(e.share)}`;
      case 'repair':
        return e.part === 'armor' ? `Armor: ${pct(e.share)} of the damage re-plated` : `${PART[e.part]} +${pct(e.share)}`;
      case 'rearm':
        return 'Every munitions weapon rearmed';
      case 'cache':
        return `+${e.actions} action${e.actions === 1 ? '' : 's'} at the next depot`;
      case 'reveal':
        return "The sector's intel revealed";
      case 'threat': {
        const where = e.scope === 'next' ? 'next battles' : 'battles ahead in the sector';
        return e.amount < 0 ? `Defenders weakened (${e.amount}): ${where}` : `Defenders alerted (+${e.amount}): ${where}`;
      }
    }
  });
}

/** The outcome of the event just decided (its text and what it did); null if none. */
export function lastEventOutcome(run: RunState): { title: string; option: string; text: string; lines: string[] } | null {
  const r = run.lastEvent;
  if (!r) return null;
  const def = MAP_EVENTS[r.id];
  const opt = def.options[r.option];
  const out = opt?.outcomes[r.outcome];
  if (!opt || !out) return null;
  const cost = opt.cost ? [`-${opt.cost} salvage`] : [];
  return { title: def.title, option: opt.label, text: out.text, lines: [...cost, ...effectLines(out.effects)] };
}
