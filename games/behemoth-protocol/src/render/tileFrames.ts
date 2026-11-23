import type { BiomeId } from '../content/biomes';
import { HALL_STYLES, ROAD_STYLES, SPARSE_TREES, STRUCTURES, structuresOf, TREE_IDS, type RoadStyle, type StructureId, type TileArt, type TreeId } from '../content/structures';
import { TERRAIN_GEN } from '../content/tuning';
import type { Tile } from '../sim/terrain';

/**
 * Terrain frame names (Phaser-free, so tests can check them): which frame of a biome's tile and
 * overlay sheets (render/tileArt.ts) draws a tile in its current state, and every name each sheet
 * has. The sheets are built from the same name builders.
 */

export const TILE = TERRAIN_GEN.tileSize;

export const TILE_FRAMES = [
  // Open ground is painted under the tiles (render/ground.ts); its tile is see-through.
  'clear',
  'road0',
  'road1',
  'forest_floor',
  'forest_floor_burnt',
  'forest_destroyed',
  'forest_flattened',
  'building_intact0',
  'building_intact1',
  'building_damaged0',
  'building_damaged1',
  'building_destroyed',
  'building_flattened',
  'rock_base',
  'rock_rubble',
  'water0',
  'water1',
  'shallows0',
  'shallows1',
  'crater0',
  'crater1',
  'tankTrap_intact',
  'tankTrap_damaged',
  'tankTrap_down',
  'wall_intact',
  'wall_damaged',
  'bunker_intact',
  'bunker_damaged',
  'mine',
  'bridge_intact',
  'bridge_damaged',
  'lightBridge_intact',
  'lightBridge_damaged',
  'hedge_floor',
  'farm0',
  'farm1',
  'farm_flattened',
  'ice0',
  'ice1',
  'thinIce_intact',
  'thinIce_damaged',
  'drift0',
  'drift1',
  'factory_intact0',
  'factory_intact1',
  'factory_damaged',
  'factory_destroyed',
  'tank_pad',
  'rail',
  'rail_torn',
  'dune0',
  'dune1',
  'wadi0',
  'wadi1',
  'derrick_pad',
  'wreck_intact0',
  'wreck_intact1',
  'wreck_damaged',
  'wreck_destroyed',
  'glass0',
  'glass1',
] as const;

export type TileFrame = (typeof TILE_FRAMES)[number];

function hallFrame(a: Extract<TileArt, { kind: 'hall' }>, damaged: boolean): string {
  const x = a.dr === 0 ? 0 : a.dr === a.rows - 1 ? 2 : 1;
  const y = a.dc === a.cols - 1 ? 0 : a.dc === 0 ? 2 : 1;
  return frameName.hall(a.style, x, y, damaged);
}

function roadFrame(t: Tile): string {
  if (t.links === undefined) return `road${t.variant & 1}`;
  const style = t.art?.kind === 'road' ? t.art.style : 'street';
  return frameName.road(style, t.links, t.variant & 1);
}

/**
 * Which frame of a tile sheet represents a tile in its current state. `shimmer` (0/1) flips water
 * between its two frames, so rivers ripple. A mine the sensors haven't swept looks like open ground.
 */
export function tileFrame(t: Tile, shimmer: number): string {
  const v1 = t.variant & 1;
  const standing = t.state === 'intact' || t.state === 'damaged';
  const damaged = t.state === 'damaged';
  const art = t.art;
  switch (t.mat) {
    case 'ground':
      return 'clear';
    case 'road':
    case 'car':
      return roadFrame(t);
    case 'footbridge':
      return frameName.footbridge(t.under === 'shallows', damaged);
    case 'forest':
      // Thin species (palms, scrub, snags) stand on the open ground.
      if (standing && art?.kind === 'tree' && SPARSE_TREES.has(art.species)) return 'clear';
      if (t.state === 'intact') return 'forest_floor';
      if (t.state === 'damaged') return 'forest_floor_burnt';
      return `forest_${t.state}` as TileFrame;
    case 'building':
      if (standing && art?.kind === 'structure') return frameName.structure(art.id, art.style, art.dc, art.dr, damaged);
      return standing ? (`building_${t.state}${v1}` as TileFrame) : (`building_${t.state}` as TileFrame);
    case 'rock':
      // Intact rock is the gravel base under a boulder overlay; flattened rubble is plain dirt.
      if (t.state === 'destroyed') return 'rock_rubble';
      return t.state === 'flattened' ? 'building_flattened' : 'rock_base';
    case 'shallows':
    case 'water':
      return `${t.mat}${v1 ^ shimmer}` as TileFrame;
    case 'crater':
      return `crater${v1}` as TileFrame;
    case 'tankTrap':
      return standing ? (`tankTrap_${t.state}` as TileFrame) : 'tankTrap_down';
    case 'wall':
      if (standing && t.links !== undefined) return frameName.wall(t.links, damaged);
      return standing ? (`wall_${t.state}` as TileFrame) : t.state === 'destroyed' ? 'building_destroyed' : 'building_flattened';
    case 'bunker':
      return standing ? (`${t.mat}_${t.state}` as TileFrame) : t.state === 'destroyed' ? 'building_destroyed' : 'building_flattened';
    case 'mine':
      return t.seen ? 'mine' : 'clear';
    case 'bridge':
    case 'lightBridge':
      return t.state === 'damaged' ? (`${t.mat}_damaged` as TileFrame) : (`${t.mat}_intact` as TileFrame);
    case 'hedgerow':
      if (t.state === 'intact' || t.state === 'damaged') return 'hedge_floor';
      return `forest_${t.state}` as TileFrame;
    case 'farmland':
      return t.state === 'flattened' ? 'farm_flattened' : (`farm${v1}` as TileFrame);
    case 'ice':
      return `ice${v1}` as TileFrame;
    case 'thinIce':
      return t.state === 'damaged' ? 'thinIce_damaged' : 'thinIce_intact';
    case 'snowdrift':
      return `drift${v1}` as TileFrame;
    case 'factory':
      if (standing && art?.kind === 'hall') return hallFrame(art, damaged);
      if (t.state === 'intact') return `factory_intact${v1}` as TileFrame;
      if (t.state === 'damaged') return 'factory_damaged';
      return t.state === 'destroyed' ? 'factory_destroyed' : 'building_flattened';
    case 'fuelTank':
      return 'tank_pad';
    case 'rail':
      return t.state === 'flattened' ? 'rail_torn' : 'rail';
    case 'dune':
      return `dune${v1}` as TileFrame;
    case 'wadi':
      return `wadi${v1}` as TileFrame;
    case 'derrick':
      return 'derrick_pad';
    case 'wreck':
      if (t.state === 'intact') return `wreck_intact${v1}` as TileFrame;
      if (t.state === 'damaged') return 'wreck_damaged';
      return t.state === 'destroyed' ? 'wreck_destroyed' : 'building_flattened';
    case 'glass':
      return `glass${v1}` as TileFrame;
  }
}

/**
 * Raised overlays drawn over a tile, bigger than a tile so neighbors merge organically: tree clumps
 * over forest, hedges over hedgerows, boulders over rock, fuel tanks on their pads.
 */
export const CLUMP = 22;
export const CLUMP_FRAMES = ['clump0', 'clump1', 'clump_damaged', 'boulder0', 'boulder1', 'hedge0', 'hedge1', 'tank0', 'tank_damaged', 'derrick0', 'derrick_damaged'] as const;
export type ClumpFrame = (typeof CLUMP_FRAMES)[number];

const CAR_STATE = { intact: 0, damaged: 1, destroyed: 2, flattened: 3 } as const;

/** Cars park along their street (nose up on a street running up the screen), and in a car park's bays. */
function carFrame(t: Tile): string {
  const links = t.links ?? 0;
  const lot = t.art?.kind === 'road' && t.art.style === 'lot';
  const along = (links & 5) !== 0 && (links & 10) === 0;
  const across = (links & 10) !== 0 && (links & 5) === 0;
  const vertical = lot || along || (!across && (t.variant & 2) === 0);
  return frameName.car(vertical, t.variant & 3, CAR_STATE[t.state]);
}

/** Raised overlays: tree clumps (by species), hedges, boulders, fuel tanks, derricks, parked cars. */
export function tileOverlay(t: Tile): string | null {
  const standing = t.state === 'intact' || t.state === 'damaged';
  switch (t.mat) {
    case 'rock':
      return standing ? (t.variant & 1 ? 'boulder1' : 'boulder0') : null;
    case 'car':
      return carFrame(t);
    case 'forest':
      if (t.state === 'intact' && t.art?.kind === 'tree') return frameName.tree(t.art.species, t.variant & 1);
      if (t.state === 'intact') return t.variant & 1 ? 'clump1' : 'clump0';
      return t.state === 'damaged' ? 'clump_damaged' : null;
    case 'hedgerow':
      if (t.state === 'intact') return t.variant & 1 ? 'hedge1' : 'hedge0';
      return t.state === 'damaged' ? 'clump_damaged' : null;
    case 'fuelTank':
      return t.state === 'intact' ? 'tank0' : t.state === 'damaged' ? 'tank_damaged' : null;
    case 'derrick':
      return t.state === 'intact' ? 'derrick0' : t.state === 'damaged' ? 'derrick_damaged' : null;
    default:
      return null;
  }
}


/** Settlement frame names (SPEC §4.6 "Settlements"); each takes `.d` once damaged. `Tile.links` bits are screen directions too (ahead is up). */
export const frameName = {
  /** A piece of a structure's footprint. */
  structure: (id: StructureId, style: number, dc: number, dr: number, damaged: boolean) => `s.${id}.${style}.${dc}.${dr}${damaged ? '.d' : ''}`,
  /** A factory hall's nine-slice (x, y: 0–2 across and down the screen). */
  hall: (style: number, x: number, y: number, damaged: boolean) => `h.${style}.${x}.${y}${damaged ? '.d' : ''}`,
  road: (style: RoadStyle, links: number, v: number) => `r.${style}.${links}.${v}`,
  wall: (links: number, damaged: boolean) => `w.${links}${damaged ? '.d' : ''}`,
  footbridge: (shallows: boolean, damaged: boolean) => `fb.${shallows ? 's' : 'w'}${damaged ? '.d' : ''}`,
  tree: (species: TreeId, v: number) => `t.${species}.${v}`,
  /** Parked cars: nose up or across, a variant, and the state (0 intact, 1 damaged, 2 burnt out, 3 crushed). */
  car: (vertical: boolean, v: number, state: number) => `c.${vertical ? 'v' : 'h'}.${v}.${state}`,
};

/** Every frame name on a biome's tile sheet and its overlay sheet. */
export function sheetFrameNames(biome: BiomeId): { tiles: Set<string>; clumps: Set<string> } {
  const tiles = new Set<string>(TILE_FRAMES);
  for (const style of ROAD_STYLES) for (let links = 0; links < 16; links++) for (let v = 0; v < 2; v++) tiles.add(frameName.road(style, links, v));
  for (let links = 0; links < 16; links++) for (const d of [false, true]) tiles.add(frameName.wall(links, d));
  for (const sh of [false, true]) for (const d of [false, true]) tiles.add(frameName.footbridge(sh, d));
  for (const id of structuresOf(biome)) {
    const def = STRUCTURES[id];
    for (let style = 0; style < def.styles; style++) {
      for (let dc = 0; dc < def.cols; dc++) for (let dr = 0; dr < def.rows; dr++) for (const d of [false, true]) tiles.add(frameName.structure(id, style, dc, dr, d));
    }
  }
  for (let style = 0; style < HALL_STYLES; style++) for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (const d of [false, true]) tiles.add(frameName.hall(style, x, y, d));
  const clumps = new Set<string>(CLUMP_FRAMES);
  for (const species of TREE_IDS) for (let v = 0; v < 2; v++) clumps.add(frameName.tree(species, v));
  for (const vertical of [true, false]) for (let v = 0; v < 4; v++) for (let state = 0; state < 4; state++) clumps.add(frameName.car(vertical, v, state));
  return { tiles, clumps };
}
