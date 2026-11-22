import { MODES, type BattleModeId } from '../content/modes';
import type { AddonId } from '../content/addons';
import { APPROACHES, type ApproachId } from '../content/approaches';
import { BIOMES, type BiomeId } from '../content/biomes';
import { ARMOR_ARCS, CHASSIS, type ArmorArc, type ChassisId } from '../content/chassis';
import { CALLSIGNS } from '../content/callsigns';
import { DIRECTIVES, DIRECTIVE_IDS, type DirectiveDef, type DirectiveId } from '../content/directives';
import type { ConditionId } from '../content/conditions';
import type { EnemyId } from '../content/enemies';
import type { EventReport } from './mapEvents';
import { battleForces, type Forces } from './encounter';
import { moduleLoads, type ModuleId } from '../content/trailer';
import { DIRECTIVE, RUN } from '../content/tuning';
import { NO_UPGRADES, type Grades, type Mods, type Upgrades } from '../content/upgrades';
import { WEAPONS, type Binding, type ShellType, type WeaponId } from '../content/weapons';
import {
  allowedBindings,
  channelsUsed,
  createBehemoth,
  defaultBindingFor,
  hitched,
  loadShell,
  mapArcs,
  speedLimits,
  usesChannel,
  type BehemothState,
} from './behemoth';
import { openDepot, type DepotState } from './depot';
import { depotKey, generateMap, isFinalNode, nodeAt, reachable, samePos, type BattleIntel, type MapNode, type MapPos, type SectorMap } from './sectorMap';
import { Rng, hashSeed } from './rng';
import type { TerrainRecipe } from './terrain';
import { START_X, type BattleStats, type World } from './world';
import { objectiveBonus, objectiveComplete, type ObjectiveSpec, type ObjectiveState } from './objective';

/**
 * Run state (SPEC §3): what carries from one node to the next. Damage, installed weapons, ammo,
 * and salvage persist; power refills and the auto toggles reset every battle (SPEC §8.1).
 * The route is the sector map (`sim/sectorMap.ts`): the player picks each next node on it.
 * Plain data, so it serializes straight into the run save.
 */

export interface HardpointSnapshot {
  slot: string;
  weapon: WeaponId | null;
  hp: number;
  /** Rounds left for munitions weapons; null = unlimited. */
  ammo: number | null;
  /** What fires it, set at the depot (SPEC §5.2); null = the weapon's default for the slot. */
  binding: Binding | null;
  /** The shell a main gun is loaded with (SPEC §6.2); null = its default (or no choice). */
  shell: ShellType | null;
}

export interface AddonSnapshot {
  id: AddonId;
  /** Integrity of the add-on's own part; null for a mount (its hardpoint's is in `hardpoints`). */
  hp: number | null;
}

export interface BaySnapshot {
  module: ModuleId;
  /** Its integrity; null for a pod (its hardpoint's is in `hardpoints`). */
  hp: number | null;
  /** Bunkers: full loads left; drone bays: drones left; null for other modules. */
  loads: number | null;
}

/** The trailer's own parts (its frame integrity is its add-on's `hp`). */
export interface TrailerSnapshot {
  armor: number;
  /** One per bay, front first; null = empty. */
  bays: (BaySnapshot | null)[];
}

/** The Behemoth between battles: integrity per component and what's installed where. */
export interface BehemothSnapshot {
  chassis: ChassisId;
  treads: number;
  sensors: number;
  fireControl: number;
  /** The ammo magazine (SPEC §5.1). */
  magazine: number;
  reactor: number;
  armor: Record<ArmorArc, number>;
  /** Includes mount slots and trailer pods. */
  hardpoints: HardpointSnapshot[];
  /** Add-ons bolted on, in order. */
  addons: AddonSnapshot[];
  /** Present exactly when a `trailer` add-on is. */
  trailer: TrailerSnapshot | null;
  /** Core components above Gen 1 (SPEC §5.6). */
  grades: Grades;
  /** Mod levels by part id (SPEC §5.6). */
  mods: Mods;
}

export interface BattleReport {
  /** 1-based battle number. */
  battle: number;
  kills: number;
  /** Salvage from kills, and the bonus for reaching the extraction line. */
  salvage: number;
  bonus: number;
  /** Seconds from start to extraction. */
  time: number;
  /** A Breach or Chase battle's targets destroyed out of all of them (SPEC §4.4); absent for an Assault. */
  objective?: { mode: BattleModeId; destroyed: number; total: number };
  /** A sector's objective battle: whether it was taken, by the Directive's rule (SPEC §3). */
  taken?: boolean;
}

/**
 * Where the run picks up: the sector map (choosing the next node), the battle, depot, or event at `at`, or
 * the run over without a death: won (the Directive complete: the last sector's objective taken) or
 * failed (extracted from the last objective battle without taking it).
 */
export type RunNext = 'map' | 'battle' | 'depot' | 'event' | 'won' | 'failed';
export const RUN_NEXT: readonly RunNext[] = ['map', 'battle', 'depot', 'event', 'won', 'failed'];

export interface RunState {
  seed: number;
  /** The Behemoth's callsign for this run (a name from `CALLSIGNS`), drawn from the seed. */
  callsign: string;
  /** The run's orders (SPEC §3): what every sector's objective battle asks. */
  directive: DirectiveId;
  /** Each sector's objective so far, in order: taken or missed. */
  objectives: boolean[];
  /** Battles won so far (= the index of the next battle). */
  battle: number;
  next: RunNext;
  map: SectorMap;
  /** The node the Behemoth is at (being fought, or the depot, or the last one done); null at the start. */
  at: MapPos | null;
  /** Every node entered, in order (`at` is the last). */
  path: MapPos[];
  /** Extra actions waiting for the next depot (supply caches, SPEC §3.1). */
  cache: number;
  salvage: number;
  kills: number;
  /** Salvage earned over the run (kills and bonuses), and seconds spent in battles won, for the summary. */
  earned: number;
  time: number;
  behemoth: BehemothSnapshot;
  /** The battle just won, for the depot screen. */
  lastBattle: BattleReport | null;
  /** The event just decided (SPEC §8.3), for its result screen and the map; null until one is. */
  lastEvent: EventReport | null;
  /** The depot the run is at (stock and actions left); null between depots. */
  depot: DepotState | null;
}

/**
 * @param addons add-ons to start with, `extra` weapons for their slots, trailer modules, and
 * upgrades (playtesting only: a real run starts with the chassis' own loadout).
 */
export function newRun(
  seed: number,
  chassisId: ChassisId = 'class2',
  addons: readonly AddonId[] = [],
  extra: Record<string, WeaponId> = {},
  bays: readonly (ModuleId | null)[] = [],
  upgrades: Upgrades = NO_UPGRADES,
  directive: DirectiveId = directiveFor(seed),
): RunState {
  const chassis = CHASSIS[chassisId];
  const ids = { ...chassis.loadout, ...extra };
  const loadout = Object.fromEntries(Object.entries(ids).map(([slot, id]) => [slot, WEAPONS[id]]));
  return {
    seed: seed >>> 0,
    callsign: callsignFor(seed),
    directive,
    objectives: [],
    battle: 0,
    next: 'map',
    map: generateMap(seed >>> 0, directive),
    at: null,
    path: [],
    cache: 0,
    salvage: RUN.startSalvage,
    kills: 0,
    earned: 0,
    time: 0,
    behemoth: snapshotBehemoth(createBehemoth(chassis, loadout, 0, 0, addons, bays, upgrades)),
    lastBattle: null,
    lastEvent: null,
    depot: null,
  };
}

/** The run's callsign: a devil's or demon's name (SPEC §3), drawn from the run seed on a stream of its own. */
export function callsignFor(seed: number): string {
  return new Rng(hashSeed(seed >>> 0, 0xca11)).pick(CALLSIGNS).name;
}

/** A Directive drawn from the run seed (practice runs, and a run that doesn't name one). */
export function directiveFor(seed: number): DirectiveId {
  return new Rng(hashSeed(seed >>> 0, 0xd1ec)).pick(DIRECTIVE_IDS);
}

/** The Behemoth as it is now. A trailer that was jettisoned or wrecked is gone, with its pods. */
export function snapshotBehemoth(b: BehemothState): BehemothSnapshot {
  const t = hitched(b);
  return {
    chassis: b.chassis.id,
    treads: b.treads.hp,
    sensors: b.sensors.hp,
    fireControl: b.fireControl.hp,
    magazine: b.magazine.hp,
    reactor: b.reactor.hp,
    armor: mapArcs((arc) => b.armor[arc].hp),
    hardpoints: b.hardpoints
      .filter((h) => t || h.slot.position !== 'trailer')
      .map((h) => ({
        slot: h.slot.id,
        weapon: h.weapon?.id ?? null,
        hp: h.integrity.hp,
        ammo: h.ammo,
        binding: h.weapon && h.binding !== defaultBindingFor(h.weapon, h.slot) ? h.binding : null,
        shell: h.shell,
      })),
    addons: b.addons.filter((a) => t || a.def.kind !== 'trailer').map((a) => ({ id: a.def.id, hp: a.integrity?.hp ?? null })),
    trailer: t && {
      armor: t.armor.hp,
      bays: t.bays.map(
        (bay) =>
          bay && {
            module: bay.def.id,
            hp: bay.def.kind === 'pod' ? null : bay.integrity.hp,
            loads: moduleLoads(bay.def) === null ? null : bay.loads,
          },
      ),
    },
    grades: structuredClone(b.upgrades.grades),
    mods: structuredClone(b.upgrades.mods),
  };
}

/** A fresh battle-ready Behemoth with the snapshot's damage, weapons, and ammo. */
export function restoreBehemoth(s: BehemothSnapshot, x: number, y: number): BehemothState {
  const chassis = CHASSIS[s.chassis];
  const loadout = Object.fromEntries(s.hardpoints.filter((h) => h.weapon).map((h) => [h.slot, WEAPONS[h.weapon!]]));
  const b = createBehemoth(
    chassis,
    loadout,
    x,
    y,
    s.addons.map((a) => a.id),
    s.trailer?.bays.map((bay) => bay?.module ?? null) ?? [],
    { grades: s.grades, mods: s.mods },
  );
  const set = (i: { hp: number; max: number }, hp: number) => (i.hp = Math.max(0, Math.min(i.max, hp)));
  set(b.treads, s.treads);
  set(b.sensors, s.sensors);
  set(b.fireControl, s.fireControl);
  set(b.magazine, s.magazine);
  set(b.reactor, s.reactor);
  for (const arc of ARMOR_ARCS) set(b.armor[arc], s.armor[arc]);
  for (const h of b.hardpoints) {
    const saved = s.hardpoints.find((sh) => sh.slot === h.slot.id);
    if (!saved) continue;
    set(h.integrity, saved.hp);
    if (h.ammo !== null && saved.ammo !== null) h.ammo = Math.max(0, Math.min(h.ammo, saved.ammo));
    loadShell(h, saved.shell);
    // A binding the slot doesn't allow, or one past the fire-control channels, stays at the default.
    const binding = saved.binding;
    if (!h.weapon || binding === null || !allowedBindings(h.weapon, h.slot).includes(binding)) continue;
    if (usesChannel(h.weapon, h.slot, binding) && channelsUsed(b) >= b.chassis.fireControl.channels) continue;
    h.binding = binding;
  }
  for (const a of b.addons) {
    const saved = s.addons.find((sa) => sa.id === a.def.id);
    if (a.integrity && saved?.hp != null) set(a.integrity, saved.hp);
  }
  if (b.trailer && s.trailer) {
    set(b.trailer.armor, s.trailer.armor);
    b.trailer.bays.forEach((bay, i) => {
      const saved = s.trailer!.bays[i];
      if (!bay || !saved) return;
      if (saved.hp !== null && bay.def.kind !== 'pod') set(bay.integrity, saved.hp);
      const full = moduleLoads(bay.def);
      if (saved.loads !== null && full !== null) bay.loads = Math.max(0, Math.min(full, saved.loads));
    });
  }
  b.vx = speedLimits(b).cruise;
  return b;
}

/** The node the run is at, or null at the start. */
export function currentNode(run: RunState): MapNode | null {
  return run.at ? (nodeAt(run.map, run.at) ?? null) : null;
}

/**
 * The battle the run is fighting: the battle node it's at, or (before any node is chosen, e.g. a
 * bare `newRun` in tests) the run's opening battle.
 */
export function currentBattle(run: RunState): BattleIntel {
  const intel = currentNode(run)?.battle;
  if (intel) return intel;
  const first = reachable(run.map, null)[0]!;
  return nodeAt(run.map, first)!.battle!;
}

/** The biome of the sector the run is in. */
export function currentBiome(run: RunState): BiomeId {
  return run.map.sectors[run.at?.sector ?? 0]!.biome;
}

/**
 * Moves the run onto a node it can reach and opens it: a battle to fight, or a depot (with any
 * supply-cache actions added). Returns the run unchanged if the node isn't reachable from here.
 */
export function enterMapNode(run: RunState, pos: MapPos): RunState {
  if (!reachable(run.map, run.at).some((p) => samePos(p, pos))) return run;
  const node = nodeAt(run.map, pos)!;
  const moved = { ...run, at: pos, path: [...run.path, pos], next: node.kind };
  if (node.kind === 'battle') return { ...moved, depot: null };
  if (node.kind === 'event') return { ...moved, depot: null, lastEvent: null };
  const depot = openDepot(run, run.behemoth, depotKey(pos));
  return { ...moved, cache: 0, depot: { ...depot, actions: depot.actions + run.cache, total: depot.total + run.cache } };
}

export function battleSeed(run: RunState): number {
  return currentBattle(run).seed;
}

/**
 * What the run's battle is fought over (SPEC §4.6 biome × §3.1 approach): its sector's biome and its
 * node's approach. `override` (practice URL params) fixes either one.
 */
export function battleRecipe(run: RunState, override: { biome?: BiomeId; approach?: ApproachId | null } = {}): TerrainRecipe {
  return { biome: override.biome ?? currentBiome(run), approach: override.approach !== undefined ? override.approach : currentBattle(run).approach };
}

/** A recipe as the HUD names it: the biome, then the approach (if any) on its own line. */
export function recipeName(r: TerrainRecipe): string {
  return r.approach ? `${BIOMES[r.biome].name}\n${APPROACHES[r.approach].name}` : BIOMES[r.biome].name;
}

/** The battle's condition (SPEC §4.6); `override` (a practice URL param) replaces it, null for clear. */
export function battleCondition(run: RunState, override?: ConditionId | null): ConditionId | null {
  return override !== undefined ? override : currentBattle(run).condition;
}

/** The run's battle's threat (sizes its defenders and alert waves). */
export function battleThreat(run: RunState): number {
  return currentBattle(run).threat;
}

/** What the battle's enemy fields: its threat and doctrine (SPEC §7.2), shaded by the ground it's fought on. */
export function battleEnemy(run: RunState, recipe: TerrainRecipe = battleRecipe(run)): Forces {
  const b = currentBattle(run);
  return battleForces(b.threat, b.doctrine, recipe.biome, recipe.approach);
}

/**
 * The battle's mode and strength (SPEC §4.4), which set its objective; `mode` overrides it (practice).
 * A Decapitation objective's fortress holds a command post (SPEC §3).
 */
export function battleObjective(run: RunState, mode?: BattleModeId): ObjectiveSpec {
  const b = currentBattle(run);
  const m = mode ?? b.mode;
  const command = isObjectiveBattle(run) && m === 'breach' && DIRECTIVES[run.directive].goal.kind === 'command';
  return { mode: m, strength: b.strength, ...(command ? { command } : {}) };
}

/** Whether the run's battle is a sector's objective (the Directive's battle, SPEC §3). */
export function isObjectiveBattle(run: RunState): boolean {
  return currentBattle(run).strength === 'objective';
}

/** The battle's length (to the extraction line): a Directive may stretch its objective battles. */
export function battleLength(run: RunState): number {
  return RUN.battleLength * (isObjectiveBattle(run) ? DIRECTIVES[run.directive].length : 1);
}

/** How fast the battle's alert clock runs: a Directive may hurry its objective battles. */
export function battleAlertPace(run: RunState): number {
  return isObjectiveBattle(run) ? DIRECTIVES[run.directive].alertPace : 1;
}

/**
 * A Breakthrough objective's par time (seconds): the battle's length at the chassis' rated cruise,
 * times the Directive's slack; null when the battle has none.
 */
export function battlePar(run: RunState, length: number = battleLength(run)): number | null {
  return isObjectiveBattle(run) ? parFor(run.directive, run.behemoth.chassis, length) : null;
}

/** A Directive's par for an objective battle of `length` (default: its own objective length); null without one. */
export function parFor(directive: DirectiveId, chassis: ChassisId, length: number = RUN.battleLength * DIRECTIVES[directive].length): number | null {
  const goal = DIRECTIVES[directive].goal;
  return goal.kind === 'par' ? Math.round((length / CHASSIS[chassis].speed.cruise) * goal.slack) : null;
}

/** Targets a share goal needs destroyed out of `total` (rounded up, at least one). */
export function requiredTargets(share: number, total: number): number {
  return Math.max(1, Math.ceil(share * total - 1e-9));
}

/**
 * Whether a sector's objective battle was taken, by the Directive's rule (SPEC §3). Called when the
 * Behemoth extracts. `time`: seconds to extraction; `par`: the battle's par (Breakthrough).
 */
export function objectiveTakenBy(def: DirectiveDef, o: ObjectiveState, time: number, par: number | null): boolean {
  const goal = def.goal;
  switch (goal.kind) {
    case 'command':
      // A fortress with no room for the post (none so far) falls back on every gun.
      return o.command ? o.command.state === 'destroyed' : objectiveComplete(o);
    case 'share':
      return o.total > 0 && o.destroyed >= requiredTargets(goal.share, o.total);
    case 'par':
      return par === null || time <= par;
  }
}

/** The Directive's ask for a sector's objective battle, for the map and the banners. */
export function directiveAsk(directive: DirectiveId, chassis: ChassisId, par: number | null = parFor(directive, chassis)): string {
  const def = DIRECTIVES[directive];
  const goal = def.goal;
  switch (goal.kind) {
    case 'command':
      return 'Destroy the command post';
    case 'share': {
      const mode = MODES[def.mode];
      const total = mode.convoy?.haulers.objective ?? mode.fortress?.guns.objective ?? 0;
      return `Stop ${requiredTargets(goal.share, total)} of ${total} ${MODES[def.mode].target?.[1] ?? 'targets'}`;
    }
    case 'par':
      return par === null ? 'Break through' : `Extract within ${clock(par)}`;
  }
}

/** Seconds as m:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Folds a battle won (the Behemoth reached the extraction line) into the run. */
export function completeBattle(run: RunState, w: World): RunState {
  const behemoth = snapshotBehemoth(w.behemoth);
  const intel = currentBattle(run);
  const o = w.objective;
  const time = w.extractedAt ?? w.time;
  // A sector's objective battle: taken or missed, by the Directive's rule (SPEC §3).
  const length = w.exitX - START_X;
  const taken = isObjectiveBattle(run) ? objectiveTakenBy(DIRECTIVES[run.directive], o, time, battlePar(run, length)) : undefined;
  const report: BattleReport = {
    battle: run.battle + 1,
    kills: w.stats.kills,
    salvage: w.stats.salvage,
    // The node's reward for extracting, plus the objective's share for each target destroyed.
    bonus: intel.salvage + objectiveBonus(o),
    ...(o.total > 0 ? { objective: { mode: o.mode, destroyed: o.destroyed, total: o.total } } : {}),
    ...(taken !== undefined ? { taken } : {}),
    time,
  };
  const final = !!run.at && isFinalNode(run.map, run.at);
  return {
    ...run,
    battle: run.battle + 1,
    // The last sector's objective decides the Directive; missing an earlier one only costs its reward.
    next: final ? (taken === false ? 'failed' : 'won') : 'map',
    objectives: taken !== undefined ? [...run.objectives, taken] : run.objectives,
    salvage: run.salvage + report.salvage + report.bonus,
    kills: run.kills + report.kills,
    earned: run.earned + report.salvage + report.bonus,
    time: run.time + time,
    cache: run.cache + (intel.cache ? 1 : 0) + (taken && !final ? DIRECTIVE.sectorReward : 0),
    behemoth,
    lastBattle: report,
    depot: null,
  };
}

export function leaveDepot(run: RunState): RunState {
  return { ...run, next: 'map', depot: null };
}

/** Where a saved run picks up, for the title screen. */
export function runWhere(run: RunState): string {
  const sector = `sector ${(run.at?.sector ?? 0) + 1}`;
  switch (run.next) {
    case 'battle':
      return `battle ${run.battle + 1}, ${sector}`;
    case 'depot':
      return `at a depot, ${sector}`;
    case 'event':
      return `at an event, ${sector}`;
    case 'won':
      return 'Directive complete';
    case 'failed':
      return 'Directive failed';
    default:
      return `on the map, ${sector}`;
  }
}

// ── The run summary (SPEC §5.1, §10) ─────────────────────────────────────────────────────────────

/** How a run ended: the Directive complete, failed (the Behemoth survived), or the reactor gone. */
export type RunOutcome = 'won' | 'failed' | 'destroyed';

export interface RunSummary {
  outcome: RunOutcome;
  seed: number;
  callsign: string;
  directive: DirectiveId;
  /** Sectors in the run, and how far it got (1-based). */
  sectors: number;
  reached: number;
  /** Each sector's biome, and its objective's result so far (taken, missed). */
  biomes: BiomeId[];
  objectives: boolean[];
  battles: number;
  kills: number;
  /** Salvage earned over the run; seconds in battle. */
  earned: number;
  time: number;
  /** The final blast (a destroyed run): units it took out, the biggest of them, and any last stand. */
  blast: { kills: number; best: EnemyId | null; stand: { time: number; waves: number } | null } | null;
}

/** What the reactor's last battle adds to a destroyed run's summary. */
export interface FinalBattle {
  stats: BattleStats;
  time: number;
  stand: { time: number; wave: number } | null;
}

/**
 * The run summary. A run over without a death (`won`, `failed`) is summed up from its state alone;
 * a destroyed run also counts the battle the reactor went up in (`final`).
 */
export function summarizeRun(run: RunState, final: FinalBattle | null = null): RunSummary {
  const outcome: RunOutcome = final ? 'destroyed' : run.next === 'won' ? 'won' : 'failed';
  return {
    outcome,
    seed: run.seed,
    callsign: run.callsign,
    directive: run.directive,
    sectors: run.map.sectors.length,
    reached: (run.at?.sector ?? 0) + 1,
    biomes: run.map.sectors.map((s) => s.biome),
    objectives: run.objectives,
    battles: run.battle,
    kills: run.kills + (final?.stats.kills ?? 0),
    earned: run.earned + (final?.stats.salvage ?? 0),
    time: run.time + (final?.time ?? 0),
    blast: final
      ? {
          kills: final.stats.blastKills,
          best: final.stats.blastBest,
          stand: final.stand ? { time: final.stand.time, waves: final.stand.wave } : null,
        }
      : null,
  };
}
