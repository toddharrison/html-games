import type { MaterialId } from '../content/terrain';
import { hashSeed, Rng } from '../sim/rng';
import type { Tile } from '../sim/terrain';
import type { DecalKind, Look, Pal, Ramp } from './looks';
import { PAL } from './palette';

/**
 * The open ground under a chunk of terrain (SPEC §4.6 "Looks"), painted per pixel from the terrain
 * seed and the battle's look: the look's three ground tones in big dithered patches (a very slow
 * noise gives a battle long stretches of one, faster ones break them up), bare patches, fringes
 * where the ground meets other terrain (banks along rivers, leaf litter at forest edges, scree under
 * rock, …), small decals, and now and then an old set of tank ruts. Pure, so tests can check it;
 * render/terrainView.ts turns it into a texture under the tiles. Tiles drawn over open ground
 * (ground, mines, craters, tank traps) are transparent there, so this shows through.
 */

/** What the painter needs from the terrain (a `Terrain` fits). */
export interface GroundSource {
  readonly seed: number;
  readonly rows: number;
  tile(col: number, row: number): Tile | undefined;
}

/** Materials whose tiles show the ground through (ground, unseen and swept mines, craters, traps). */
const SHOWS_GROUND = new Set<MaterialId>(['ground', 'mine', 'crater', 'tankTrap']);

type FringeKey = 'bank' | 'litter' | 'apron' | 'scree' | 'sand' | 'snow' | 'soil' | 'ash' | 'ballast';

/** What spills onto neighboring open ground from each material. */
const FRINGE_OF: Partial<Record<MaterialId, FringeKey>> = {
  water: 'bank',
  shallows: 'bank',
  bridge: 'bank',
  lightBridge: 'bank',
  ice: 'bank',
  thinIce: 'bank',
  wadi: 'bank',
  forest: 'litter',
  hedgerow: 'litter',
  building: 'apron',
  road: 'apron',
  factory: 'apron',
  wall: 'apron',
  bunker: 'apron',
  fuelTank: 'apron',
  derrick: 'apron',
  rock: 'scree',
  dune: 'sand',
  snowdrift: 'snow',
  farmland: 'soil',
  wreck: 'ash',
  glass: 'ash',
  rail: 'ballast',
};

/** How far each fringe reaches onto the ground (pixels; ragged by up to a third either way). */
const FRINGE_WIDTH: Record<FringeKey, number> = { bank: 7, litter: 5, apron: 3, scree: 5, sand: 5, snow: 5, soil: 2, ash: 3, ballast: 2 };

/** Speckle: the share of pixels in a light and a dark fleck (the tile art's ~12 of 256 each). */
const FLECK = { light: 0.05, dark: 0.1 };

/**
 * Tone noise: three octaves (spacing in pixels, weight). The thresholds split it about 28% second
 * tone, 45% first, 27% third (measured quantiles of the blend).
 */
const TONE_OCTAVES: readonly (readonly [number, number])[] = [
  [320, 0.5],
  [96, 0.32],
  [32, 0.18],
];
const TONE_LOW = 0.42;
const TONE_HIGH = 0.6;
/** Bare-patch noise: two octaves. */
const BARE_OCTAVES: readonly (readonly [number, number])[] = [
  [56, 0.65],
  [20, 0.35],
];
/** How wide a band dithering blurs each threshold over (in noise units). */
const DITHER = 0.05;
/** Decal clustering noise spacing (pixels). */
const DECAL_SPACING = 64;
/** Fringe raggedness noise spacing (pixels). */
const WOBBLE_SPACING = 5;
/** Tank ruts: chunks per stretch, half the gauge (pixels), and how much they darken. */
const RUTS = { chunks: 3, half: 4, shade: 0.78, gaps: 0.15, taper: 24 };

const SALT = { tone: 0x70e1, bare: 0xba4e, wobble: 0x3b61, decal: 0xdeca, fleck: 0xf1ec, ruts: 0x2075 };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);

type Rgb = readonly [number, number, number];
type RampRgb = readonly [Rgb, Rgb, Rgb];

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const ramp = (r: Ramp): RampRgb => [rgb(r[0]), rgb(r[1]), rgb(r[2])];

/** Value noise over a window, its lattice hashed once so each pixel only interpolates. */
class Grid {
  private readonly vals: Float32Array;
  private readonly g0u: number;
  private readonly g0v: number;
  private readonly gw: number;

  constructor(seed: number, salt: number, private readonly sp: number, u0: number, v0: number, w: number, h: number) {
    this.g0u = Math.floor(u0 / sp);
    this.g0v = Math.floor(v0 / sp);
    this.gw = Math.floor((u0 + w) / sp) + 2 - this.g0u;
    const gh = Math.floor((v0 + h) / sp) + 2 - this.g0v;
    this.vals = new Float32Array(this.gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < this.gw; i++) this.vals[j * this.gw + i] = hashSeed(seed, salt, this.g0u + i, this.g0v + j) / 4294967296;
    }
  }

  at(u: number, v: number): number {
    const fu = u / this.sp;
    const fv = v / this.sp;
    const iu = Math.floor(fu);
    const iv = Math.floor(fv);
    let tu = fu - iu;
    let tv = fv - iv;
    tu = tu * tu * (3 - 2 * tu);
    tv = tv * tv * (3 - 2 * tv);
    const k = (iv - this.g0v) * this.gw + (iu - this.g0u);
    const a = this.vals[k]!;
    const b = this.vals[k + 1]!;
    const c = this.vals[k + this.gw]!;
    const d = this.vals[k + this.gw + 1]!;
    return a + (b - a) * tu + (c - a + (a - b + d - c) * tu) * tv;
  }
}

/** Several octaves of `Grid`, weights summing to 1. */
class Fbm {
  private readonly grids: Grid[];
  private readonly weights: number[];
  constructor(seed: number, salt: number, octaves: readonly (readonly [number, number])[], u0: number, v0: number, w: number, h: number) {
    this.grids = octaves.map(([sp], i) => new Grid(seed, salt + i, sp, u0, v0, w, h));
    this.weights = octaves.map(([, wt]) => wt);
  }
  at(u: number, v: number): number {
    let n = 0;
    for (let i = 0; i < this.grids.length; i++) n += this.grids[i]!.at(u, v) * this.weights[i]!;
    return n;
  }
}

/** Per-pixel hash in [0, 1). */
function fleck(seed: number, u: number, v: number): number {
  let h = Math.imul(u, 0x27d4eb2d) ^ Math.imul(v, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Decal stamps, drawn on screen (forward is up). Letters pick colors: L/D the ground tone's light and
 * dark, A/B the look's accents, s/h/k stone (base, lit, shaded), d/e dirt and dark dirt, c/C/x canopy,
 * its light, and its shadow; '.' leaves the ground.
 */
const STAMPS: Record<DecalKind, readonly (readonly string[])[]> = {
  tuft: [
    ['.L.L.', 'L.D.L', '.DLD.'],
    ['L..L', '.DL.', 'D.D.'],
  ],
  flowers: [
    ['A...B', '.D.A.', 'B..D.', '.A...'],
    ['.A.', 'ADA', '.D.', '..B'],
    ['B.A', '.D.', 'A..'],
  ],
  stones: [
    ['hs..', 'sk.h', '...k'],
    ['.hs.', 'hssk', '.kk.'],
    ['h..', '.k.', '..h'],
  ],
  scuff: [
    ['.ddd.', 'dedde', '.e.d.'],
    ['dd.', 'ede', '.dd'],
  ],
  shrub: [
    ['.CC.', 'CccC', 'cccx', '.xx.'],
    ['.C.', 'Ccx', '.x.'],
  ],
};
const DECAL_KINDS = Object.keys(STAMPS) as DecalKind[];

/**
 * Paints chunk `ci`'s ground as RGBA into `pixels`, `rows × tile` wide and `cols × tile` tall, in
 * screen orientation: x runs across the field (sim rows), y down the screen (the chunk's last column
 * on top). It works a tile column at a time (`paintColumn`), so the view can spread a chunk over
 * several frames. Deterministic for a seed and look; a mine paints exactly like the ground it hides in.
 */
export class GroundPainter {
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  private readonly firstCol: number;
  private readonly v0: number;
  private readonly tone: Fbm;
  private readonly bare: Fbm;
  private readonly wobble: Grid;
  private readonly decalField: Grid;
  private readonly tones: RampRgb[];
  private readonly bareRamp: RampRgb;
  private readonly bareAt: number;
  private readonly fringes: Record<FringeKey, RampRgb>;
  private readonly ruts: Rut[];

  constructor(
    private readonly src: GroundSource,
    private readonly look: Look,
    private readonly pal: Pal,
    ci: number,
    readonly cols: number,
    private readonly tile: number,
  ) {
    this.width = src.rows * tile;
    this.height = cols * tile;
    this.pixels = new Uint8ClampedArray(this.width * this.height * 4);
    const seed = src.seed;
    this.firstCol = ci * cols;
    // World pixel coordinates: u across the field, v forward (bottom of the chunk = v0).
    this.v0 = this.firstCol * tile;
    const [W, H, v0] = [this.width, this.height, this.v0];
    this.tone = new Fbm(seed, SALT.tone, TONE_OCTAVES, 0, v0, W, H);
    this.bare = new Fbm(seed, SALT.bare, BARE_OCTAVES, 0, v0, W, H);
    this.wobble = new Grid(seed, SALT.wobble, WOBBLE_SPACING, 0, v0, W, H);
    this.decalField = new Grid(seed, SALT.decal, DECAL_SPACING, 0, v0, W, H);
    this.tones = look.tones.map(ramp);
    this.bareRamp = ramp(look.bare);
    this.bareAt = bareThreshold(look.bareCover);
    this.fringes = {
      bank: ramp(look.bank),
      litter: ramp([pal.grassDark, pal.canopyLight, pal.canopyShadow]),
      apron: ramp([pal.dirt, pal.rubble, pal.dirtDark]),
      scree: ramp([pal.gravel, pal.stone, pal.stoneDark]),
      sand: ramp([pal.grass, pal.grassLight, pal.grassDark]),
      snow: ramp([PAL.snow, PAL.snowHi, PAL.snowShade]),
      soil: ramp([pal.dirt, pal.dirtDark, pal.dirtDark]),
      ash: ramp([pal.ash, pal.ashLight, pal.dirtDark]),
      ballast: ramp([pal.gravel, pal.stoneDark, pal.stoneDark]),
    };
    this.ruts = rutsNear(seed, look, ci, cols, tile, src.rows);
  }

  /** Paint local tile column `lc` (0 = the chunk's first, at the bottom). */
  paintColumn(lc: number): void {
    const { src, tile, pixels: out, width: W } = this;
    const seed = src.seed;
    const fleckSeed = seed ^ SALT.fleck;
    const col = this.firstCol + lc;
    const ty = (this.cols - 1 - lc) * tile;
    const vTop = this.v0 + this.height;
    const put = (x: number, y: number, c: Rgb): void => {
      const k = (y * W + x) * 4;
      out[k] = c[0];
      out[k + 1] = c[1];
      out[k + 2] = c[2];
      out[k + 3] = 255;
    };
    // Neighbors spilling onto the tile: offsets (dc +1 is the tile ahead, above) and fringe.
    const sdc: number[] = [];
    const sdr: number[] = [];
    const skey: FringeKey[] = [];
    for (let row = 0; row < src.rows; row++) {
      const tx = row * tile;
      const here = src.tile(col, row);
      const open = !here || SHOWS_GROUND.has(here.mat);
      sdc.length = sdr.length = skey.length = 0;
      if (open) {
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const n = src.tile(col + dc, row + dr);
            const f = n && FRINGE_OF[n.mat];
            if (f) {
              sdc.push(dc);
              sdr.push(dr);
              skey.push(f);
            }
          }
        }
      }
      const spills = skey.length;

      for (let yi = 0; yi < tile; yi++) {
        const y = ty + yi;
        const v = vTop - 1 - y;
        for (let xi = 0; xi < tile; xi++) {
          const x = tx + xi;
          const b = BAYER[((y & 3) << 2) | (x & 3)]! - 0.5;
          const h = fleck(fleckSeed, x, v);
          let r: RampRgb | null = null;

          // Fringe: the nearest spilling neighbor, its edge ragged; solid inside half its width,
          // dithered out to the full width.
          if (spills) {
            let best = Infinity;
            let key: FringeKey = skey[0]!;
            for (let i = 0; i < spills; i++) {
              const dr = sdr[i]!;
              const dc = sdc[i]!;
              const dx = dr < 0 ? xi + 0.5 : dr > 0 ? tile - xi - 0.5 : 0;
              const dy = dc > 0 ? yi + 0.5 : dc < 0 ? tile - yi - 0.5 : 0;
              const d = Math.sqrt(dx * dx + dy * dy) / FRINGE_WIDTH[skey[i]!];
              if (d < best) {
                best = d;
                key = skey[i]!;
              }
            }
            if (best < 1.4) {
              const d = best + (this.wobble.at(x, v) - 0.5) * 0.66;
              if (d < 0.5 || (d < 1 && b + 0.5 > (d - 0.5) * 2)) r = this.fringes[key];
            }
          }
          if (!r) {
            if (this.bare.at(x, v) + b * DITHER > this.bareAt) r = this.bareRamp;
            else {
              const n = this.tone.at(x, v) + b * DITHER;
              r = this.tones[n < TONE_LOW ? 1 : n > TONE_HIGH ? 2 : 0]!;
            }
          }
          const c = h < FLECK.light ? r[1] : h < FLECK.dark ? r[2] : r[0];
          const k = (y * W + x) * 4;
          out[k] = c[0];
          out[k + 1] = c[1];
          out[k + 2] = c[2];
          out[k + 3] = 255;
        }
      }

      if (!open) continue;
      if (this.ruts.length) shadeRuts(out, W, tx, ty, tile, vTop, this.ruts, seed);
      if (!spills) stampDecal(seed, this.look, this.pal, col, row, tx, ty, tile, this.decalField, this.tones, this.tone, put);
    }
  }
}

/** Paint a whole chunk at once (see `GroundPainter`). */
export function paintGround(src: GroundSource, look: Look, pal: Pal, ci: number, cols: number, tile: number): Uint8ClampedArray {
  const p = new GroundPainter(src, look, pal, ci, cols, tile);
  for (let lc = 0; lc < cols; lc++) p.paintColumn(lc);
  return p.pixels;
}

/**
 * The bare-noise level above which ground is bare, for a cover fraction. Two blended octaves of
 * smoothed value noise bunch up around 0.5, so a straight `1 - cover` would leave almost none.
 */
function bareThreshold(cover: number): number {
  if (cover <= 0) return Infinity;
  // Measured quantiles of the blend (tests/render/ground.test.ts checks the cover lands near them).
  const q: readonly [number, number][] = [
    [0, 1],
    [0.02, 0.813],
    [0.05, 0.761],
    [0.1, 0.711],
    [0.15, 0.674],
    [0.2, 0.643],
    [0.3, 0.591],
    [0.5, 0.501],
  ];
  for (let i = 1; i < q.length; i++) {
    const [c1, t1] = q[i]!;
    if (cover <= c1) {
      const [c0, t0] = q[i - 1]!;
      return t0 + ((cover - c0) / (c1 - c0)) * (t1 - t0);
    }
  }
  return 0.5;
}

interface Rut {
  vs: number;
  ve: number;
  u0: number;
  amp: number;
  wave: number;
  phase: number;
}

/** Old tank ruts that may cross chunk `ci`: each stretch of `RUTS.chunks` chunks may hold one. */
function rutsNear(seed: number, look: Look, ci: number, cols: number, tile: number, rows: number): Rut[] {
  const span = RUTS.chunks * cols * tile;
  const out: Rut[] = [];
  const s1 = Math.floor(ci / RUTS.chunks);
  for (let s = s1 - 1; s <= s1; s++) {
    const rng = new Rng(hashSeed(seed, SALT.ruts, s));
    if (rng.next() >= look.ruts) continue;
    const vs = s * span + rng.range(0, cols * tile);
    out.push({
      vs,
      ve: vs + rng.range(1.2, 2.6) * cols * tile,
      u0: rng.range(3 * tile, (rows - 3) * tile),
      amp: rng.range(1, 4) * tile,
      wave: rng.range(40, 90),
      phase: rng.range(0, Math.PI * 2),
    });
  }
  return out;
}

/** Darken the ruts' pixels inside one tile. `vTop` is the world v just above the chunk's top row. */
function shadeRuts(out: Uint8ClampedArray, W: number, tx: number, ty: number, tile: number, vTop: number, ruts: Rut[], seed: number): void {
  for (let yi = 0; yi < tile; yi++) {
    const y = ty + yi;
    const v = vTop - 1 - y;
    for (const r of ruts) {
      if (v < r.vs || v > r.ve) continue;
      const c = r.u0 + r.amp * Math.sin((v - r.vs) / r.wave + r.phase);
      // Fade in and out at the ends: more and more gaps.
      const end = Math.min(v - r.vs, r.ve - v) / RUTS.taper;
      for (const side of [-1, 1]) {
        const x0 = Math.round(c + side * RUTS.half);
        for (let x = x0; x < x0 + 2; x++) {
          if (x < tx || x >= tx + tile) continue;
          const h = fleck(seed ^ SALT.ruts, x, v);
          if (h < RUTS.gaps || h > Math.min(1, end)) continue;
          const k = (y * W + x) * 4;
          out[k] = out[k]! * RUTS.shade;
          out[k + 1] = out[k + 1]! * RUTS.shade;
          out[k + 2] = out[k + 2]! * RUTS.shade;
        }
      }
    }
  }
}

/** Maybe stamp a decal on an open tile clear of any fringe, clustered by the decal noise. */
function stampDecal(
  seed: number,
  look: Look,
  pal: Pal,
  col: number,
  row: number,
  tx: number,
  ty: number,
  tile: number,
  field: Grid,
  tones: RampRgb[],
  tone: Fbm,
  put: (x: number, y: number, c: Rgb) => void,
): void {
  const rng = new Rng(hashSeed(seed, SALT.decal, col, row));
  const u = tx + tile / 2;
  const v = col * tile + tile / 2;
  const chance = look.decalDensity * (0.2 + 1.6 * field.at(u, v));
  if (rng.next() >= chance) return;
  const weights = DECAL_KINDS.map((k) => look.decals[k] ?? 0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  let roll = rng.next() * total;
  let kind = DECAL_KINDS[0]!;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) {
      kind = DECAL_KINDS[i]!;
      break;
    }
  }
  const stamp = rng.pick(STAMPS[kind]);
  const sh = stamp.length;
  const sw = stamp[0]!.length;
  const ox = tx + rng.int(1, tile - sw - 1);
  const oy = ty + rng.int(1, tile - sh - 1);
  // The tone under the stamp's middle sets its L/D colors.
  const n = tone.at(u, v);
  const t = tones[n < TONE_LOW ? 1 : n > TONE_HIGH ? 2 : 0]!;
  const accents = look.accents.map(rgb);
  const a = rng.pick(accents);
  const bAcc = rng.pick(accents);
  const colors: Record<string, Rgb> = {
    L: t[1],
    D: t[2],
    A: a,
    B: bAcc,
    s: rgb(pal.stone),
    h: rgb(pal.stoneHi),
    k: rgb(pal.stoneDark),
    d: rgb(pal.dirt),
    e: rgb(pal.dirtDark),
    c: rgb(pal.canopy),
    C: rgb(pal.canopyLight),
    x: rgb(pal.canopyShadow),
  };
  for (let j = 0; j < sh; j++) {
    const line = stamp[j]!;
    for (let i = 0; i < sw; i++) {
      const c = colors[line[i]!];
      if (c) put(ox + i, oy + j, c);
    }
  }
}
