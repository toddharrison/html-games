import { ADDONS, trailerOf, type AddonDef, type AddonId, type TrailerAddon } from '../content/addons';
import { ARMOR_ARCS, CHASSIS, HARDPOINT_SIZES, type ChassisDef, type CoreComponent, type HardpointSlotDef } from '../content/chassis';
import { DEPOT_ADDONS, DEPOT_GRADES, DEPOT_MODULES, DEPOT_TRACKS, DEPOT_WEAPONS } from '../content/depot';
import { moduleLoads, TRAILER_MODULES, type ModuleId } from '../content/trailer';
import { DEPOT } from '../content/tuning';
import { armorArcsOf, trackMax, TRACKS, type Gen, type PartKind, type TrackId, type UpgradeGen } from '../content/upgrades';
import { shellsOf, WEAPONS, type Binding, type ShellType, type WeaponId } from '../content/weapons';
import {
  allowedBindings,
  bayId,
  bayIndex,
  defaultBindingFor,
  hardpointSlots,
  loadMass,
  turretRings,
  massCapacity,
  speedLimits,
  usesChannel,
} from './behemoth';
import { hashSeed, Rng } from './rng';
import {
  restoreBehemoth,
  type AddonSnapshot,
  type BaySnapshot,
  type BehemothSnapshot,
  type HardpointSnapshot,
  type RunState,
} from './run';
import { CORE_COMPONENTS, fitAddon, fitChassis } from './upgrades';

/**
 * The depot (SPEC §8.2): a limited number of actions, each costing salvage. Works on the run's
 * Behemoth snapshot, so it's pure data in, data out. The stock is seeded per depot, so reloading
 * a save shows the same goods.
 */

export interface DepotStockItem {
  weapon: WeaponId;
  sold: boolean;
}

export interface DepotAddonItem {
  addon: AddonId;
  sold: boolean;
}

export interface DepotModuleItem {
  module: ModuleId;
  sold: boolean;
}

/** A higher-grade core component for sale (SPEC §5.6). */
export interface DepotGradeItem {
  component: CoreComponent;
  gen: UpgradeGen;
  sold: boolean;
}

export interface DepotState {
  /** Actions left. */
  actions: number;
  /** Actions the depot opened with (more than `DEPOT.actions` with supply caches). */
  total: number;
  stock: DepotStockItem[];
  addons: DepotAddonItem[];
  /** Trailer modules: offered when the Behemoth has a trailer, or one is for sale here. */
  modules: DepotModuleItem[];
  /** Core components above the grade fitted. */
  grades: DepotGradeItem[];
}

export type DepotAction =
  /** Restore one core component or hardpoint (by slot id) to full integrity (treads partway, if that's all the salvage covers). */
  | { kind: 'repair'; component: CoreComponent | string }
  /** Re-plate all four armor zones (partway, if that's all the salvage covers). */
  | { kind: 'repairArmor' }
  /** Refill a munitions weapon's ammo. */
  | { kind: 'rearm'; slot: string }
  /** Install a weapon from the stock (replacing whatever is in the slot). */
  | { kind: 'install'; slot: string; stock: number }
  /** Take a weapon off, leaving the slot empty. Takes no action; pays back its resale value. */
  | { kind: 'remove'; slot: string }
  /** Bolt on an add-on from the stock. */
  | { kind: 'installAddon'; stock: number }
  /** Take an add-on off (a mount's weapon goes with it; the trailer's modules with it). Takes no action; pays back their resale value. */
  | { kind: 'removeAddon'; addon: AddonId }
  /** Put a trailer module from the stock in a bay (replacing whatever is there). */
  | { kind: 'installModule'; stock: number; bay: number }
  /** Take a module out of its bay. Takes no action; pays back its resale value. */
  | { kind: 'removeModule'; bay: number }
  /** Set what fires a hardpoint (SPEC §5.2). Free, and takes no action. */
  | { kind: 'bind'; slot: string; binding: Binding }
  /** Load a main gun with a shell it takes (SPEC §6.2). Free, and takes no action. */
  | { kind: 'shell'; slot: string; shell: ShellType }
  /** Replace a core component with a higher grade from the stock; the old one sells back (SPEC §5.6). */
  | { kind: 'installGrade'; stock: number }
  /** Buy the next level of a mod track on a part (a core component, hardpoint slot, or `armorPart(arc)`). */
  | { kind: 'mod'; part: string; track: TrackId };

/**
 * `salvage` is the net cost: negative when the action pays out (taking parts off). `partial` is
 * set when a tread or armor repair can't be paid for in full: the integrity points the salvage
 * left does buy (SPEC §8.2).
 */
export type Quote = { ok: true; salvage: number; actions: number; partial?: number } | { ok: false; reason: string };

/** Draws up to `count` distinct ids from a weighted pool. */
function draw<T>(rng: Rng, pool: T[], count: number, weight: (id: T) => number): T[] {
  const left = pool.slice();
  const out: T[] = [];
  for (let i = 0; i < count && left.length > 0; i++) {
    const pick = rng.weighted(left, weight)!;
    left.splice(left.indexOf(pick), 1);
    out.push(pick);
  }
  return out;
}

/** The multiplier a sector's depots put on the stock weight of goods of a generation (`DEPOT.genOdds`). */
export function genOdds(sector: number, gen: Gen = 1): number {
  const rows = DEPOT.genOdds;
  return rows[Math.max(0, Math.min(rows.length - 1, Math.floor(sector)))]![gen - 1]!;
}

/**
 * A depot in sector `sector` (0 = the first), with its stock seeded by `key` (a map node's
 * `depotKey`; by default the battle count).
 * - **Weapons:** always at least one of each hardpoint size (user's call, Nov 2026: a depot with no
 *   L gun for sale was a wasted stop), and for that one, a weapon the Behemoth `s` doesn't already
 *   carry when there is one. Listed biggest first.
 * - **Generations:** what's on offer gets better as the run goes on: every item's stock weight is
 *   multiplied by the sector's odds for its generation (`genOdds`), core components' grades included.
 * - Add-ons the Behemoth already has, or can't take, aren't offered, nor is a trailer no bigger than
 *   the one in tow. Add-ons, modules, and grades are each drawn on a stream of their own, so the
 *   weapons on sale don't depend on them.
 */
export function openDepot(run: Pick<RunState, 'seed' | 'battle'>, s?: BehemothSnapshot, key: number = run.battle, sector = 0): DepotState {
  const odds = (gen?: Gen) => genOdds(sector, gen);
  const rng = new Rng(hashSeed(run.seed, 0xde90, key));
  const weaponWeight = (id: WeaponId) => DEPOT_WEAPONS[id]!.weight * odds(DEPOT_WEAPONS[id]!.gen);
  const sold = (Object.keys(DEPOT_WEAPONS) as WeaponId[]).filter((id) => weaponWeight(id) > 0);
  const count = rng.int(DEPOT.stock[0], DEPOT.stock[1]);
  const weapons: WeaponId[] = [];
  for (const size of HARDPOINT_SIZES) {
    const sized = sold.filter((id) => WEAPONS[id].size === size);
    const fresh = sized.filter((id) => !s || !onBoard(s, id));
    const pick = rng.weighted(fresh.length > 0 ? fresh : sized, weaponWeight);
    if (pick) weapons.push(pick);
  }
  weapons.push(...draw(rng, sold.filter((id) => !weapons.includes(id)), count - weapons.length, weaponWeight));
  const sizeOrder = (id: WeaponId) => HARDPOINT_SIZES.indexOf(WEAPONS[id].size!);
  weapons.sort((a, b) => sizeOrder(a) - sizeOrder(b));

  const arng = new Rng(hashSeed(run.seed, 0xadd0, key));
  const chassis = s ? CHASSIS[s.chassis] : null;
  const towed = s ? trailerDef(s) : null;
  const addonWeight = (id: AddonId) => DEPOT_ADDONS[id]!.weight * odds(DEPOT_ADDONS[id]!.gen);
  const offered = (Object.keys(DEPOT_ADDONS) as AddonId[]).filter((id) => {
    if (addonWeight(id) <= 0) return false;
    if (!s) return true;
    const def = ADDONS[id];
    if (def.kind === 'trailer' && towed && def.bays.length <= towed.bays.length) return false;
    return chassis!.addonMounts[id] !== undefined && !s.addons.some((a) => a.id === id);
  });
  const addons = draw(arng, offered, arng.int(DEPOT.addonStock[0], DEPOT.addonStock[1]), addonWeight);
  // Modules only make sense with a trailer to put them in; they're on a stream of their own too.
  const mrng = new Rng(hashSeed(run.seed, 0x70d5, key));
  const trailer = !s || towed !== null || trailerOf(addons) !== null;
  const moduleWeight = (id: ModuleId) => DEPOT_MODULES[id].weight * odds(DEPOT_MODULES[id].gen);
  const modules = trailer
    ? draw(mrng, (Object.keys(DEPOT_MODULES) as ModuleId[]).filter((id) => moduleWeight(id) > 0), mrng.int(DEPOT.moduleStock[0], DEPOT.moduleStock[1]), moduleWeight)
    : [];
  // Core components above the grade fitted; their own stream too.
  const grng = new Rng(hashSeed(run.seed, 0x9e4d, key));
  const gens: UpgradeGen[] = [2, 3];
  const pool = CORE_COMPONENTS.flatMap((component) =>
    gens.filter((gen) => gen > (s?.grades[component] ?? 1) && odds(gen) > 0).map((gen) => ({ component, gen })),
  );
  const grades = draw(grng, pool, grng.int(DEPOT.gradeStock[0], DEPOT.gradeStock[1]), (g) => DEPOT_GRADES[g.component][g.gen].weight * odds(g.gen));
  return {
    actions: DEPOT.actions,
    total: DEPOT.actions,
    stock: weapons.map((weapon) => ({ weapon, sold: false })),
    addons: addons.map((addon) => ({ addon, sold: false })),
    modules: modules.map((module) => ({ module, sold: false })),
    grades: grades.map((g) => ({ ...g, sold: false })),
  };
}

/** The snapshot's chassis with its upgrades applied: integrity maxima and ratings come from here. */
export function fittedChassis(s: BehemothSnapshot): ChassisDef {
  return fitChassis(CHASSIS[s.chassis], { grades: s.grades, mods: s.mods });
}

/** A core component's integrity at full, on a fitted chassis. */
export function coreMax(c: ChassisDef, component: CoreComponent): number {
  switch (component) {
    case 'treads':
      return c.treadHp;
    case 'sensors':
      return c.sensorsHp;
    case 'reactor':
      return c.reactor.hp;
    case 'fireControl':
      return c.fireControl.hp;
    case 'magazine':
      return c.magazine.hp;
  }
}

function isCore(id: string): id is CoreComponent {
  return (CORE_COMPONENTS as string[]).includes(id);
}

/** What kind of part an id is, for mods (SPEC §5.6); null when nothing can be modded there. */
export function partKind(s: BehemothSnapshot, id: string): PartKind | null {
  if (isCore(id)) return id === 'reactor' || id === 'treads' || id === 'fireControl' ? id : 'core';
  if (armorArcsOf(id).length > 0) return 'armor';
  // An add-on tread set takes what the chassis' own treads take.
  const addon = addonPart(s, id);
  if (addon && ADDONS[addon.id].kind === 'treads') return 'treads';
  const slot = slotDef(s, id);
  if (!slot || slot.position === 'trailer') return null;
  if (!slot.ring) return 'mount';
  const rings = turretRings(CHASSIS[s.chassis], s.addons.map((a) => a.id));
  return rings.some((t) => t.slot === id) ? 'ring' : 'coax';
}

/** The mod tracks a part can take, in the order the depot lists them. */
export function tracksOf(s: BehemothSnapshot, id: string): TrackId[] {
  const kind = partKind(s, id);
  return kind ? (Object.keys(TRACKS) as TrackId[]).filter((t) => TRACKS[t].on.includes(kind)) : [];
}

/** Salvage spent on a part's mods so far. */
function modsSpent(s: BehemothSnapshot, id: string): number {
  const tracks = s.mods[id] ?? {};
  return (Object.keys(tracks) as TrackId[]).reduce((sum, t) => sum + DEPOT_TRACKS[t].slice(0, tracks[t] ?? 0).reduce((a, b) => a + b, 0), 0);
}

/** Resale value of a core component (its grade's price and its mods; Gen 1 isn't sold anywhere). */
function coreResale(s: BehemothSnapshot, component: CoreComponent): number {
  const gen = s.grades[component];
  return resale(s, component, (gen ? DEPOT_GRADES[component][gen].price : 0) + modsSpent(s, component));
}

/** Every hardpoint slot the Behemoth has, mounts' and trailer pods included. */
export function slotsOf(s: BehemothSnapshot): HardpointSlotDef[] {
  return hardpointSlots(
    fittedChassis(s),
    s.addons.map((a) => a.id),
    s.trailer?.bays.map((b) => b?.module ?? null) ?? [],
  );
}

/** The module in a trailer bay (by component id), if any. */
export function bayPart(s: BehemothSnapshot, id: string): BaySnapshot | null {
  const i = bayIndex(id);
  return i === null ? null : (s.trailer?.bays[i] ?? null);
}

/** The trailer in tow (its frame's add-on), if there is one. */
export function trailerDef(s: BehemothSnapshot): TrailerAddon | null {
  return s.trailer ? trailerOf(s.addons.map((a) => a.id)) : null;
}

/** An add-on as fitted to this Behemoth: a tread set's integrity and capacity include its upgrades. */
export function addonDef(s: BehemothSnapshot, id: AddonId): AddonDef {
  return fitAddon(ADDONS[id], { grades: s.grades, mods: s.mods });
}

function slotDef(s: BehemothSnapshot, id: string): HardpointSlotDef | undefined {
  return slotsOf(s).find((h) => h.id === id);
}

function addonPart(s: BehemothSnapshot, id: string): AddonSnapshot | undefined {
  return s.addons.find((a) => a.id === id);
}

function hardpoint(s: BehemothSnapshot, id: string): HardpointSnapshot | undefined {
  return s.hardpoints.find((h) => h.slot === id);
}

/** Integrity points missing from a core component or hardpoint, and its maximum. */
export function damageOf(s: BehemothSnapshot, component: string): { missing: number; max: number } | null {
  if (isCore(component)) {
    const max = coreMax(fittedChassis(s), component);
    return { missing: Math.max(0, max - s[component]), max };
  }
  const addon = addonPart(s, component);
  const def = addon && addonDef(s, addon.id);
  if (addon && def && def.kind !== 'mount' && addon.hp !== null) return { missing: Math.max(0, def.hp - addon.hp), max: def.hp };
  const bay = bayPart(s, component);
  if (bay && bay.hp !== null) {
    const max = TRAILER_MODULES[bay.module].hp;
    return { missing: Math.max(0, max - bay.hp), max };
  }
  const slot = slotDef(s, component);
  const h = hardpoint(s, component);
  if (!slot || !h) return null;
  return { missing: Math.max(0, slot.hp - h.hp), max: slot.hp };
}

/** Armor points missing over every zone and the trailer's armor (they re-plate together). */
export function armorMissing(s: BehemothSnapshot): number {
  const max = fittedChassis(s).armor;
  const t = trailerDef(s);
  const trailer = t && s.trailer ? Math.max(0, t.armor - s.trailer.armor) : 0;
  return ARMOR_ARCS.reduce((sum, arc) => sum + Math.max(0, max[arc] - s.armor[arc]), trailer);
}

/**
 * Rounds a munitions weapon is short of a full load (or, by its bay id, loads a bunker is short or
 * drones a drone bay has lost); null for weapons and modules without ammo.
 */
export function ammoMissing(s: BehemothSnapshot, slot: string): number | null {
  const bay = bayPart(s, slot);
  const stock = bay && moduleLoads(TRAILER_MODULES[bay.module]);
  if (bay && stock != null) return Math.max(0, stock - (bay.loads ?? 0));
  const h = hardpoint(s, slot);
  const full = h?.weapon ? WEAPONS[h.weapon].ammo : undefined;
  if (!h || full === undefined || h.ammo === null) return null;
  return Math.max(0, full - h.ammo);
}

/**
 * Whether a weapon fits a slot: hardpoint sizes must match exactly (SPEC §5.2). A pod's weapon is
 * built in, so nothing else goes there. A turret slot can't aim on its own, so it takes only
 * weapons that can go on a trigger (no point defense).
 */
export function fits(s: BehemothSnapshot, slot: string, weapon: WeaponId): boolean {
  const def = slotDef(s, slot);
  const w = WEAPONS[weapon];
  return def !== undefined && def.position !== 'trailer' && w.size === def.size && allowedBindings(w, def).length > 0;
}

/** Whether the Behemoth already carries this weapon on some hardpoint (the depot shows it dimmed). */
export function onBoard(s: BehemothSnapshot, weapon: WeaponId): boolean {
  return s.hardpoints.some((h) => h.weapon === weapon);
}

/** The shell a main gun is loaded with: its choice, or its default. Null for an empty slot or a gun with no choice. */
export function shellOf(s: BehemothSnapshot, slot: string): ShellType | null {
  const h = hardpoint(s, slot);
  if (!h?.weapon) return null;
  return h.shell ?? shellsOf(WEAPONS[h.weapon])[0] ?? null;
}

/** What fires a hardpoint: its binding, or its weapon's default for the slot. Null for an empty slot. */
export function bindingOf(s: BehemothSnapshot, slot: string): Binding | null {
  const h = hardpoint(s, slot);
  const def = slotDef(s, slot);
  if (!h?.weapon || !def) return null;
  return h.binding ?? defaultBindingFor(WEAPONS[h.weapon], def);
}

/** Fire-control channels in use (weapons the player put on Auto) and how many there are. */
export function channelsOf(s: BehemothSnapshot): { used: number; max: number } {
  let used = 0;
  for (const def of slotsOf(s)) {
    const h = hardpoint(s, def.id);
    const binding = bindingOf(s, def.id);
    if (h?.weapon && binding && usesChannel(WEAPONS[h.weapon], def, binding)) used++;
  }
  return { used, max: fittedChassis(s).fireControl.channels };
}

/** Salvage per round when rearming a weapon (a pod's comes from its module). */
function roundPrice(weapon: WeaponId): number {
  const sold = DEPOT_WEAPONS[weapon]?.roundPrice;
  if (sold !== undefined) return sold;
  const pod = Object.values(TRAILER_MODULES).find((m) => m.kind === 'pod' && m.weapon === weapon);
  return pod ? (DEPOT_MODULES[pod.id].roundPrice ?? 0) : 0;
}

/**
 * Salvage paid back for a part bought at `price` (SPEC §8.2): `DEPOT.resale` of it when whole,
 * scaled by the integrity the part (by component id) has left, so a wreck is worth nothing.
 */
function resale(s: BehemothSnapshot, id: string, price: number | undefined): number {
  const d = damageOf(s, id);
  const condition = d && d.max > 0 ? 1 - d.missing / d.max : 1;
  return Math.floor((price ?? 0) * DEPOT.resale * condition);
}

/** Resale value of the weapon in a slot (0 for an empty slot or one depots don't sell, like a pod's launcher). */
function weaponResale(s: BehemothSnapshot, slot: string): number {
  const weapon = hardpoint(s, slot)?.weapon;
  return weapon ? resale(s, slot, DEPOT_WEAPONS[weapon]?.price) : 0;
}

/** Resale value of the module in a trailer bay (a pod's launcher comes with it; a pod's condition is its hardpoint's). */
function moduleResale(s: BehemothSnapshot, bay: number): number {
  const module = s.trailer?.bays[bay]?.module;
  return module ? resale(s, bayId(bay), DEPOT_MODULES[module].price) : 0;
}

/**
 * Resale value of an add-on and everything that comes off with it (a mount's weapon, the trailer's
 * modules). A mount has no integrity of its own: its condition is its hardpoint's.
 */
function addonResale(s: BehemothSnapshot, addon: AddonId): number {
  if (!addonPart(s, addon)) return 0;
  const slot = CHASSIS[s.chassis].addonMounts[addon]?.hardpoint;
  // A mount's mods go with it (they're filed under its slot, which has the add-on's id), and so do a tread set's.
  const weapon = slot ? weaponResale(s, slot.id) : 0;
  const modules = ADDONS[addon].kind === 'trailer' ? (s.trailer?.bays.reduce((sum, _, i) => sum + moduleResale(s, i), 0) ?? 0) : 0;
  return resale(s, addon, (DEPOT_ADDONS[addon]?.price ?? 0) + modsSpent(s, addon)) + weapon + modules;
}

export interface Load {
  /** Tons installed, and what the treads are rated for (SPEC §5.3). */
  mass: number;
  capacity: number;
  /** Cruise speed with this load and the current tread integrity. */
  cruise: number;
}

/**
 * The Behemoth's load and the cruise speed it gives, worked out exactly as in battle. To preview
 * an action, pass the snapshot `applyAction` returns.
 */
export function loadOf(s: BehemothSnapshot): Load {
  const b = restoreBehemoth(s, 0, 0);
  return { mass: loadMass(b), capacity: massCapacity(b), cruise: speedLimits(b).cruise };
}

/** What an action would cost, or why it can't be done. */
export function quote(run: RunState, action: DepotAction): Quote {
  const depot = run.depot;
  if (!depot) return { ok: false, reason: 'No depot' };
  const s = run.behemoth;
  const no = (reason: string): Quote => ({ ok: false, reason });
  // Taking parts off pays out and takes no action, even with none left.
  const payout = (back: number): Quote => ({ ok: true, salvage: back > 0 ? -back : 0, actions: 0 });
  let salvage: number;
  /** Salvage per point, for the repairs that can be done partway. */
  let partialRate: number | null = null;

  switch (action.kind) {
    case 'bind': {
      const h = hardpoint(s, action.slot);
      const def = slotDef(s, action.slot);
      if (!h?.weapon || !def) return no('Empty');
      const w = WEAPONS[h.weapon];
      if (!allowedBindings(w, def).includes(action.binding)) return no('Not allowed');
      if (bindingOf(s, action.slot) === action.binding) return no('Set');
      const ch = channelsOf(s);
      if (usesChannel(w, def, action.binding) && ch.used >= ch.max) return no('No channel');
      return { ok: true, salvage: 0, actions: 0 };
    }
    case 'shell': {
      const h = hardpoint(s, action.slot);
      if (!h?.weapon) return no('Empty');
      if (!shellsOf(WEAPONS[h.weapon]).includes(action.shell)) return no('Not allowed');
      if (shellOf(s, action.slot) === action.shell) return no('Set');
      return { ok: true, salvage: 0, actions: 0 };
    }
    case 'remove': {
      const h = hardpoint(s, action.slot);
      if (!h?.weapon) return no('Empty');
      if (slotDef(s, action.slot)?.position === 'trailer') return no('Built in');
      return payout(weaponResale(s, action.slot));
    }
    case 'removeModule': {
      if (!s.trailer?.bays[action.bay]) return no('Empty');
      return payout(moduleResale(s, action.bay));
    }
    case 'installModule': {
      const item = depot.modules[action.stock];
      if (!item || item.sold) return no('Sold');
      const t = trailerDef(s);
      if (!t) return no('No trailer');
      if (action.bay < 0 || action.bay >= t.bays.length) return no('No such bay');
      salvage = DEPOT_MODULES[item.module].price - moduleResale(s, action.bay);
      break;
    }
    case 'removeAddon': {
      if (!addonPart(s, action.addon)) return no('Not fitted');
      return payout(addonResale(s, action.addon));
    }
    case 'installAddon': {
      const item = depot.addons[action.stock];
      if (!item || item.sold) return no('Sold');
      if (!CHASSIS[s.chassis].addonMounts[item.addon]) return no("Doesn't fit");
      if (addonPart(s, item.addon)) return no('Fitted');
      salvage = DEPOT_ADDONS[item.addon]?.price ?? 0;
      // A bigger trailer takes over from the one in tow: its modules move across, and the old
      // frame's resale comes off the price.
      const def = ADDONS[item.addon];
      const towed = trailerDef(s);
      if (def.kind === 'trailer' && towed) {
        if (def.bays.length <= towed.bays.length) return no('No bigger');
        salvage -= resale(s, towed.id, DEPOT_ADDONS[towed.id]?.price);
      }
      break;
    }
    case 'repair': {
      const d = damageOf(s, action.component);
      if (!d) return no('No such part');
      const h = hardpoint(s, action.component);
      if (h && !h.weapon) return no('Empty');
      if (d.missing <= 0) return no('Undamaged');
      const addon = addonPart(s, action.component);
      const kind = addon && ADDONS[addon.id].kind;
      const rate =
        h || bayPart(s, action.component)
          ? DEPOT.perHp.hardpoint
          : addon
            ? DEPOT.perHp[kind === 'treads' ? 'treads' : kind === 'trailer' ? 'frame' : kind === 'panels' ? 'panels' : 'plow']
            : DEPOT.perHp[action.component as CoreComponent];
      const destroyed = h !== undefined && h.hp <= 0;
      salvage = DEPOT.repairBase + Math.ceil(d.missing * rate) + (destroyed ? DEPOT.reactivate : 0);
      if (action.component === 'treads' || kind === 'treads') partialRate = rate;
      break;
    }
    case 'repairArmor': {
      const missing = armorMissing(s);
      if (missing <= 0) return no('Undamaged');
      salvage = DEPOT.repairBase + Math.ceil(missing * DEPOT.perHp.armor);
      partialRate = DEPOT.perHp.armor;
      break;
    }
    case 'rearm': {
      const missing = ammoMissing(s, action.slot);
      if (missing === null) return no('No ammo');
      if (missing <= 0) return no('Full');
      const bay = bayPart(s, action.slot);
      const each = bay && !hardpoint(s, action.slot) ? (DEPOT_MODULES[bay.module].loadPrice ?? 0) : roundPrice(hardpoint(s, action.slot)!.weapon!);
      salvage = DEPOT.rearmBase + Math.ceil(missing * each);
      break;
    }
    case 'installGrade': {
      const item = depot.grades[action.stock];
      if (!item || item.sold) return no('Sold');
      const fitted = s.grades[item.component] ?? 1;
      if (item.gen <= fitted) return no(`Gen ${fitted} fitted`);
      salvage = DEPOT_GRADES[item.component][item.gen].price - coreResale(s, item.component);
      break;
    }
    case 'mod': {
      if (!tracksOf(s, action.part).includes(action.track)) return no("Doesn't apply");
      const level = s.mods[action.part]?.[action.track] ?? 0;
      if (level >= trackMax(action.track, DEPOT.maxModLevel)) return no('Maxed');
      // A mount's own traverse: nothing to speed up while it carries a weapon that doesn't turn.
      const h = hardpoint(s, action.part);
      if (action.track === 'traverse' && partKind(s, action.part) === 'mount' && h?.weapon && WEAPONS[h.weapon].traverseDegPerSec <= 0) return no('Fixed weapon');
      salvage = DEPOT_TRACKS[action.track][level]!;
      break;
    }
    case 'install': {
      const item = depot.stock[action.stock];
      if (!item || item.sold) return no('Sold');
      if (!slotDef(s, action.slot)) return no('No such slot');
      if (!fits(s, action.slot, item.weapon)) return no('Wrong size');
      // Swapping a weapon for its twin buys nothing a repair and rearm don't, for far more.
      if (hardpoint(s, action.slot)?.weapon === item.weapon) return no('Fitted');
      salvage = (DEPOT_WEAPONS[item.weapon]?.price ?? 0) - weaponResale(s, action.slot);
      break;
    }
  }
  if (depot.actions < 1) return no('No actions left');
  if (run.salvage < salvage) {
    // Treads and armor can be patched partway with whatever salvage is left.
    const points = partialRate === null ? 0 : Math.floor((run.salvage - DEPOT.repairBase) / partialRate);
    if (points < 1) return no('Not enough salvage');
    return { ok: true, salvage: DEPOT.repairBase + Math.ceil(points * partialRate!), actions: 1, partial: points };
  }
  return { ok: true, salvage, actions: 1 };
}

/** Carries out an action; returns the run unchanged if it can't be done. */
export function applyAction(run: RunState, action: DepotAction): RunState {
  const q = quote(run, action);
  if (!q.ok || !run.depot) return run;
  const s: BehemothSnapshot = structuredClone(run.behemoth);
  const depot: DepotState = structuredClone(run.depot);
  depot.actions -= q.actions;
  const c = fittedChassis(s);

  switch (action.kind) {
    case 'bind': {
      const h = hardpoint(s, action.slot)!;
      h.binding = action.binding === defaultBindingFor(WEAPONS[h.weapon!], slotDef(s, action.slot)!) ? null : action.binding;
      break;
    }
    case 'shell': {
      const h = hardpoint(s, action.slot)!;
      h.shell = action.shell === shellsOf(WEAPONS[h.weapon!])[0] ? null : action.shell;
      break;
    }
    case 'remove': {
      const h = hardpoint(s, action.slot)!;
      h.weapon = null;
      h.ammo = null;
      h.binding = null;
      h.shell = null;
      break;
    }
    case 'repair': {
      if (q.partial !== undefined) {
        // Only tread sets repair partway.
        if (action.component === 'treads') s.treads = Math.min(c.treadHp, s.treads + q.partial);
        else {
          const part = addonPart(s, action.component)!;
          const def = addonDef(s, part.id);
          if (def.kind !== 'mount') part.hp = Math.min(def.hp, (part.hp ?? 0) + q.partial);
        }
      } else if (action.component === 'treads') s.treads = c.treadHp;
      else if (action.component === 'sensors') s.sensors = c.sensorsHp;
      else if (action.component === 'fireControl') s.fireControl = c.fireControl.hp;
      else if (action.component === 'magazine') s.magazine = c.magazine.hp;
      else if (action.component === 'reactor') s.reactor = c.reactor.hp;
      else if (hardpoint(s, action.component)) hardpoint(s, action.component)!.hp = slotDef(s, action.component)!.hp;
      else if (bayPart(s, action.component)) {
        const bay = bayPart(s, action.component)!;
        bay.hp = TRAILER_MODULES[bay.module].hp;
      } else {
        const part = addonPart(s, action.component)!;
        const def = addonDef(s, part.id);
        part.hp = def.kind === 'mount' ? null : def.hp;
      }
      break;
    }
    case 'installAddon': {
      const item = depot.addons[action.stock]!;
      item.sold = true;
      const def = addonDef(s, item.addon);
      const towed = def.kind === 'trailer' ? trailerDef(s) : null;
      if (def.kind === 'trailer' && towed) {
        // The new frame arrives whole and takes the old one's place; its modules move across, bay for bay.
        const at = s.addons.findIndex((a) => a.id === towed.id);
        s.addons[at] = { id: def.id, hp: def.hp };
        s.trailer = { armor: def.armor, bays: def.bays.map((_, i) => s.trailer?.bays[i] ?? null) };
        break;
      }
      s.addons.push({ id: def.id, hp: def.kind === 'mount' ? null : def.hp });
      const slot = c.addonMounts[def.id]?.hardpoint;
      if (slot) s.hardpoints.push({ slot: slot.id, weapon: null, hp: slot.hp, ammo: null, binding: null, shell: null });
      if (def.kind === 'trailer') s.trailer = { armor: def.armor, bays: def.bays.map(() => null) };
      break;
    }
    case 'removeAddon': {
      s.addons = s.addons.filter((a) => a.id !== action.addon);
      const slot = c.addonMounts[action.addon]?.hardpoint;
      if (slot) s.hardpoints = s.hardpoints.filter((h) => h.slot !== slot.id);
      // Its mods go with it: a mount's are under its slot (the same id), a tread set's under its own.
      delete s.mods[action.addon];
      if (ADDONS[action.addon].kind === 'trailer') {
        s.trailer?.bays.forEach((_, i) => clearBay(s, i));
        s.trailer = null;
      }
      break;
    }
    case 'installModule': {
      const item = depot.modules[action.stock]!;
      item.sold = true;
      const def = TRAILER_MODULES[item.module];
      clearBay(s, action.bay);
      s.trailer!.bays[action.bay] = { module: def.id, hp: def.kind === 'pod' ? null : def.hp, loads: moduleLoads(def) };
      // A pod arrives with its launcher loaded.
      if (def.kind === 'pod') s.hardpoints.push({ slot: bayId(action.bay), weapon: def.weapon, hp: def.hp, ammo: WEAPONS[def.weapon].ammo ?? null, binding: null, shell: null });
      break;
    }
    case 'removeModule':
      clearBay(s, action.bay);
      break;
    case 'repairArmor': {
      // Partway, every zone (and the trailer) gets back the same share of what it's missing.
      const share = q.partial === undefined ? 1 : q.partial / armorMissing(s);
      const plate = (hp: number, max: number) => (share >= 1 ? max : hp + Math.max(0, max - hp) * share);
      for (const arc of ARMOR_ARCS) s.armor[arc] = plate(s.armor[arc], c.armor[arc]);
      const t = trailerDef(s);
      if (t && s.trailer) s.trailer.armor = plate(s.trailer.armor, t.armor);
      break;
    }
    case 'rearm': {
      const bay = bayPart(s, action.slot);
      const full = bay && moduleLoads(TRAILER_MODULES[bay.module]);
      if (bay && full != null) {
        bay.loads = full;
        break;
      }
      const h = hardpoint(s, action.slot)!;
      h.ammo = WEAPONS[h.weapon!].ammo ?? null;
      break;
    }
    case 'install': {
      const item = depot.stock[action.stock]!;
      item.sold = true;
      const h = hardpoint(s, action.slot)!;
      // A new weapon arrives in working order with a full load.
      h.weapon = item.weapon;
      h.hp = slotDef(s, action.slot)!.hp;
      h.ammo = WEAPONS[item.weapon].ammo ?? null;
      h.binding = null;
      h.shell = null;
      break;
    }
    case 'installGrade': {
      const item = depot.grades[action.stock]!;
      item.sold = true;
      // The new part arrives whole; the old one's mods went with it. Add-on tread sets run the
      // treads' grade too: each keeps the share of integrity it had.
      const sets = s.addons.filter((a) => ADDONS[a.id].kind === 'treads' && a.hp !== null).map((a) => ({ a, before: addonDef(s, a.id) }));
      s.grades[item.component] = item.gen;
      delete s.mods[item.component];
      s[item.component] = coreMax(fittedChassis(s), item.component);
      for (const { a, before } of sets) {
        const after = addonDef(s, a.id);
        if (before.kind === 'treads' && after.kind === 'treads' && before.hp > 0) a.hp = (a.hp! * after.hp) / before.hp;
      }
      break;
    }
    case 'mod': {
      const before = partMax(s, c, action.part);
      s.mods[action.part] = { ...s.mods[action.part], [action.track]: (s.mods[action.part]?.[action.track] ?? 0) + 1 };
      // The part keeps the share of integrity it had: a wreck stays a wreck.
      const after = partMax(s, fittedChassis(s), action.part);
      if (before && after && after !== before) scaleHp(s, action.part, after / before);
      break;
    }
  }
  return { ...run, salvage: run.salvage - q.salvage, behemoth: s, depot };
}

/**
 * A part's integrity (or armor) at full on a fitted chassis: core components, hardpoint slots,
 * armor zones, and add-ons with integrity of their own (as `s` has them upgraded).
 */
function partMax(s: BehemothSnapshot, c: ChassisDef, id: string): number | null {
  if (isCore(id)) return coreMax(c, id);
  const addon = addonPart(s, id);
  const def = addon && addonDef(s, addon.id);
  if (def && def.kind !== 'mount') return def.hp;
  // A shared front plate: both halves are the same size, so either gives the ratio.
  const arc = armorArcsOf(id)[0];
  if (arc) return c.armor[arc];
  const slot = c.hardpoints.find((h) => h.id === id) ?? Object.values(c.addonMounts).find((m) => m?.hardpoint?.id === id)?.hardpoint;
  return slot?.hp ?? null;
}

function scaleHp(s: BehemothSnapshot, id: string, k: number): void {
  if (isCore(id)) s[id] *= k;
  for (const arc of armorArcsOf(id)) s.armor[arc] *= k;
  const h = hardpoint(s, id);
  if (h) h.hp *= k;
  const addon = addonPart(s, id);
  if (addon && addon.hp !== null) addon.hp *= k;
}

/** Empties a trailer bay (a pod's hardpoint goes with it). */
function clearBay(s: BehemothSnapshot, bay: number): void {
  if (!s.trailer) return;
  s.trailer.bays[bay] = null;
  s.hardpoints = s.hardpoints.filter((h) => h.slot !== bayId(bay));
}
