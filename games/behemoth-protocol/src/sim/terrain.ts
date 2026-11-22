import { APPROACHES, type ApproachDef, type ApproachId } from '../content/approaches';
import { BIOMES, type BiomeDef, type BiomeId, type MixKey } from '../content/biomes';
import { hoverable, MATERIALS, type MaterialId, type TileState, type UnitMobility } from '../content/terrain';
import type { ObstacleClass } from '../content/obstacles';
import { BEARING, TERRAIN_GEN } from '../content/tuning';
import type { SimEvent } from './events';
import type { Rect } from './math';
import { hashSeed, Rng } from './rng';

/**
 * Destructible tile grid (SPEC §4.5), generated in chunks ahead of the frame and dropped behind it.
 * Each chunk is generated purely from (seed, recipe, chunk index), so the same seed always produces
 * the same battlefield regardless of how fast the player drives or what order chunks are generated
 * in. The recipe is a biome (SPEC §4.6) × an approach (SPEC §3.1).
 */

export interface Tile {
  mat: MaterialId;
  state: TileState;
  hp: number;
  /** Cosmetic variant (0..3) for the renderer. */
  variant: number;
  /** What a bridge is built over: the tile it falls back to once it's down. */
  under?: MaterialId;
  /** A hidden tile (a mine) the Behemoth's sensors have swept: drawn from now on. */
  seen?: boolean;
}

/** What a battle's terrain is built from. A null approach is the biome's own balanced mix. */
export interface TerrainRecipe {
  biome: BiomeId;
  approach: ApproachId | null;
  /** A Breach battle's fortress (SPEC §4.4): a fortified line forced at this column. */
  fortress?: FortressSpec;
}

/** Where a Breach fortress stands and how many armed positions its wall holds. */
export interface FortressSpec {
  /** The wall's column. */
  col: number;
  guns: number;
  gates: number;
  gateWidth: readonly [number, number];
}

/** A fortress as generated: its wall column, gates, and the rows of each armed position. */
export interface FortressPlan {
  col: number;
  gates: [number, number][];
  /** [first, end) rows of each gap in the wall that holds a gun. */
  embrasures: [number, number][];
}

export const DEFAULT_RECIPE: TerrainRecipe = { biome: 'temperate', approach: null };

/** A blast queued by explosive terrain (SPEC §4.6), set off after its fuse. */
export interface TerrainBlast {
  x: number;
  y: number;
  radius: number;
  damage: number;
  fuse: number;
}

const TS = TERRAIN_GEN.tileSize;
const CHUNK = TERRAIN_GEN.chunkCols;

/** The recipe's content looked up once. */
interface Resolved {
  biome: BiomeDef;
  approach: ApproachDef | null;
  fortress: FortressSpec | null;
}

function resolve(r: TerrainRecipe): Resolved {
  return { biome: BIOMES[r.biome], approach: r.approach ? APPROACHES[r.approach] : null, fortress: r.fortress ?? null };
}

function scaleOf(rc: Resolved, key: MixKey): number {
  return rc.approach?.scale[key] ?? 1;
}

/** A single-number mix entry scaled by the approach. */
function mixOf(rc: Resolved, key: Exclude<MixKey, 'forests' | 'rock'>): number {
  return rc.biome.mix[key] * scaleOf(rc, key);
}

/** A whole count with `e` expected: its fraction is the chance of one more. */
function expected(rng: Rng, e: number): number {
  const k = Math.floor(e);
  return k + (rng.chance(e - k) ? 1 : 0);
}

/** A drawn count scaled (draws nothing more when the scale is 1, so the baseline keeps its layout). */
function scaled(rng: Rng, n: number, scale: number): number {
  return scale === 1 ? n : expected(rng, n * scale);
}

interface ForestBlob {
  kind: 'forest';
  id: number;
  col: number;
  row: number;
  r: number;
}
interface Town {
  kind: 'town';
  id: number;
  col0: number;
  row0: number;
  cols: number;
  rows: number;
}
/** A rock outcrop (a = b) or ridge: a capsule from a to b, in tile units. */
interface Rock {
  kind: 'rock';
  id: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}
/** A round patch: crater fields, minefields, wreck fields. */
interface Patch {
  kind: 'craters' | 'mines' | 'wrecks';
  id: number;
  col: number;
  row: number;
  r: number;
}
/** An oval: frozen lakes, snowdrifts, dunes, blast sites (radii along and across the field). */
interface Oval {
  kind: 'lake' | 'drift' | 'dune' | 'blast';
  id: number;
  col: number;
  row: number;
  rx: number;
  ry: number;
}
/**
 * A rectangle of tiles: crop fields, factory compounds, tank farms (`cols` × `rows` of tanks),
 * oilfields.
 */
interface Block {
  kind: 'farm' | 'factory' | 'tanks' | 'oilfield';
  id: number;
  col0: number;
  row0: number;
  cols: number;
  rows: number;
  /** Farms: boxed in by hedgerows. Factories: inside a compound wall. */
  walled: boolean;
}
/** A straight hedgerow, across the field (along the rows) or along it (along the columns). */
interface Hedge {
  kind: 'hedge';
  id: number;
  col: number;
  row: number;
  len: number;
  across: boolean;
}
/**
 * Defenses across the field at a column. A fortified line is a wall with gates, bunkers behind it,
 * and a belt of tank traps in front with its own gates; a trap line is the belt alone, over part of
 * the field.
 */
interface Defense {
  kind: 'fort' | 'traps';
  id: number;
  col: number;
  /** Rows covered: [first, end). */
  rows: [number, number];
  /** Wall gates (fort) or belt gates (traps), [first, end) rows. */
  gates: [number, number][];
  /** Fort: the trap belt's gates. */
  trapGates: [number, number][];
  /** Fort: rows of the bunkers behind the wall. */
  bunkers: number[];
  /** A Breach fortress: gaps in the wall, [first, end) rows, each holding a gun. */
  embrasures?: [number, number][];
}
type Feature = ForestBlob | Town | Rock | Patch | Oval | Block | Hedge | Defense;

/** Deterministic [0,1) value for a cell, independent of generation order. */
function cellNoise(seed: number, col: number, row: number, salt: number): number {
  return hashSeed(seed, col, row, salt) / 4294967296;
}

/** Random streams for the feature kinds added after M1, so each leaves the others' layouts alone. */
const SALT = {
  craters: 0xc7a1,
  mines: 0x313e,
  fort: 0xf047,
  fortress: 0xf0e7,
  traps: 0x7a95,
  hedge: 0x4ed9,
  farm: 0xfa53,
  lake: 0x1a4e,
  drift: 0xd51f,
  factory: 0xfac7,
  tanks: 0x7a4c,
  dune: 0xd0e5,
  oilfield: 0x0115,
  wrecks: 0x3ec7,
  blast: 0xb1a5,
} as const;

/** `n` gates spread over [a, b), each in its own stretch, so two never merge. */
function gates(rng: Rng, n: number, width: readonly [number, number], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const w = rng.int(width[0], width[1]);
    const s0 = a + Math.floor((i * (b - a)) / n);
    const s1 = a + Math.floor(((i + 1) * (b - a)) / n);
    const r0 = rng.int(s0, Math.max(s0, s1 - w));
    out.push([r0, Math.min(b, r0 + w)]);
  }
  return out;
}

const inRanges = (ranges: [number, number][], row: number) => ranges.some(([a, b]) => row >= a && row < b);

/** Features whose origin lies in chunk `ci`. They may spill into neighboring chunks. */
function chunkFeatures(seed: number, ci: number, rows: number, rc: Resolved): Feature[] {
  const rng = new Rng(hashSeed(seed, ci, 0xfea7));
  const g = TERRAIN_GEN;
  const mix = rc.biome.mix;
  const out: Feature[] = [];
  const baseCol = ci * CHUNK;
  const forestSize = rc.approach?.forestSize ?? 1;
  const townSize = rc.approach?.townSize ?? 1;

  // Forests, towns, then rock, on the original stream in the original order (the temperate
  // baseline keeps the layouts it had before biomes).
  const blobs = scaled(rng, rng.int(mix.forests[0], mix.forests[1]), scaleOf(rc, 'forests'));
  for (let i = 0; i < blobs; i++) {
    out.push({
      kind: 'forest',
      id: i,
      col: baseCol + rng.range(0, CHUNK),
      row: rng.range(0, rows),
      r: rng.range(g.forestBlobRadius[0], g.forestBlobRadius[1]) * forestSize,
    });
  }
  const towns = expected(rng, mixOf(rc, 'towns'));
  for (let i = 0; i < towns; i++) {
    const cols = Math.round(rng.int(g.townCols[0], g.townCols[1]) * townSize);
    const trows = Math.min(rows, Math.round(rng.int(g.townRows[0], g.townRows[1]) * townSize));
    out.push({
      kind: 'town',
      id: 100 + i,
      col0: baseCol + rng.int(0, CHUNK - 1),
      row0: rng.int(0, Math.max(0, rows - trows)),
      cols,
      rows: trows,
    });
  }
  const rocks = scaled(rng, rng.int(mix.rock[0], mix.rock[1]), scaleOf(rc, 'rock'));
  for (let i = 0; i < rocks; i++) {
    const ax = baseCol + rng.range(0, CHUNK);
    const ay = rng.range(0, rows);
    if (rng.chance(g.ridgeChance)) {
      const len = rng.range(g.ridgeLength[0], g.ridgeLength[1]);
      const slope = rng.range(-g.ridgeSlope, g.ridgeSlope);
      const dx = len / Math.hypot(1, slope);
      out.push({ kind: 'rock', id: 200 + i, ax, ay, bx: ax + dx, by: ay + dx * slope, r: rng.range(g.ridgeRadius[0], g.ridgeRadius[1]) });
    } else {
      out.push({ kind: 'rock', id: 200 + i, ax, ay, bx: ax, by: ay, r: rng.range(g.outcropRadius[0], g.outcropRadius[1]) });
    }
  }

  // Everything else, each kind on a stream of its own.
  const each = (kind: keyof typeof SALT, e: number, make: (r: Rng, id: number) => Feature | null) => {
    const r = new Rng(hashSeed(seed, ci, SALT[kind]));
    const n = expected(r, e);
    for (let i = 0; i < n; i++) {
      const f = make(r, 300 + out.length);
      if (f) out.push(f);
    }
  };
  const anyCol = (r: Rng) => baseCol + r.range(0, CHUNK);
  const defended = ci >= g.firstDefenseChunk;

  each('farm', mixOf(rc, 'farms'), (r, id) => {
    const cols = r.int(g.farm.cols[0], g.farm.cols[1]);
    const frows = Math.min(rows, r.int(g.farm.rows[0], g.farm.rows[1]));
    return { kind: 'farm', id, col0: baseCol + r.int(0, CHUNK - 1), row0: r.int(0, rows - frows), cols, rows: frows, walled: r.chance(g.farm.hedged) };
  });
  each('craters', mixOf(rc, 'craterFields'), (r, id) => ({ kind: 'craters', id, col: anyCol(r), row: r.range(0, rows), r: r.range(g.craterField.radius[0], g.craterField.radius[1]) }));
  each('hedge', mixOf(rc, 'hedgerows'), (r, id) => {
    const across = r.chance(0.5);
    const len = r.int(g.hedgerow.length[0], g.hedgerow.length[1]);
    return { kind: 'hedge', id, col: baseCol + r.int(0, CHUNK - 1), row: r.int(0, rows - 1), len, across };
  });
  // Factory compounds and tank farms stand beside the guaranteed lane, never across it: a whole
  // compound of halls (or a farm of tanks waiting to go up) in the only way forward would leave
  // nothing to do but grind through it.
  each('factory', mixOf(rc, 'factories'), (r, id) => {
    const cols = Math.round(r.int(g.factory.cols[0], g.factory.cols[1]) * townSize);
    const frows = Math.min(rows - 4, Math.round(r.int(g.factory.rows[0], g.factory.rows[1]) * townSize));
    const col0 = baseCol + r.int(0, CHUNK - 1);
    const ring = 2;
    const row0 = besideLane(seed, rows, rc, r, col0 - ring, col0 + cols + ring, frows + 2 * ring);
    return row0 === null ? null : { kind: 'factory', id, col0, row0: row0 + ring, cols, rows: frows, walled: r.chance(g.factory.walled) };
  });
  each('tanks', mixOf(rc, 'tankFarms'), (r, id) => {
    const cols = r.int(g.tankFarm.cols[0], g.tankFarm.cols[1]);
    const trows = r.int(g.tankFarm.rows[0], g.tankFarm.rows[1]);
    const col0 = baseCol + r.int(0, CHUNK - 1);
    const row0 = besideLane(seed, rows, rc, r, col0, col0 + 2 * cols, 2 * trows - 1);
    return row0 === null ? null : { kind: 'tanks', id, col0, row0, cols, rows: trows, walled: false };
  });
  each('drift', mixOf(rc, 'snowdrifts'), (r, id) => {
    const rx = r.range(g.snowdrift.radius[0], g.snowdrift.radius[1]);
    return { kind: 'drift', id, col: anyCol(r), row: r.range(0, rows), rx, ry: rx * g.snowdrift.stretch };
  });
  each('lake', mixOf(rc, 'lakes'), (r, id) => {
    const rad = r.range(g.lake.radius[0], g.lake.radius[1]);
    return { kind: 'lake', id, col: anyCol(r), row: r.range(0, rows), rx: rad * r.range(0.8, 1.2), ry: rad * r.range(0.9, 1.5) };
  });
  each('dune', mixOf(rc, 'dunes'), (r, id) => ({
    kind: 'dune',
    id,
    col: anyCol(r),
    row: r.range(0, rows),
    rx: r.range(g.dune.along[0], g.dune.along[1]),
    ry: r.range(g.dune.across[0], g.dune.across[1]),
  }));
  each('oilfield', mixOf(rc, 'oilfields'), (r, id) => {
    const size = r.int(g.oilfield.size[0], g.oilfield.size[1]);
    const col0 = baseCol + r.int(0, CHUNK - 1);
    const row0 = besideLane(seed, rows, rc, r, col0, col0 + size, size);
    return row0 === null ? null : { kind: 'oilfield', id, col0, row0, cols: size, rows: size, walled: false };
  });
  each('wrecks', mixOf(rc, 'wrecks'), (r, id) => ({ kind: 'wrecks', id, col: anyCol(r), row: r.range(0, rows), r: r.range(g.wreckField.radius[0], g.wreckField.radius[1]) }));
  each('blast', mixOf(rc, 'blastSites'), (r, id) => {
    const rad = r.range(g.blastSite.radius[0], g.blastSite.radius[1]);
    return { kind: 'blast', id, col: anyCol(r), row: r.range(0, rows), rx: rad, ry: rad * r.range(0.85, 1.2) };
  });
  const fortress = rc.fortress;
  if (fortress && Math.floor(fortress.col / CHUNK) === ci) out.push(fortressFeature(new Rng(hashSeed(seed, ci, SALT.fortress)), 900, fortress, rows));
  // Defenses never stand where a river crosses nearby (it would cut them apart).
  const riverNear = () => [ci - 1, ci, ci + 1].some((c) => riverOf(seed, c, rows, rc) !== null);
  if (defended) {
    each('fort', mixOf(rc, 'fortLines'), (r, id) => {
      if (riverNear()) return null;
      const f = g.fortLine;
      const col = baseCol + r.int(f.trapsAhead + 1, CHUNK - f.bunkerBehind - 1);
      const wallGates = gates(r, r.int(f.gates[0], f.gates[1]), f.gateWidth, 0, rows);
      const trapGates = gates(r, r.int(f.gates[0], f.gates[1]), f.gateWidth, 0, rows);
      const bunkers: number[] = [];
      const nb = r.int(f.bunkers[0], f.bunkers[1]);
      for (let i = 0; i < nb; i++) bunkers.push(r.int(1, rows - 2));
      return { kind: 'fort', id, col, rows: [0, rows], gates: wallGates, trapGates, bunkers };
    });
    each('traps', mixOf(rc, 'trapLines'), (r, id) => {
      const t = g.trapLine;
      const len = Math.min(rows, r.int(t.length[0], t.length[1]));
      const row0 = r.int(0, rows - len);
      const col = baseCol + r.int(0, CHUNK - 2);
      return { kind: 'traps', id, col, rows: [row0, row0 + len], gates: gates(r, r.int(t.gates[0], t.gates[1]), [t.gateWidth, t.gateWidth], row0, row0 + len), trapGates: [], bunkers: [] };
    });
    each('mines', mixOf(rc, 'minefields'), (r, id) => ({ kind: 'mines', id, col: anyCol(r), row: r.range(0, rows), r: r.range(g.minefield.radius[0], g.minefield.radius[1]) }));
  }
  return out;
}

/**
 * A Breach fortress (SPEC §4.4): a fortified line like any other (wall, gates, bunkers behind, a trap
 * belt in front), whose wall also holds `guns` armed positions, each in a two-row gap of its own;
 * a gate may open right beside a gun, which then covers it.
 */
function fortressFeature(r: Rng, id: number, spec: FortressSpec, rows: number): Defense {
  const f = TERRAIN_GEN.fortLine;
  // The wall is laid out across the field as a sequence of guns (two rows each) and gates, with
  // stretches of wall between. Gates narrow, then guns drop, only if the field is too narrow for all of them.
  const widths = Array.from({ length: spec.gates }, () => r.int(spec.gateWidth[0], spec.gateWidth[1]));
  let guns = spec.guns;
  const used = () => 2 * guns + widths.reduce((a, b) => a + b, 0);
  while (used() > rows - 2 && widths.some((w) => w > 3)) widths[widths.indexOf(Math.max(...widths))]!--;
  while (used() > rows - 2 && guns > 1) guns--;
  // Each gate goes in its own slot between guns (or at an end).
  const slots = new Set<number>();
  while (slots.size < Math.min(widths.length, guns + 1)) slots.add(r.int(0, guns));
  const items: { gate: boolean; len: number }[] = [];
  let g = 0;
  for (let slot = 0; slot <= guns; slot++) {
    if (slots.has(slot)) items.push({ gate: true, len: widths[g++]! });
    if (slot < guns) items.push({ gate: false, len: 2 });
  }
  // The rows left over are wall, cut into a stretch before each item and one after the last.
  const spare = rows - items.reduce((a, it) => a + it.len, 0);
  const cuts = Array.from({ length: items.length }, () => r.int(0, spare)).sort((a, b) => a - b);
  const wallGates: [number, number][] = [];
  const embrasures: [number, number][] = [];
  let row = 0;
  items.forEach((it, i) => {
    row += cuts[i]! - (cuts[i - 1] ?? 0);
    (it.gate ? wallGates : embrasures).push([row, row + it.len]);
    row += it.len;
  });
  const trapGates = gates(r, r.int(f.gates[0], f.gates[1]), f.gateWidth, 0, rows);
  const bunkers: number[] = [];
  const nb = r.int(f.bunkers[0], f.bunkers[1]);
  for (let i = 0; i < nb; i++) bunkers.push(r.int(1, rows - 2));
  return { kind: 'fort', id, col: spec.col, rows: [0, rows], gates: wallGates, trapGates, bunkers, embrasures };
}

/**
 * Center row of the guaranteed lane at a column (SPEC §4.2: there is always a way forward).
 * Linear between per-knot hashed offsets, so it depends only on (seed, col) and drifts at most
 * 2 × amplitude / knot spacing rows per column, well within the Behemoth's steering.
 */
export function laneCenter(seed: number, col: number, rows: number, amplitude: number = TERRAIN_GEN.laneAmplitude): number {
  const g = TERRAIN_GEN;
  const amp = Math.max(0, Math.min(amplitude, (rows - g.laneWidth) / 2));
  const k = Math.floor(col / g.laneKnotCols);
  const t = col / g.laneKnotCols - k;
  const knot = (i: number) => (cellNoise(seed, i, 0, 0x1a7e) * 2 - 1) * amp;
  return rows / 2 + knot(k) + (knot(k + 1) - knot(k)) * t;
}

/**
 * A first row for a block `height` rows tall over columns [c0, c1] that keeps clear of the lane
 * (wherever it wanders over those columns), on a side picked at random; null if neither side has
 * room.
 */
function besideLane(seed: number, rows: number, rc: Resolved, rng: Rng, c0: number, c1: number, height: number): number | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let c = c0; c <= c1; c++) {
    const lc = laneCenter(seed, c + 0.5, rows, rc.approach?.laneAmplitude);
    lo = Math.min(lo, lc - TERRAIN_GEN.laneWidth / 2);
    hi = Math.max(hi, lc + TERRAIN_GEN.laneWidth / 2);
  }
  const above = Math.floor(lo) - height; // last first-row that fits before the lane
  const below = Math.ceil(hi); // first first-row past it
  const sides: [number, number][] = [];
  if (above >= 0) sides.push([0, above]);
  if (below + height <= rows) sides.push([below, rows - height]);
  if (sides.length === 0) return null;
  const [a, b] = sides[rng.int(0, sides.length - 1)]!;
  return rng.int(a, b);
}

function inLane(seed: number, col: number, row: number, rows: number, rc: Resolved): boolean {
  return Math.abs(row + 0.5 - laneCenter(seed, col + 0.5, rows, rc.approach?.laneAmplitude)) < TERRAIN_GEN.laneWidth / 2;
}

/** Distance from point p to segment ab. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const SOFT: ReadonlySet<MaterialId> = new Set(['ground', 'farmland']);
/**
 * What rock (outcrops, ridges, cliffs) never claims: towns and industrial buildings. Everything else
 * it paints over, so rock keeps the shape it would have on open ground (holes cut by rails or
 * defenses would leave notches a hull gets wedged in).
 */
const ROCK_SPARES: ReadonlySet<MaterialId> = new Set(['building', 'road', 'factory', 'fuelTank']);
const LAKE_CLAIMS: ReadonlySet<MaterialId> = new Set(['ground', 'forest', 'farmland', 'crater', 'snowdrift']);

/**
 * What a feature paints over a cell that currently holds `cur`, or null if it leaves the cell alone
 * (outside it, or a material it doesn't claim).
 */
function featurePaint(seed: number, ci: number, f: Feature, col: number, row: number, cur: MaterialId): MaterialId | null {
  const noise = cellNoise(seed, col, row, ci * 1000 + f.id);
  switch (f.kind) {
    case 'forest': {
      if (!SOFT.has(cur)) return null;
      const d = Math.hypot(col + 0.5 - f.col, row + 0.5 - f.row) / f.r;
      return d < 1 && noise > d * d * 0.85 ? 'forest' : null;
    }
    case 'rock': {
      if (ROCK_SPARES.has(cur)) return null;
      const d = segmentDistance(col + 0.5, row + 0.5, f.ax, f.ay, f.bx, f.by);
      // Mostly solid with a slightly ragged edge.
      return d < f.r * (0.8 + 0.4 * noise) ? 'rock' : null;
    }
    case 'town': {
      const dc = col - f.col0;
      const dr = row - f.row0;
      if (dc < 0 || dr < 0 || dc >= f.cols || dr >= f.rows) return null;
      const street = dc % 3 === 2 || (f.rows >= 4 && dr === Math.floor(f.rows / 2));
      return !street && noise < TERRAIN_GEN.townFill ? 'building' : 'road';
    }
    case 'craters': {
      if (!SOFT.has(cur) && cur !== 'forest') return null;
      const d = Math.hypot(col + 0.5 - f.col, row + 0.5 - f.row) / f.r;
      return d < 1 && noise < TERRAIN_GEN.craterField.density * (1 - d * 0.5) ? 'crater' : null;
    }
    case 'mines': {
      // Open ground only: a hidden mine is drawn as plain ground, so on crops it would show.
      if (cur !== 'ground') return null;
      const d = Math.hypot(col + 0.5 - f.col, row + 0.5 - f.row) / f.r;
      return d < 1 && noise < TERRAIN_GEN.minefield.density ? 'mine' : null;
    }
    case 'lake': {
      if (!LAKE_CLAIMS.has(cur)) return null;
      const d = Math.hypot((col + 0.5 - f.col) / f.rx, (row + 0.5 - f.row) / f.ry) + (noise - 0.5) * 0.25;
      if (d >= 1) return null;
      return d < TERRAIN_GEN.lake.core ? 'thinIce' : 'ice';
    }
    case 'dune': {
      // Long ridges blown across the field, ragged along their crests.
      if (cur !== 'ground') return null;
      const d = Math.hypot((col + 0.5 - f.col) / f.rx, (row + 0.5 - f.row) / f.ry);
      return d < 1 && noise > d * d * 0.5 ? 'dune' : null;
    }
    case 'blast': {
      // Whatever stood here is gone: glass at the heart, craters around it.
      const d = Math.hypot((col + 0.5 - f.col) / f.rx, (row + 0.5 - f.row) / f.ry) + (noise - 0.5) * 0.2;
      if (d >= 1) return null;
      if (d < TERRAIN_GEN.blastSite.core) return 'glass';
      return noise < 0.55 ? 'crater' : 'ground';
    }
    case 'wrecks': {
      if (!SOFT.has(cur) && cur !== 'crater') return null;
      const d = Math.hypot(col + 0.5 - f.col, row + 0.5 - f.row) / f.r;
      return d < 1 && noise < TERRAIN_GEN.wreckField.density ? 'wreck' : null;
    }
    case 'oilfield': {
      // Derricks on a loose grid, three tiles apart: each goes up on its own (a blast falls just
      // short of the next), unlike a tank farm.
      const dc = col - f.col0;
      const dr = row - f.row0;
      if (dc < 0 || dr < 0 || dc >= f.cols || dr >= f.rows || cur !== 'ground') return null;
      return dc % 3 === 1 && dr % 3 === 1 && noise < 0.8 ? 'derrick' : null;
    }
    case 'drift': {
      if (cur !== 'ground') return null;
      const d = Math.hypot((col + 0.5 - f.col) / f.rx, (row + 0.5 - f.row) / f.ry);
      return d < 1 && noise > d * d * 0.7 ? 'snowdrift' : null;
    }
    case 'hedge': {
      if (!SOFT.has(cur)) return null;
      const on = f.across ? col === f.col && row >= f.row && row < f.row + f.len : row === f.row && col >= f.col && col < f.col + f.len;
      return on && noise >= TERRAIN_GEN.hedgerow.gap ? 'hedgerow' : null;
    }
    case 'farm': {
      const dc = col - f.col0;
      const dr = row - f.row0;
      if (dc < 0 || dr < 0 || dc >= f.cols || dr >= f.rows || !SOFT.has(cur)) return null;
      const edge = dc === 0 || dr === 0 || dc === f.cols - 1 || dr === f.rows - 1;
      return f.walled && edge && noise >= TERRAIN_GEN.farm.gap ? 'hedgerow' : 'farmland';
    }
    case 'factory': {
      // The hall, a road around it, and (walled) a compound wall with a gate front and back.
      const dc = col - f.col0;
      const dr = row - f.row0;
      const ring = f.walled ? 2 : 1;
      if (dc < -ring || dr < -ring || dc >= f.cols + ring || dr >= f.rows + ring) return null;
      if (dc >= 0 && dr >= 0 && dc < f.cols && dr < f.rows) return 'factory';
      const outer = dc === -2 || dr === -2 || dc === f.cols + 1 || dr === f.rows + 1;
      const gate = (dc === -2 || dc === f.cols + 1) && Math.abs(dr - (f.rows - 1) / 2) <= 1.5;
      return outer && !gate ? 'wall' : 'road';
    }
    case 'tanks': {
      const dc = col - f.col0;
      const dr = row - f.row0;
      if (dc < 0 || dr < 0 || dc >= 2 * f.cols - 1 || dr >= 2 * f.rows - 1) return null;
      return dc % 2 === 0 && dr % 2 === 0 ? 'fuelTank' : 'road';
    }
    case 'fort': {
      const g = TERRAIN_GEN.fortLine;
      if (col === f.col && f.embrasures && inRanges(f.embrasures, row)) return 'ground';
      if (col === f.col) return inRanges(f.gates, row) ? (cur === 'forest' || SOFT.has(cur) ? null : 'ground') : 'wall';
      if (col === f.col + g.bunkerBehind) return f.bunkers.includes(row) ? 'bunker' : null;
      if (col === f.col - g.trapsAhead || col === f.col - g.trapsAhead - 1) return (col + row) % 2 === 0 && !inRanges(f.trapGates, row) ? 'tankTrap' : null;
      return null;
    }
    case 'traps': {
      if (col !== f.col && col !== f.col + 1) return null;
      if (row < f.rows[0] || row >= f.rows[1]) return null;
      return (col + row) % 2 === 0 && !inRanges(f.gates, row) ? 'tankTrap' : null;
    }
  }
}

/**
 * A river crossing the whole field (SPEC §4.5), in tile units: shallows along both banks, a deep
 * channel between, fords (row ranges) that are shallow all the way across, and maybe a bridge.
 */
export interface River {
  /** Center column at the middle of the field. */
  col: number;
  amp: number;
  freq: number;
  phase: number;
  /** Columns the center shifts per row away from the middle of the field. */
  slant: number;
  /** Half the bank-to-bank width, and the width of the shallows along each bank. */
  half: number;
  bank: number;
  /** [first, end) rows of each ford. */
  fords: [number, number][];
  /** A bridge across it (rows it spans, and which kind), or null. */
  bridge: { rows: [number, number]; mat: MaterialId } | null;
  /** What it's made of (the biome's): the shallows and fords, and the channel. */
  shallows: MaterialId;
  channel: MaterialId;
}

/** Center column of a river at a (fractional) row. */
export function riverCenter(rv: River, row: number, rows: number): number {
  return rv.col + rv.amp * Math.sin(row * rv.freq + rv.phase) + rv.slant * (row - rows / 2);
}

/** Whether chunk `ci` rolled a river (before suppressing neighbors). */
function riverRoll(seed: number, ci: number, chance: number): boolean {
  return ci >= TERRAIN_GEN.riverFirstChunk && cellNoise(seed, ci, 0, 0x51fe) < chance;
}

/**
 * Whether chunk `ci` has a river: it rolled one and the chunk before doesn't have one. Worked out
 * forward from the first chunk that can have one, so a run of rolls alternates (river, none, river)
 * rather than suppressing itself.
 */
function hasRiver(seed: number, ci: number, rc: Resolved): boolean {
  const chance = Math.min(TERRAIN_GEN.riverMaxChance, mixOf(rc, 'rivers'));
  let prev = false;
  for (let c = TERRAIN_GEN.riverFirstChunk; c <= ci; c++) prev = !prev && riverRoll(seed, c, chance);
  return prev;
}

/**
 * The river whose center lies in chunk `ci`, or null. Drawn on its own random stream, so rivers
 * don't change the other features. Never in two neighboring chunks: a river spans at most about
 * 8 columns either side of its center, so rivers in chunks two apart never touch.
 */
export function chunkRiver(seed: number, ci: number, rows: number, recipe: TerrainRecipe = DEFAULT_RECIPE): River | null {
  return riverOf(seed, ci, rows, resolve(recipe));
}

function riverOf(seed: number, ci: number, rows: number, rc: Resolved): River | null {
  if (!hasRiver(seed, ci, rc)) return null;
  const g = TERRAIN_GEN;
  const rng = new Rng(hashSeed(seed, ci, 0x7177));
  const rv: River = {
    col: ci * CHUNK + rng.range(3, CHUNK - 3),
    amp: rng.range(g.riverMeander[0], g.riverMeander[1]),
    freq: rng.range(g.riverMeanderFreq[0], g.riverMeanderFreq[1]),
    phase: rng.range(0, Math.PI * 2),
    slant: rng.range(-g.riverSlant, g.riverSlant),
    half: rng.range(g.riverHalfWidth[0], g.riverHalfWidth[1]),
    bank: rng.range(g.riverBank[0], g.riverBank[1]),
    fords: [],
    bridge: null,
    shallows: rc.biome.river.shallows,
    channel: rc.biome.river.channel,
  };
  rv.fords = gates(rng, rng.int(g.fordsPerRiver[0], g.fordsPerRiver[1]), g.fordWidth, 0, rows);
  // The bridge, on a stream of its own, clear of the fords by a row.
  const brng = new Rng(hashSeed(seed, ci, 0xb81d));
  if (brng.chance(Math.min(1, mixOf(rc, 'bridges')))) {
    const w = g.bridgeWidth;
    for (let attempt = 0; attempt < 10 && !rv.bridge; attempt++) {
      const r0 = brng.int(1, rows - w - 1);
      if (rv.fords.some(([a, b]) => r0 < b + 1 && r0 + w > a - 1)) continue;
      rv.bridge = { rows: [r0, r0 + w], mat: brng.chance(g.lightBridgeShare) ? 'lightBridge' : 'bridge' };
    }
  }
  return rv;
}

/** A chunk's features and river, as seen from a column being painted. */
interface Neighbor {
  ci: number;
  features: Feature[];
  river: River | null;
}

/** Columns a feature can paint (inclusive, padded), so a column only looks at the ones that reach it. */
function colSpan(f: Feature): [number, number] {
  const g = TERRAIN_GEN;
  switch (f.kind) {
    case 'forest':
    case 'craters':
    case 'mines':
    case 'wrecks':
      return [f.col - f.r - 1, f.col + f.r + 1];
    case 'rock': {
      const r = f.r * 1.2 + 1;
      return [Math.min(f.ax, f.bx) - r, Math.max(f.ax, f.bx) + r];
    }
    case 'lake':
    case 'drift':
    case 'dune':
    case 'blast':
      return [f.col - f.rx * 1.3 - 1, f.col + f.rx * 1.3 + 1];
    case 'town':
    case 'farm':
    case 'oilfield':
      return [f.col0, f.col0 + f.cols];
    case 'factory':
      return [f.col0 - 2, f.col0 + f.cols + 2];
    case 'tanks':
      return [f.col0, f.col0 + 2 * f.cols];
    case 'hedge':
      return f.across ? [f.col, f.col] : [f.col, f.col + f.len];
    case 'fort':
      return [f.col - g.fortLine.trapsAhead - 1, f.col + g.fortLine.bunkerBehind];
    case 'traps':
      return [f.col, f.col + 1];
  }
}

/** The features of every neighbor that reach a column, by paint pass. */
type Reaching = Map<Feature['kind'], { ci: number; f: Feature }[]>;

function reaching(neighbors: Neighbor[], col: number): Reaching {
  const out: Reaching = new Map();
  for (const n of neighbors) {
    for (const f of n.features) {
      const [a, b] = colSpan(f);
      if (col < a || col > b) continue;
      let list = out.get(f.kind);
      if (!list) out.set(f.kind, (list = []));
      list.push({ ci: n.ci, f });
    }
  }
  return out;
}

/**
 * Chunks' features and rivers, cached: painting a chunk reads its neighbors', and the world asks for
 * rivers every step. Pure functions of (seed, recipe, chunk), so caching changes nothing.
 */
const chunkCache = new Map<string, Neighbor>();
const CHUNK_CACHE_SIZE = 96;

function neighborOf(seed: number, ci: number, rows: number, rc: Resolved): Neighbor {
  const fort = rc.fortress;
  const key = `${seed}|${rows}|${rc.biome.id}|${rc.approach?.id ?? ''}|${fort ? `${fort.col}/${fort.guns}/${fort.gates}` : ''}|${ci}`;
  let n = chunkCache.get(key);
  if (!n) {
    n = { ci, features: chunkFeatures(seed, ci, rows, rc), river: riverOf(seed, ci, rows, rc) };
    if (chunkCache.size >= CHUNK_CACHE_SIZE) chunkCache.delete(chunkCache.keys().next().value!);
    chunkCache.set(key, n);
  }
  return n;
}

/**
 * What a river does to a cell: shallows or deep water; 'approach' (open ground leading into a
 * ford or onto a bridge) or 'margin' (rock-free ground along the rest of the bank); or null outside
 * it. Materials are generic here ('shallows', 'water'); `paintColumn` maps them to the river's own.
 */
function riverPaint(seed: number, rv: River, col: number, row: number, rows: number): 'water' | 'shallows' | 'approach' | 'margin' | null {
  const d = Math.abs(col + 0.5 - riverCenter(rv, row + 0.5, rows));
  const ford = inRanges(rv.fords, row);
  const bridge = rv.bridge !== null && row >= rv.bridge.rows[0] && row < rv.bridge.rows[1];
  // Ragged banks; the channel's edge wobbles less, so it stays unbroken outside the fords.
  const n = cellNoise(seed, col, row, 0x5a1d) - 0.5;
  if (d >= rv.half + n * 0.6) return d < rv.half + TERRAIN_GEN.riverMargin ? (ford || bridge ? 'approach' : 'margin') : null;
  return !ford && d < rv.half - rv.bank + n * 0.3 ? 'water' : 'shallows';
}

/** Whether a river or its banks cover a cell (rock never goes there, including dead-end filling). */
function nearRiver(seed: number, neighbors: Neighbor[], col: number, row: number, rows: number): boolean {
  return neighbors.some((n) => n.river && riverPaint(seed, n.river, col, row, rows) !== null);
}

/** Passable (non-rock) runs of a column, as [start, end) row ranges. */
function openRuns(column: MaterialId[]): [number, number][] {
  const runs: [number, number][] = [];
  let r = 0;
  while (r < column.length) {
    if (column[r] === 'rock') {
      r++;
      continue;
    }
    const start = r;
    while (r < column.length && column[r] !== 'rock') r++;
    runs.push([start, r]);
  }
  return runs;
}

/**
 * Fills dead ends (SPEC §4.2: always a way forward). A passable run survives only if it opens onto
 * a gap at least `rockMinGap` tiles wide in the rock of the next few columns (merged, since a hull
 * spans several columns at once and can be squeezed between outcrops a few columns apart).
 * Otherwise a hull driving up it would be wedged against rock, so it becomes rock and the outcrop
 * reads as one face to slide around. Narrow gaps next to the field edge fill the same way.
 */
function fillDeadEnds(column: MaterialId[], ahead: MaterialId[][], lane: (row: number) => boolean): void {
  if (!column.includes('rock')) return;
  const merged = column.map((_, r) => (ahead.some((c) => c[r] === 'rock') ? 'rock' : 'ground'));
  const gaps = openRuns(merged);
  const need = TERRAIN_GEN.rockMinGap;
  for (const [a, b] of openRuns(column)) {
    if (gaps.some(([c, d]) => Math.min(b, d) - Math.max(a, c) >= need)) continue;
    for (let r = a; r < b; r++) if (!lane(r)) column[r] = 'rock';
  }
}

/**
 * Mountain pass cliffs (SPEC §3.1): how deep (tiles) the rock reaches in from one field edge at a
 * column, wandering between knots.
 */
function cliffDepth(seed: number, col: number, side: 0 | 1, range: readonly [number, number]): number {
  const k = TERRAIN_GEN.cliffKnotCols;
  const i = Math.floor(col / k);
  const t = col / k - i;
  const knot = (j: number) => range[0] + (range[1] - range[0]) * cellNoise(seed, j, side, 0xc11f);
  return knot(i) + (knot(i + 1) - knot(i)) * t;
}

/** Rows of the rail lines through a chunk (the same all along a stretch of chunks), if any. */
function railRows(seed: number, ci: number, rows: number, rc: Resolved): number[] {
  const g = TERRAIN_GEN;
  const rng = new Rng(hashSeed(seed, Math.floor(ci / g.railStretch), 0x4a11));
  if (!rng.chance(Math.min(1, mixOf(rc, 'rails')))) return [];
  const row = rng.int(3, rows - 6);
  return rng.int(g.railTracks[0], g.railTracks[1]) === 2 ? [row, row + 2] : [row];
}

/** Order features are painted in: later passes paint over earlier ones where they claim the cell. */
const PASSES = ['farm', 'forest', 'craters', 'hedge', 'town', 'factory', 'tanks', 'oilfield', 'drift', 'dune', 'lake', 'wrecks', 'blast', 'fort', 'traps', 'mines'] as const;

/** Structures an old battlefield leaves standing damaged or in rubble (`BiomeDef.ruins`). */
const RUINABLE: ReadonlySet<MaterialId> = new Set(['building', 'factory', 'wall', 'bunker']);

interface Painted {
  mats: MaterialId[];
  /** What a bridge tile is built over. */
  under: (MaterialId | undefined)[];
}

/** Raw material of every cell in a column, before dead ends are filled. */
function paintColumn(seed: number, col: number, rows: number, neighbors: Neighbor[], rc: Resolved): Painted {
  const out: Painted = { mats: [], under: [] };
  const rails = col >= TERRAIN_GEN.clearStartCols ? railRows(seed, Math.floor(col / CHUNK), rows, rc) : [];
  const cliffs = rc.approach?.cliffs;
  const reach = reaching(neighbors, col);
  const rivers = neighbors.filter((n) => n.river);
  for (let row = 0; row < rows; row++) {
    let mat: MaterialId = 'ground';
    let under: MaterialId | undefined;
    if (col >= TERRAIN_GEN.clearStartCols) {
      for (const pass of PASSES) {
        for (const { ci, f } of reach.get(pass) ?? []) {
          const paint = featurePaint(seed, ci, f, col, row, mat);
          if (paint) mat = paint;
        }
      }
      if (rails.includes(row)) mat = 'rail';
      // A main avenue runs through town along the lane (urban districts).
      const avenue = rc.approach?.avenue;
      if (avenue && mat === 'building' && Math.abs(row + 0.5 - laneCenter(seed, col + 0.5, rows, rc.approach?.laneAmplitude)) < avenue / 2) mat = 'road';
      // Rivers paint over everything; rock only claims open ground, and never the guaranteed lane
      // or a river and its banks.
      let rockOk = !inLane(seed, col, row, rows, rc);
      for (const n of rivers) {
        const rv = n.river;
        const paint = rv && riverPaint(seed, rv, col, row, rows);
        if (!paint) continue;
        rockOk = false;
        const onBridge = rv.bridge !== null && row >= rv.bridge.rows[0] && row < rv.bridge.rows[1];
        if (paint === 'approach') {
          // Open ground leads into a ford or onto a bridge, so tracked units can reach it.
          if (MATERIALS[mat].speed.tracked.intact === 0) mat = 'road';
          if (onBridge) mat = 'road';
        } else if (paint !== 'margin') {
          const water = paint === 'water' ? rv.channel : rv.shallows;
          if (onBridge) {
            mat = rv.bridge!.mat;
            under = water;
          } else {
            mat = water;
            under = undefined;
          }
        }
      }
      if (rockOk) {
        if (cliffs) {
          const n = cellNoise(seed, col, row, 0xc1a) * 0.8 - 0.4;
          const top = cliffDepth(seed, col, 0, cliffs) + n;
          const bottom = cliffDepth(seed, col, 1, cliffs) + n;
          if (row + 0.5 < top || rows - row - 0.5 < bottom) mat = 'rock';
        }
        for (const { ci, f } of reach.get('rock') ?? []) {
          const paint = featurePaint(seed, ci, f, col, row, mat);
          if (paint) mat = paint;
        }
      }
    }
    out.mats.push(mat);
    out.under.push(under);
  }
  return out;
}

/**
 * One chunk of the battlefield. Features spill at most one chunk, so chunk `ci` is painted from
 * the features of its neighbors. Dead-end filling looks one chunk further ahead and works back
 * from there (each column depends on the filled column after it); the lookahead is cut off at a
 * chunk, which only matters for a chain of dead ends longer than that.
 */
export function generateChunk(seed: number, ci: number, rows: number, recipe: TerrainRecipe = DEFAULT_RECIPE): Tile[][] {
  const rc = resolve(recipe);
  const neighbors = [ci - 1, ci, ci + 1, ci + 2].map((c) => neighborOf(seed, c, rows, rc));
  const first = ci * CHUNK;
  const k = TERRAIN_GEN.rockLookahead;
  // Filled columns after the one being processed, nearest first.
  const ahead: MaterialId[][] = [];
  for (let col = first + 2 * CHUNK + k - 1; col >= first + 2 * CHUNK; col--) ahead.unshift(paintColumn(seed, col, rows, neighbors, rc).mats);
  const cols: Painted[] = [];
  for (let col = first + 2 * CHUNK - 1; col >= first; col--) {
    const painted = paintColumn(seed, col, rows, neighbors, rc);
    fillDeadEnds(painted.mats, ahead, (row) => inLane(seed, col, row, rows, rc) || nearRiver(seed, neighbors, col, row, rows));
    if (col < first + CHUNK) cols[col - first] = painted;
    ahead.unshift(painted.mats);
    ahead.length = k;
  }
  return cols.map((p, i) =>
    p.mats.map((mat, row) => {
      const t: Tile = { mat, state: 'intact', hp: MATERIALS[mat].maxHp, variant: hashSeed(seed, first + i, row) & 3 };
      const under = p.under[row];
      if (under) t.under = under;
      const ruins = rc.biome.ruins;
      if (ruins && RUINABLE.has(mat)) {
        const n = cellNoise(seed, first + i, row, 0x7a1d);
        if (n < ruins.destroyed) Object.assign(t, { state: 'destroyed', hp: 0 });
        else if (n < ruins.destroyed + ruins.damaged) Object.assign(t, { state: 'damaged', hp: MATERIALS[mat].maxHp * MATERIALS[mat].damagedAt });
      }
      return t;
    }),
  );
}

/** What a footprint has under it (SPEC §4.5 water, §4.6 drifts and ice): see `Terrain.groundAt`. */
export interface Underfoot {
  /** Area share under each kind of speed cap. */
  cruise: number;
  min: number;
  /** Area-weighted tread wear per 100 units driven. */
  wear: number;
  /** Area-weighted traction (1 = full). */
  grip: number;
  /** The HUD's speed tag for what it's in (FORD, WADE, DRIFT, ICE), or null on firm ground. */
  label: string | null;
}

/** Below this traction the HUD tags the speed ICE. */
const SLIPPERY = 0.75;

export class Terrain {
  readonly tileSize = TS;
  readonly height: number;
  private readonly rc: Resolved;
  private readonly chunks = new Map<number, Tile[][]>();
  private readonly rivers = new Map<number, River | null>();
  /** Salvage from razed tiles not yet banked by the world (`takeSalvage`). */
  private salvage = 0;
  /** Explosive tiles set off and not yet handed to the world (`takeBlasts`). */
  private blasts: TerrainBlast[] = [];
  /** Tiles that turned into another material (a bridge into water) since the last `takeBroken`. */
  private broken: [number, number][] = [];
  /** Where and how far the last `reveal` swept. */
  private swept = '';

  constructor(
    readonly seed: number,
    readonly rows: number,
    readonly recipe: TerrainRecipe = DEFAULT_RECIPE,
  ) {
    this.height = rows * TS;
    this.rc = resolve(recipe);
  }

  /** Make sure every column overlapping world x in [x0, x1] exists. */
  ensure(x0: number, x1: number): void {
    const c0 = Math.floor(Math.floor(x0 / TS) / CHUNK);
    const c1 = Math.floor(Math.floor(x1 / TS) / CHUNK);
    for (let ci = c0; ci <= c1; ci++) {
      if (!this.chunks.has(ci)) this.chunks.set(ci, generateChunk(this.seed, ci, this.rows, this.recipe));
    }
  }

  /** Drop chunks lying entirely left of world x. */
  prune(x: number): void {
    const keepFrom = Math.floor(Math.floor(x / TS) / CHUNK);
    for (const ci of this.chunks.keys()) if (ci < keepFrom) this.chunks.delete(ci);
    for (const ci of this.rivers.keys()) if (ci < keepFrom - 1) this.rivers.delete(ci);
  }

  /** Rivers that may cover any column in world x [x0, x1]. */
  riversNear(x0: number, x1: number): River[] {
    const out: River[] = [];
    const c0 = Math.floor(Math.floor(x0 / TS) / CHUNK) - 1;
    const c1 = Math.floor(Math.floor(x1 / TS) / CHUNK) + 1;
    for (let ci = c0; ci <= c1; ci++) {
      if (!this.rivers.has(ci)) this.rivers.set(ci, neighborOf(this.seed, ci, this.rows, this.rc).river);
      const rv = this.rivers.get(ci);
      if (rv) out.push(rv);
    }
    return out;
  }

  /**
   * Where tracked units can get across a river right now, as [first, end) rows: its fords, and its
   * bridge while it stands.
   */
  crossings(rv: River): [number, number][] {
    const out = [...rv.fords];
    if (rv.bridge) {
      const [a, b] = rv.bridge.rows;
      const mid = Math.floor((a + b) / 2);
      const t = this.tile(Math.floor(riverCenter(rv, mid + 0.5, this.rows)), mid);
      if (t?.mat === rv.bridge.mat) out.push(rv.bridge.rows);
    }
    return out;
  }

  /**
   * What a footprint is driving through (SPEC §4.5 water, §4.6 drifts and ice): the area share
   * under each kind of speed cap, the tread wear, the traction, and the HUD's tag.
   */
  groundAt(fp: Rect): Underfoot {
    const out: Underfoot = { cruise: 0, min: 0, wear: 0, grip: 1, label: null };
    const area = (fp.x1 - fp.x0) * (fp.y1 - fp.y0);
    if (area <= 0) return out;
    let tag: { label: string; share: number; deep: boolean } | null = null;
    let slip: { label: string; share: number } | null = null;
    for (let c = Math.floor(fp.x0 / TS); c * TS < fp.x1; c++) {
      for (let r = Math.max(0, Math.floor(fp.y0 / TS)); r < this.rows && r * TS < fp.y1; r++) {
        const t = this.tile(c, r);
        if (!t) continue;
        const def = MATERIALS[t.mat];
        if (!def.wading && def.grip === undefined) continue;
        const ox = Math.min(fp.x1, (c + 1) * TS) - Math.max(fp.x0, c * TS);
        const oy = Math.min(fp.y1, (r + 1) * TS) - Math.max(fp.y0, r * TS);
        const share = (ox * oy) / area;
        if (def.grip !== undefined) {
          out.grip -= share * (1 - def.grip);
          if (def.slipTag && (!slip || share > slip.share)) slip = { label: def.slipTag, share };
        }
        const wade = def.wading;
        if (!wade) continue;
        out[wade.cap] += share;
        out.wear += share * wade.wear;
        // Deep water names the tag over anything shallow; otherwise the biggest share does.
        const deep = wade.cap === 'min';
        if (!tag || (deep && !tag.deep) || (deep === tag.deep && share > tag.share)) tag = { label: wade.label, share, deep };
      }
    }
    if (out.min > 0.05 || out.cruise > 0.05) out.label = tag?.label ?? null;
    else if (out.grip < SLIPPERY) out.label = slip?.label ?? null;
    return out;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  tile(col: number, row: number): Tile | undefined {
    if (row < 0 || row >= this.rows) return undefined;
    const ci = Math.floor(col / CHUNK);
    return this.chunks.get(ci)?.[col - ci * CHUNK]?.[row];
  }

  tileAt(x: number, y: number): Tile | undefined {
    return this.tile(Math.floor(x / TS), Math.floor(y / TS));
  }

  /** The Breach fortress as generated (wall column, gates, gun positions); null if there's none. */
  fortress(): FortressPlan | null {
    const spec = this.rc.fortress;
    if (!spec) return null;
    const f = neighborOf(this.seed, Math.floor(spec.col / CHUNK), this.rows, this.rc).features.find((x) => x.kind === 'fort' && x.embrasures);
    return f && f.kind === 'fort' ? { col: f.col, gates: f.gates, embrasures: f.embrasures ?? [] } : null;
  }

  /** World y of the guaranteed lane's center at world x (SPEC §4.2): rock-free, the way forward. */
  laneY(x: number): number {
    return laneCenter(this.seed, x / TS, this.rows, this.rc.approach?.laneAmplitude) * TS;
  }

  /**
   * A mine dropped on open ground (a convoy's mine layer, SPEC §4.4 Chase): laid in plain sight,
   * so it's drawn swept. Only on bare ground; returns whether one was laid.
   */
  layMine(col: number, row: number, events: SimEvent[]): boolean {
    const t = this.tile(col, row);
    if (!t || t.mat !== 'ground' || t.state !== 'intact') return false;
    this.turnInto(col, row, t, 'mine', 'intact', events);
    t.seen = true;
    return true;
  }

  obstacleAt(col: number, row: number): ObstacleClass {
    const t = this.tile(col, row);
    return t ? MATERIALS[t.mat].obstacle[t.state] : 'none';
  }

  blocksShotAt(x: number, y: number): boolean {
    const t = this.tileAt(x, y);
    return t ? MATERIALS[t.mat].blocksShots[t.state] : false;
  }

  /** Movement speed multiplier at a point for a mobility type (0 = impassable). */
  speedAt(x: number, y: number, mobility: UnitMobility): number {
    const t = this.tileAt(x, y);
    if (!t) return 1;
    if (mobility === 'hover') return hoverable(t.mat) ? 1 : MATERIALS[t.mat].speed.tracked[t.state];
    return MATERIALS[t.mat].speed[mobility][t.state];
  }

  /** Whether a tile gives infantry cover. */
  isCover(col: number, row: number): boolean {
    const t = this.tile(col, row);
    return t ? MATERIALS[t.mat].cover[t.state] : false;
  }

  /** Share of damage a unit on foot avoids at a point (SPEC §4.5 cover; 0 = none). */
  protectionAt(x: number, y: number): number {
    const t = this.tileAt(x, y);
    return t ? MATERIALS[t.mat].protection[t.state] : 0;
  }

  /** Protection of a tile (see `protectionAt`). */
  protection(col: number, row: number): number {
    const t = this.tile(col, row);
    return t ? MATERIALS[t.mat].protection[t.state] : 0;
  }

  /** Whether a tile stops direct fire. */
  blocksShot(col: number, row: number): boolean {
    const t = this.tile(col, row);
    return t ? MATERIALS[t.mat].blocksShots[t.state] : false;
  }

  /** Whether units that can hide are concealed at a point (forest). */
  concealsAt(x: number, y: number): boolean {
    const t = this.tileAt(x, y);
    return t ? MATERIALS[t.mat].conceals[t.state] : false;
  }

  /**
   * True if a straight shot from (x0,y0) to (x1,y1) would hit something that blocks fire. The
   * shooter's own tile never does: a garrison fires out of the building it's in.
   */
  lineBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(len / (TS / 2));
    const c0 = Math.floor(x0 / TS);
    const r0 = Math.floor(y0 / TS);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (Math.floor(x / TS) === c0 && Math.floor(y / TS) === r0) continue;
      if (this.blocksShotAt(x, y)) return true;
    }
    return false;
  }

  /**
   * Salvage earned by knocking tiles down since the last call (SPEC §8.1: buildings pay a little).
   * The world banks it every step.
   */
  takeSalvage(): number {
    const s = this.salvage;
    this.salvage = 0;
    return s;
  }

  /** Explosive tiles set off since the last call (SPEC §4.6); the world sets them off after their fuse. */
  takeBlasts(): TerrainBlast[] {
    const b = this.blasts;
    this.blasts = [];
    return b;
  }

  /** Tiles that turned into another material since the last call (the world drowns what's on them). */
  takeBroken(): [number, number][] {
    const b = this.broken;
    this.broken = [];
    return b;
  }

  /**
   * Weapons damage. Moves the tile through intact → damaged → destroyed. `credit` = knocking it
   * down pays salvage (false for enemy fire). Open ground hit hard enough is left a crater.
   */
  damage(col: number, row: number, amount: number, events: SimEvent[], credit = true): void {
    const t = this.tile(col, row);
    if (!t) return;
    const def = MATERIALS[t.mat];
    if (def.maxHp <= 0) {
      if (def.scars !== undefined && amount >= def.scars) this.turnInto(col, row, t, 'crater', 'destroyed', events);
      return;
    }
    if (t.state === 'destroyed' || t.state === 'flattened') return;
    t.hp = Math.max(0, t.hp - amount);
    const next: TileState = t.hp <= 0 ? 'destroyed' : t.hp <= def.maxHp * def.damagedAt ? 'damaged' : 'intact';
    if (next === t.state) return;
    if (next === 'destroyed') {
      // A bridge comes down as a whole.
      if (def.bearing?.give === 'span') this.collapse(col, row, events);
      else this.knockDown(col, row, t, 'destroyed', events, credit);
    } else {
      t.state = next;
      events.push({ type: 'tileChanged', col, row, state: next, mat: t.mat });
    }
  }

  /**
   * The Behemoth drove over this tile. Returns the obstacle class it hit (before flattening).
   * Immovable tiles can't be crushed (collision deflects off them instead): they report 'none'.
   */
  crush(col: number, row: number, events: SimEvent[]): ObstacleClass {
    const t = this.tile(col, row);
    if (!t) return 'none';
    const cls = MATERIALS[t.mat].obstacle[t.state];
    if (cls === 'none' || cls === 'immovable') return 'none';
    this.knockDown(col, row, t, 'flattened', events, true);
    return cls;
  }

  /** Grinds an immovable tile down to rubble (the deflection failsafe when boxed in both ways). */
  crumble(col: number, row: number, events: SimEvent[]): void {
    const t = this.tile(col, row);
    if (!t || this.obstacleAt(col, row) !== 'immovable') return;
    t.state = 'destroyed';
    events.push({ type: 'tileChanged', col, row, state: 'destroyed', mat: t.mat });
  }

  /**
   * The Behemoth's weight on the tiles under its ground box (SPEC §4.5 bridge limits, §4.6 thin
   * ice). Over a bridge's limit, the whole span comes down; over thin ice's, the ice cracks, faster
   * the heavier it is, until it gives way. Returns how many spans collapsed.
   */
  bear(fp: Rect, mass: number, dt: number, events: SimEvent[]): number {
    let spans = 0;
    for (let c = Math.floor(fp.x0 / TS); c * TS < fp.x1; c++) {
      for (let r = Math.max(0, Math.floor(fp.y0 / TS)); r < this.rows && r * TS < fp.y1; r++) {
        const t = this.tile(c, r);
        const bearing = t && MATERIALS[t.mat].bearing;
        if (!t || !bearing || mass <= bearing.limit || (t.state !== 'intact' && t.state !== 'damaged')) continue;
        if (bearing.give === 'span') {
          this.collapse(c, r, events);
          spans++;
        } else {
          this.damage(c, r, BEARING.crackRate * (mass / bearing.limit - 1) * dt, events, false);
        }
      }
    }
    return spans;
  }

  /**
   * Sweeps hidden tiles (mines) within `radius` of a point: they're drawn from now on. Only sweeps
   * again once the point moves into another tile or the radius changes (chunks are generated well
   * beyond any sensor reach, so nothing new turns up in between).
   */
  reveal(x: number, y: number, radius: number): void {
    const key = `${Math.floor(x / TS)},${Math.floor(y / TS)},${radius}`;
    if (key === this.swept) return;
    this.swept = key;
    const r2 = radius * radius;
    for (let c = Math.floor((x - radius) / TS); c <= Math.floor((x + radius) / TS); c++) {
      for (let r = Math.max(0, Math.floor((y - radius) / TS)); r <= Math.min(this.rows - 1, Math.floor((y + radius) / TS)); r++) {
        const t = this.tile(c, r);
        if (!t || t.seen || !MATERIALS[t.mat].hidden) continue;
        const dx = (c + 0.5) * TS - x;
        const dy = (r + 0.5) * TS - y;
        if (dx * dx + dy * dy <= r2) t.seen = true;
      }
    }
  }

  /** Brings a bridge down: every standing tile of the span connected to (col, row). */
  private collapse(col: number, row: number, events: SimEvent[]): void {
    const start = this.tile(col, row);
    if (!start) return;
    const mat = start.mat;
    const standingAt = (c: number, r: number) => {
      const t = this.tile(c, r);
      return t && t.mat === mat && (t.state === 'intact' || t.state === 'damaged') ? t : null;
    };
    const queue: [number, number][] = [[col, row]];
    const seen = new Set<string>();
    let sx = 0;
    let sy = 0;
    let n = 0;
    while (queue.length) {
      const [c, r] = queue.pop()!;
      const key = `${c},${r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = standingAt(c, r);
      if (!t) continue;
      this.knockDown(c, r, t, 'destroyed', events, false);
      sx += c;
      sy += r;
      n++;
      queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    if (n > 0) events.push({ type: 'bridgeCollapse', x: (sx / n + 0.5) * TS, y: (sy / n + 0.5) * TS, tiles: n });
  }

  /**
   * A tile knocked down (destroyed or crushed): pays out (`credit`), goes up if it's explosive, and
   * turns into what it breaks to, if anything.
   */
  private knockDown(col: number, row: number, t: Tile, state: 'destroyed' | 'flattened', events: SimEvent[], credit: boolean): void {
    const def = MATERIALS[t.mat];
    if (credit) this.razed(t, t.state);
    if (def.explodes) this.blasts.push({ x: (col + 0.5) * TS, y: (row + 0.5) * TS, ...def.explodes });
    const next = def.breaksTo === 'under' ? t.under : def.breaksTo;
    if (next) {
      this.turnInto(col, row, t, next, state, events);
      return;
    }
    t.state = state;
    t.hp = 0;
    events.push({ type: 'tileChanged', col, row, state, mat: t.mat });
  }

  /** Replaces a tile with another material, fresh; the event names the one that was there. */
  private turnInto(col: number, row: number, t: Tile, mat: MaterialId, state: TileState, events: SimEvent[]): void {
    const was = t.mat;
    t.mat = mat;
    t.state = 'intact';
    t.hp = MATERIALS[mat].maxHp;
    delete t.under;
    delete t.seen;
    this.broken.push([col, row]);
    events.push({ type: 'tileChanged', col, row, state, mat: was });
  }

  /** Pays out a tile's salvage when it's knocked down from standing. */
  private razed(t: Tile, from: TileState): void {
    if (from === 'intact' || from === 'damaged') this.salvage += MATERIALS[t.mat].salvage ?? 0;
  }
}
