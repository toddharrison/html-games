import type { ObstacleClass } from './obstacles';

/** Terrain materials for the destructible tile grid (SPEC §4.5, §4.6). */

export type TileState = 'intact' | 'damaged' | 'destroyed' | 'flattened';

export type MaterialId =
  | 'ground'
  | 'road'
  | 'forest'
  | 'building'
  | 'rock'
  | 'shallows'
  | 'water'
  // Common features (any biome)
  | 'crater'
  | 'tankTrap'
  | 'wall'
  | 'bunker'
  | 'mine'
  | 'bridge'
  | 'lightBridge'
  | 'footbridge'
  | 'car'
  // Temperate
  | 'hedgerow'
  | 'farmland'
  // Arctic
  | 'ice'
  | 'thinIce'
  | 'snowdrift'
  // Industrial
  | 'factory'
  | 'fuelTank'
  | 'rail'
  // Desert
  | 'dune'
  | 'wadi'
  | 'derrick'
  // Blasted wasteland
  | 'wreck'
  | 'glass';

/** How a unit moves over terrain: tracked vehicles, or troops on foot. */
export type MobilityId = 'tracked' | 'foot';

/**
 * How an enemy unit moves: a ground mobility, or a hovercraft's, which glides over water and ice
 * as if it were open ground and otherwise goes where tracked vehicles go, or skis (SPEC §7.4 ski
 * troops): full speed over snow, drifts, and ice, and a slog on foot over anything else
 * (`Terrain.speedAt`).
 */
export type UnitMobility = MobilityId | 'hover' | 'ski' | 'walker';

/**
 * A walker's pace on a tile (SPEC §7.4 spider walker): it strides over rock, wrecks, craters,
 * rubble, trap belts, dunes, and drifts as if they were open ground, clambers over standing
 * structures at `climb`, wades shallows like a tank, and can't cross deep water.
 */
export function walkerSpeed(mat: MaterialId, state: TileState, climb: number): number {
  if (mat === 'water') return 0;
  if (mat === 'shallows') return MATERIALS[mat].speed.tracked[state];
  const standing = state === 'intact' || state === 'damaged';
  const structure = mat === 'building' || mat === 'factory' || mat === 'wall' || mat === 'bunker' || mat === 'fuelTank' || mat === 'derrick';
  return standing && structure ? climb : 1;
}

/** What skis glide over: open snow (an arctic field's open ground), drifts, and ice. */
export function skiable(mat: MaterialId): boolean {
  return mat === 'ground' || mat === 'snowdrift' || mat === 'ice' || mat === 'thinIce';
}

/** What a hovercraft skims over freely: open water and ice. */
export function hoverable(mat: MaterialId): boolean {
  return mat === 'water' || mat === 'shallows' || mat === 'ice' || mat === 'thinIce' || mat === 'footbridge';
}

/** What a tile throws off when it's knocked down, for effects and sound. */
export type Debris = 'wood' | 'masonry' | 'rock' | 'metal' | 'ice';

export interface MaterialDef {
  id: MaterialId;
  /** Hit points while intact; 0 = can't be damaged by weapons. */
  maxHp: number;
  /** Becomes `damaged` at or below this fraction of maxHp. */
  damagedAt: number;
  /** Obstacle class the Behemoth meets when driving into each state. */
  obstacle: Record<TileState, ObstacleClass>;
  /** Whether each state stops direct-fire projectiles. */
  blocksShots: Record<TileState, boolean>;
  /** Movement speed multiplier per mobility type (1 = normal, 0 = impassable). */
  speed: Record<MobilityId, Record<TileState, number>>;
  /** States infantry use as cover (SPEC §7: they hide in forests and buildings). */
  cover: Record<TileState, boolean>;
  /**
   * States that hide units able to conceal themselves (SPEC §4.5): they stay invisible until the
   * Behemoth's sensors reveal them or the tile is cleared.
   */
  conceals: Record<TileState, boolean>;
  /**
   * Share of incoming damage a unit taking cover here avoids (0 = none). Only troops on foot use
   * it. Walls that block shots also stop direct fire outright (rounds hit the building first), so
   * a garrison is dug out with splash, lobbed shells, or by knocking the building down.
   */
  protection: Record<TileState, number>;
  /** Salvage for knocking a tile down (intact or damaged → destroyed or flattened). */
  salvage?: number;
  /**
   * Ground the Behemoth drags through (SPEC §4.5): the speed limit it holds the hull to (its
   * tread-scaled cruise or minimum speed) and tread wear per 100 units driven through it, both
   * scaled by how much of the footprint is in it (see WADING). `label` is the HUD's speed tag.
   */
  wading?: { cap: 'cruise' | 'min'; wear: number; label: string };
  /**
   * Traction for the Behemoth (1 = full): ice lets it slide (SPEC §4.6). Scales its forward and
   * sideways acceleration, blended by how much of the ground box is on it.
   */
  grip?: number;
  /** The HUD's speed tag while the treads are sliding on it (low `grip`): ICE, GLASS. */
  slipTag?: string;
  /**
   * Tons the tile holds (SPEC §4.5 bridges, §4.6 thin ice). A heavier Behemoth over it either
   * collapses the whole span at once (`span`, bridges) or cracks the tiles under it until they
   * give way (`crack`, thin ice; faster the heavier it is). Enemy vehicles are always light enough.
   * A `quiet` span (a footbridge) is too slight to jolt the hull when it goes.
   */
  bearing?: { limit: number; give: 'span' | 'crack'; quiet?: boolean };
  /**
   * What the tile turns into once it's destroyed or crushed, starting intact: another material, or
   * `under`, the one it was built over (a bridge falls into its river).
   */
  breaksTo?: MaterialId | 'under';
  /** Goes up when destroyed or crushed (SPEC §4.6 fuel tanks, minefields): a blast that can chain. */
  explodes?: { radius: number; damage: number; fuse: number; fire?: boolean };
  /** Invisible until the Behemoth's sensors sweep it (minefields): it looks like open ground. */
  hidden?: boolean;
  /** Open ground: a single blast hit this hard (tile damage) leaves a crater. */
  scars?: number;
  /** What knocking it down throws off (effects and sound). */
  debris?: Debris;
  /**
   * It burns once set alight (SPEC §6 flamethrower, `sim/fire.ts`), while it stands: the fire eats
   * `dps` of its hit points a second until it's down (a forest burns to a clearing), and each
   * second has `spread` odds of catching each burnable neighbor (side by side, not corners).
   */
  burns?: { dps: number; spread: number };
}

const ALL_CLEAR = { intact: 1, damaged: 1, destroyed: 1, flattened: 1 };
const NO_COVER = { intact: false, damaged: false, destroyed: false, flattened: false };
const NO_OBSTACLE = { intact: 'none', damaged: 'none', destroyed: 'none', flattened: 'none' } as const;
/** The same value in every state (for terrain that can't be damaged). */
const every = <T>(v: T) => ({ intact: v, damaged: v, destroyed: v, flattened: v });
const NO_PROTECTION = every(0);
/** Standing structures: `standing` while intact or damaged, `down` once destroyed or flattened. */
const standing = <T>(up: T, down: T) => ({ intact: up, damaged: up, destroyed: down, flattened: down });

/** River water (splashes, no scorch marks, no plasma pools). */
export function isWet(mat: MaterialId): boolean {
  return mat === 'water' || mat === 'shallows';
}

/** Big blasts (heavy shells, missiles, detonations) crater open ground (tile damage per hit). */
const SCARS = 100;

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  ground: {
    id: 'ground',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: ALL_CLEAR, foot: ALL_CLEAR },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    scars: SCARS,
  },
  road: {
    // Town streets and squares: cosmetic for now.
    id: 'road',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: ALL_CLEAR, foot: ALL_CLEAR },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    scars: SCARS,
  },
  forest: {
    id: 'forest',
    maxHp: 30,
    damagedAt: 0.5,
    // Destroyed forest = burnt clearing; flattened = crushed under the treads.
    obstacle: { intact: 'trivial', damaged: 'trivial', destroyed: 'none', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: {
      tracked: { intact: 0.55, damaged: 0.7, destroyed: 1, flattened: 1 },
      foot: { intact: 0.85, damaged: 0.9, destroyed: 1, flattened: 1 },
    },
    cover: standing(true, false),
    // A burnt clearing or flattened trees hide nothing.
    conceals: standing(true, false),
    // Trees soak up some shrapnel; thinned out, less.
    protection: { intact: 0.3, damaged: 0.2, destroyed: 0, flattened: 0 },
    debris: 'wood',
    // Dry timber: it burns down in about 6 s, and a forest fire runs through a wood.
    burns: { dps: 5, spread: 0.35 },
  },
  building: {
    id: 'building',
    maxHp: 120,
    damagedAt: 0.5,
    // Destroyed building = rubble (light obstacle); flattened = rubble ground into the dirt.
    obstacle: { intact: 'medium', damaged: 'medium', destroyed: 'light', flattened: 'none' },
    blocksShots: standing(true, false),
    // Troops garrison buildings (SPEC §4.5): they move in (slowly) and fire out of them.
    speed: {
      tracked: { intact: 0, damaged: 0, destroyed: 0.6, flattened: 1 },
      foot: { intact: 0.5, damaged: 0.6, destroyed: 0.8, flattened: 1 },
    },
    cover: { intact: true, damaged: true, destroyed: true, flattened: false },
    // A garrison is hidden until sensors pick it up; rubble is cover but not concealment.
    conceals: standing(true, false),
    // Better than trees: walls stop direct fire and most of a blast.
    protection: { intact: 0.6, damaged: 0.5, destroyed: 0.2, flattened: 0 },
    salvage: 2,
    debris: 'masonry',
    // A slow burn (about 20 s) that only now and then jumps to the house next door.
    burns: { dps: 6, spread: 0.08 },
  },
  rock: {
    // Outcrops and ridges: indestructible, block direct fire, deflect the Behemoth (SPEC §4.5).
    // `destroyed` only happens when a Behemoth boxed in both ways grinds a face down (sim/collision.ts).
    id: 'rock',
    maxHp: 0,
    damagedAt: 0,
    obstacle: { intact: 'immovable', damaged: 'immovable', destroyed: 'light', flattened: 'none' },
    blocksShots: standing(true, false),
    speed: {
      tracked: { intact: 0, damaged: 0, destroyed: 0.6, flattened: 1 },
      foot: { intact: 0, damaged: 0, destroyed: 0.8, flattened: 1 },
    },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    debris: 'rock',
  },
  shallows: {
    // River banks and fords: tracked units slow down; the Behemoth can't surge through.
    id: 'shallows',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.5), foot: every(0.6) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    wading: { cap: 'cruise', wear: 0, label: 'WADE' },
  },
  water: {
    // A river's deep channel (or broken ice): tracked units can't enter it, troops wade it slowly,
    // and the Behemoth fords it at minimum speed with the treads churning the riverbed.
    id: 'water',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0), foot: every(0.35) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    wading: { cap: 'min', wear: 8, label: 'FORD' },
  },

  // ── Common features (SPEC §4.5) ───────────────────────────────────────────────────────────

  crater: {
    // Shell holes: rough going for small units, a scrape to hide in for troops. Big blasts make new ones.
    id: 'crater',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.75), foot: every(0.9) },
    cover: every(true),
    conceals: NO_COVER,
    protection: every(0.25),
  },
  tankTrap: {
    // Dragon's teeth: concrete pyramids that stop tracked vehicles and chew up the Behemoth's treads
    // unless they're shot down first.
    id: 'tankTrap',
    maxHp: 60,
    damagedAt: 0.5,
    obstacle: { intact: 'trap', damaged: 'trap', destroyed: 'none', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: {
      tracked: { intact: 0, damaged: 0, destroyed: 1, flattened: 1 },
      foot: { intact: 0.8, damaged: 0.85, destroyed: 1, flattened: 1 },
    },
    cover: standing(true, false),
    conceals: NO_COVER,
    protection: standing(0.15, 0),
    debris: 'masonry',
    salvage: 1,
  },
  wall: {
    // Fortification walls: tough, block fire, and the Behemoth plows through them at a cost.
    id: 'wall',
    maxHp: 200,
    damagedAt: 0.5,
    obstacle: { intact: 'heavy', damaged: 'medium', destroyed: 'light', flattened: 'none' },
    blocksShots: standing(true, false),
    speed: {
      tracked: { intact: 0, damaged: 0, destroyed: 0.6, flattened: 1 },
      foot: { intact: 0, damaged: 0, destroyed: 0.8, flattened: 1 },
    },
    cover: { intact: false, damaged: false, destroyed: true, flattened: false },
    conceals: NO_COVER,
    protection: { intact: 0, damaged: 0, destroyed: 0.2, flattened: 0 },
    salvage: 2,
    debris: 'masonry',
  },
  bunker: {
    // Hardened pillboxes: infantry garrison them like buildings, better protected. (Armed
    // emplacements arrive with Breach mode.)
    id: 'bunker',
    maxHp: 360,
    damagedAt: 0.5,
    obstacle: { intact: 'heavy', damaged: 'heavy', destroyed: 'light', flattened: 'none' },
    blocksShots: standing(true, false),
    speed: {
      tracked: { intact: 0, damaged: 0, destroyed: 0.6, flattened: 1 },
      foot: { intact: 0.4, damaged: 0.5, destroyed: 0.8, flattened: 1 },
    },
    cover: { intact: true, damaged: true, destroyed: true, flattened: false },
    conceals: standing(true, false),
    protection: { intact: 0.8, damaged: 0.65, destroyed: 0.25, flattened: 0 },
    salvage: 8,
    debris: 'masonry',
  },
  mine: {
    // A buried mine (one per tile in a minefield): looks like open ground until the sensors sweep
    // it. The treads set it off (under the hull, it hits the treads); any hit from a weapon does too.
    // Enemy units know where their own mines are and never trigger them.
    id: 'mine',
    maxHp: 1,
    damagedAt: 0,
    obstacle: { intact: 'trivial', damaged: 'trivial', destroyed: 'none', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: { tracked: ALL_CLEAR, foot: ALL_CLEAR },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    hidden: true,
    explodes: { radius: 14, damage: 30, fuse: 0 },
    breaksTo: 'crater',
  },
  bridge: {
    // A girder bridge over a river: the fast, dry crossing, and the only one besides fords for
    // tracked enemies. Holds any but the heaviest Behemoth; a few heavy shells drop it.
    id: 'bridge',
    maxHp: 120,
    damagedAt: 0.5,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: ALL_CLEAR, foot: ALL_CLEAR },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    bearing: { limit: 400, give: 'span' },
    breaksTo: 'under',
    debris: 'metal',
  },
  lightBridge: {
    // A light road bridge: a stock Behemoth crosses it, a heavily loaded one brings it down.
    id: 'lightBridge',
    maxHp: 50,
    damagedAt: 0.5,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: ALL_CLEAR, foot: ALL_CLEAR },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    bearing: { limit: 300, give: 'span' },
    breaksTo: 'under',
    debris: 'wood',
  },
  footbridge: {
    // A narrow plank or girder footbridge over a river (SPEC §4.5): troops cross dry-shod; vehicles
    // can't get on it, and the Behemoth's weight brings the whole span down without slowing it
    // (it's fording beside it anyway).
    id: 'footbridge',
    maxHp: 14,
    damagedAt: 0.5,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0), foot: every(1) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    bearing: { limit: 20, give: 'span', quiet: true },
    breaksTo: 'under',
    debris: 'wood',
  },
  car: {
    // Cars parked along a street or left on a road (SPEC §4.6 "Settlements"): like rubble, light
    // going that slows small units and gives troops a little cover. The treads crush them flat; a
    // hit burns one out where it stands.
    id: 'car',
    maxHp: 16,
    damagedAt: 0.5,
    obstacle: { intact: 'light', damaged: 'light', destroyed: 'light', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: {
      tracked: { intact: 0.6, damaged: 0.6, destroyed: 0.7, flattened: 1 },
      foot: { intact: 0.8, damaged: 0.8, destroyed: 0.85, flattened: 1 },
    },
    cover: { intact: true, damaged: true, destroyed: true, flattened: false },
    conceals: NO_COVER,
    protection: { intact: 0.2, damaged: 0.2, destroyed: 0.15, flattened: 0 },
    debris: 'metal',
    burns: { dps: 4, spread: 0.12 },
  },

  // ── Temperate (SPEC §4.6) ──────────────────────────────────────────────────────────────────

  hedgerow: {
    // Thick, banked hedges along field edges: they slow vehicles, hide infantry, and the Behemoth
    // tears straight through them.
    id: 'hedgerow',
    maxHp: 25,
    damagedAt: 0.5,
    obstacle: { intact: 'trivial', damaged: 'trivial', destroyed: 'none', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: {
      tracked: { intact: 0.35, damaged: 0.6, destroyed: 1, flattened: 1 },
      foot: { intact: 0.7, damaged: 0.85, destroyed: 1, flattened: 1 },
    },
    cover: standing(true, false),
    conceals: standing(true, false),
    protection: { intact: 0.25, damaged: 0.15, destroyed: 0, flattened: 0 },
    debris: 'wood',
    burns: { dps: 5, spread: 0.4 },
  },
  farmland: {
    // Crop fields: open ground that the treads flatten as they pass (cosmetic).
    id: 'farmland',
    maxHp: 0,
    damagedAt: 0,
    obstacle: { intact: 'soft', damaged: 'soft', destroyed: 'none', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: { tracked: every(0.9), foot: every(0.9) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    scars: SCARS,
  },

  // ── Arctic (SPEC §4.6) ─────────────────────────────────────────────────────────────────────

  ice: {
    // Solid ice sheets (frozen lakes, river banks): the Behemoth slides, losing most of its grip.
    id: 'ice',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.8), foot: every(0.7) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    grip: 0.3,
    slipTag: 'ICE',
  },
  thinIce: {
    // Thin ice over deep water (frozen channels, lake centers): enemy vehicles drive across, a
    // heavy Behemoth cracks it and drops into icy water. Shells break holes in it too.
    id: 'thinIce',
    maxHp: 12,
    damagedAt: 0.5,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.8), foot: every(0.7) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    grip: 0.4,
    slipTag: 'ICE',
    bearing: { limit: 200, give: 'crack' },
    breaksTo: 'water',
    debris: 'ice',
  },
  snowdrift: {
    // Deep drifts: hold the Behemoth to cruise (no surge) and bog small units down.
    id: 'snowdrift',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.5), foot: every(0.55) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    wading: { cap: 'cruise', wear: 0, label: 'DRIFT' },
  },

  // ── Industrial (SPEC §4.6) ─────────────────────────────────────────────────────────────────

  factory: {
    // Factory halls: big, tough buildings that pay well when they come down. Sheet-metal walls, so
    // plowing through one costs no more than a house per tile (a whole hall of heavy tiles would
    // stop the Behemoth in its tracks).
    id: 'factory',
    maxHp: 260,
    damagedAt: 0.5,
    obstacle: { intact: 'medium', damaged: 'medium', destroyed: 'light', flattened: 'none' },
    blocksShots: standing(true, false),
    speed: {
      tracked: { intact: 0, damaged: 0, destroyed: 0.6, flattened: 1 },
      foot: { intact: 0.5, damaged: 0.6, destroyed: 0.8, flattened: 1 },
    },
    cover: { intact: true, damaged: true, destroyed: true, flattened: false },
    conceals: standing(true, false),
    protection: { intact: 0.6, damaged: 0.5, destroyed: 0.2, flattened: 0 },
    salvage: 5,
    debris: 'metal',
  },
  fuelTank: {
    // Storage tanks: a hit that holes one sets it off, and the blast sets off its neighbors (SPEC
    // §4.6: explosive terrain is a weapon for either side). Plowing into one blows it under the hull.
    id: 'fuelTank',
    maxHp: 25,
    damagedAt: 0.5,
    obstacle: { intact: 'medium', damaged: 'medium', destroyed: 'none', flattened: 'none' },
    blocksShots: standing(true, false),
    speed: { tracked: standing(0, 1), foot: standing(0, 1) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    // Reaches the next tank in a farm (2 tiles away) with enough left to hole it.
    explodes: { radius: 40, damage: 50, fuse: 0.25, fire: true },
    breaksTo: 'crater',
    debris: 'metal',
    salvage: 2,
    // It burns a few seconds, then goes up.
    burns: { dps: 8, spread: 0 },
  },
  rail: {
    // Rail lines along the direction of travel (armored train routes in M4). The treads twist them.
    id: 'rail',
    maxHp: 0,
    damagedAt: 0,
    obstacle: { intact: 'soft', damaged: 'soft', destroyed: 'none', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: { tracked: ALL_CLEAR, foot: ALL_CLEAR },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
  },

  // ── Desert (SPEC §4.6) ─────────────────────────────────────────────────────────────────────

  dune: {
    // Soft sand ridges: hold the Behemoth to cruise (no surge) and bog small units down.
    id: 'dune',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.5), foot: every(0.6) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    wading: { cap: 'cruise', wear: 0, label: 'SAND' },
  },
  wadi: {
    // A dry riverbed: vehicles drive along its sandy bottom; infantry lie hidden in it (it's below
    // the line of sight until the sensors look down into it).
    id: 'wadi',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.85), foot: every(1) },
    cover: every(true),
    conceals: every(true),
    protection: every(0.3),
    scars: SCARS,
  },
  derrick: {
    // An oil derrick: a lattice tower over a wellhead (shots pass through it). Holed, it goes up
    // bigger and slower than a fuel tank; knocked down, it pays like the machinery it is.
    id: 'derrick',
    maxHp: 40,
    damagedAt: 0.5,
    obstacle: { intact: 'medium', damaged: 'medium', destroyed: 'none', flattened: 'none' },
    blocksShots: NO_COVER,
    speed: { tracked: standing(0, 1), foot: standing(0.5, 1) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    salvage: 3,
    explodes: { radius: 44, damage: 60, fuse: 0.4, fire: true },
    breaksTo: 'crater',
    debris: 'metal',
    burns: { dps: 6, spread: 0 },
  },

  // ── Blasted wasteland (SPEC §4.6) ──────────────────────────────────────────────────────────

  wreck: {
    // The burnt-out hulk of a vehicle from an older war: it stops fire, hides infantry, and cut
    // apart it pays scrap.
    id: 'wreck',
    maxHp: 150,
    damagedAt: 0.5,
    obstacle: { intact: 'medium', damaged: 'medium', destroyed: 'light', flattened: 'none' },
    blocksShots: standing(true, false),
    speed: {
      tracked: { intact: 0, damaged: 0, destroyed: 0.6, flattened: 1 },
      foot: { intact: 0.6, damaged: 0.7, destroyed: 0.8, flattened: 1 },
    },
    cover: { intact: true, damaged: true, destroyed: true, flattened: false },
    conceals: standing(true, false),
    protection: { intact: 0.5, damaged: 0.4, destroyed: 0.2, flattened: 0 },
    salvage: 4,
    debris: 'metal',
  },
  glass: {
    // Ground fused to glass where something enormous once went up: slick under the treads.
    id: 'glass',
    maxHp: 0,
    damagedAt: 0,
    obstacle: NO_OBSTACLE,
    blocksShots: NO_COVER,
    speed: { tracked: every(0.9), foot: every(0.8) },
    cover: NO_COVER,
    conceals: NO_COVER,
    protection: NO_PROTECTION,
    grip: 0.5,
    slipTag: 'GLASS',
  },
};
