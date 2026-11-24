import { describe, expect, it } from 'vitest';
import { APPROACHES, type ApproachId } from '../../src/content/approaches';
import { BIOMES, type BiomeId } from '../../src/content/biomes';
import { isLine, isWet, MATERIALS } from '../../src/content/terrain';
import { TERRAIN_GEN } from '../../src/content/tuning';
import type { SimEvent } from '../../src/sim/events';
import { generateChunk, riverCenter, Terrain, type TerrainRecipe } from '../../src/sim/terrain';

const TS = TERRAIN_GEN.tileSize;
const G = TERRAIN_GEN.railLine;
const ROWS = 21;
/** An Intercept battle's length in columns (7000 units and a little over), and a shorter stretch for the wide sweep. */
const FULL = 448;
const SHORT = 176;

const BIOME_LIST = Object.keys(BIOMES) as BiomeId[];
const APPROACH_LIST: (ApproachId | null)[] = [null, ...(Object.keys(APPROACHES) as ApproachId[])];

interface Field {
  t: Terrain;
  cols: number;
  name: string;
}

function terrain(seed: number, biome: BiomeId, approach: ApproachId | null, cols = FULL, rows = ROWS): Terrain {
  // Rivers forced where an Intercept puts them (35% and 70% of the way), scaled to the stretch.
  const chunks = cols / TERRAIN_GEN.chunkCols;
  const t = new Terrain(seed, rows, { biome, approach, line: { rivers: [Math.floor(chunks * 0.35), Math.floor(chunks * 0.7)] } });
  t.ensure(0, cols * TS - 1);
  return t;
}

/** Every recipe once over a short stretch, and each biome over a whole battle; built once for all the tests. */
let built: Field[] | null = null;
function fields(): Field[] {
  if (built) return built;
  built = [];
  for (const biome of BIOME_LIST) for (const approach of APPROACH_LIST) built.push({ t: terrain(3, biome, approach, SHORT), cols: SHORT, name: `3 ${biome} ${approach}` });
  for (const [i, biome] of BIOME_LIST.entries()) {
    const approach = APPROACH_LIST[(i + 1) % APPROACH_LIST.length]!;
    built.push({ t: terrain(10 + i, biome, approach), cols: FULL, name: `${10 + i} ${biome} ${approach}` });
  }
  return built;
}

describe('an armored train\'s rail line (SPEC §4.4 Intercept)', () => {
  it('runs unbroken from the first column to the last, a row at a time, clear of the field edges', () => {
    for (const { t, cols: COLS, name } of fields()) {
      let prev = t.lineRow(0)!;
      for (let col = 0; col < COLS; col++) {
        const row = t.lineRow(col)!;
        const where = `${name} col ${col}`;
        expect(isLine(t.tile(col, row)!.mat), where).toBe(true);
        expect(Math.abs(row - prev), where).toBeLessThanOrEqual(1);
        expect(row, where).toBeGreaterThanOrEqual(G.edge);
        expect(row, where).toBeLessThanOrEqual(ROWS - 1 - G.edge);
        prev = row;
      }
    }
  });

  it('keeps a railbed either side clear of obstacles, and rock farther off', () => {
    for (const { t, cols: COLS, name } of fields()) {
      for (let col = 0; col < COLS; col++) {
        const row = t.lineRow(col)!;
        for (const d of [-2, -1, 1, 2]) {
          const tile = t.tile(col, row + d)!;
          const where = `${name} col ${col} row ${row + d}: ${tile.mat}`;
          expect(tile.mat, where).not.toBe('rock');
          if (Math.abs(d) === 1 && !isLine(tile.mat)) expect(['none', 'soft', 'trivial'], where).toContain(MATERIALS[tile.mat].obstacle[tile.state]);
        }
      }
    }
  });

  it('crosses every river on a rail bridge, and at least one river', () => {
    for (const { t, cols: COLS, name } of fields()) {
      let bridged = 0;
      for (let col = 0; col < COLS; col++) {
        const row = t.lineRow(col)!;
        const where = `${name} col ${col}`;
        for (const d of [-1, 0, 1]) expect(isWet(t.tile(col, row + d)!.mat), where).toBe(false);
        if (t.tile(col, row)!.mat !== 'railBridge') continue;
        bridged++;
        expect(t.tile(col, row)!.links, where).toBeTruthy();
      }
      expect(bridged, name).toBeGreaterThan(0);
      // Over the middle of every river's channel, the line is on its bridge.
      for (const rv of t.riversNear(0, (COLS - 16) * TS)) {
        const row = t.lineRow(Math.floor(rv.col))!;
        const mid = Math.floor(riverCenter(rv, row + 0.5, ROWS));
        if (mid < 0 || mid >= COLS) continue;
        // The span is three rows wide there, the rails down the middle.
        for (const d of [-1, 0, 1]) expect(t.tile(mid, t.lineRow(mid)! + d)!.mat, `${name} river at ${mid}`).toBe('railBridge');
      }
    }
  });

  it('leaves the lane on its wide side, and a ford there at every river', () => {
    for (const { t, cols: COLS, name } of fields()) {
      const wide = -t.lineSide;
      for (let col = 0; col < COLS; col++) {
        const gap = (t.laneY((col + 0.5) * TS) / TS - (t.lineRow(col)! + 0.5)) * wide;
        expect(gap, `${name} col ${col}`).toBeGreaterThanOrEqual(G.laneGap - 0.5);
      }
      for (const rv of t.riversNear(0, COLS * TS)) {
        const span = rv.bridge!;
        expect(span.mat).toBe('railBridge');
        expect(rv.fords.some(([a, b]) => (wide > 0 ? a > span.rows[1] : b < span.rows[0])), `${name} river at ${rv.col}`).toBe(true);
        for (const [a, b] of rv.fords) expect(b <= span.rows[0] - 1 || a >= span.rows[1] + 1).toBe(true);
      }
    }
  });

  it('gives what runs on it a smooth path along the track', () => {
    const t = terrain(11, 'temperate', 'river', SHORT);
    for (let x = 8; x < SHORT * TS - 8; x += 1) {
      expect(Math.abs(t.lineY(x + 1) - t.lineY(x))).toBeLessThanOrEqual(1 / G.smooth + 1e-9);
      const row = t.lineRow(Math.floor(x / TS))!;
      // Never more than a tile from the track it's drawn on.
      expect(Math.abs(t.lineY(x) - (row + 0.5) * TS)).toBeLessThan(TS);
    }
  });

  it('starts at a station: a platform either side, a building behind it on the narrow side', () => {
    const t = terrain(3, 'temperate', null, SHORT);
    const st = G.station;
    const row = t.lineRow(st.col + 3)!;
    expect(t.tile(st.col + 3, row - 1)!.mat).toBe('road');
    expect(t.tile(st.col + 3, row + 1)!.mat).toBe('road');
    expect(t.tile(st.col + 3, row + 2 * t.lineSide)!.mat).toBe('building');
    expect(t.tile(st.col + 3, row - 2 * t.lineSide)!.mat).not.toBe('building');
  });

  it('leaves every other battle\'s terrain as it was', () => {
    const plain: TerrainRecipe = { biome: 'temperate', approach: null };
    const a = generateChunk(7, 3, ROWS, plain);
    expect(a.flat().some((tile) => isLine(tile.mat))).toBe(false);
    const fit = new Terrain(7, 18, { ...plain, line: { rivers: [3] } });
    fit.ensure(0, 100 * TS);
    for (let col = 0; col < 100; col++) expect(isLine(fit.tile(col, fit.lineRow(col)!)!.mat)).toBe(true);
    expect(new Terrain(7, ROWS, plain).hasLine).toBe(false);
  });
});

describe('hardened track (SPEC §7.3)', () => {
  const at = (t: Terrain, col: number) => [col, t.lineRow(col)!] as const;

  it('is open ground the treads don\'t tear', () => {
    const t = terrain(3, 'temperate', null, SHORT);
    const events: SimEvent[] = [];
    const [col, row] = at(t, 40);
    expect(t.tile(col, row)!.mat).toBe('track');
    expect(t.crush(col, row, events)).toBe('none');
    expect(t.tile(col, row)!.mat).toBe('track');
    expect(t.speedAt((col + 0.5) * TS, (row + 0.5) * TS, 'tracked')).toBe(1);
  });

  it('breaks only to a blast hard enough to crater open ground', () => {
    const t = terrain(3, 'temperate', null, SHORT);
    const events: SimEvent[] = [];
    const [col, row] = at(t, 40);
    t.damage(col, row, 90, events);
    expect(t.lineCut(col)).toBe(false);
    t.damage(col, row, 120, events);
    expect(t.tile(col, row)!.mat).toBe('crater');
    expect(t.lineCut(col)).toBe(true);
    expect(t.lineCut(col + 1)).toBe(false);
  });

  it('never breaks to enemy fire, or under the train', () => {
    const t = terrain(3, 'temperate', null, SHORT);
    const events: SimEvent[] = [];
    const [col, row] = at(t, 40);
    t.damage(col, row, 500, events, false);
    expect(t.lineCut(col)).toBe(false);
    t.shield = (c) => c === col;
    t.damage(col, row, 500, events);
    expect(t.lineCut(col)).toBe(false);
    t.shield = null;
    t.damage(col, row, 500, events);
    expect(t.lineCut(col)).toBe(true);
  });

  it('falls as a whole span when its bridge is shot out, unless the train is on any of it', () => {
    const t = terrain(3, 'temperate', null, SHORT);
    const events: SimEvent[] = [];
    let col = 0;
    while (t.tile(col, t.lineRow(col)!)!.mat !== 'railBridge') col++;
    const row = t.lineRow(col)!;
    let end = col;
    while (t.tile(end + 1, row)!.mat === 'railBridge') end++;
    expect(MATERIALS.railBridge.bearing!.limit).toBe(Infinity);
    expect(t.bear({ x0: col * TS, y0: (row - 1) * TS, x1: (end + 1) * TS, y1: (row + 2) * TS }, 5000, 1, events)).toBe(0);
    // The train on the far end of the span shields all of it.
    t.shield = (c) => c === end;
    t.damage(col, row, 1000, events);
    expect(t.tile(col, row)!.mat).toBe('railBridge');
    t.shield = null;
    t.damage(col, row + 1, 1000, events);
    for (let c = col; c <= end; c++) {
      expect(t.tile(c, row)!.mat).not.toBe('railBridge');
      expect(t.lineCut(c)).toBe(true);
    }
    expect(events.some((e) => e.type === 'bridgeCollapse')).toBe(true);
  });
});
