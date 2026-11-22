import type { AddonId } from './addons';
import type { WeaponId } from './weapons';

/** Behemoth chassis classes (SPEC §5.5). Only the starting Class II exists so far. */

export type ChassisId = 'class2';

/**
 * The armor zones (SPEC §5.1). Which one a hit strikes depends on where it came from; the front is
 * split at the hull's centerline, so a hit from ahead lands on the half on its side.
 */
export type ArmorArc = 'frontLeft' | 'frontRight' | 'rear' | 'left' | 'right';

export const ARMOR_ARCS: readonly ArmorArc[] = ['frontLeft', 'frontRight', 'rear', 'left', 'right'];

/** Display names (depot, readouts). */
export const ARC_NAMES: Record<ArmorArc, string> = { frontLeft: 'front-left', frontRight: 'front-right', rear: 'rear', left: 'left', right: 'right' };

/** Internal components every chassis has, besides its hardpoints. */
export type CoreComponent = 'treads' | 'sensors' | 'reactor' | 'fireControl' | 'magazine';

export type HardpointSize = 'S' | 'M' | 'L';
/** Where a hardpoint sits on the hull; decides its firing arc (SPEC §5.2). */
export type MountPosition = 'turret' | 'front' | 'left' | 'right' | 'rear' | 'trailer';

export interface HardpointSlotDef {
  /** Unique within the chassis; also the component id in damage events. */
  id: string;
  name: string;
  size: HardpointSize;
  position: MountPosition;
  hp: number;
  /** Weight of being struck by damage that gets through each armor arc (missing = 0). */
  exposure: Partial<Record<ArmorArc, number>>;
  /**
   * Mount pivot in hull space (x forward, y to the right). A turret slot's is where it sits with its
   * ring facing forward; it turns with the ring.
   */
  mount: { x: number; y: number };
  /** Turret slots: the id of the ring (`TurretDef`) it turns with. */
  ring?: string;
  /** Firing arc relative to the hull's forward direction, in degrees (+ = to the right). */
  arc: { center: number; half: number };
  /** Multiplier on its own weapon's traverse (a `traverse` mod, SPEC §5.6); missing = 1. */
  traverse?: number;
}

/**
 * A turret ring (SPEC §5.2): a pivot with its own traverse rate. Its slots (`HardpointSlotDef.ring`)
 * turn with it and fire along its facing.
 */
export interface TurretDef {
  /** Unique within the Behemoth. */
  id: string;
  /** Pivot in hull space (x forward, y to the right). */
  pivot: { x: number; y: number };
  traverseDegPerSec: number;
  /** The ring's main slot: its integrity is the ring's (damage slows the traverse; destroyed, it's stuck). */
  slot: string;
}

export interface ReactorDef {
  hp: number;
  /** Power generated per second at full integrity, and capacitor size (SPEC §5.4). */
  output: number;
  capacitor: number;
  /** Seconds from reactor destruction (or a confirmed self-destruct) to detonation. */
  fuse: number;
  /** Detonation reach (world units) and damage before scaling (SPEC §5.1). */
  blastRadius: number;
  blastDamage: number;
  /** Self-destruct is allowed once the reactor is at or below this integrity (or when Immobilized). */
  criticalAt: number;
}

/** Where an add-on sits on a chassis (SPEC §5.5). A chassis takes only the add-ons it lists. */
export interface AddonMount {
  /** Sponsons: the hardpoint it adds. */
  hardpoint?: HardpointSlotDef;
  /** The turret ring it adds (its slot comes in `hardpoint`). */
  turret?: TurretDef;
  /** Units it widens the footprint by on each side (outboard tread pods). */
  widen?: number;
  /** Trailer: the tow hitch in hull space (on the rear). */
  hitch?: { x: number; y: number };
  /** Where it sits in hull space (x forward, y to the right), for damage effects. */
  anchors: { x: number; y: number }[];
}

export interface ChassisDef {
  id: ChassisId;
  name: string;
  /** Footprint in world units (length along the direction of travel, width across). */
  length: number;
  width: number;
  /**
   * Share of the footprint's length and width that meets the ground: rock contact and fording use
   * this smaller box (SPEC §4.2), so grazing a rock or the edge of a river is forgiving. Crushing,
   * ramming, and incoming fire use the full footprint.
   */
  ground: { length: number; width: number };
  /**
   * Ground speeds (units/s) at full tread integrity, carrying exactly its rated mass capacity.
   * Lighter loads go a little faster, heavier ones much slower (SPEC §5.3, `MASS`).
   */
  speed: { min: number; cruise: number; top: number };
  /** Forward acceleration (at rated load) and braking (units/s²) at full tread integrity. */
  accel: number;
  brake: number;
  /**
   * Lateral steering: max sideways speed, max sideways accel, how fast that accel builds and eases
   * off (jerk, units/s³: turns start and settle smoothly), and max sideways:forward ratio.
   */
  lateral: { maxSpeed: number; accel: number; jerk: number; maxRatio: number };
  /** Its own turret rings, main ring first. Add-ons can add more (`AddonMount.turret`). */
  turrets: TurretDef[];
  treadHp: number;
  /** Mass (tons) the tread set is rated to carry: installed weapons and add-ons (SPEC §5.3). */
  massCapacity: number;
  sensorsHp: number;
  /** Distance (world units) at which full-integrity sensors reveal hidden units (SPEC §5.1). */
  revealRadius: number;
  /** Multiplier on every auto weapon's reach (higher-grade sensors, SPEC §5.6); missing = 1. */
  sensorReach?: number;
  /**
   * Fire control (SPEC §5.2): its integrity, how many weapons the player can put on Auto that
   * aren't Auto by default (each takes a channel), and a multiplier on auto-fire spread (higher
   * grades, SPEC §5.6; missing = 1).
   */
  fireControl: { hp: number; channels: number; spread?: number };
  reactor: ReactorDef;
  /**
   * The ammo magazine (SPEC §5.1): its integrity, and how a cook-off's inside share is spread over
   * the parts next to it (weights by component: core ids, `treads` for every set, or hardpoint
   * slot ids; a missing or wrecked one is skipped). `cookOff` scales the blast (higher grades,
   * SPEC §5.6; missing = 1).
   */
  magazine: { hp: number; neighbors: Record<string, number>; cookOff?: number };
  armor: Record<ArmorArc, number>;
  /**
   * Weight of each core component being struck by damage that gets through each armor arc.
   * Hardpoints add their own `exposure` weights to the same draw.
   */
  internals: Record<ArmorArc, Record<CoreComponent, number>>;
  hardpoints: HardpointSlotDef[];
  /**
   * Where each core component sits in hull space (x forward, y to the right), for damage effects.
   * A component spread over the hull (the two tread pods) lists several points.
   */
  anchors: Record<CoreComponent, { x: number; y: number }[]>;
  /** Weapons installed at the start of a run, by slot id. */
  loadout: Record<string, WeaponId>;
  /** Built-in ram gear rating 0..1: cuts collision damage and speed dip (SPEC §4.2). */
  ram: number;
  /** The add-ons this chassis can take, and where they go. */
  addonMounts: Partial<Record<AddonId, AddonMount>>;
}

function slot(
  id: string,
  name: string,
  size: HardpointSize,
  position: MountPosition,
  hp: number,
  exposure: Partial<Record<ArmorArc, number>>,
  [x, y]: [number, number],
  [center, half]: [number, number],
  ring?: string,
): HardpointSlotDef {
  return { id, name, size, position, hp, exposure, mount: { x, y }, arc: { center, half }, ...(ring ? { ring } : {}) };
}

export const CHASSIS: Record<ChassisId, ChassisDef> = {
  class2: {
    id: 'class2',
    name: 'Class II',
    length: 64,
    width: 40,
    ground: { length: 0.8, width: 0.8 },
    speed: { min: 18, cruise: 36, top: 64 },
    accel: 11,
    brake: 22,
    // maxRatio 0.87 lets the hull angle up to ~41° off forward; maxSpeed 32 keeps that reachable
    // at cruise (36 × 0.87 ≈ 31).
    lateral: { maxSpeed: 32, accel: 45, jerk: 142, maxRatio: 0.87 },
    turrets: [{ id: 'main', pivot: { x: 4, y: 0 }, traverseDegPerSec: 75, slot: 'turret' }],
    treadHp: 100,
    // The starting loadout weighs 245 t (88%): room for a heavier gun or two, not a full refit.
    massCapacity: 280,
    sensorsHp: 40,
    revealRadius: 90,
    fireControl: { hp: 40, channels: 2 },
    // Aft of center under the spine rack, between the turret ring and the reactor.
    magazine: { hp: 40, neighbors: { spine: 1.5, turret: 1, reactor: 1, fireControl: 1, treads: 1.5 } },
    reactor: { hp: 90, output: 10, capacitor: 60, fuse: 2, blastRadius: 110, blastDamage: 400, criticalAt: 0.25 },
    // Each front half is as thick as a flank (user's call).
    armor: { frontLeft: 80, frontRight: 80, rear: 60, left: 80, right: 80 },
    // The reactor sits at the rear, sensors at the front, tread pods along the flanks, fire
    // control amidships under the turret (a little left of center), the magazine deep in the
    // hull aft of center (hard to reach from any side, a little easier from behind).
    internals: {
      frontLeft: { treads: 2, sensors: 2, reactor: 0.5, fireControl: 1.25, magazine: 0.3 },
      frontRight: { treads: 2, sensors: 2, reactor: 0.5, fireControl: 0.75, magazine: 0.3 },
      rear: { treads: 2, sensors: 0, reactor: 3, fireControl: 0.5, magazine: 0.6 },
      left: { treads: 4, sensors: 0.5, reactor: 1, fireControl: 0.75, magazine: 0.4 },
      right: { treads: 4, sensors: 0.5, reactor: 1, fireControl: 0.75, magazine: 0.4 },
    },
    hardpoints: [
      slot('turret', 'Turret', 'L', 'turret', 60, { frontLeft: 2, frontRight: 2, left: 1.5, right: 1.5, rear: 1 }, [4, 0], [0, 180], 'main'),
      slot('prow', 'Prow', 'M', 'front', 40, { frontLeft: 3, frontRight: 3 }, [22, 0], [0, 70]),
      slot('flankL', 'Left flank', 'S', 'left', 30, { left: 3 }, [-4, -10], [-90, 100]),
      slot('flankR', 'Right flank', 'S', 'right', 30, { right: 3 }, [-4, 10], [90, 100]),
      slot('spine', 'Spine', 'M', 'rear', 40, { rear: 2, left: 0.5, right: 0.5 }, [-13, 0], [0, 180]),
      slot('pd', 'Point defense', 'S', 'front', 25, { frontRight: 1.5, frontLeft: 0.5, right: 0.5 }, [16, 10], [0, 180]),
    ],
    anchors: {
      treads: [-18, 0, 18].flatMap((x) => [-1, 1].map((side) => ({ x, y: side * 14.5 }))),
      sensors: [{ x: 18, y: -7.5 }, { x: 18, y: 7.5 }],
      reactor: [{ x: -19, y: 0 }],
      fireControl: [{ x: 10, y: -4 }],
      magazine: [{ x: -8, y: 0 }],
    },
    loadout: { turret: 'heavyCannon', prow: 'autocannon', spine: 'missileRack', flankL: 'apGuns', flankR: 'apGuns', pd: 'pdLaser' },
    ram: 0,
    addonMounts: {
      ramPlow: { anchors: [{ x: 30, y: -9 }, { x: 31, y: 9 }, { x: 33, y: 0 }] },
      // A second pair of pods outside the first: the hull goes from 40 to 56 units wide.
      outerTreads: { widen: 8, anchors: [-18, 0, 18].flatMap((x) => [-1, 1].map((side) => ({ x, y: side * 24 }))) },
      // Sponsons ride on the inner tread pods, ahead of the flank mounts, and cover that side
      // and a little forward.
      sponsonL: {
        hardpoint: slot('sponsonL', 'Left sponson', 'M', 'left', 40, { left: 2.5, frontLeft: 1 }, [10, -16], [-75, 95]),
        anchors: [{ x: 10, y: -16 }],
      },
      sponsonR: {
        hardpoint: slot('sponsonR', 'Right sponson', 'M', 'right', 40, { right: 2.5, frontRight: 1 }, [10, 16], [75, 95]),
        anchors: [{ x: 10, y: 16 }],
      },
      // A second turret ring raised on the aft deck over the spine, firing over the main turret.
      // A little quicker on its traverse than the main ring, so the two read as separate guns.
      dorsalRing: {
        turret: { id: 'dorsal', pivot: { x: -14, y: 0 }, traverseDegPerSec: 90, slot: 'dorsalRing' },
        hardpoint: slot('dorsalRing', 'Dorsal turret', 'L', 'turret', 60, { rear: 2, left: 1.5, right: 1.5, frontLeft: 1, frontRight: 1 }, [-14, 0], [0, 180], 'dorsal'),
        anchors: [{ x: -14, y: 0 }],
      },
      // Beside the main gun, on the turret's right cheek: it turns with the main ring and fires
      // along its facing (no traverse of its own).
      coax: {
        hardpoint: slot('coax', 'Coaxial mount', 'M', 'turret', 30, { frontLeft: 1, frontRight: 1, left: 0.5, right: 0.5, rear: 0.5 }, [10, 5], [0, 180], 'main'),
        anchors: [{ x: 10, y: 5 }],
      },
      // Hinged plates in the deck over the magazine.
      blowoutPanels: { anchors: [{ x: -8, y: -8 }, { x: -8, y: 8 }] },
      // The trailer's own parts are placed in trailer space (`TrailerAddon.bays`); the anchor is the hitch.
      trailer: { hitch: { x: -32, y: 0 }, anchors: [{ x: -32, y: 0 }] },
    },
  },
};
