import type { ArmorArc } from './chassis';

/**
 * Add-ons (SPEC §5.5): bolted on at depots, they physically grow the Behemoth. Each kind works
 * through a part of the damage model that already exists:
 * - a **plow** is a blade over the nose that takes ram and plowing damage before the front armor
 *   does (fire never touches it) and adds ram gear while it holds;
 * - a **tread set** is another set of tread pods with its own integrity and mass capacity;
 * - a **mount** adds a hardpoint, and its integrity is the hardpoint's: a sponson's on the hull
 *   side, the dorsal ring's on a turret ring of its own (`AddonMount.turret`), the coaxial mount's
 *   on the main turret;
 * - **blowout panels** are hinged plates over the magazine: a cook-off vents up through them
 *   instead of into the hull, blowing them off (fire never touches them);
 * - a **trailer** is towed behind the hull: its own armor, frame, and module bays
 *   (content/trailer.ts). Its integrity is the frame's. They come in three sizes (two, three, and
 *   four bays); a Behemoth tows one, and a bigger one bought at a depot takes over the modules of
 *   the one it replaces.
 * Where each sits on the hull, and a mount's slot (and ring), are per chassis (`ChassisDef.addonMounts`).
 * A mount's slot id is the add-on's id.
 */

export type AddonId =
  | 'ramPlow'
  | 'outerTreads'
  | 'sponsonL'
  | 'sponsonR'
  | 'dorsalRing'
  | 'coax'
  | 'twinTurret'
  | 'blowoutPanels'
  | 'trailer'
  | 'heavyTrailer'
  | 'superTrailer';

interface AddonBase {
  id: AddonId;
  name: string;
  /** Short name for tight spots (HUD readout). */
  short: string;
  /** One line on what it's for (depot). */
  blurb: string;
  /** Tons, on top of whatever it carries (SPEC §5.3). */
  mass: number;
}

/**
 * A ram plow (SPEC §5.5): rams, plowing, and rock scraping at the nose wear it first, and what it
 * can't take spills into the front armor half that struck. Incoming fire skips it. It takes two
 * upgrades at a depot (SPEC §5.6): Harden (more `hp`) and the Breaker (`breaksRock`).
 */
export interface PlowAddon extends AddonBase {
  kind: 'plow';
  hp: number;
  /** Ram gear rating it adds while it holds (SPEC §4.2). */
  ram: number;
  /**
   * The Breaker upgrade is fitted: while the blade holds, rock at the nose is broken and driven
   * over instead of turning the hull aside (SPEC §4.2). Set by `fitAddon`, never in the table.
   */
  breaksRock?: boolean;
}

/**
 * Blowout panels (SPEC §5.1, §5.5): while they're on, a magazine cook-off vents outward. The rounds
 * are still lost, but nothing inside is hurt; the panels blow off and must be repaired at a depot
 * before they work again. Incoming fire skips them.
 */
export interface PanelsAddon extends AddonBase {
  kind: 'panels';
  hp: number;
}

export interface TreadAddon extends AddonBase {
  kind: 'treads';
  hp: number;
  /** Mass capacity (tons) it adds while it still works. */
  capacity: number;
  /**
   * Share of tread damage it takes from each arc, against the built-in set's 1 on every arc:
   * outboard pods shield the inner ones from the flanks.
   */
  exposure: Record<ArmorArc, number>;
}

export interface MountAddon extends AddonBase {
  kind: 'mount';
}

/**
 * A towed, articulated unit (SPEC §5.5). It's a target of its own: rounds that reach it first hit
 * it, its armor takes them, and what gets through strikes the frame or a module. At zero frame
 * integrity it's wrecked and cooks off; it can also be jettisoned to lie in the track as a mine.
 */
export interface TrailerAddon extends AddonBase {
  kind: 'trailer';
  /** Frame integrity. Its modules have their own. */
  hp: number;
  /** One armor pool all round: it absorbs every hit on the trailer first. */
  armor: number;
  /** Footprint (units): length along the tow, width across. */
  length: number;
  width: number;
  /** Gap from the hitch on the hull's rear to the trailer's front. */
  towBar: number;
  /** Most the trailer swings off the hull's line, in degrees. */
  maxSwing: number;
  /** Module bays, front first, in trailer space (x forward from its center, y to the right). */
  bays: { x: number; y: number }[];
  /** Weight of damage through the armor striking the frame, and each working module. */
  exposure: { frame: number; module: number };
  /** The empty frame's cook-off; modules add their own (`ModuleDef.blast`). */
  blast: { radius: number; damage: number };
}

export type AddonDef = PlowAddon | PanelsAddon | TreadAddon | MountAddon | TrailerAddon;

export const ADDONS: Record<AddonId, AddonDef> = {
  ramPlow: {
    id: 'ramPlow',
    kind: 'plow',
    name: 'Ram plow',
    short: 'Ram plow',
    blurb: 'A blade over the nose that takes the rams. Plow towns flat.',
    // With the starting loadout (245 t) it sits right at the Class II's capacity (280).
    mass: 35,
    hp: 80,
    ram: 0.6,
  },
  outerTreads: {
    id: 'outerTreads',
    kind: 'treads',
    name: 'Outboard treads',
    short: 'Out treads',
    blurb: 'A second pair of pods: carry more, widen the hull.',
    mass: 35,
    hp: 100,
    capacity: 140,
    exposure: { frontLeft: 1, frontRight: 1, rear: 1, left: 4, right: 4 },
  },
  sponsonL: { id: 'sponsonL', kind: 'mount', name: 'Left sponson', short: 'L sponson', blurb: 'An M hardpoint on the left side.', mass: 15 },
  sponsonR: { id: 'sponsonR', kind: 'mount', name: 'Right sponson', short: 'R sponson', blurb: 'An M hardpoint on the right side.', mass: 15 },
  dorsalRing: {
    id: 'dorsalRing',
    kind: 'mount',
    name: 'Dorsal turret ring',
    short: 'Dorsal',
    blurb: 'A second main-gun turret, raised aft. Bring treads.',
    mass: 25,
  },
  coax: {
    id: 'coax',
    kind: 'mount',
    name: 'Coaxial mount',
    short: 'Coax',
    blurb: 'An M gun beside the main gun: fires where it points.',
    mass: 5,
  },
  // The main turret rebuilt wider, with a second main-gun mount beside the first (user's request,
  // Nov 2026). Both guns turn with the main ring; on one trigger they ripple.
  twinTurret: {
    id: 'twinTurret',
    kind: 'mount',
    name: 'Twin turret',
    short: 'Twin',
    blurb: 'The main turret rebuilt for two main guns. Bring treads.',
    mass: 30,
  },
  blowoutPanels: {
    id: 'blowoutPanels',
    kind: 'panels',
    name: 'Blowout panels',
    short: 'Panels',
    blurb: 'A magazine cook-off vents up and out, not into the hull.',
    mass: 10,
    hp: 30,
  },
  trailer: {
    id: 'trailer',
    kind: 'trailer',
    name: 'Trailer',
    short: 'Trailer',
    blurb: 'Towed: two module bays; soaks fire from behind.',
    mass: 30,
    hp: 70,
    armor: 60,
    length: 34,
    width: 26,
    towBar: 6,
    maxSwing: 50,
    bays: [
      { x: 7, y: 0 },
      { x: -8, y: 0 },
    ],
    exposure: { frame: 2, module: 1.5 },
    blast: { radius: 36, damage: 50 },
  },
  // The bigger trailers (user's request, Nov 2026): a bay is 15 units of bed, so each is that much
  // longer, heavier, and tougher than the one before.
  heavyTrailer: {
    id: 'heavyTrailer',
    kind: 'trailer',
    name: 'Heavy trailer',
    short: 'Trailer',
    blurb: 'Towed: three module bays; soaks fire from behind.',
    mass: 45,
    hp: 95,
    armor: 80,
    length: 49,
    width: 26,
    towBar: 6,
    maxSwing: 50,
    bays: [
      { x: 14.5, y: 0 },
      { x: -0.5, y: 0 },
      { x: -15.5, y: 0 },
    ],
    exposure: { frame: 2, module: 1.5 },
    blast: { radius: 40, damage: 60 },
  },
  superTrailer: {
    id: 'superTrailer',
    kind: 'trailer',
    name: 'Super-heavy trailer',
    short: 'Trailer',
    blurb: 'Towed: four module bays, as long as the hull.',
    mass: 60,
    hp: 120,
    armor: 100,
    length: 64,
    width: 26,
    towBar: 6,
    maxSwing: 50,
    bays: [
      { x: 22, y: 0 },
      { x: 7, y: 0 },
      { x: -8, y: 0 },
      { x: -23, y: 0 },
    ],
    exposure: { frame: 2, module: 1.5 },
    blast: { radius: 44, damage: 70 },
  },
};

/** The trailer among these add-ons (a Behemoth tows one at most), or null. */
export function trailerOf(addons: readonly AddonId[]): TrailerAddon | null {
  for (const id of addons) {
    const def = ADDONS[id];
    if (def.kind === 'trailer') return def;
  }
  return null;
}
