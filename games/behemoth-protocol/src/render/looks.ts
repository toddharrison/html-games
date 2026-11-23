import type { BiomeId } from '../content/biomes';
import { hashSeed } from '../sim/rng';
import { PAL } from './palette';

/**
 * A battle's look (SPEC §4.6 "Looks"): the season, or its counterpart in a biome without seasons,
 * picked from the terrain seed. It recolors the biome's tiles and sets how the open ground is painted
 * (render/ground.ts): three ground tones laid out in big patches, bare patches, the river banks,
 * and the scattered detail. Cosmetic only: the sim never sees it.
 */

/** A ground color with its speckle: [base, light, dark]. */
export type Ramp = readonly [base: string, light: string, dark: string];

/** Small details stamped on open ground (render/ground.ts `DECALS`). */
export type DecalKind = 'tuft' | 'flowers' | 'stones' | 'scuff' | 'shrub';

export interface Look {
  id: string;
  /** Shown in the dev overlay and the title's attract-mode caption. */
  name: string;
  /**
   * Ground tones: the first is the biome's ground (it also becomes `grass`/`grassLight`/`grassDark`
   * in the tile palette, so dunes and tank traps match it); the second fills the low patches of the
   * tone noise and the third the high ones.
   */
  tones: readonly [Ramp, Ramp, Ramp];
  /** Bare patches (mud, gravel, tundra, slabs) and how much of the ground they cover (0 to ~0.3). */
  bare: Ramp;
  bareCover: number;
  /** River and lake banks. */
  bank: Ramp;
  /** Flower and leaf colors for `flowers` decals and leaf litter at forest edges. */
  accents: readonly string[];
  /** Decals per open tile on average (clustered by noise), and how often each kind turns up. */
  decalDensity: number;
  decals: Partial<Record<DecalKind, number>>;
  /** Chance a stretch of three chunks has an old set of tank ruts wandering through it. */
  ruts: number;
  /** Tile palette overrides on top of the biome's (canopy colors in autumn, red sandstone, …). */
  pal?: Partial<Pal>;
}

export const LOOKS: Record<BiomeId, readonly Look[]> = {
  temperate: [
    {
      id: 'spring',
      name: 'Spring',
      tones: [
        ['#4a6b2c', '#5a7d36', '#3e5c25'],
        ['#3a6630', '#4a783a', '#305728'],
        ['#64823a', '#749244', '#56722f'],
      ],
      bare: ['#5a4a32', '#6a5a3e', '#46392a'],
      bareCover: 0.07,
      bank: ['#7a6a48', '#8e7e58', '#5e5038'],
      accents: ['#ece8d4', '#e8cf4a', '#c58ad6'],
      decalDensity: 0.45,
      decals: { flowers: 5, tuft: 3, shrub: 1, stones: 0.5 },
      ruts: 0.35,
      pal: { canopy: '#356a2a', canopyLight: '#4e873a', canopyHi: '#6fa64c', cropA: '#7c9a3c', cropB: '#5e8a34' },
    },
    {
      id: 'summer',
      name: 'Summer',
      tones: [
        ['#3f5b2c', '#4b6a33', '#354d26'],
        ['#6a6a33', '#7a7a3e', '#58582b'],
        ['#30502a', '#3c5e31', '#294524'],
      ],
      bare: ['#6b5a3a', '#7b6a48', '#574a30'],
      bareCover: 0.1,
      bank: ['#a89468', '#bba77a', '#8c7a54'],
      accents: ['#e8cf4a', '#ece8d4'],
      decalDensity: 0.35,
      decals: { tuft: 4, flowers: 1.5, shrub: 1.5, stones: 1, scuff: 1 },
      ruts: 0.5,
    },
    {
      id: 'autumn',
      name: 'Autumn',
      tones: [
        ['#5c5a30', '#6a6838', '#4c4a28'],
        ['#7a5428', '#8e6430', '#62421f'],
        ['#86783a', '#988a48', '#6e622f'],
      ],
      bare: ['#5a4630', '#6a553c', '#463626'],
      bareCover: 0.12,
      bank: ['#6e5a3e', '#7e6a4a', '#56462f'],
      accents: ['#c8642a', '#a8382a', '#d8a838'],
      decalDensity: 0.4,
      decals: { flowers: 3, tuft: 3, scuff: 1, stones: 1 },
      ruts: 0.5,
      pal: {
        canopyShadow: '#3a2414',
        canopy: '#8a4a1e',
        canopyLight: '#b0662a',
        canopyHi: '#d8a440',
        cropA: '#a89a48',
        cropB: '#8a7a3a',
        cropDark: '#6a5a2a',
      },
    },
  ],
  arctic: [
    {
      id: 'deepSnow',
      name: 'Deep snow',
      tones: [
        ['#dce4ea', '#f0f5f8', '#c0ccd5'],
        ['#c2d0dc', '#d6e2ea', '#a6b6c4'],
        ['#eaf0f4', '#ffffff', '#d2dce2'],
      ],
      bare: ['#7d7c76', '#93918a', '#5f605c'],
      bareCover: 0.03,
      bank: ['#b4ccd8', '#d6e8f0', '#92aebe'],
      accents: ['#ffffff'],
      decalDensity: 0.15,
      decals: { stones: 2, tuft: 1 },
      ruts: 0.4,
    },
    {
      id: 'windswept',
      name: 'Windswept',
      tones: [
        ['#c8d2da', '#dde5ea', '#aab8c4'],
        ['#a4b2c0', '#b8c6d2', '#8a98a8'],
        ['#9aa29e', '#b0b6b2', '#7e8682'],
      ],
      bare: ['#6a6860', '#7e7c72', '#545249'],
      bareCover: 0.14,
      bank: ['#a8c2d0', '#c8dce6', '#86a2b4'],
      accents: ['#ffffff'],
      decalDensity: 0.3,
      decals: { stones: 4, scuff: 1 },
      ruts: 0.3,
    },
    {
      id: 'thaw',
      name: 'Thaw',
      tones: [
        ['#d0d8de', '#e6ecf0', '#b0bcc6'],
        ['#a6acae', '#babfc2', '#8a9092'],
        ['#7a7058', '#8c826a', '#625a46'],
      ],
      bare: ['#5a5040', '#6a604e', '#463e32'],
      bareCover: 0.24,
      bank: ['#6e6452', '#80766a', '#564e40'],
      accents: ['#8a7a4a'],
      decalDensity: 0.35,
      decals: { tuft: 3, stones: 2, scuff: 2 },
      ruts: 0.6,
    },
  ],
  industrial: [
    {
      id: 'cinders',
      name: 'Cinders',
      tones: [
        ['#4a4943', '#57554e', '#3b3a35'],
        ['#393835', '#45433e', '#2d2c29'],
        ['#55473a', '#635444', '#433729'],
      ],
      bare: ['#6a6862', '#7a7872', '#56544f'],
      bareCover: 0.08,
      bank: ['#3e4636', '#4c5442', '#30372a'],
      accents: ['#7a7a40'],
      decalDensity: 0.35,
      decals: { stones: 3, scuff: 3, tuft: 1 },
      ruts: 0.7,
    },
    {
      id: 'rust',
      name: 'Rust',
      tones: [
        ['#57483c', '#655446', '#463a30'],
        ['#6e4430', '#844f36', '#563325'],
        ['#4a4a48', '#585856', '#3a3a38'],
      ],
      bare: ['#7a4a2e', '#99633f', '#5e3822'],
      bareCover: 0.12,
      bank: ['#5a4030', '#6e4e3a', '#443024'],
      accents: ['#99633f'],
      decalDensity: 0.35,
      decals: { stones: 3, scuff: 3 },
      ruts: 0.7,
      pal: { dirt: '#6a4a34', dirtDark: '#4e3626' },
    },
    {
      id: 'chemical',
      name: 'Chemical',
      tones: [
        ['#4e4e40', '#5c5c4a', '#3e3e33'],
        ['#787438', '#8c8842', '#5e5a2c'],
        ['#6a6a5e', '#7a7a6e', '#56564c'],
      ],
      bare: ['#3a4a3a', '#465a46', '#2e3c2e'],
      bareCover: 0.12,
      bank: ['#8a8a48', '#a0a058', '#6e6e38'],
      accents: ['#c8c858'],
      decalDensity: 0.3,
      decals: { scuff: 3, stones: 2, tuft: 1 },
      ruts: 0.6,
      pal: { water: '#3e4a2c', waterDeep: '#2c3620', waterLight: '#647a3a', shallow: '#56603a', shallowLight: '#74804a' },
    },
  ],
  desert: [
    {
      id: 'paleSand',
      name: 'Pale sand',
      tones: [
        ['#c6ad78', '#d8c290', '#ad935f'],
        ['#d6c290', '#e6d4a6', '#beaa7a'],
        ['#b8955e', '#c8a66e', '#9e7e4c'],
      ],
      bare: ['#a89070', '#b8a282', '#8c7658'],
      bareCover: 0.08,
      bank: ['#9c7f52', '#b89c6c', '#7f6541'],
      accents: ['#71833d'],
      decalDensity: 0.25,
      decals: { stones: 2, tuft: 1.5, shrub: 0.6 },
      ruts: 0.5,
    },
    {
      id: 'redSand',
      name: 'Red sand',
      tones: [
        ['#b8784a', '#c88a5a', '#9c643c'],
        ['#9e5e38', '#b06c42', '#824c2c'],
        ['#c89a68', '#d8ac7a', '#ae845a'],
      ],
      bare: ['#8a5a3a', '#9c6a48', '#70462c'],
      bareCover: 0.07,
      bank: ['#80543a', '#9a6a4a', '#64402a'],
      accents: ['#6e7a3a'],
      decalDensity: 0.25,
      decals: { stones: 2, tuft: 1, shrub: 0.6 },
      ruts: 0.5,
      pal: {
        dirt: '#8c5a38',
        dirtDark: '#6e442a',
        stone: '#a8705a',
        stoneHi: '#c88e72',
        stoneDark: '#7a4e3e',
        gravel: '#7a5038',
        pavement: '#9a7058',
        roofA: '#b86e48',
        roofAHi: '#d08860',
        roofADark: '#94543a',
      },
    },
    {
      id: 'hamada',
      name: 'Stony plain',
      tones: [
        ['#a89474', '#b8a486', '#8e7c60'],
        ['#7e6e58', '#8e7e68', '#665848'],
        ['#c6ad78', '#d8c290', '#ad935f'],
      ],
      bare: ['#6e6050', '#7e7062', '#584c40'],
      bareCover: 0.15,
      bank: ['#857560', '#9a8a74', '#6a5c4a'],
      accents: ['#6e7a3a'],
      decalDensity: 0.45,
      decals: { stones: 5, tuft: 1, scuff: 1 },
      ruts: 0.6,
    },
  ],
  wasteland: [
    {
      id: 'ash',
      name: 'Ash',
      tones: [
        ['#55524b', '#625e56', '#46433d'],
        ['#6e6a62', '#7c786f', '#5c5850'],
        ['#3e3b36', '#4a4640', '#322f2b'],
      ],
      bare: ['#594a3d', '#6a5848', '#41362c'],
      bareCover: 0.12,
      bank: ['#6b7a46', '#7e8e54', '#55623a'],
      accents: ['#706653'],
      decalDensity: 0.35,
      decals: { stones: 2, scuff: 3, tuft: 1 },
      ruts: 0.8,
    },
    {
      id: 'rustDust',
      name: 'Rust dust',
      tones: [
        ['#6a5040', '#7a5e4c', '#584234'],
        ['#7e5a3e', '#906a4a', '#664632'],
        ['#4e4640', '#5a524b', '#403a35'],
      ],
      bare: ['#3e3530', '#4a403a', '#322a26'],
      bareCover: 0.1,
      bank: ['#7a7040', '#8e8450', '#625a32'],
      accents: ['#99633f'],
      decalDensity: 0.35,
      decals: { stones: 3, scuff: 3 },
      ruts: 0.8,
      pal: { dirt: '#6e4a36', dirtDark: '#523628' },
    },
    {
      id: 'toxic',
      name: 'Toxic',
      tones: [
        ['#4e5244', '#5a5e4e', '#404438'],
        ['#5c683c', '#6c7846', '#4a5430'],
        ['#6e6a44', '#7e7a52', '#5a5636'],
      ],
      bare: ['#3a3e30', '#464a3a', '#2e3226'],
      bareCover: 0.1,
      bank: ['#8a9a48', '#a0b058', '#6e7c38'],
      accents: ['#b8c850'],
      decalDensity: 0.3,
      decals: { scuff: 3, stones: 2, tuft: 1 },
      ruts: 0.7,
      pal: { water: '#4a5a2a', waterDeep: '#36421e', waterLight: '#7a9a3a', shallow: '#5e6a36', shallowLight: '#7e8c48' },
    },
  ],
};

/**
 * The battle's look, from its terrain seed (its own stream: nothing else draws on it), unless
 * `wanted` names one of the biome's looks (the `?look=` playtest shortcut).
 */
export function lookFor(biome: BiomeId, terrainSeed: number, wanted?: string): Look {
  const looks = LOOKS[biome];
  return looks.find((l) => l.id === wanted) ?? looks[hashSeed(terrainSeed, 0x5ea5) % looks.length]!;
}

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

/** A biome's palette in a look (the look's ground tone as its grass, and its own overrides). */
export function lookPalette(biome: BiomeId, look: Look): Pal {
  const [grass, grassLight, grassDark] = look.tones[0];
  return { ...biomePalette(biome), grass, grassLight, grassDark, ...look.pal };
}

