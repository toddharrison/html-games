import type { BiomeId } from '../content/biomes';
import { HALL_STYLES, ROAD_STYLES, SPARSE_TREES, STRUCTURES, structuresOf, TREE_IDS, type RoadStyle, type StructureId, type TileArt, type TreeId } from '../content/structures';
import { TERRAIN_GEN } from '../content/tuning';
import { hashSeed } from '../sim/rng';
import { BEND, type Tile } from '../sim/terrain';

/**
 * Terrain frame names (Phaser-free, so tests can check them): which frame of a biome's tile and
 * overlay sheets (render/tileArt.ts) draws a tile in its current state, and every name each sheet
 * has. The sheets are built from the same name builders.
 */

export const TILE = TERRAIN_GEN.tileSize;

export const TILE_FRAMES = [
  // Open ground is painted under the tiles (render/ground.ts), dunes and snowdrifts with it; their tile is see-through.
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
  'tankTrap_intact',
  'tankTrap_damaged',
  'tankTrap_down',
  'wall_intact',
  'wall_damaged',
  'bunker_intact',
  'bunker_damaged',
  'mine',
  'hedge_floor',
  'farm0',
  'farm1',
  'farm_flattened',
  'ice0',
  'ice1',
  'thinIce_intact',
  'thinIce_damaged',
  'factory_intact0',
  'factory_intact1',
  'factory_damaged',
  'factory_destroyed',
  'tank_pad',
  'rail',
  'rail_torn',
  'track',
  'ballast',
  'tunnel_in',
  'tunnel_out',
  'tunnel_cap',
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

/** Where a tile is, for tiles drawn by what's round them (craters, bridge edges): its place, the terrain's seed, and a way to look at other tiles. */
export interface Around {
  seed: number;
  col: number;
  row: number;
  /** Undefined off the field or where nothing is generated yet. */
  tile(col: number, row: number): Tile | undefined;
}

/** Crater sizes, in tiles across: a shell hole, and two sizes of big round crater. */
export const CRATER_SIZES = [1, 2, 3] as const;
/** Variants drawn of each size. */
export const CRATER_VARIANTS = { 1: 4, 2: 2, 3: 2 } as const;
/** Share of the 3×3 and 2×2 blocks of cratered ground that are drawn as one crater (the rest break into smaller ones). */
const CRATER_ODDS = { 3: 0.7, 2: 0.85 } as const;

/** Whether every tile of the `size`×`size` block at (c0, r0) is crater. */
function allCrater(a: Around, c0: number, r0: number, size: number): boolean {
  for (let c = c0; c < c0 + size; c++) for (let r = r0; r < r0 + size; r++) if (a.tile(c, r)?.mat !== 'crater') return false;
  return true;
}

/** The corner of the 3×3 crater a tile is part of, or null. Blocks sit on a grid of threes, shifted by the seed. */
function bigCrater(a: Around, col: number, row: number): [number, number] | null {
  const ox = hashSeed(a.seed, 0xc3a1) % 3;
  const oy = hashSeed(a.seed, 0xc3a2) % 3;
  const c0 = Math.floor((col + ox) / 3) * 3 - ox;
  const r0 = Math.floor((row + oy) / 3) * 3 - oy;
  if (hashSeed(a.seed, c0, r0, 0xc3a3) / 0x100000000 >= CRATER_ODDS[3]) return null;
  return allCrater(a, c0, r0, 3) ? [c0, r0] : null;
}

/**
 * The corner of the 2×2 crater a tile is part of, or null. Blocks sit on a grid of twos; `shift`
 * (0 or 1) picks which of two grids, a tile apart each way. A block on the second grid gives way to
 * any on the first; either gives way to a big crater.
 */
function midCrater(a: Around, col: number, row: number, shift: 0 | 1): [number, number] | null {
  const c0 = Math.floor((col + shift) / 2) * 2 - shift;
  const r0 = Math.floor((row + shift) / 2) * 2 - shift;
  if (hashSeed(a.seed, c0, r0, 0xc2a1 + shift) / 0x100000000 >= CRATER_ODDS[2] || !allCrater(a, c0, r0, 2)) return null;
  for (let c = c0; c < c0 + 2; c++) {
    for (let r = r0; r < r0 + 2; r++) if (bigCrater(a, c, r) || (shift === 1 && midCrater(a, c, r, 0))) return null;
  }
  return [c0, r0];
}

/**
 * Which crater a crater tile is drawn as part of (SPEC §4.5): cratered ground is packed with round
 * craters of three sizes. Where a 3×3 block of it lines up (and the seed's roll allows) it's one big
 * crater; failing that a 2×2 block is a middling one; what's left are single shell holes. So a
 * field of craters, or the ground under a big blast, is a mix of big and small ones. Returns the
 * size, which piece of it this tile is (`dc` ahead, `dr` to the right of its corner), and a variant.
 */
export function craterPiece(a: Around, variant: number): { size: 1 | 2 | 3; dc: number; dr: number; v: number } {
  const big = bigCrater(a, a.col, a.row);
  if (big) return { size: 3, dc: a.col - big[0], dr: a.row - big[1], v: hashSeed(a.seed, big[0], big[1]) % CRATER_VARIANTS[3] };
  const mid = midCrater(a, a.col, a.row, 0) ?? midCrater(a, a.col, a.row, 1);
  if (mid) return { size: 2, dc: a.col - mid[0], dr: a.row - mid[1], v: hashSeed(a.seed, mid[0], mid[1]) % CRATER_VARIANTS[2] };
  return { size: 1, dc: 0, dr: 0, v: variant % CRATER_VARIANTS[1] };
}

/**
 * Which sides of a bridge tile are the span's edge (the deck ends there, over the water): 1 left,
 * 2 right. Not where the deck runs on into more of itself, or into the road at its abutments.
 */
function bridgeEdges(t: Tile, a: Around | undefined): number {
  if (!a) return 0;
  const open = (m: Tile['mat'] | undefined) => m !== t.mat && m !== 'road' && m !== 'car';
  return (open(a.tile(a.col, a.row - 1)?.mat) ? 1 : 0) | (open(a.tile(a.col, a.row + 1)?.mat) ? 2 : 0);
}

/**
 * A tile where a track or a one-tile road steps sideways (SPEC §4.4): which way it comes in from the
 * column behind and goes out to the one ahead (-1 left, 0 straight, 1 right), or null if it runs
 * straight. Such a tile is drawn by an overlay wider than itself (`frameName.bend`), so the curve
 * runs on unbroken from tile to tile; its own frame is left clear.
 * - An armored train's track and the gravel beside it: from `Tile.links` (`BEND`).
 * - A plain road one tile wide (the line's service road): from the road tiles round it.
 */
function bendOf(t: Tile, a: Around | undefined): [number, number] | null {
  if (t.mat === 'track' || t.mat === 'ballast') {
    const links = t.links ?? 0;
    const into = links & BEND.behindRight ? 1 : links & BEND.behindLeft ? -1 : 0;
    const out = links & BEND.aheadRight ? 1 : links & BEND.aheadLeft ? -1 : 0;
    return into || out ? [into, out] : null;
  }
  if (t.mat !== 'road' || t.art || !a) return null;
  const road = (c: number, r: number) => a.tile(c, r)?.mat === 'road';
  const side = (dc: number): number => {
    if (road(a.col + dc, a.row)) return 0;
    for (const dr of [1, -1]) if (road(a.col + dc, a.row + dr) && !road(a.col, a.row + dr)) return dr;
    return 0;
  };
  const into = side(-1);
  const out = side(1);
  return into || out ? [into, out] : null;
}

/**
 * Which frame of a tile sheet represents a tile in its current state. `shimmer` (0/1) flips water
 * between its two frames, so rivers ripple. A mine the sensors haven't swept looks like open ground.
 * `around` places the tile, for those drawn by what's round them (craters, bridge edges); without
 * it they draw as if alone.
 */
export function tileFrame(t: Tile, shimmer: number, around?: Around): string {
  const v1 = t.variant & 1;
  const standing = t.state === 'intact' || t.state === 'damaged';
  const damaged = t.state === 'damaged';
  const art = t.art;
  switch (t.mat) {
    case 'ground':
      return 'clear';
    case 'road':
      if (bendOf(t, around)) return 'clear';
      return roadFrame(t);
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
    case 'crater': {
      const p = around ? craterPiece(around, t.variant) : { size: 1, dc: 0, dr: 0, v: t.variant % CRATER_VARIANTS[1] };
      return frameName.crater(p.size, p.v, p.dc, p.dr);
    }
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
      return frameName.bridge(t.mat === 'lightBridge', bridgeEdges(t, around), damaged);
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
    case 'dune':
      // Blown snow and sand are painted into the ground (render/ground.ts): ridges that run on from tile to tile.
      return 'clear';
    case 'factory':
      if (standing && art?.kind === 'hall') return hallFrame(art, damaged);
      if (t.state === 'intact') return `factory_intact${v1}` as TileFrame;
      if (t.state === 'damaged') return 'factory_damaged';
      return t.state === 'destroyed' ? 'factory_destroyed' : 'building_flattened';
    case 'fuelTank':
      return 'tank_pad';
    case 'rail':
      return t.state === 'flattened' ? 'rail_torn' : 'rail';
    case 'track':
      return bendOf(t, around) ? 'clear' : 'track';
    case 'ballast':
      return bendOf(t, around) ? 'clear' : 'ballast';
    case 'tunnel': {
      // A mouth where the line runs into the roof (behind this tile) or out of it (ahead).
      const railed = (m: Tile['mat'] | undefined) => m === 'track' || m === 'ballast';
      if (around && railed(around.tile(around.col - 1, around.row)?.mat)) return 'tunnel_in';
      if (around && railed(around.tile(around.col + 1, around.row)?.mat)) return 'tunnel_out';
      // The rest of the portal: its headwall's top and wings.
      return 'tunnel_cap';
    }
    case 'railBridge':
      return frameName.railBridge(bridgeEdges(t, around), !!t.links, damaged);
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

/** What bends: an armored train's track, the gravel between its two tracks, a one-tile road. */
export type BendKind = 'track' | 'ballast' | 'road';

/** How wide a bend's overlay is: the tile and half a tile either side of it. */
export const BEND_W = TILE * 2;

/** Raised overlays: tree clumps (by species), hedges, boulders, fuel tanks, derricks, parked cars; and the curve of a track or road where it steps sideways (`bendOf`). */
export function tileOverlay(t: Tile, around?: Around): string | null {
  const standing = t.state === 'intact' || t.state === 'damaged';
  switch (t.mat) {
    case 'track':
    case 'ballast':
    case 'road': {
      const bend = bendOf(t, around);
      return bend ? frameName.bend(t.mat, bend[0], bend[1]) : null;
    }
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
  /** A piece of a round crater `size` tiles across (`craterPiece`): `dc` ahead, `dr` right of its corner. */
  crater: (size: number, v: number, dc: number, dr: number) => `cr.${size}.${v}.${dc}.${dr}`,
  /** A bridge deck (girder or light), by which sides are the span's edge (1 left, 2 right). */
  bridge: (light: boolean, edges: number, damaged: boolean) => `b.${light ? 'l' : 'g'}.${edges}${damaged ? '.d' : ''}`,
  /** A rail bridge's deck (SPEC §4.4), by its span edges, and whether this tile carries the rails. */
  railBridge: (edges: number, rails: boolean, damaged: boolean) => `rb.${edges}${rails ? '.r' : ''}${damaged ? '.d' : ''}`,
  tree: (species: TreeId, v: number) => `t.${species}.${v}`,
  /** The curve of a track or road through a tile where it steps sideways (`bendOf`): in from behind, out ahead (-1 left, 1 right). On the overlay sheet, `BEND_W` wide. */
  bend: (kind: BendKind, into: number, out: number) => `bend.${kind}.${into}.${out}`,
  /** Parked cars: nose up or across, a variant, and the state (0 intact, 1 damaged, 2 burnt out, 3 crushed). */
  car: (vertical: boolean, v: number, state: number) => `c.${vertical ? 'v' : 'h'}.${v}.${state}`,
};

/** Every bend there is a frame for: each way in and out but straight through. */
export const BENDS: readonly [BendKind, number, number][] = (['track', 'ballast', 'road'] as const).flatMap((kind) =>
  [-1, 0, 1].flatMap((into) => [-1, 0, 1].filter((out) => into || out).map((out) => [kind, into, out] as [BendKind, number, number])),
);

/** Every frame name on a biome's tile sheet and its overlay sheet. */
export function sheetFrameNames(biome: BiomeId): { tiles: Set<string>; clumps: Set<string> } {
  const tiles = new Set<string>(TILE_FRAMES);
  for (const style of ROAD_STYLES) for (let links = 0; links < 16; links++) for (let v = 0; v < 2; v++) tiles.add(frameName.road(style, links, v));
  for (let links = 0; links < 16; links++) for (const d of [false, true]) tiles.add(frameName.wall(links, d));
  for (const sh of [false, true]) for (const d of [false, true]) tiles.add(frameName.footbridge(sh, d));
  for (const size of CRATER_SIZES) {
    for (let v = 0; v < CRATER_VARIANTS[size]; v++) for (let dc = 0; dc < size; dc++) for (let dr = 0; dr < size; dr++) tiles.add(frameName.crater(size, v, dc, dr));
  }
  for (const light of [false, true]) for (let edges = 0; edges < 4; edges++) for (const d of [false, true]) tiles.add(frameName.bridge(light, edges, d));
  for (let edges = 0; edges < 4; edges++) for (const rails of [false, true]) for (const d of [false, true]) tiles.add(frameName.railBridge(edges, rails, d));
  for (const id of structuresOf(biome)) {
    const def = STRUCTURES[id];
    for (let style = 0; style < def.styles; style++) {
      for (let dc = 0; dc < def.cols; dc++) for (let dr = 0; dr < def.rows; dr++) for (const d of [false, true]) tiles.add(frameName.structure(id, style, dc, dr, d));
    }
  }
  for (let style = 0; style < HALL_STYLES; style++) for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (const d of [false, true]) tiles.add(frameName.hall(style, x, y, d));
  const clumps = new Set<string>(CLUMP_FRAMES);
  for (const species of TREE_IDS) for (let v = 0; v < 2; v++) clumps.add(frameName.tree(species, v));
  for (const [kind, into, out] of BENDS) clumps.add(frameName.bend(kind, into, out));
  for (const vertical of [true, false]) for (let v = 0; v < 4; v++) for (let state = 0; state < 4; state++) clumps.add(frameName.car(vertical, v, state));
  return { tiles, clumps };
}
