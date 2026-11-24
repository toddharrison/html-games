import { describe, expect, it } from 'vitest';
import { APPROACHES, type ApproachId } from '../../src/content/approaches';
import { BIOMES, type BiomeId } from '../../src/content/biomes';
import { isLine, isWet, MATERIALS } from '../../src/content/terrain';
import { TERRAIN_GEN } from '../../src/content/tuning';
import type { SimEvent } from '../../src/sim/events';
import { BEND, generateChunk, riverCenter, Terrain, type TerrainRecipe } from '../../src/sim/terrain';
import { railLine } from '../../src/sim/world';

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

  it('is a double track: a second track on the narrow side, gravel between the two', () => {
    for (const { t, cols: COLS, name } of fields()) {
      let gravel = 0;
      for (let col = 0; col < COLS; col++) {
        const row = t.lineRow(col)!;
        const where = `${name} col ${col}`;
        const own = t.tile(col, row)!;
        const second = t.tile(col, row + G.twin * t.lineSide)!;
        // Both carry rails, on the ground and on a bridge (a river's bank isn't square to the line,
        // so one track can be on the span a column before the other).
        for (const tile of [own, second]) {
          expect(['track', 'railBridge'], `${where}: ${tile.mat}`).toContain(tile.mat);
          if (tile.mat === 'railBridge') expect(tile.links, where).toBeTruthy();
        }
        for (let k = 1; k < G.twin; k++) {
          const between = t.tile(col, row + k * t.lineSide)!;
          expect(isLine(between.mat), `${where}: ${between.mat}`).toBe(true);
          if (between.mat === 'ballast') gravel++;
          // Gravel, or the bridge's deck: no rails.
          if (between.mat === 'railBridge') expect(between.links, where).toBeFalsy();
        }
      }
      expect(gravel, name).toBeGreaterThan(COLS / 2);
    }
  });

  it('keeps a railbed either side of the line clear of obstacles, and rock farther off', () => {
    for (const { t, cols: COLS, name } of fields()) {
      for (let col = 0; col < COLS; col++) {
        const row = t.lineRow(col)!;
        // Depth from the train's track toward the narrow side: the line is 0..twin.
        for (const depth of [-2, -1, G.twin + 1, G.twin + 2]) {
          const tile = t.tile(col, row + depth * t.lineSide);
          if (!tile) continue;
          const where = `${name} col ${col} row ${row + depth * t.lineSide}: ${tile.mat}`;
          expect(tile.mat, where).not.toBe('rock');
          if ((depth === -1 || depth === G.twin + 1) && !isLine(tile.mat)) expect(['none', 'soft', 'trivial'], where).toContain(MATERIALS[tile.mat].obstacle[tile.state]);
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
        for (let k = 0; k <= G.twin; k++) expect(isWet(t.tile(col, row + k * t.lineSide)!.mat), where).toBe(false);
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
        // The span is as wide as the line there, a track down each edge.
        for (let k = 0; k <= G.twin; k++) expect(t.tile(mid, t.lineRow(mid)! + k * t.lineSide)!.mat, `${name} river at ${mid}`).toBe('railBridge');
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

  it('clears a service road down the lane: no obstacle and no deep water the whole way, a road along its middle', () => {
    for (const { t, cols: COLS, name } of fields()) {
      let road = 0;
      for (let col = 0; col < COLS; col++) {
        const lane = t.laneY((col + 0.5) * TS) / TS;
        for (let row = Math.ceil(lane - G.serviceRoad / 2 - 0.5 + 1e-9); row + 0.5 < lane + G.serviceRoad / 2; row++) {
          const tile = t.tile(col, row);
          if (!tile) continue;
          const where = `${name} col ${col} row ${row}: ${tile.mat}`;
          expect(['none', 'soft', 'trivial'], where).toContain(MATERIALS[tile.mat].obstacle[tile.state]);
          expect(tile.mat, where).not.toBe('water');
          if (tile.mat === 'road') road++;
        }
      }
      // Most of the way it's a road you can see (fords, ice, and the like break it).
      expect(road, name).toBeGreaterThan(COLS / 2);
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
    const far = row + G.twin * t.lineSide;
    expect(t.tile(st.col + 3, row - t.lineSide)!.mat).toBe('road');
    expect(t.tile(st.col + 3, far + t.lineSide)!.mat).toBe('road');
    expect(t.tile(st.col + 3, far + 2 * t.lineSide)!.mat).toBe('building');
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

  it('is cut only on the train\'s own track: the gravel and the second track can be cratered', () => {
    const t = terrain(3, 'temperate', null, SHORT);
    const events: SimEvent[] = [];
    const [col, row] = at(t, 40);
    for (let k = 1; k <= G.twin; k++) {
      t.damage(col, row + k * t.lineSide, 500, events);
      expect(t.tile(col, row + k * t.lineSide)!.mat).toBe('crater');
    }
    expect(t.lineCut(col)).toBe(false);
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
    const far = row + G.twin * t.lineSide;
    expect(t.bear({ x0: col * TS, y0: Math.min(row, far) * TS, x1: (end + 1) * TS, y1: (Math.max(row, far) + 1) * TS }, 5000, 1, events)).toBe(0);
    // The train on the far end of the span shields all of it.
    t.shield = (c) => c === end;
    t.damage(col, row, 1000, events);
    expect(t.tile(col, row)!.mat).toBe('railBridge');
    t.shield = null;
    // Shot out on its second track: the whole span goes, the train's track with it.
    t.damage(col, far, 1000, events);
    for (let c = col; c <= end; c++) {
      expect(t.tile(c, row)!.mat).not.toBe('railBridge');
      expect(t.lineCut(c)).toBe(true);
    }
    expect(events.some((e) => e.type === 'bridgeCollapse')).toBe(true);
  });
});

describe('crossovers (SPEC §4.4): the line changes sides of the field through a tunnel under the lane', () => {
  const X = G.crossover;
  /** A stretch with a crossover at column `at`, and a river forced well past it. */
  function crossing(seed: number, biome: BiomeId, at = 90, cols = 192): Terrain {
    const t = new Terrain(seed, ROWS, { biome, approach: null, line: { rivers: [10], crossovers: [at] } });
    t.ensure(0, cols * TS - 1);
    return t;
  }
  const FIELDS = BIOME_LIST.flatMap((biome, i) => [3, 20 + i].map((seed) => ({ t: crossing(seed, biome), name: `${seed} ${biome}` })));

  it('runs from one side to the other a row at a time, and the lane crosses it the other way', () => {
    for (const { t, name } of FIELDS) {
      const before = t.lineSideAt(40 * TS);
      expect(t.lineSideAt(140 * TS), name).toBe(-before);
      const row0 = t.lineRow(90 - X.cols)!;
      const row1 = t.lineRow(90 + X.cols)!;
      expect(Math.sign(row1 - row0), name).toBe(-before);
      expect(Math.abs(row1 - row0), name).toBeGreaterThan(ROWS / 3);
      for (let col = 1; col < 192; col++) expect(Math.abs(t.lineRow(col)! - t.lineRow(col - 1)!), `${name} col ${col}`).toBeLessThanOrEqual(1);
      // The lane was on the wide side before and is on the wide side after.
      const gap = (col: number) => t.laneY((col + 0.5) * TS) / TS - (t.lineRow(col)! + 0.5);
      expect(Math.sign(gap(60)), name).toBe(-before);
      expect(Math.sign(gap(120)), name).toBe(before);
      // And it moves gently: the hull follows it at speed.
      for (let col = 1; col < 192; col++) expect(Math.abs(t.laneY((col + 0.5) * TS) - t.laneY((col - 0.5) * TS)), `${name} col ${col}`).toBeLessThan(TS);
    }
  });

  it('is underground wherever the lane comes near: no track in the open within three rows of the road', () => {
    for (const { t, name } of FIELDS) {
      let under = 0;
      for (let col = 0; col < 192; col++) {
        const x = (col + 0.5) * TS;
        if (t.underground(x)) {
          under++;
          continue;
        }
        for (const track of [0, 1] as const) expect(Math.abs(t.laneY(x) - t.trackY(x, track)), `${name} col ${col} track ${track}`).toBeGreaterThanOrEqual(3 * TS);
      }
      // A stretch of it, in the middle of the crossover.
      expect(under, name).toBeGreaterThanOrEqual(6);
      expect(under, name).toBeLessThan(X.cols);
      expect(t.underground(90 * TS), name).toBe(true);
    }
  });

  it('has a portal over the line at each end of the tunnel, and the land as it comes between them, the road across it', () => {
    for (const { t, name } of FIELDS) {
      const cols: number[] = [];
      for (let col = 0; col < 192; col++) if (t.underground((col + 0.5) * TS)) cols.push(col);
      const c0 = cols[0]!;
      const c1 = cols[cols.length - 1]!;
      for (const col of cols) {
        const where = `${name} col ${col}`;
        const row = t.lineRow(col)!;
        const portal = Math.min(col - c0, c1 - col) < X.portal;
        for (let k = 0; k <= G.twin; k++) {
          const mat = t.tile(col, row + k * t.lineSideAt(col * TS))!.mat;
          // No rails in the open over a tunnel.
          expect(isLine(mat), `${where}: ${mat}`).toBe(false);
          if (portal) expect(mat, where).toBe('tunnel');
          else expect(mat, where).not.toBe('tunnel');
        }
        // The service road is as clear here as anywhere.
        const lane = t.laneY((col + 0.5) * TS) / TS;
        for (let r = Math.ceil(lane - G.serviceRoad / 2 - 0.5 + 1e-9); r + 0.5 < lane + G.serviceRoad / 2; r++) {
          const tile = t.tile(col, r)!;
          expect(['none', 'soft', 'trivial'], `${where} row ${r}: ${tile.mat}`).toContain(MATERIALS[tile.mat].obstacle[tile.state]);
        }
      }
      // The rails run into the portal's face from the open at both ends.
      expect(isLine(t.tile(c0 - 1, t.lineRow(c0 - 1)!)!.mat), name).toBe(true);
      expect(isLine(t.tile(c1 + 1, t.lineRow(c1 + 1)!)!.mat), name).toBe(true);
      // Nothing breaks a portal, and it's open ground.
      t.damage(c0, t.lineRow(c0)!, 5000, []);
      expect(t.tile(c0, t.lineRow(c0)!)!.mat, name).toBe('tunnel');
      expect(MATERIALS.tunnel.obstacle.intact).toBe('none');
    }
  });

  it('keeps rivers clear of it', () => {
    for (const { t, name } of FIELDS) {
      for (const rv of t.riversNear(0, 192 * TS)) expect(Math.abs(rv.col - 90), `${name} river at ${rv.col}`).toBeGreaterThan(X.cols / 2 + G.riverFlat);
    }
  });

  it('carries the second track on the line\'s narrow side, and under the first in the tunnel', () => {
    const t = crossing(3, 'temperate');
    for (let col = 20; col < 170; col++) {
      const x = (col + 0.5) * TS;
      const off = (t.trackY(x, 1) - t.trackY(x, 0)) / TS;
      if (Math.abs(col - 90) > X.cols / 2 + 1) expect(off, `col ${col}`).toBeCloseTo(G.twin * t.lineSideAt(x));
      // A smooth path the whole way, for what runs on it.
      expect(Math.abs(t.trackY(x + 1, 1) - t.trackY(x, 1)), `col ${col}`).toBeLessThan(1.5);
    }
    // Its own break doesn't cut the armored train's track, and the other way round.
    const col = 40;
    const row = t.lineRow(col)!;
    t.damage(col, row + G.twin * t.lineSideAt(col * TS), 500, []);
    expect(t.lineCut(col, 1)).toBe(true);
    expect(t.lineCut(col, 0)).toBe(false);
    t.damage(col + 2, row, 500, []);
    expect(t.lineCut(col + 2, 0)).toBe(true);
    expect(t.lineCut(col + 2, 1)).toBe(false);
  });

  it('marks every sideways step of its tracks and gravel so they\'re drawn as one curve', () => {
    const t = crossing(3, 'temperate');
    let bends = 0;
    for (let col = 2; col < 180; col++) {
      const step = t.lineRow(col + 1)! - t.lineRow(col)!;
      for (let k = 0; k <= G.twin; k++) {
        const tile = t.tile(col, t.lineRow(col)! + k * t.lineSideAt(col * TS))!;
        if (tile.mat !== 'track' && tile.mat !== 'ballast') continue;
        // (Where the line changes sides its rows shift under the tunnel, not in the open.)
        if (t.lineSideAt(col * TS) !== t.lineSideAt((col + 1) * TS)) continue;
        const links = tile.links ?? 0;
        expect(!!(links & BEND.aheadRight), `col ${col}`).toBe(step === 1);
        expect(!!(links & BEND.aheadLeft), `col ${col}`).toBe(step === -1);
        const next = t.tile(col + 1, t.lineRow(col + 1)! + k * t.lineSideAt(col * TS))!;
        if (step !== 0 && (next.mat === 'track' || next.mat === 'ballast')) {
          // The tile it steps into knows where it came from: the other half of the curve.
          expect(!!((next.links ?? 0) & (step === 1 ? BEND.behindLeft : BEND.behindRight)), `col ${col}`).toBe(true);
          bends++;
        }
      }
    }
    expect(bends).toBeGreaterThan(10);
  });

  it('is part of every battle with a line: two crossovers, clear of its rivers', () => {
    const spec = railLine(7000);
    expect(spec.crossovers).toHaveLength(2);
    for (const x of spec.crossovers!) {
      for (const chunk of spec.rivers) expect(Math.abs((chunk + 0.5) * TERRAIN_GEN.chunkCols - x)).toBeGreaterThan(X.cols + G.riverFlat + TERRAIN_GEN.chunkCols);
    }
  });
});
