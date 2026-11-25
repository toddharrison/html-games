import { ADDONS, trailerOf, type AddonDef, type AddonId, type TrailerAddon } from '../content/addons';
import { ARMOR_ARCS, type ArmorArc, type ChassisDef, type CoreComponent, type HardpointSlotDef, type TurretDef } from '../content/chassis';
import { moduleLoads, TRAILER_MODULES, type ModuleDef, type ModuleId } from '../content/trailer';
import { NO_UPGRADES, type Upgrades } from '../content/upgrades';
import { DEGRADE, DETONATION, FIRE_CONTROL, MAGAZINE, MASS, MOVEMENT, RAM, WADING } from '../content/tuning';
import { defaultBinding, shellsOf, WEAPONS, withShell, type Binding, type ShellType, type StrikeFocus, type WeaponDef } from '../content/weapons';
import type { SimEvent } from './events';
import { approach, boxBounds, clamp, easeToward, orientedBox, rotateToward, wrapAngle, type Box, type Rect } from './math';
import type { Rng } from './rng';
import type { Underfoot } from './terrain';
import { fitAddon, fitChassis, upgradeMass } from './upgrades';

/**
 * The Behemoth: movement, turret, and the component damage model (SPEC §5.1).
 * Shared by the player and (later) enemy Behemoths. Top-down movement lives here for now;
 * when the side-on mode arrives, movement splits out per battle mode (SPEC §4.1).
 */

export type { ArmorArc } from '../content/chassis';

export interface Integrity {
  hp: number;
  max: number;
}

export interface HardpointState {
  slot: HardpointSlotDef;
  /** Installed weapon; null = empty slot. */
  weapon: WeaponDef | null;
  integrity: Integrity;
  /** Seconds until it can fire again. */
  cooldown: number;
  /** Mount angle relative to the hull (own-mount weapons; turret weapons follow their ring). */
  angle: number;
  /** Rounds left for munitions weapons; null = unlimited. */
  ammo: number | null;
  /**
   * Salvo in progress: rounds left, time to the next one, and what it's locked on to. A swarm's
   * `targets` are the units its missiles are shared out over, in turn.
   */
  salvo: { left: number; timer: number; targetId: number | null; x: number; y: number; targets?: number[] } | null;
  /** What fires it (SPEC §5.2): set at the depot; meaningless for an empty slot. See `firingBinding`. */
  binding: Binding;
  /**
   * The shell a main gun is loaded with (SPEC §6.2); null = its default, or a weapon with no
   * choice. `weapon` is already the gun loaded with it (`withShell`).
   */
  shell: ShellType | null;
}

/** A turret ring (SPEC §5.2): its slots turn with it. */
export interface TurretState {
  def: TurretDef;
  /** Angle relative to the hull. */
  angle: number;
}

export interface Capacitor {
  stored: number;
  max: number;
}

/** A core component name, a hardpoint slot id, an add-on id, or a trailer bay id (`bayId`). */
export type ComponentId = CoreComponent | string;

/** A bolted-on add-on (SPEC §5.5). */
export interface AddonState {
  def: AddonDef;
  /** Its own integrity (plates, tread sets); null for a mount (sponson, dorsal ring), whose integrity is its hardpoint's. */
  integrity: Integrity | null;
}

/** A module in one of the trailer's bays (SPEC §5.5). */
export interface BayState {
  def: ModuleDef;
  /** Its integrity; a pod's is its hardpoint's (the same object). */
  integrity: Integrity;
  /** Bunkers: full loads left. Drone bays: drones it still has (in the bay or out). */
  loads: number;
  /** Drone bays: tread HP its drones can still patch this battle. */
  pool: number;
  /** Bunkers: a load on its way to a weapon that ran dry (slot id, seconds left). */
  feeding: { slot: string; timer: number } | null;
}

/**
 * The towed trailer (SPEC §5.5): where it is, its armor, frame, and bays. It stays here after it's
 * jettisoned or wrecked (status), so the battle can tell what happened to it.
 */
export interface TrailerState {
  def: TrailerAddon;
  /** Center and heading in the world. */
  x: number;
  y: number;
  heading: number;
  armor: Integrity;
  /** The frame: the trailer add-on's integrity (the same object). */
  frame: Integrity;
  /** One entry per bay, front first; null = empty. */
  bays: (BayState | null)[];
  status: 'hitched' | 'jettisoned' | 'wrecked';
  /** Seconds the jettison key has been held (resets on release). */
  jettisonHeld: number;
}

/** One set of tread pods: the chassis' own (`treads`) or an add-on's. */
export interface TreadSet {
  id: ComponentId;
  integrity: Integrity;
  /** Mass capacity (tons) it adds while it works. */
  capacity: number;
  /** Share of tread damage it takes from each arc. */
  exposure: Record<ArmorArc, number>;
}

/** The fire triggers (SPEC §4.3): LMB, RMB, and Space. */
export type Trigger = 'lmb' | 'rmb' | 'space';

/** Ripple fire on one trigger (SPEC §5.2). */
export interface RippleState {
  /** Seconds until the next gun in the ripple may fire. */
  gap: number;
  /** Slot that fired last; the next ready gun after it goes next. */
  last: string | null;
}

export interface BehemothState {
  /** The chassis with its upgrades applied (`fitChassis`): read maxima and ratings from here. */
  chassis: ChassisDef;
  /** Core-component grades and part mods (SPEC §5.6), already applied to `chassis`. */
  upgrades: Upgrades;
  x: number;
  y: number;
  /** Forward ground speed (units/s); never negative. */
  vx: number;
  /** Lateral speed (units/s). */
  vy: number;
  /** Lateral acceleration (units/s²): eased in and out, so turns start and settle smoothly. */
  ay: number;
  /** Hull heading in radians (0 = forward, +x). Follows the velocity direction. */
  heading: number;
  /** Turret rings: the chassis' own (main first), then any an add-on brings. */
  turrets: TurretState[];
  hardpoints: HardpointState[];
  /** Add-ons, in the order they were bolted on. */
  addons: AddonState[];
  /** The trailer, if one is fitted (its add-on is in `addons` too). */
  trailer: TrailerState | null;
  /** The chassis' own tread set. Add-on sets are in `addons` (see `treadSets`). */
  treads: Integrity;
  sensors: Integrity;
  fireControl: Integrity;
  /** The ammo magazine (SPEC §5.1): holds the hull's munitions; destroyed with rounds in it, it cooks off. */
  magazine: Integrity;
  reactor: Integrity;
  power: Capacitor;
  /** Auto-weapon groups 1–4 switched on (index = group - 1). */
  autoEnabled: boolean[];
  /** Ripple fire per trigger, for L guns sharing it. */
  ripple: Record<Trigger, RippleState>;
  armor: Record<ArmorArc, Integrity>;
  immobilized: boolean;
  /** Seconds until the reactor detonates; null while it's stable. */
  reactorFuse: number | null;
  /** Seconds the self-destruct key has been held (resets on release). */
  selfDestructHeld: number;
  /** The reactor has detonated: the Behemoth is gone. */
  destroyed: boolean;
  /**
   * Glancing off rock (SPEC §4.2): which way it's being shoved while held against a rock face
   * (0 = not held), how often the slide has been blocked and reversed, and seconds to the next
   * spark event.
   */
  deflect: { dir: -1 | 0 | 1; flips: number; spark: number };
  /**
   * What the ground box is in (SPEC §4.5 fording, §4.6 drifts and ice), refreshed after each step's
   * collisions: the share under a cruise or a minimum speed cap, the area-weighted tread wear per
   * 100 units driven, the traction, and the HUD's tag.
   */
  wading: Underfoot;
  /** Dev console god mode: hits land (sparks, sounds) but take nothing off. Never saved. */
  invulnerable?: boolean;
}

/** Per-tick player intent. The scene turns raw input into this. */
export interface PlayerCommand {
  /** +1 surge, 0 cruise, -1 brake (never below minimum speed). */
  throttle: -1 | 0 | 1;
  /** -1 steer to the Behemoth's left (-y), +1 to its right (+y). */
  steer: -1 | 0 | 1;
  /** Aim point in world coordinates. */
  aimX: number;
  aimY: number;
  fireMain: boolean;
  fireSecondary: boolean;
  fireMissile: boolean;
  /** Toggle this auto-weapon group (1–4) this tick; null = no change. */
  toggleAuto: number | null;
  /** Self-destruct key held ("Final protocol", SPEC §5.1). */
  selfDestruct: boolean;
  /** Jettison key held: cut the trailer loose (SPEC §5.5). */
  jettison: boolean;
}

export const IDLE_COMMAND: PlayerCommand = {
  throttle: 0,
  steer: 0,
  aimX: 0,
  aimY: 0,
  fireMain: false,
  fireSecondary: false,
  fireMissile: false,
  toggleAuto: null,
  selfDestruct: false,
  jettison: false,
};

const full = (max: number): Integrity => ({ hp: max, max });

/** Component id (and hardpoint slot id, for a pod) of the trailer bay at `index`. */
export function bayId(index: number): string {
  return `bay${index}`;
}

/** The bay index a component id names, or null. */
export function bayIndex(id: ComponentId): number | null {
  const m = /^bay(\d)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/**
 * What a trailer bay is called, front first, on a trailer of `count` bays: the front one, the rear
 * one, and what's between ("Mid bay"; on a four-bay trailer, "Bay 2" and "Bay 3").
 */
export function bayName(index: number, count = 2): string {
  if (index === 0) return 'Front bay';
  if (index === count - 1) return 'Rear bay';
  return count === 3 ? 'Mid bay' : `Bay ${index + 1}`;
}

/** The hardpoint a pod module adds in trailer bay `index`: its built-in weapon fires all round. */
function podSlot(trailer: TrailerAddon, index: number, def: ModuleDef): HardpointSlotDef {
  const at = trailer.bays[index]!;
  return {
    id: bayId(index),
    name: bayName(index, trailer.bays.length),
    size: 'M',
    position: 'trailer',
    hp: def.hp,
    exposure: {},
    mount: { x: at.x, y: at.y },
    arc: { center: 0, half: 180 },
  };
}

/**
 * The hardpoint slots a chassis has with these add-ons: its own, then each mount's (sponsons, the
 * dorsal ring, a twin turret's second gun), then the trailer's pods (for the modules in `bays`).
 * A slot an add-on moves (`AddonMount.moves`) sits where that add-on puts it. Add-ons the chassis
 * can't take are ignored.
 */
export function hardpointSlots(chassis: ChassisDef, addons: readonly AddonId[], bays: readonly (ModuleId | null)[] = []): HardpointSlotDef[] {
  const fitted = addons.filter((id) => chassis.addonMounts[id]);
  const extra = fitted.flatMap((id) => chassis.addonMounts[id]?.hardpoint ?? []);
  const trailer = trailerOf(fitted);
  const pods = trailer
    ? bays.slice(0, trailer.bays.length).flatMap((id, i) => {
        const def = id ? TRAILER_MODULES[id] : undefined;
        return def?.kind === 'pod' ? [podSlot(trailer, i, def)] : [];
      })
    : [];
  const moves: Record<string, { x: number; y: number }> = Object.assign({}, ...fitted.map((id) => chassis.addonMounts[id]?.moves ?? {}));
  const placed = (slot: HardpointSlotDef) => (moves[slot.id] ? { ...slot, mount: moves[slot.id]! } : slot);
  return [...chassis.hardpoints.map(placed), ...extra.map(placed), ...pods];
}

/** The turret rings a chassis has with these add-ons: its own, then each add-on's. */
export function turretRings(chassis: ChassisDef, addons: readonly AddonId[]): TurretDef[] {
  return [...chassis.turrets, ...addons.flatMap((id) => chassis.addonMounts[id]?.turret ?? [])];
}

/**
 * @param loadout weapons to install, by hardpoint slot id (mount slots included; pods carry
 * their own).
 * @param addons add-ons bolted on; ones the chassis can't take and repeats are dropped.
 * @param bays trailer modules, front bay first (ignored without a trailer).
 * @param upgrades grades and mods (SPEC §5.6), applied to the chassis it's built from.
 * Starts out at its cruise speed, with the trailer lined up behind it.
 */
export function createBehemoth(
  base: ChassisDef,
  loadout: Record<string, WeaponDef>,
  x: number,
  y: number,
  addons: readonly AddonId[] = [],
  bays: readonly (ModuleId | null)[] = [],
  upgrades: Upgrades = NO_UPGRADES,
): BehemothState {
  const chassis = fitChassis(base, upgrades);
  const a = chassis.armor;
  // One of each, and one trailer at most (the first listed).
  const towed = trailerOf(addons.filter((id) => chassis.addonMounts[id]))?.id;
  const fitted = addons.filter((id, i) => chassis.addonMounts[id] && addons.indexOf(id) === i && (ADDONS[id].kind !== 'trailer' || id === towed));
  const podWeapon = (id: string) => {
    const i = bayIndex(id);
    const m = i === null ? null : bays[i];
    const def = m ? TRAILER_MODULES[m] : undefined;
    return def?.kind === 'pod' ? WEAPONS[def.weapon] : undefined;
  };
  const b: BehemothState = {
    chassis,
    upgrades: structuredClone(upgrades),
    x,
    y,
    vx: chassis.speed.cruise,
    vy: 0,
    ay: 0,
    heading: 0,
    turrets: turretRings(chassis, fitted).map((def) => ({ def, angle: 0 })),
    hardpoints: hardpointSlots(chassis, fitted, bays).map((slot) => {
      const weapon = (slot.position === 'trailer' ? podWeapon(slot.id) : loadout[slot.id]) ?? null;
      return {
        slot,
        weapon,
        integrity: full(slot.hp),
        cooldown: 0,
        angle: (slot.arc.center * Math.PI) / 180,
        ammo: weapon?.ammo ?? null,
        salvo: null,
        binding: weapon ? defaultBindingFor(weapon, slot) : 'auto',
        shell: null,
      };
    }),
    addons: fitted.map((id) => {
      // A tread set's or the plow's own upgrades are already in its def, as the chassis' are in `chassis`.
      const def = fitAddon(ADDONS[id], upgrades);
      return { def, integrity: def.kind === 'mount' ? null : full(def.hp) };
    }),
    trailer: null,
    treads: full(chassis.treadHp),
    sensors: full(chassis.sensorsHp),
    fireControl: full(chassis.fireControl.hp),
    magazine: full(chassis.magazine.hp),
    reactor: full(chassis.reactor.hp),
    power: { stored: chassis.reactor.capacitor, max: chassis.reactor.capacitor },
    autoEnabled: [true, true, true, true],
    ripple: { lmb: { gap: 0, last: null }, rmb: { gap: 0, last: null }, space: { gap: 0, last: null } },
    armor: mapArcs((arc) => full(a[arc])),
    immobilized: false,
    reactorFuse: null,
    selfDestructHeld: 0,
    destroyed: false,
    deflect: { dir: 0, flips: 0, spark: 0 },
    wading: { cruise: 0, min: 0, wear: 0, grip: 1, label: null },
  };
  const hitched = b.addons.find((ad) => ad.def.kind === 'trailer');
  if (hitched && hitched.def.kind === 'trailer' && hitched.integrity) b.trailer = createTrailer(b, hitched.def, hitched.integrity, bays);
  b.power.max = capacitorSize(b);
  b.power.stored = b.power.max;
  b.vx = speedLimits(b).cruise;
  return b;
}

function createTrailer(b: BehemothState, def: TrailerAddon, frame: Integrity, bays: readonly (ModuleId | null)[]): TrailerState {
  const t: TrailerState = {
    def,
    x: b.x,
    y: b.y,
    heading: b.heading,
    armor: full(def.armor),
    frame,
    bays: def.bays.map((_, i) => {
      const id = bays[i];
      if (!id) return null;
      const m = TRAILER_MODULES[id];
      // A pod's integrity is its hardpoint's.
      const pod = b.hardpoints.find((h) => h.slot.id === bayId(i));
      return { def: m, integrity: pod?.integrity ?? full(m.hp), loads: moduleLoads(m) ?? 0, pool: m.kind === 'drones' ? m.pool : 0, feeding: null };
    }),
    status: 'hitched',
    jettisonHeld: 0,
  };
  b.trailer = t;
  placeTrailer(b, b.heading);
  return t;
}

/** The trailer is still being towed. */
export function hitched(b: BehemothState): TrailerState | null {
  return b.trailer?.status === 'hitched' ? b.trailer : null;
}

/** World position of the tow hitch on the hull's rear. */
export function hitchPoint(b: BehemothState): { x: number; y: number } {
  const h = (b.trailer && b.chassis.addonMounts[b.trailer.def.id]?.hitch) ?? { x: -b.chassis.length / 2, y: 0 };
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  return { x: b.x + h.x * c - h.y * s, y: b.y + h.x * s + h.y * c };
}

/**
 * Puts the trailer behind the hitch along `heading`, swung no further than its limit off the
 * hull's line.
 */
export function placeTrailer(b: BehemothState, heading: number): void {
  const t = b.trailer;
  if (!t) return;
  const max = (t.def.maxSwing * Math.PI) / 180;
  t.heading = wrapAngle(b.heading + clamp(wrapAngle(heading - b.heading), -max, max));
  const h = hitchPoint(b);
  const reach = t.def.towBar + t.def.length / 2;
  t.x = h.x - Math.cos(t.heading) * reach;
  t.y = h.y - Math.sin(t.heading) * reach;
}

/** A trailer-space point (x forward from its center, y to the right) in world coordinates. */
export function trailerToWorld(t: TrailerState, p: { x: number; y: number }): { x: number; y: number } {
  const c = Math.cos(t.heading);
  const s = Math.sin(t.heading);
  return { x: t.x + p.x * c - p.y * s, y: t.y + p.x * s + p.y * c };
}

export function fraction(i: Integrity): number {
  return i.max > 0 ? clamp(i.hp / i.max, 0, 1) : 0;
}

/** The module in a trailer bay (by bay index or component id), if any. */
export function bayOf(b: BehemothState, bay: number | ComponentId): BayState | null {
  const i = typeof bay === 'number' ? bay : bayIndex(bay);
  return i === null ? null : (b.trailer?.bays[i] ?? null);
}

export function addonOf(b: BehemothState, id: AddonId): AddonState | undefined {
  return b.addons.find((a) => a.def.id === id);
}

/** The built-in tread set's share of tread damage from every arc (see `TreadAddon.exposure`). */
const BASE_EXPOSURE: Record<ArmorArc, number> = mapArcs(() => 1);

/** Every tread set, the chassis' own first. */
export function treadSets(b: BehemothState): TreadSet[] {
  const sets: TreadSet[] = [{ id: 'treads', integrity: b.treads, capacity: b.chassis.massCapacity, exposure: BASE_EXPOSURE }];
  for (const a of b.addons) {
    if (a.def.kind === 'treads' && a.integrity) sets.push({ id: a.def.id, integrity: a.integrity, capacity: a.def.capacity, exposure: a.def.exposure });
  }
  return sets;
}

/** Share of tread integrity left over every set (for the HUD; speed uses `treadDrive`). */
export function treadIntegrity(b: BehemothState): number {
  let hp = 0;
  let max = 0;
  for (const t of treadSets(b)) {
    hp += Math.max(0, t.integrity.hp);
    max += t.integrity.max;
  }
  return max > 0 ? clamp(hp / max, 0, 1) : 0;
}

/**
 * How much of its full-health speed the treads give: each set's `treadSpeedScale`, weighted by the
 * integrity it has left. A healthy set carries the hull while a wrecked one fades out (so losing
 * the outer pods doesn't cripple a sound inner set), and with one set it's just that set's scale.
 */
export function treadDrive(b: BehemothState): number {
  let weight = 0;
  let sum = 0;
  for (const t of treadSets(b)) {
    const hp = Math.max(0, t.integrity.hp);
    weight += hp;
    sum += hp * treadSpeedScale(fraction(t.integrity));
  }
  return weight > 0 ? sum / weight : 0;
}

/** Full width of the hull across, outboard tread pods included. */
export function hullWidth(b: BehemothState): number {
  let widen = 0;
  for (const a of b.addons) widen += b.chassis.addonMounts[a.def.id]?.widen ?? 0;
  return b.chassis.width + 2 * widen;
}

/** Ram gear rating 0..1 (SPEC §4.2): the chassis' own plus each intact plow's. */
export function ramRating(b: BehemothState): number {
  let ram = b.chassis.ram;
  for (const a of b.addons) if (a.def.kind === 'plow' && a.integrity && a.integrity.hp > 0) ram += a.def.ram;
  return Math.min(RAM.max, ram);
}

/** Whether rock at the nose is broken instead of turning the hull aside (SPEC §4.2): a plow with the Breaker upgrade, while its blade holds. */
export function breaksRock(b: BehemothState): boolean {
  return b.addons.some((a) => a.def.kind === 'plow' && !!a.def.breaksRock && !!a.integrity && a.integrity.hp > 0);
}

/** Can still drive: not Immobilized, and the reactor isn't about to go. */
export function mobile(b: BehemothState): boolean {
  return !b.immobilized && b.reactorFuse === null && !b.destroyed;
}

/** A share that falls from 1 at full integrity to `floor` at none (`DEGRADE`). */
export function degraded(floor: number, integrity: number): number {
  return floor + (1 - floor) * integrity;
}

/**
 * How much of its full-health speed the Behemoth keeps at a given tread integrity: declines
 * gradually to `DEGRADE.treadSpeedFloor` as the set wears out, and is zero only once it's
 * destroyed (SPEC §5.1).
 */
export function treadSpeedScale(integrity: number): number {
  if (integrity <= 0) return 0;
  const floor = DEGRADE.treadSpeedFloor;
  return floor + (1 - floor) * Math.min(integrity, 1) ** DEGRADE.treadSpeedExponent;
}

/**
 * How much of its rated speed a Behemoth keeps under a load (SPEC §5.3): a little more than all of
 * it below capacity, falling gently as mass is added, then steeply once over capacity, on a curve
 * that levels out at `MASS.floor`: the minimum, however overloaded it is.
 */
export function massScale(mass: number, capacity: number): number {
  const ratio = capacity > 0 ? Math.max(0, mass) / capacity : Infinity;
  if (ratio <= 1) return 1 + MASS.underload * (1 - ratio);
  // Over capacity it falls away at `MASS.overload` per unit of overload at first, then ever more
  // gently, settling toward the floor instead of running down a straight line to it.
  const span = 1 - MASS.floor;
  if (span <= 0) return MASS.floor;
  return MASS.floor + span * Math.exp((-MASS.overload * (ratio - 1)) / span);
}

/**
 * Tons carried by the treads: every installed weapon and add-on, working or wrecked (SPEC §5.3),
 * and what upgrades add (SPEC §5.6). A hitched trailer and its modules count at the towed share;
 * once it's gone it weighs nothing.
 */
export function loadMass(b: BehemothState): number {
  let mass = upgradeMass(b.upgrades);
  for (const h of b.hardpoints) if (h.slot.position !== 'trailer') mass += h.weapon?.mass ?? 0;
  for (const a of b.addons) if (a.def.kind !== 'trailer') mass += a.def.mass;
  const t = hitched(b);
  if (t) mass += MASS.towed * t.bays.reduce((sum, bay) => sum + (bay?.def.mass ?? 0), t.def.mass);
  return mass;
}

/** Tons the treads are rated for: the capacity of every set that still works. */
export function massCapacity(b: BehemothState): number {
  return treadSets(b).reduce((sum, t) => sum + (t.integrity.hp > 0 ? t.capacity : 0), 0);
}

/**
 * Share of the chassis' rated speeds, acceleration, and agility the Behemoth has right now:
 * tread integrity times the load.
 */
export function mobilityScale(b: BehemothState): number {
  return treadDrive(b) * massScale(loadMass(b), massCapacity(b));
}

export interface SpeedLimits {
  min: number;
  cruise: number;
  top: number;
}

export function speedLimits(b: BehemothState): SpeedLimits {
  const k = mobilityScale(b);
  const s = b.chassis.speed;
  return { min: s.min * k, cruise: s.cruise * k, top: s.top * k };
}

/** Fastest the Behemoth can move sideways by steering. */
export function lateralLimit(b: BehemothState): number {
  return b.chassis.lateral.maxSpeed * mobilityScale(b);
}

/**
 * The speed water holds the hull to (Infinity on dry ground). Any water caps it at cruise, deep
 * water at minimum speed, each blending in as more of the footprint is in it.
 */
export function wadingCap(b: BehemothState): number {
  const w = b.wading;
  if (w.cruise + w.min <= 0) return Infinity;
  const lim = speedLimits(b);
  const blend = (f: number) => clamp(f / WADING.fullAt, 0, 1);
  const shallow = lim.top + (lim.cruise - lim.top) * blend(w.cruise + w.min);
  return shallow + (lim.min - shallow) * blend(w.min);
}

/**
 * The hull's hit box: its length and width turned to its heading, so it follows the machine's shape
 * as it steers (user's call, Nov 2026). Incoming fire, crushing and rams, units under it, blasts,
 * mines, and plasma pools test against this.
 */
export function hullBox(b: BehemothState): Box {
  return orientedBox(b.x, b.y, b.chassis.length / 2, hullWidth(b) / 2, b.heading);
}

/** The part of the hull that meets the ground (chassis `ground`), turned with it: plasma pools burn the treads under it. */
export function groundBox(b: BehemothState): Box {
  return orientedBox(b.x, b.y, (b.chassis.length * b.chassis.ground.length) / 2, (hullWidth(b) * b.chassis.ground.width) / 2, b.heading);
}

/** The axis-aligned rect around the turned hull: a broad test (the last stand's solid hull, placing wave units). */
export function footprint(b: BehemothState): Rect {
  return boxBounds(hullBox(b));
}

/**
 * The part of the footprint that meets the ground, for rock contact, fording, and bridge and ice
 * loads (chassis `ground`). Unturned on purpose: rock deflection is built on axis-aligned pushes
 * (SPEC §4.2), and the hull is held to ~41° anyway.
 */
export function groundFootprint(b: BehemothState): Rect {
  const hl = (b.chassis.length * b.chassis.ground.length) / 2;
  const hw = (hullWidth(b) * b.chassis.ground.width) / 2;
  return { x0: b.x - hl, y0: b.y - hw, x1: b.x + hl, y1: b.y + hw };
}

/**
 * Forward momentum + lateral steering. The Behemoth never stops by choice and never reverses:
 * braking only reaches the (tread-scaled) minimum speed.
 */
export function stepMovement(b: BehemothState, cmd: PlayerCommand, dt: number, fieldHeight: number): void {
  const c = b.chassis;
  const lim = speedLimits(b);
  const k = mobilityScale(b);
  // On ice the treads lose their bite (SPEC §4.6): speeding up, braking, and steering all come on
  // weaker, so the hull keeps sliding the way it was going.
  const grip = Math.max(MOVEMENT.minGrip, b.wading.grip);
  const latAccel = c.lateral.accel * grip;
  const latJerk = c.lateral.jerk * grip;

  const steerTo = (target: number) => {
    const e = easeToward(b.vy, b.ay, target, latAccel, latJerk, dt);
    b.vy = e.v;
    b.ay = e.a;
  };

  if (!mobile(b)) {
    b.vx = approach(b.vx, 0, c.brake * dt);
    steerTo(0);
  } else {
    const cap = wadingCap(b);
    const target = Math.min(cap, cmd.throttle > 0 ? lim.top : cmd.throttle < 0 ? lim.min : lim.cruise);
    if (b.vx < target) {
      // Damaged or overloaded treads accelerate more weakly, but never so weakly that recovery stalls.
      b.vx = Math.min(target, b.vx + c.accel * Math.max(k, MOVEMENT.accelFloor) * grip * dt);
    } else {
      // Braking is firm; easing off a surge drifts back down at the acceleration rate. Water drags
      // harder, but momentum still carries a fast hull a way in.
      let decel = (cmd.throttle < 0 ? c.brake : c.accel) * grip;
      if (b.vx > cap) decel = Math.max(decel, WADING.drag);
      b.vx = Math.max(target, b.vx - decel * dt);
    }

    const halfW = hullWidth(b) / 2;
    const maxLat = Math.min(lateralLimit(b), b.vx * c.lateral.maxRatio);
    let targetVy = cmd.steer * maxLat;
    // Near the field edge, straighten out in time to arrive square instead of snapping straight.
    const room = targetVy < 0 ? b.y - halfW : fieldHeight - halfW - b.y;
    targetVy = Math.sign(targetVy) * Math.min(Math.abs(targetVy), edgeApproachSpeed(latAccel, latJerk, Math.max(0, room)));
    steerTo(targetVy);
  }

  b.vx = Math.max(0, b.vx);
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  const halfW = hullWidth(b) / 2;
  const clampedY = clamp(b.y, halfW, fieldHeight - halfW);
  if (clampedY !== b.y) {
    b.y = clampedY;
    b.vy = 0;
    b.ay = 0;
  }

  // The hull turns with its velocity, up to the steering ratio's angle (a deflection shove can
  // push sideways faster than steering allows).
  const maxHeading = Math.atan(c.lateral.maxRatio);
  if (b.vx > 0.5) b.heading = clamp(Math.atan2(b.vy, b.vx), -maxHeading, maxHeading);
}

/**
 * Fastest sideways speed toward the field edge that can still ease to a stop in `room` units, with
 * the deceleration ramping in and out at the chassis' jerk (the inverse of the S-curve's stopping
 * distance, planned over `MOVEMENT.edgeMargin` of the room).
 */
function edgeApproachSpeed(a: number, j: number, room: number): number {
  const d = room * MOVEMENT.edgeMargin;
  // Short stops never reach full deceleration: d = v^1.5 / sqrt(j), for v up to a²/j.
  const v = Math.cbrt(d * d * j);
  if (v <= (a * a) / j) return v;
  // Longer ones hold full deceleration in the middle: d = v²/2a + v·a/2j.
  const k = (a * a) / (2 * j);
  return -k + Math.sqrt(k * k + 2 * a * d);
}

/** Footprint test for the trailer: its length along its own heading, its width across. */
export function inTrailer(t: TrailerState, x: number, y: number): boolean {
  const c = Math.cos(t.heading);
  const s = Math.sin(t.heading);
  const dx = x - t.x;
  const dy = y - t.y;
  return Math.abs(dx * c + dy * s) <= t.def.length / 2 && Math.abs(-dx * s + dy * c) <= t.def.width / 2;
}

/** The ring a turret slot turns with; null for own-mount and trailer slots. */
export function ringOf(b: BehemothState, h: HardpointState): TurretState | null {
  return h.slot.ring === undefined ? null : (b.turrets.find((t) => t.def.id === h.slot.ring) ?? null);
}

/** World position of a turret ring's pivot. */
export function turretPivot(b: BehemothState, t: TurretState): { x: number; y: number } {
  return hullToWorld(b, t.def.pivot);
}

export function turretWorldAngle(b: BehemothState, t: TurretState): number {
  return wrapAngle(b.heading + t.angle);
}

/**
 * Reactor output (power/s). Damage lowers it; a reactor at 30% integrity still makes 51% (SPEC §5.4).
 */
export function reactorOutput(b: BehemothState): number {
  const i = fraction(b.reactor);
  return i > 0 && !b.destroyed ? b.chassis.reactor.output * degraded(DEGRADE.powerFloor, i) : 0;
}

/** Working generators in a hitched trailer. */
function generators(b: BehemothState): BayState[] {
  const t = hitched(b);
  return t ? t.bays.filter((bay): bay is BayState => bay?.def.kind === 'generator' && bay.integrity.hp > 0) : [];
}

/**
 * Power per second from the reactor and any working auxiliary generator in a hitched trailer
 * (which falls off with damage the same way).
 */
export function powerOutput(b: BehemothState): number {
  if (b.destroyed) return 0;
  let out = reactorOutput(b);
  for (const g of generators(b)) if (g.def.kind === 'generator') out += g.def.output * degraded(DEGRADE.powerFloor, fraction(g.integrity));
  return out;
}

/** Capacitor size: the reactor's, plus each working generator's. */
export function capacitorSize(b: BehemothState): number {
  return generators(b).reduce((sum, g) => sum + (g.def.kind === 'generator' ? g.def.capacitor : 0), b.chassis.reactor.capacitor);
}

export function stepPower(b: BehemothState, dt: number): void {
  b.power.max = capacitorSize(b);
  b.power.stored = Math.min(b.power.max, b.power.stored + powerOutput(b) * dt);
}

/**
 * Auto-weapon reach multiplier from sensor integrity: with sensors destroyed, autos only engage at
 * close range (SPEC §5.1).
 */
export function sensorRangeScale(b: BehemothState): number {
  return degraded(DEGRADE.sensorFloor, fraction(b.sensors));
}

/** Multiplier on every auto weapon's reach: sensor damage shrinks it, a higher sensor grade stretches it. */
export function autoReach(b: BehemothState): number {
  return sensorRangeScale(b) * (b.chassis.sensorReach ?? 1);
}

/** How close a hidden unit must be for the sensors to reveal it; shrinks with sensor damage. */
export function revealRadius(b: BehemothState): number {
  return b.chassis.revealRadius * sensorRangeScale(b);
}

/**
 * Load a main gun with a shell it takes (SPEC §6.2); its default, or one it can't take, clears
 * the choice. An empty slot is left alone.
 */
export function loadShell(h: HardpointState, shell: ShellType | null): void {
  if (!h.weapon) return;
  const base = WEAPONS[h.weapon.id];
  const ok = shell !== null && shellsOf(base).indexOf(shell) > 0;
  h.shell = ok ? shell : null;
  h.weapon = withShell(base, h.shell);
}

/**
 * The bindings a weapon allows in a slot (SPEC §5.2): point defense is Auto only; L guns and
 * anything else on a turret ring (coax) are never Auto, since they can't aim on their own.
 * Empty when it can't work there at all (point defense on a ring).
 */
export function allowedBindings(weapon: WeaponDef, slot: HardpointSlotDef): Binding[] {
  const auto = weapon.projectile.kind === 'intercept';
  const trigger = weapon.size === 'L' || slot.ring !== undefined;
  if (auto && trigger) return [];
  if (auto) return ['auto'];
  return trigger ? ['lmb', 'rmb', 'space'] : ['lmb', 'rmb', 'space', 'auto'];
}

/**
 * A weapon's binding when nobody has set one: its own default if the slot allows it, else RMB (an
 * auto weapon on a coax mount).
 */
export function defaultBindingFor(weapon: WeaponDef, slot: HardpointSlotDef): Binding {
  const allowed = allowedBindings(weapon, slot);
  const own = defaultBinding(weapon);
  return allowed.includes(own) ? own : (allowed.find((b) => b === 'rmb') ?? allowed[0] ?? own);
}

/** Bound to Auto by the player (not by default): it takes a fire-control channel. */
export function usesChannel(weapon: WeaponDef, slot: HardpointSlotDef, binding: Binding): boolean {
  return binding === 'auto' && defaultBindingFor(weapon, slot) !== 'auto';
}

/** Fire-control channels in use. */
export function channelsUsed(b: BehemothState): number {
  return b.hardpoints.filter((h) => h.weapon && usesChannel(h.weapon, h.slot, h.binding)).length;
}

/**
 * What actually fires a hardpoint right now: its binding, except that a weapon the player put on
 * Auto falls back to its default trigger once fire control is destroyed (SPEC §5.2).
 */
export function firingBinding(b: BehemothState, h: HardpointState): Binding {
  if (!h.weapon || b.fireControl.hp > 0 || !usesChannel(h.weapon, h.slot, h.binding)) return h.binding;
  return defaultBindingFor(h.weapon, h.slot);
}

/** The toggle group (keys 1–4) of a weapon firing on Auto: its own, or the one for player-bound autos. */
export function autoGroupOf(weapon: WeaponDef): number {
  return weapon.autoGroup ?? FIRE_CONTROL.group;
}

/**
 * Spread multiplier fire control puts on everything firing on Auto: 1 when sound, widening with
 * damage, and the local-control penalty once it's destroyed (SPEC §5.2), all times its grade's
 * spread (SPEC §5.6).
 */
export function fireControlSpread(b: BehemothState): number {
  const i = fraction(b.fireControl);
  return (i > 0 ? 1 + FIRE_CONTROL.damaged * (1 - i) : FIRE_CONTROL.local) * (b.chassis.fireControl.spread ?? 1);
}

/** World position of a hardpoint's pivot (a turret slot's turns with its ring; a pod's is on the trailer). */
export function mountPosition(b: BehemothState, h: HardpointState): { x: number; y: number } {
  const ring = ringOf(b, h);
  if (ring) {
    // The slot's offset from the ring's pivot, turned with the ring.
    const dx = h.slot.mount.x - ring.def.pivot.x;
    const dy = h.slot.mount.y - ring.def.pivot.y;
    const c = Math.cos(ring.angle);
    const s = Math.sin(ring.angle);
    return hullToWorld(b, { x: ring.def.pivot.x + dx * c - dy * s, y: ring.def.pivot.y + dx * s + dy * c });
  }
  if (h.slot.position === 'trailer' && b.trailer) return trailerToWorld(b.trailer, h.slot.mount);
  return hullToWorld(b, h.slot.mount);
}

/** A hull-space point (x forward from the center, y to the right) in world coordinates. */
export function hullToWorld(b: BehemothState, p: { x: number; y: number }): { x: number; y: number } {
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  return { x: b.x + p.x * c - p.y * s, y: b.y + p.x * s + p.y * c };
}

/** World angle a hardpoint's weapon is pointing. */
export function mountWorldAngle(b: BehemothState, h: HardpointState): number {
  const base = h.slot.position === 'trailer' && b.trailer ? b.trailer.heading : b.heading;
  return wrapAngle(base + (ringOf(b, h)?.angle ?? h.angle));
}

/** A ring whose main slot is damaged traverses more slowly; destroyed, it's stuck (SPEC §5.1). */
export function turretTraverseScale(b: BehemothState, t: TurretState): number {
  const mount = b.hardpoints.find((h) => h.slot.id === t.def.slot);
  if (!mount) return 1;
  const i = fraction(mount.integrity);
  return i > 0 ? degraded(DEGRADE.traverseFloor, i) : 0;
}

/** Reload time multiplier for a damaged hardpoint: up to 2× slower near destruction. */
export function reloadScale(h: HardpointState): number {
  return 1 + DEGRADE.reloadPenalty * (1 - fraction(h.integrity));
}

/** Aim error multiplier for a damaged hardpoint: up to 3× wider near destruction. */
export function spreadScale(h: HardpointState): number {
  return 3 - 2 * fraction(h.integrity);
}

/** Traverse every turret ring toward the aim point, each at its own limited rate (heavy feel, SPEC §4.3). */
export function stepTurrets(b: BehemothState, aimX: number, aimY: number, dt: number): void {
  for (const t of b.turrets) {
    const p = turretPivot(b, t);
    const desiredRel = wrapAngle(Math.atan2(aimY - p.y, aimX - p.x) - b.heading);
    const rate = ((t.def.traverseDegPerSec * Math.PI) / 180) * turretTraverseScale(b, t);
    t.angle = rotateToward(t.angle, desiredRel, rate * dt);
  }
}

/** A record with one entry per armor arc. */
export function mapArcs<T>(fn: (arc: ArmorArc) => T): Record<ArmorArc, T> {
  return Object.fromEntries(ARMOR_ARCS.map((arc) => [arc, fn(arc)])) as Record<ArmorArc, T>;
}

type Pose = Pick<BehemothState, 'x' | 'y' | 'heading'>;

/** How far a world point sits off the hull's centerline, in hull space (+ = to the right). */
export function hullSide(b: Pose, x: number, y: number): number {
  return -(x - b.x) * Math.sin(b.heading) + (y - b.y) * Math.cos(b.heading);
}

/** The front armor half on the side of `side` (+ = right of the centerline; 0 counts as left). */
export function frontHalf(side: number): ArmorArc {
  return side > 0 ? 'frontRight' : 'frontLeft';
}

/**
 * Which armor arc a hit strikes (SPEC §5.1): the direction it came *from* (world vector pointing
 * from the Behemoth toward the source) picks front, rear, or a flank (±45° boundaries); a front
 * hit lands on the half on the side of the centerline where it struck (`atX`, `atY`), so an angled
 * hull takes fire from ahead on its leading corner. Dead center falls back to the source's side.
 */
export function hitArc(b: Pose, fromX: number, fromY: number, atX: number, atY: number): ArmorArc {
  const rel = wrapAngle(Math.atan2(fromY, fromX) - b.heading);
  const q = Math.PI / 4;
  if (rel >= -q && rel <= q) {
    const side = hullSide(b, atX, atY);
    return frontHalf(side !== 0 ? side : rel);
  }
  if (rel >= 3 * q || rel <= -3 * q) return 'rear';
  return rel > 0 ? 'right' : 'left';
}

/**
 * A hit on an armor arc (SPEC §5.1). The arc's armor absorbs what it can; whatever gets through
 * strikes one internal component, chosen by weighted random from the chassis' exposure table.
 * A `strike` focus sends part of the damage straight to the treads or a hardpoint, past the armor.
 */
export function applyHit(
  b: BehemothState,
  arc: ArmorArc,
  damage: number,
  rng: Rng,
  events: SimEvent[],
  x: number,
  y: number,
  strike?: StrikeFocus,
): void {
  if (b.destroyed) return;
  events.push({ type: 'behemothHit', arc, damage, x, y });
  const direct = strike ? damage * clamp(strike.bypass, 0, 1) : 0;
  if (direct > 0 && strike) {
    const id = strike.target === 'treads' ? pickTreadSet(b, arc, rng) : pickHardpoint(b, arc, rng);
    damageComponent(b, id ?? pickInternal(b, arc, rng), direct, events);
  }
  soak(b, arc, damage - direct, rng, events);
}

/**
 * Damage on an armor arc with no blow behind it (an enemy flamethrower's lick, `shootFlame`): the
 * armor takes what it can and the rest goes to a component inside, as for a hit, but nothing rings
 * the hull (no `behemothHit`).
 */
export function soak(b: BehemothState, arc: ArmorArc, damage: number, rng: Rng, events: SimEvent[]): void {
  if (b.destroyed) return;
  const through = damageArmor(b, arc, damage);
  if (through > 0) damageComponent(b, pickInternal(b, arc, rng), through, events);
}

/** Damages an arc's armor zone. Returns the damage that gets through it. */
export function damageArmor(b: BehemothState, arc: ArmorArc, amount: number): number {
  if (b.invulnerable) return 0;
  const left = Math.max(0, amount);
  const zone = b.armor[arc];
  const absorbed = Math.min(zone.hp, left);
  zone.hp -= absorbed;
  return left - absorbed;
}

/**
 * Ram damage at the nose (SPEC §5.5): an intact plow takes it first (it breaks off when spent).
 * Returns what the plow couldn't take, for the front armor.
 */
export function wearPlow(b: BehemothState, amount: number, events: SimEvent[]): number {
  if (b.invulnerable) return 0;
  let left = Math.max(0, amount);
  for (const a of b.addons) {
    if (a.def.kind !== 'plow' || !a.integrity || a.integrity.hp <= 0 || left <= 0) continue;
    const absorbed = Math.min(a.integrity.hp, left);
    a.integrity.hp -= absorbed;
    left -= absorbed;
    events.push({ type: 'componentDamaged', component: a.def.id, amount: absorbed });
    if (a.integrity.hp <= 0) events.push({ type: 'componentDestroyed', component: a.def.id });
  }
  return left;
}

export function isCore(id: ComponentId): id is CoreComponent {
  return id === 'treads' || id === 'sensors' || id === 'reactor' || id === 'fireControl' || id === 'magazine';
}

export function component(b: BehemothState, id: ComponentId): Integrity | null {
  if (isCore(id)) return b[id];
  const h = b.hardpoints.find((hp) => hp.slot.id === id);
  if (h) return h.integrity;
  const bay = bayOf(b, id);
  if (bay) return bay.integrity;
  return b.addons.find((a) => a.def.id === id)?.integrity ?? null;
}

/** A working tread set for damage from an arc, weighted by each set's exposure to it. */
export function pickTreadSet(b: BehemothState, arc: ArmorArc, rng: Rng): ComponentId | null {
  const live = treadSets(b).filter((t) => t.integrity.hp > 0);
  if (live.length <= 1) return live[0]?.id ?? null;
  return rng.weighted(live, (t) => t.exposure[arc])?.id ?? live[0]!.id;
}

/**
 * Damage to the treads as a whole, with no arc to it (ram strain, wading, scraping overflow):
 * shared out over the working sets in proportion to their size, so each loses the same share.
 */
export function damageTreads(b: BehemothState, amount: number, events: SimEvent[]): void {
  const live = treadSets(b).filter((t) => t.integrity.hp > 0);
  const total = live.reduce((sum, t) => sum + t.integrity.max, 0);
  for (const t of live) damageComponent(b, t.id, (amount * t.integrity.max) / total, events);
}

/**
 * Which internal component takes damage that got through an arc. Destroyed components and empty
 * hardpoint slots are skipped. Falls back to the reactor, which is always there while the
 * Behemoth exists.
 */
export function pickInternal(b: BehemothState, arc: ArmorArc, rng: Rng): ComponentId {
  const weights = b.chassis.internals[arc];
  const options: { id: ComponentId; weight: number }[] = [];
  // The treads' share is split over the working sets by how exposed each is on this arc.
  const sets = treadSets(b).filter((t) => t.integrity.hp > 0);
  const exposure = sets.reduce((sum, t) => sum + t.exposure[arc], 0);
  for (const t of sets) options.push({ id: t.id, weight: exposure > 0 ? (weights.treads * t.exposure[arc]) / exposure : 0 });
  for (const core of ['sensors', 'reactor', 'fireControl', 'magazine'] as const) {
    if (b[core].hp > 0) options.push({ id: core, weight: weights[core] });
  }
  for (const h of b.hardpoints) {
    if (h.weapon && h.integrity.hp > 0) options.push({ id: h.slot.id, weight: h.slot.exposure[arc] ?? 0 });
  }
  return rng.weighted(options, (o) => o.weight)?.id ?? 'reactor';
}

/**
 * A working hardpoint for an attack aimed at the weapon mounts: weighted by exposure on the arc,
 * or any working one if none is exposed there. Null when no weapon is left.
 */
export function pickHardpoint(b: BehemothState, arc: ArmorArc, rng: Rng): ComponentId | null {
  // Pods are on the trailer, out of reach of hits on the hull.
  const live = b.hardpoints.filter((h) => h.weapon && h.integrity.hp > 0 && h.slot.position !== 'trailer');
  const exposed = rng.weighted(live, (h) => h.slot.exposure[arc] ?? 0);
  return (exposed ?? (live.length > 0 ? rng.pick(live) : null))?.slot.id ?? null;
}

/** Damage one component directly (also used by attacks that bypass armor, e.g. on the treads). */
export function damageComponent(b: BehemothState, id: ComponentId, amount: number, events: SimEvent[]): void {
  const c = component(b, id);
  if (!c || amount <= 0 || c.hp <= 0 || b.destroyed || b.invulnerable) return;
  c.hp = Math.max(0, c.hp - amount);
  events.push({ type: 'componentDamaged', component: id, amount });
  if (c.hp > 0) return;
  events.push({ type: 'componentDestroyed', component: id });
  if (!b.immobilized && treadSets(b).some((t) => t.id === id) && treadSets(b).every((t) => t.integrity.hp <= 0)) {
    b.immobilized = true;
    events.push({ type: 'immobilized' });
  }
  if (id === 'reactor') igniteReactor(b, events);
  if (id === 'magazine') cookOff(b, events);
}

/**
 * The hull's munitions: rounds left in every hardpoint on the hull that carries ammo (trailer
 * pods keep their own). They're what the magazine holds (SPEC §5.1).
 */
export function magazineRounds(b: BehemothState): HardpointState[] {
  return b.hardpoints.filter((h) => h.weapon && h.ammo !== null && h.ammo > 0 && h.slot.position !== 'trailer');
}

/**
 * Combined damage of the rounds left in the magazine: what a cook-off or the death blast has to work
 * with. Each shot counts one round's damage, even a salvo weapon's (a rack's shot is a salvo now), so
 * the cook-off kept its size when ammo moved to counting shots.
 */
export function magazineLoad(b: BehemothState): number {
  return magazineRounds(b).reduce((sum, h) => {
    const spec = h.weapon!.projectile;
    return sum + h.ammo! * ('damage' in spec ? spec.damage : 0);
  }, 0);
}

/**
 * Magazine cook-off (SPEC §5.1): every round left in the hull goes off. Behind intact blowout
 * panels it vents up through the deck, blowing them off and sparing everything else. Otherwise
 * the blast tears into the parts next to the magazine (`neighbors`) and every armor zone from the
 * inside. Either way the rounds are gone. A higher-grade magazine contains part of the blast (SPEC §5.6).
 */
export function cookOff(b: BehemothState, events: SimEvent[]): void {
  const damage = magazineLoad(b) * MAGAZINE.perDamage * (b.chassis.magazine.cookOff ?? 1);
  if (damage <= 0) return;
  for (const h of magazineRounds(b)) h.ammo = 0;
  const panels = b.addons.find((a) => a.def.kind === 'panels' && a.integrity && a.integrity.hp > 0);
  events.push({ type: 'cookOff', damage, vented: panels !== undefined });
  if (panels?.integrity) {
    damageComponent(b, panels.def.id, panels.integrity.hp, events);
    return;
  }
  const inside = damage * MAGAZINE.inside;
  const live = Object.entries(b.chassis.magazine.neighbors).filter(([id]) => {
    if (id === 'treads') return treadSets(b).some((t) => t.integrity.hp > 0);
    const h = b.hardpoints.find((hp) => hp.slot.id === id);
    return (h ? h.weapon !== null : true) && (component(b, id)?.hp ?? 0) > 0;
  });
  const total = live.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of live) {
    const share = (inside * w) / total;
    if (id === 'treads') damageTreads(b, share, events);
    else damageComponent(b, id, share, events);
  }
  const armor = (damage - (total > 0 ? inside : 0)) / ARMOR_ARCS.length;
  for (const arc of ARMOR_ARCS) damageArmor(b, arc, armor);
}

/** Starts the countdown to detonation (reactor destroyed, or self-destruct confirmed). */
export function igniteReactor(b: BehemothState, events: SimEvent[]): void {
  if (b.reactorFuse !== null || b.destroyed) return;
  b.reactorFuse = b.chassis.reactor.fuse;
  events.push({ type: 'reactorCritical', fuse: b.reactorFuse });
}

/** Self-destruct is available once Immobilized or with the reactor critical (SPEC §5.1). */
export function canSelfDestruct(b: BehemothState): boolean {
  return !b.destroyed && b.reactorFuse === null && (b.immobilized || fraction(b.reactor) <= b.chassis.reactor.criticalAt);
}

export function stepSelfDestruct(b: BehemothState, held: boolean, dt: number, events: SimEvent[]): void {
  if (!held || !canSelfDestruct(b)) {
    b.selfDestructHeld = 0;
    return;
  }
  b.selfDestructHeld += dt;
  if (b.selfDestructHeld >= DETONATION.selfDestructHold) {
    b.selfDestructHeld = 0;
    igniteReactor(b, events);
  }
}

/**
 * Detonation reach. Grows with reactor size today; remaining munitions and power join in once
 * those systems exist (SPEC §5.1).
 */
/** The reactor's blast radius, plus what the rounds still in the magazine add (SPEC §5.1). */
export function detonationRadius(b: BehemothState): number {
  return b.chassis.reactor.blastRadius + magazineLoad(b) * DETONATION.radiusPerMunition;
}
