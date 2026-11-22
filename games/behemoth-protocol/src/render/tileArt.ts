import Phaser from 'phaser';
import { BIOME_IDS, type BiomeId } from '../content/biomes';
import { TERRAIN_GEN } from '../content/tuning';
import type { Tile } from '../sim/terrain';
import { Rng } from '../sim/rng';
import { canvasTexture, type Painter } from './painter';
import { PAL } from './palette';

/**
 * Procedural placeholder terrain (SPEC §11.1): a tile sheet and a raised-overlay sheet per biome
 * (SPEC §4.6), drawn from the same recipes in the biome's palette. Real art replaces these textures
 * later under the same keys and frame names.
 */

export const TILE = TERRAIN_GEN.tileSize;

/** Texture keys of a biome's tile sheet and overlay sheet. */
export const tileSheet = (biome: BiomeId) => `tiles_${biome}`;
export const clumpSheet = (biome: BiomeId) => `clumps_${biome}`;

/** A palette with the base one's color names (any colors). */
export type Pal = { [K in keyof typeof PAL]: string };

/**
 * Each biome's palette over the base (temperate) one: the ground, trees, roofs, and water change;
 * everything that isn't terrain keeps its colors.
 */
const BIOME_PAL: Record<BiomeId, Partial<Pal>> = {
  temperate: {},
  arctic: {
    // Snow for grass, frozen earth for dirt, snow-laden pines, snow on the roofs.
    grass: '#d4dde3',
    grassLight: '#eaf0f3',
    grassDark: '#b4c1ca',
    dirt: '#7d7c76',
    dirtDark: '#5f605c',
    canopyShadow: '#132219',
    canopy: '#24443a',
    canopyLight: '#35604f',
    canopyHi: '#e9f1f3',
    trunk: '#43352a',
    roofAHi: '#eef3f5',
    roofBHi: '#eef3f5',
    pavement: '#767d84',
    waterDeep: '#15293a',
    water: '#1f3c50',
    waterLight: '#3a6077',
    shallow: '#476b78',
    shallowLight: '#6a8e9a',
    silt: '#5d6c72',
  },
  industrial: {
    // Cinders and oily dirt for ground, scrubby olive trees, grimy concrete, murky water.
    grass: '#4a4943',
    grassLight: '#57554e',
    grassDark: '#3b3a35',
    dirt: '#55473a',
    dirtDark: '#3f3429',
    canopyShadow: '#22281a',
    canopy: '#3c4529',
    canopyLight: '#525d37',
    canopyHi: '#6a7444',
    pavement: '#3d3e40',
    roofA: '#6e5040',
    roofADark: '#533b2f',
    roofAHi: '#86624f',
    water: '#2f3e37',
    waterDeep: '#222e29',
    waterLight: '#465a4f',
    shallow: '#47544a',
    shallowLight: '#5d6c5f',
    silt: '#4e5242',
  },
  desert: {
    // Sand for grass, sandstone for rock, dusty palms and scrub, adobe roofs.
    grass: '#c6ad78',
    grassLight: '#d8c290',
    grassDark: '#ad935f',
    dirt: '#9c7f52',
    dirtDark: '#7f6541',
    canopyShadow: '#343c1b',
    canopy: '#58682f',
    canopyLight: '#71833d',
    canopyHi: '#8fa04f',
    trunk: '#6a4e30',
    roofA: '#b5845a',
    roofAHi: '#cfa074',
    roofADark: '#93673f',
    roofB: '#b09f84',
    roofBHi: '#c9baa0',
    roofBDark: '#8e7f68',
    pavement: '#9a8766',
    stone: '#a88b64',
    stoneHi: '#c7aa80',
    stoneDark: '#7b6345',
    gravel: '#8d7451',
    rubble: '#a89676',
    rubbleDark: '#857456',
  },
  wasteland: {
    // Ash for grass, scorched earth, dead grey-brown trees, soot-dark roofs, a toxic river.
    grass: '#55524b',
    grassLight: '#625e56',
    grassDark: '#46433d',
    dirt: '#594a3d',
    dirtDark: '#41362c',
    canopyShadow: '#2a251f',
    canopy: '#4a4237',
    canopyLight: '#5d5446',
    canopyHi: '#706653',
    trunk: '#3a2f25',
    roofA: '#5e4136',
    roofAHi: '#735245',
    roofADark: '#46302a',
    roofB: '#5f6064',
    roofBHi: '#76777b',
    roofBDark: '#47484b',
    pavement: '#46443f',
    water: '#3b4a2b',
    waterDeep: '#2b371f',
    waterLight: '#58703a',
    shallow: '#4f5a36',
    shallowLight: '#6b7a46',
    silt: '#4b4a35',
  },
};

/** A biome's full palette (the base one with its terrain colors swapped in). */
export function biomePalette(biome: BiomeId): Pal {
  return { ...PAL, ...BIOME_PAL[biome] };
}

const TILE_FRAMES = [
  'ground0',
  'ground1',
  'ground2',
  'ground3',
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

type TileFrame = (typeof TILE_FRAMES)[number];

/**
 * Which frame of a tile sheet represents a tile in its current state. `shimmer` (0/1) flips water
 * between its two frames, so rivers ripple. A mine the sensors haven't swept looks like open ground.
 */
export function tileFrame(t: Tile, shimmer: number): TileFrame {
  const v1 = t.variant & 1;
  const standing = t.state === 'intact' || t.state === 'damaged';
  switch (t.mat) {
    case 'ground':
      return `ground${t.variant & 3}` as TileFrame;
    case 'road':
      return `road${v1}` as TileFrame;
    case 'forest':
      if (t.state === 'intact') return 'forest_floor';
      if (t.state === 'damaged') return 'forest_floor_burnt';
      return `forest_${t.state}` as TileFrame;
    case 'building':
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
    case 'bunker':
      return standing ? (`${t.mat}_${t.state}` as TileFrame) : t.state === 'destroyed' ? 'building_destroyed' : 'building_flattened';
    case 'mine':
      return t.seen ? 'mine' : (`ground${t.variant & 3}` as TileFrame);
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
const CLUMP_FRAMES = ['clump0', 'clump1', 'clump_damaged', 'boulder0', 'boulder1', 'hedge0', 'hedge1', 'tank0', 'tank_damaged', 'derrick0', 'derrick_damaged'] as const;
type ClumpFrame = (typeof CLUMP_FRAMES)[number];

export function tileOverlay(t: Tile): ClumpFrame | null {
  const standing = t.state === 'intact' || t.state === 'damaged';
  switch (t.mat) {
    case 'rock':
      return standing ? (t.variant & 1 ? 'boulder1' : 'boulder0') : null;
    case 'forest':
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

export function makeTiles(scene: Phaser.Scene): void {
  for (const biome of BIOME_IDS) {
    const pal = biomePalette(biome);
    const tex = canvasTexture(scene, tileSheet(biome), TILE * TILE_FRAMES.length, TILE, (p) => {
      TILE_FRAMES.forEach((name, i) => {
        p.ox = i * TILE;
        drawTile(p, name, new Rng(1000 + i * 77), pal);
      });
    });
    TILE_FRAMES.forEach((name, i) => tex.add(name, 0, i * TILE, 0, TILE, TILE));

    const clumps = canvasTexture(scene, clumpSheet(biome), CLUMP * CLUMP_FRAMES.length, CLUMP, (p) => {
      CLUMP_FRAMES.forEach((name, i) => {
        p.ox = i * CLUMP;
        drawClump(p, name, new Rng(3000 + i * 31), pal, biome);
      });
    });
    CLUMP_FRAMES.forEach((name, i) => clumps.add(name, 0, i * CLUMP, 0, CLUMP, CLUMP));
  }
}

function drawClump(p: Painter, name: ClumpFrame, rng: Rng, pal: Pal, biome: BiomeId): void {
  const c = CLUMP / 2;
  if (name.startsWith('boulder')) {
    boulder(p, rng, c, pal, biome);
    return;
  }
  if (name.startsWith('tank')) {
    fuelTank(p, rng, c, name === 'tank_damaged');
    return;
  }
  if (name.startsWith('derrick')) {
    derrick(p, rng, c, name === 'derrick_damaged');
    return;
  }
  const hedge = name.startsWith('hedge');
  const spots: [number, number, number][] =
    name === 'clump_damaged'
      ? [
          [c - 3, c - 2, 4],
          [c + 4, c + 3, 3.5],
        ]
      : hedge
        ? // A dense, low bank: smaller bushes packed edge to edge.
          [
            [c - 5, c - 3, 3.5],
            [c, c - 4, 3.5],
            [c + 5, c - 3, 3.5],
            [c - 5, c + 3, 3.5],
            [c, c + 2, 4],
            [c + 5, c + 3, 3.5],
          ]
        : [
            [c - 4, c - 4, 5],
            [c + 4, c - 3, 5],
            [c - 3, c + 4, 5],
            [c + 4, c + 4, 4.5],
            [c, c, 5.5],
          ];
  // Shadows first (offset down-right), then canopies, so clumps read as raised.
  for (const [x, y, r] of spots) p.disc(x + 1.5, y + 1.5, r, 'rgba(10,20,8,0.45)');
  for (const [x, y, r] of spots) {
    const jx = rng.range(-1, 1);
    const jy = rng.range(-1, 1);
    const base = hedge ? pal.canopyLight : pal.canopy;
    const light = hedge ? pal.canopyHi : pal.canopyLight;
    p.disc(x + jx, y + jy, r, base, light, pal.canopyShadow);
    p.px(Math.round(x + jx - r / 2), Math.round(y + jy - r / 2), pal.canopyHi);
  }
  if (name === 'clump_damaged') p.speckle(rng, 4, 4, 14, 14, 6, pal.ash);
  // Snow lies on the arctic's trees.
  if (biome === 'arctic' && name !== 'clump_damaged') p.speckle(rng, 3, 3, 16, 12, 10, pal.grassLight);
}

/** A craggy lump of rock: overlapping slabs with a drop shadow, lit from the upper left. */
function boulder(p: Painter, rng: Rng, c: number, pal: Pal, biome: BiomeId): void {
  const slabs: [number, number, number][] = [
    [c - 3, c - 3, 7],
    [c + 3, c - 3, 6.5],
    [c - 3, c + 3, 6.5],
    [c + 3, c + 3, 6.5],
    [c, c, 7.5],
  ];
  for (const [x, y, r] of slabs) p.disc(x + 2, y + 2, r, 'rgba(12,12,10,0.5)');
  for (const [x, y, r] of slabs) {
    const jx = rng.range(-1, 1);
    const jy = rng.range(-1, 1);
    p.disc(x + jx, y + jy, r, pal.stone, pal.stoneHi, pal.stoneDark);
  }
  // Cracks and lichen (snow caps in the arctic).
  for (let i = 0; i < 3; i++) {
    const x = rng.int(c - 6, c + 3);
    const y = rng.int(c - 6, c + 5);
    p.rect(x, y, rng.int(2, 4), 1, pal.stoneDark);
    p.px(x, y + 1, pal.stoneDark);
  }
  p.speckle(rng, c - 6, c - 6, 12, 12, 5, pal.stoneHi);
  if (biome === 'arctic') p.speckle(rng, c - 7, c - 7, 10, 8, 14, pal.grassLight);
  else p.speckle(rng, c - 5, c - 5, 10, 10, 3, pal.grassDark);
}

/** A storage tank seen from above: a round lid with a rim, lit from the upper left, on a shadow. */
function fuelTank(p: Painter, rng: Rng, c: number, holed: boolean): void {
  p.disc(c + 1.5, c + 1.5, 8.5, 'rgba(10,10,8,0.5)');
  p.disc(c, c, 8.5, PAL.tankShade, PAL.tankWhite, PAL.steelDark);
  p.disc(c, c, 6, PAL.tankWhite, PAL.tankHi);
  // Hazard band and the vent hatch.
  p.rect(c - 6, c - 1, 12, 2, PAL.rust);
  p.disc(c - 2, c - 3, 1.5, PAL.tankShade);
  if (holed) {
    p.disc(c + 3, c + 2, 2.5, PAL.hole);
    p.speckle(rng, c - 5, c - 5, 10, 10, 8, PAL.ash);
    p.px(c + 4, c + 1, PAL.ember);
  }
}

/**
 * An oil derrick from above: a lattice tower (a square with X bracing) leaning a long shadow, and
 * the pumpjack's walking beam beside it.
 */
function derrick(p: Painter, rng: Rng, c: number, bent: boolean): void {
  // Shadow, then the tower's legs and bracing.
  p.rect(c - 4, c - 2, 13, 12, 'rgba(10,10,8,0.4)');
  const s = 7;
  p.rect(c - s, c - s, 2 * s, 1, PAL.girderHi);
  p.rect(c - s, c - s, 1, 2 * s, PAL.girderHi);
  p.rect(c - s, c + s - 1, 2 * s, 1, PAL.girder);
  p.rect(c + s - 1, c - s, 1, 2 * s, PAL.girder);
  for (let i = -s + 1; i < s - 1; i++) {
    p.px(c + i, c + i, PAL.girderHi);
    p.px(c + i, c - i - 1, PAL.girder);
  }
  // Crown block, and the pumpjack's beam and head off to one side.
  p.rect(c - 1, c - 1, 2, 2, PAL.steelDark);
  p.rect(c + s, c + 1, 3, 2, PAL.rust);
  p.rect(c + s + 2, c, 2, 4, PAL.rustHi);
  if (bent) {
    p.speckle(rng, c - 6, c - 6, 12, 12, 10, PAL.ash);
    p.rect(c - s, c - 2, 4, 1, PAL.hole);
    p.px(c + 2, c + 3, PAL.ember);
  }
}

/** A burnt-out vehicle from above: hull, a turret ring with no turret, scorch around it. */
function wreck(p: Painter, rng: Rng, pal: Pal, kind: 0 | 1, damaged: boolean): void {
  grass(p, rng, pal);
  // A scorch ring around it, so it stands out on ash or sand.
  p.disc(8, 8, 8, pal.ash, undefined, pal.hole);
  p.speckle(rng, 0, 0, TILE, TILE, 10, pal.ash);
  // Hull at a skew-free angle (art is screen-relative), with a drop shadow.
  const [x, y, w, h] = kind === 0 ? [2, 3, 11, 9] : [3, 2, 9, 11];
  p.rect(x + 1, y + 1, w, h, 'rgba(10,10,8,0.5)');
  p.rect(x, y, w, h, PAL.wreck);
  p.rect(x, y, w, 1, PAL.wreckHi);
  p.rect(x, y, 1, h, PAL.wreckHi);
  p.rect(x + w - 1, y, 1, h, PAL.wreckDark);
  // Track runs along two sides.
  if (kind === 0) {
    p.rect(x, y, w, 2, PAL.wreckDark);
    p.rect(x, y + h - 2, w, 2, PAL.wreckDark);
  } else {
    p.rect(x, y, 2, h, PAL.wreckDark);
    p.rect(x + w - 2, y, 2, h, PAL.wreckDark);
  }
  p.disc(x + w / 2, y + h / 2, 2.5, PAL.wreckDark, undefined, pal.hole);
  p.speckle(rng, x, y, w, h, 6, PAL.rust);
  if (damaged) {
    p.rect(rng.int(x, x + w - 4), rng.int(y, y + h - 3), 4, 3, pal.hole);
    p.speckle(rng, x, y, w, h, 6, pal.hole);
  }
}

function grass(p: Painter, rng: Rng, pal: Pal, variant = 0): void {
  p.rect(0, 0, TILE, TILE, pal.grass);
  p.speckle(rng, 0, 0, TILE, TILE, 12, pal.grassLight);
  p.speckle(rng, 0, 0, TILE, TILE, 12, pal.grassDark);
  if (variant === 2) {
    const x = rng.int(3, 11);
    const y = rng.int(3, 11);
    p.px(x, y, pal.canopyLight);
    p.px(x + 1, y - 1, pal.canopyLight);
    p.px(x + 2, y, pal.canopyLight);
  }
  if (variant === 3) {
    const x = rng.int(2, 10);
    const y = rng.int(2, 10);
    p.rect(x, y, 3, 2, pal.dirt);
    p.px(x + 1, y + 2, pal.dirtDark);
  }
}

function roof(p: Painter, rng: Rng, pal: Pal, kind: 0 | 1): void {
  const base = kind === 0 ? pal.roofA : pal.roofB;
  const hi = kind === 0 ? pal.roofAHi : pal.roofBHi;
  const dark = kind === 0 ? pal.roofADark : pal.roofBDark;
  p.rect(0, 0, TILE, TILE, pal.pavement);
  // Drop shadow to the lower right.
  p.rect(2, 14, 14, 2, pal.outline);
  p.rect(14, 2, 2, 14, pal.outline);
  p.rect(1, 1, 13, 13, pal.outline);
  p.rect(2, 2, 11, 5, base);
  p.rect(2, 8, 11, 5, dark);
  if (kind === 0) {
    // Pitched roof: lit ridge, tile courses.
    p.rect(2, 7, 11, 1, hi);
    for (let x = 3; x < 13; x += 3) p.px(x, 4, dark);
    p.rect(rng.int(3, 9), 3, 2, 2, pal.wall); // chimney
  } else {
    // Flat concrete roof: parapet highlight, AC unit, hatch.
    p.rect(2, 2, 11, 1, hi);
    p.rect(2, 7, 11, 1, base);
    p.rect(rng.int(3, 8), rng.int(3, 4), 3, 2, hi);
    p.rect(rng.int(4, 9), rng.int(9, 10), 2, 2, pal.hole);
  }
}

/** Rubble and dirt (wrecked buildings, walls, bunkers). */
function rubble(p: Painter, rng: Rng, pal: Pal): void {
  p.rect(0, 0, TILE, TILE, pal.dirtDark);
  p.speckle(rng, 0, 0, TILE, TILE, 10, pal.dirt);
  for (let i = 0; i < 14; i++) {
    const s = rng.int(1, 2);
    p.rect(rng.int(1, 13), rng.int(1, 13), s, s, rng.pick([pal.rubble, pal.rubbleDark, pal.roofADark, pal.wall]));
  }
}

/** A shell hole: a dark bowl with a lit far rim and thrown-out dirt. */
function crater(p: Painter, rng: Rng, pal: Pal, big: boolean): void {
  grass(p, rng, pal);
  const r = big ? 6.5 : 5;
  p.speckle(rng, 1, 1, 14, 14, 14, pal.dirt);
  p.disc(8, 8, r + 1, pal.dirt, pal.dirt, pal.dirtDark);
  p.disc(8.5, 8.5, r, pal.dirtDark, pal.dirt, pal.hole);
  p.disc(9, 9, r - 2.5, pal.hole);
  p.speckle(rng, 2, 2, 12, 12, 5, pal.ash);
}

/** Bridge deck: planks or plates across the span (screen-horizontal), rails along both edges. */
function deck(p: Painter, rng: Rng, pal: Pal, light: boolean, damaged: boolean): void {
  const base = light ? PAL.plank : PAL.deck;
  const seam = light ? PAL.plankDark : PAL.girder;
  p.rect(0, 0, TILE, TILE, base);
  for (let y = 1; y < TILE; y += light ? 3 : 4) p.rect(0, y, TILE, 1, seam);
  if (!light) {
    p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.girderHi);
    p.rect(0, 0, TILE, 1, PAL.girderHi);
  }
  if (damaged) {
    p.rect(rng.int(2, 7), rng.int(2, 7), 5, 4, pal.waterDeep);
    p.speckle(rng, 0, 0, TILE, TILE, 10, pal.hole);
    p.rect(rng.int(8, 12), rng.int(9, 12), 3, 2, pal.waterDeep);
  }
}

function drawTile(p: Painter, name: TileFrame, rng: Rng, pal: Pal): void {
  switch (name) {
    case 'ground0':
    case 'ground1':
    case 'ground2':
    case 'ground3':
      grass(p, rng, pal, Number(name.slice(-1)));
      break;
    case 'road0':
    case 'road1':
      p.rect(0, 0, TILE, TILE, pal.pavement);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.rubbleDark);
      p.speckle(rng, 0, 0, TILE, TILE, 4, pal.rubble);
      if (name === 'road1') {
        p.rect(rng.int(3, 9), rng.int(3, 9), 3, 3, pal.rubbleDark); // manhole / patch
        p.rect(rng.int(1, 8), rng.int(10, 13), 5, 1, pal.hole); // crack
      }
      break;
    case 'forest_floor':
      p.rect(0, 0, TILE, TILE, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 30, pal.canopyShadow);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.trunk);
      break;
    case 'forest_floor_burnt':
      p.rect(0, 0, TILE, TILE, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 24, pal.ash);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.canopyShadow);
      p.rect(9, 3, 4, 1, pal.trunk);
      p.rect(3, 12, 1, 3, pal.trunk);
      break;
    case 'forest_destroyed':
      p.rect(0, 0, TILE, TILE, pal.ash);
      p.speckle(rng, 0, 0, TILE, TILE, 20, pal.ashLight);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.dirtDark);
      for (const [x, y] of [[4, 4], [11, 6], [6, 11]] as const) {
        p.rect(x, y, 2, 2, pal.hole);
        p.px(x + 2, y + 1, pal.trunk);
      }
      p.px(rng.int(2, 13), rng.int(2, 13), pal.ember);
      p.px(rng.int(2, 13), rng.int(2, 13), pal.ember);
      break;
    case 'forest_flattened':
      grass(p, rng, pal);
      p.speckle(rng, 0, 0, TILE, TILE, 16, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.canopy);
      for (let i = 0; i < 3; i++) {
        const x = rng.int(1, 10);
        const y = rng.int(2, 13);
        p.rect(x, y, rng.int(3, 5), 1, pal.trunk);
      }
      break;
    case 'building_intact0':
    case 'building_intact1':
      roof(p, rng, pal, name.endsWith('0') ? 0 : 1);
      break;
    case 'building_damaged0':
    case 'building_damaged1': {
      roof(p, rng, pal, name.endsWith('0') ? 0 : 1);
      // Blown-out corner and shell holes.
      p.rect(9, 1, 6, 5, pal.rubbleDark);
      p.speckle(rng, 9, 1, 6, 5, 6, pal.rubble);
      p.rect(4, 9, 3, 2, pal.hole);
      p.px(5, 8, pal.hole);
      p.speckle(rng, 2, 2, 11, 11, 8, pal.hole);
      break;
    }
    case 'building_destroyed':
      rubble(p, rng, pal);
      // Broken wall stub.
      p.rect(1, 1, 6, 1, pal.wall);
      p.rect(1, 1, 1, 5, pal.wall);
      break;
    case 'rock_base':
      p.rect(0, 0, TILE, TILE, pal.gravel);
      p.speckle(rng, 0, 0, TILE, TILE, 20, pal.stoneDark);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.dirtDark);
      break;
    case 'rock_rubble':
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.gravel);
      for (let i = 0; i < 9; i++) {
        const x = rng.int(1, 12);
        const y = rng.int(1, 12);
        const s = rng.int(2, 3);
        p.rect(x, y, s, s, pal.stone);
        p.px(x, y, pal.stoneHi);
        p.px(x + s - 1, y + s - 1, pal.stoneDark);
      }
      break;
    case 'water0':
    case 'water1':
      // Deep channel: dark, with short ripple streaks running across the current (screen-horizontal).
      p.rect(0, 0, TILE, TILE, pal.water);
      p.speckle(rng, 0, 0, TILE, TILE, 14, pal.waterDeep);
      for (let i = 0; i < 3; i++) {
        const x = rng.int(0, 11);
        const y = (rng.int(1, 4) * 4 + (name === 'water1' ? 2 : 0)) % TILE;
        p.rect(x, y, rng.int(3, 5), 1, pal.waterLight);
      }
      break;
    case 'shallows0':
    case 'shallows1':
      // Shallows: lighter, silty, with pebbles showing through and a few glints.
      p.rect(0, 0, TILE, TILE, pal.shallow);
      p.speckle(rng, 0, 0, TILE, TILE, 12, pal.silt);
      p.speckle(rng, 0, 0, TILE, TILE, 4, pal.stoneDark);
      for (let i = 0; i < 2; i++) {
        const x = rng.int(1, 12);
        const y = (rng.int(0, 3) * 4 + 1 + (name === 'shallows1' ? 2 : 0)) % TILE;
        p.rect(x, y, 3, 1, pal.shallowLight);
      }
      if (name === 'shallows1') p.px(rng.int(2, 13), rng.int(2, 13), pal.foam);
      break;
    case 'building_flattened':
      p.rect(0, 0, TILE, TILE, pal.dirt);
      p.speckle(rng, 0, 0, TILE, TILE, 16, pal.rubbleDark);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.rubble);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.dirtDark);
      break;

    // ── Common features ─────────────────────────────────────────────────────────────────────
    case 'crater0':
    case 'crater1':
      crater(p, rng, pal, name === 'crater1');
      break;
    case 'tankTrap_intact':
    case 'tankTrap_damaged': {
      // Three concrete pyramids, lit from the upper left, with shadows down-right.
      grass(p, rng, pal);
      const teeth: [number, number][] = name === 'tankTrap_intact' ? [[4, 4], [11, 6], [6, 11]] : [[4, 4], [10, 10]];
      for (const [x, y] of teeth) {
        p.rect(x - 1, y + 1, 6, 5, 'rgba(10,10,8,0.45)');
        p.rect(x - 2, y - 2, 5, 5, PAL.concrete);
        p.rect(x - 2, y - 2, 5, 1, PAL.concreteHi);
        p.rect(x - 2, y - 2, 1, 5, PAL.concreteHi);
        p.px(x, y, PAL.concreteHi);
        p.rect(x + 2, y - 1, 1, 4, PAL.concreteDark);
        p.rect(x - 1, y + 2, 4, 1, PAL.concreteDark);
      }
      if (name === 'tankTrap_damaged') p.speckle(rng, 6, 2, 8, 8, 7, PAL.concreteDark);
      break;
    }
    case 'tankTrap_down':
      grass(p, rng, pal);
      for (let i = 0; i < 7; i++) p.rect(rng.int(1, 13), rng.int(1, 13), rng.int(1, 2), rng.int(1, 2), rng.pick([PAL.concrete, PAL.concreteDark]));
      break;
    case 'wall_intact':
    case 'wall_damaged':
      // A thick concrete wall: blocks along the tile with a lit top edge and a shadow below.
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.rect(0, 3, TILE, 10, PAL.concrete);
      p.rect(0, 3, TILE, 2, PAL.concreteHi);
      p.rect(0, 13, TILE, 2, 'rgba(10,10,8,0.5)');
      for (let x = 3; x < TILE; x += 5) p.rect(x, 5, 1, 8, PAL.concreteDark);
      if (name === 'wall_damaged') {
        p.rect(rng.int(2, 9), 3, 5, 4, pal.rubbleDark);
        p.speckle(rng, 0, 3, TILE, 10, 10, PAL.concreteDark);
        p.rect(rng.int(1, 12), rng.int(7, 10), 2, 2, pal.hole);
      }
      break;
    case 'bunker_intact':
    case 'bunker_damaged':
      // A domed pillbox with a dark firing slit facing forward (screen-up).
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.disc(9, 9, 7, 'rgba(10,10,8,0.5)');
      p.disc(8, 8, 7, PAL.concrete, PAL.concreteHi, PAL.concreteDark);
      p.disc(8, 8, 4, PAL.concreteDark, PAL.concrete);
      p.rect(4, 2, 8, 2, pal.hole);
      if (name === 'bunker_damaged') {
        p.speckle(rng, 3, 3, 10, 10, 10, pal.hole);
        p.rect(10, 9, 3, 3, pal.rubbleDark);
      }
      break;
    case 'mine':
      // A swept mine: ground with the mine's lid showing and a warning tick beside it.
      grass(p, rng, pal);
      p.disc(8, 8, 3.5, PAL.mineBody, PAL.mineHi);
      p.px(8, 8, PAL.mineHi);
      p.rect(2, 2, 2, 1, pal.warn);
      p.rect(2, 2, 1, 2, pal.warn);
      p.rect(12, 12, 2, 1, pal.warn);
      p.rect(13, 11, 1, 2, pal.warn);
      break;
    case 'bridge_intact':
    case 'bridge_damaged':
      deck(p, rng, pal, false, name === 'bridge_damaged');
      break;
    case 'lightBridge_intact':
    case 'lightBridge_damaged':
      deck(p, rng, pal, true, name === 'lightBridge_damaged');
      break;

    // ── Temperate ───────────────────────────────────────────────────────────────────────────
    case 'hedge_floor':
      p.rect(0, 0, TILE, TILE, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 24, pal.canopyShadow);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.dirt);
      break;
    case 'farm0':
    case 'farm1': {
      // Plowed rows of crops (screen-horizontal furrows), wheat or greens.
      const crop = name === 'farm0' ? PAL.cropA : PAL.cropB;
      p.rect(0, 0, TILE, TILE, pal.dirt);
      for (let y = 0; y < TILE; y += 4) {
        p.rect(0, y, TILE, 2, crop);
        p.speckle(rng, 0, y, TILE, 2, 4, PAL.cropDark);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 4, pal.dirtDark);
      break;
    }
    case 'farm_flattened':
      p.rect(0, 0, TILE, TILE, pal.dirt);
      p.speckle(rng, 0, 0, TILE, TILE, 18, PAL.cropDark);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.dirtDark);
      break;

    // ── Arctic ──────────────────────────────────────────────────────────────────────────────
    case 'ice0':
    case 'ice1':
      // Solid ice: pale blue with long glints and a few frozen-in bubbles.
      p.rect(0, 0, TILE, TILE, PAL.ice);
      p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.iceDark);
      p.rect(rng.int(0, 6), rng.int(2, 6), rng.int(5, 9), 1, PAL.iceHi);
      if (name === 'ice1') p.rect(rng.int(4, 9), rng.int(9, 13), rng.int(4, 6), 1, PAL.iceHi);
      break;
    case 'thinIce_intact':
    case 'thinIce_damaged':
      // Thin ice: darker (the water shows through), webbed with cracks once it's stressed.
      p.rect(0, 0, TILE, TILE, PAL.thinIce);
      p.speckle(rng, 0, 0, TILE, TILE, 14, PAL.iceDark);
      p.rect(rng.int(1, 8), rng.int(2, 12), rng.int(4, 6), 1, PAL.iceHi);
      if (name === 'thinIce_damaged') {
        let x = rng.int(2, 6);
        let y = rng.int(2, 6);
        for (let i = 0; i < 10; i++) {
          p.px(x, y, PAL.iceCrack);
          x = Math.min(15, x + rng.int(0, 1));
          y = Math.min(15, y + rng.int(0, 2));
        }
        p.rect(rng.int(3, 11), rng.int(3, 11), 2, 2, pal.waterDeep);
      }
      break;
    case 'drift0':
    case 'drift1':
      // A snowdrift: wind-blown ridges across the field (screen-horizontal), each a bright crest
      // with blue shade on its lee, on snow that runs to the tile edges so drifts merge.
      p.rect(0, 0, TILE, TILE, PAL.snow);
      p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.snowShade);
      for (const y of name === 'drift0' ? [3, 10] : [6, 13]) {
        const x0 = rng.int(0, 3);
        p.rect(x0, y, TILE - x0 - rng.int(0, 3), 1, PAL.snowHi);
        p.rect(x0 + 1, y + 1, TILE - x0 - 3, 2, PAL.snowShade);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 6, PAL.snowHi);
      break;

    // ── Industrial ──────────────────────────────────────────────────────────────────────────
    case 'factory_intact0':
    case 'factory_intact1':
    case 'factory_damaged':
      // Factory hall roof: sawtooth skylight rows (screen-horizontal), corrugated, grimy.
      p.rect(0, 0, TILE, TILE, PAL.rust);
      for (let y = 0; y < TILE; y += 4) {
        p.rect(0, y, TILE, 1, PAL.rustHi);
        p.rect(0, y + 2, TILE, 1, name === 'factory_intact1' ? PAL.steelDark : PAL.girder);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.concreteDark);
      if (name === 'factory_damaged') {
        p.rect(rng.int(1, 8), rng.int(1, 8), 6, 5, pal.hole);
        p.rect(rng.int(1, 8), rng.int(1, 8), 6, 1, PAL.girderHi);
        p.speckle(rng, 0, 0, TILE, TILE, 8, pal.hole);
      }
      break;
    case 'factory_destroyed':
      rubble(p, rng, pal);
      // Twisted roof girders.
      p.rect(1, 4, 12, 1, PAL.girderHi);
      p.rect(4, 2, 1, 11, PAL.girder);
      p.rect(9, 7, 6, 1, PAL.rust);
      break;
    case 'tank_pad':
      p.rect(0, 0, TILE, TILE, PAL.concreteDark);
      p.speckle(rng, 0, 0, TILE, TILE, 12, PAL.concrete);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.hole);
      break;
    // ── Desert ──────────────────────────────────────────────────────────────────────────────
    case 'dune0':
    case 'dune1':
      // Sand ridges blown across the field (screen-horizontal): a lit crest, a shaded lee.
      p.rect(0, 0, TILE, TILE, pal.grass);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.grassDark);
      for (const y of name === 'dune0' ? [2, 9] : [5, 12]) {
        const x0 = rng.int(0, 2);
        p.rect(x0, y, TILE - x0 - rng.int(0, 2), 1, pal.grassLight);
        p.rect(x0, y + 1, TILE - x0 - 1, 3, pal.grassDark);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 5, pal.grassLight);
      break;
    case 'wadi0':
    case 'wadi1':
      // A dry bed: darker packed sand, pebbles, a few cracks where water last stood.
      p.rect(0, 0, TILE, TILE, pal.dirt);
      p.speckle(rng, 0, 0, TILE, TILE, 14, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.stone);
      p.speckle(rng, 0, 0, TILE, TILE, 3, pal.stoneHi);
      if (name === 'wadi1') {
        p.rect(rng.int(1, 8), rng.int(2, 6), 5, 1, pal.dirtDark);
        p.rect(rng.int(3, 10), rng.int(9, 13), 4, 1, pal.dirtDark);
      }
      break;
    case 'derrick_pad':
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 12, pal.dirt);
      // An oil stain around the wellhead.
      p.disc(8, 9, 4, pal.hole);
      p.speckle(rng, 3, 4, 10, 10, 6, pal.ash);
      break;

    // ── Blasted wasteland ───────────────────────────────────────────────────────────────────
    case 'wreck_intact0':
    case 'wreck_intact1':
      wreck(p, rng, pal, name === 'wreck_intact0' ? 0 : 1, false);
      break;
    case 'wreck_damaged':
      wreck(p, rng, pal, 0, true);
      break;
    case 'wreck_destroyed':
      // Cut apart: scrap plates and a track run in the dirt.
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.ash);
      for (let i = 0; i < 6; i++) p.rect(rng.int(1, 12), rng.int(1, 12), rng.int(2, 3), rng.int(1, 2), rng.pick([PAL.wreck, PAL.wreckHi, PAL.rust]));
      p.rect(2, 12, 10, 2, PAL.wreckDark);
      break;
    case 'glass0':
    case 'glass1':
      // Fused glass: near-black green with long, sharp glints.
      p.rect(0, 0, TILE, TILE, PAL.glass);
      p.speckle(rng, 0, 0, TILE, TILE, 12, PAL.glassDark);
      p.rect(rng.int(0, 6), rng.int(1, 6), rng.int(4, 8), 1, PAL.glassHi);
      if (name === 'glass1') p.px(rng.int(2, 13), rng.int(8, 13), PAL.glassHi);
      p.speckle(rng, 0, 0, TILE, TILE, 3, pal.ash);
      break;

    case 'rail':
    case 'rail_torn': {
      // Two rails running with the travel (screen-vertical) on wooden sleepers over ballast.
      p.rect(0, 0, TILE, TILE, pal.gravel);
      p.speckle(rng, 0, 0, TILE, TILE, 14, pal.stoneDark);
      for (let y = 1; y < TILE; y += 4) p.rect(2, y, 12, 2, PAL.sleeper);
      if (name === 'rail') {
        p.rect(4, 0, 1, TILE, PAL.railSteel);
        p.rect(11, 0, 1, TILE, PAL.railSteel);
      } else {
        // Torn up: bent rail ends and scattered sleepers.
        p.rect(4, 0, 1, 6, PAL.railSteel);
        p.rect(5, 6, 1, 3, PAL.railSteel);
        p.rect(11, 9, 1, 7, PAL.railSteel);
        p.rect(10, 6, 1, 3, PAL.railSteel);
        p.speckle(rng, 0, 0, TILE, TILE, 8, pal.dirtDark);
      }
      break;
    }
  }
}
