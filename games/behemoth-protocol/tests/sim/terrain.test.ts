import { TERRAIN_GEN } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { chunkRiver, generateChunk, riverCenter, Terrain, type River } from '../../src/sim/terrain';

const ROWS = 16;

function snapshot(t: Terrain, c0: number, c1: number): string {
  let s = '';
  for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) s += t.tile(c, r)!.mat[0];
  return s;
}

function findTile(t: Terrain, mat: string): [number, number] {
  for (let c = 0; c < 400; c++) for (let r = 0; r < ROWS; r++) if (t.tile(c, r)?.mat === mat) return [c, r];
  throw new Error(`no ${mat} tile found`);
}

describe('terrain generation', () => {
  it('is deterministic per seed', () => {
    expect(generateChunk(7, 3, ROWS)).toEqual(generateChunk(7, 3, ROWS));
    expect(JSON.stringify(generateChunk(7, 3, ROWS))).not.toEqual(JSON.stringify(generateChunk(8, 3, ROWS)));
  });

  it("doesn't depend on generation order", () => {
    const ts = TERRAIN_GEN.tileSize;
    const a = new Terrain(11, ROWS);
    a.ensure(0, 2000);
    const b = new Terrain(11, ROWS);
    b.ensure(1200, 2000);
    b.ensure(0, 1199);
    const c1 = Math.floor(2000 / ts);
    expect(snapshot(b, 0, c1)).toBe(snapshot(a, 0, c1));
  });

  it('keeps the start area clear and produces forests and buildings later', () => {
    const t = new Terrain(3, ROWS);
    t.ensure(0, 16 * 400);
    for (let c = 0; c < TERRAIN_GEN.clearStartCols; c++) for (let r = 0; r < ROWS; r++) expect(t.tile(c, r)!.mat).toBe('ground');
    expect(() => findTile(t, 'forest')).not.toThrow();
    expect(() => findTile(t, 'building')).not.toThrow();
  });

  it('prunes chunks behind and treats missing tiles as open ground', () => {
    const t = new Terrain(3, ROWS);
    t.ensure(0, 3000);
    const before = t.chunkCount;
    t.prune(1500);
    expect(t.chunkCount).toBeLessThan(before);
    expect(t.tile(0, 0)).toBeUndefined();
    expect(t.obstacleAt(0, 0)).toBe('none');
  });
});

describe('destructible tiles', () => {
  it('buildings go intact → damaged → rubble under fire and stop blocking shots', () => {
    const t = new Terrain(3, ROWS);
    t.ensure(0, 16 * 400);
    const [c, r] = findTile(t, 'building');
    const events: SimEvent[] = [];
    const x = (c + 0.5) * 16;
    const y = (r + 0.5) * 16;
    expect(t.blocksShotAt(x, y)).toBe(true);
    expect(t.obstacleAt(c, r)).toBe('medium');
    t.damage(c, r, 70, events);
    expect(t.tile(c, r)!.state).toBe('damaged');
    t.damage(c, r, 70, events);
    expect(t.tile(c, r)!.state).toBe('destroyed');
    expect(t.blocksShotAt(x, y)).toBe(false);
    expect(t.obstacleAt(c, r)).toBe('light'); // rubble
    expect(events.map((e) => e.type)).toEqual(['tileChanged', 'tileChanged']);
  });

  it('crushing flattens a tile and reports what was hit', () => {
    const t = new Terrain(3, ROWS);
    t.ensure(0, 16 * 400);
    const [c, r] = findTile(t, 'forest');
    const events: SimEvent[] = [];
    expect(t.crush(c, r, events)).toBe('trivial');
    expect(t.tile(c, r)!.state).toBe('flattened');
    expect(t.crush(c, r, events)).toBe('none');
    expect(events).toHaveLength(1);
  });

  it('line of fire is blocked by intact buildings', () => {
    const t = new Terrain(3, ROWS);
    t.ensure(0, 16 * 400);
    const [c, r] = findTile(t, 'building');
    const y = (r + 0.5) * 16;
    expect(t.lineBlocked((c - 3) * 16, y, (c + 4) * 16, y)).toBe(true);
  });
});

describe('rivers', () => {
  const FIELD = 21; // rows in the default 576-wide layout
  const ts = TERRAIN_GEN.tileSize;

  /** Every river centered in the first `chunks` chunks of a seed, with the terrain generated around it. */
  function rivers(seed: number, rows: number, chunks = 40): { t: Terrain; rv: River }[] {
    const t = new Terrain(seed, rows);
    t.ensure(0, chunks * TERRAIN_GEN.chunkCols * ts);
    const out: { t: Terrain; rv: River }[] = [];
    for (let ci = 0; ci < chunks - 1; ci++) {
      const rv = chunkRiver(seed, ci, rows);
      if (rv) out.push({ t, rv });
    }
    return out;
  }

  /** Column range a river can cover, padded. */
  function span(rv: River, rows: number, pad: number): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    for (let r = 0; r < rows; r++) {
      const c = riverCenter(rv, r + 0.5, rows);
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
    return [Math.floor(lo - rv.half - pad), Math.ceil(hi + rv.half + pad)];
  }

  /** Whether a tracked unit can get from one side of the window to the other (4-connected tiles). */
  function crossable(t: Terrain, c0: number, c1: number, rows: number, closed: (r: number) => boolean): boolean {
    const open = (c: number, r: number) => !closed(r) && t.speedAt((c + 0.5) * ts, (r + 0.5) * ts, 'tracked') > 0;
    const seen = new Set<number>();
    const queue: [number, number][] = [];
    for (let r = 0; r < rows; r++) if (open(c0, r)) queue.push([c0, r]);
    while (queue.length) {
      const [c, r] = queue.pop()!;
      const k = c * 1000 + r;
      if (seen.has(k)) continue;
      seen.add(k);
      if (c === c1) return true;
      for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]] as const) {
        if (nc >= c0 && nc <= c1 && nr >= 0 && nr < rows && open(nc, nr)) queue.push([nc, nr]);
      }
    }
    return false;
  }

  it('appear every few chunks, never in the start area or in neighboring chunks', () => {
    let count = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let last = -10;
      for (let ci = 0; ci < 40; ci++) {
        const rv = chunkRiver(seed, ci, FIELD);
        if (!rv) continue;
        count++;
        expect(ci).toBeGreaterThanOrEqual(TERRAIN_GEN.riverFirstChunk);
        expect(ci - last).toBeGreaterThan(1);
        last = ci;
      }
    }
    // About one river per 4–5 chunks.
    expect(count / (20 * 40)).toBeGreaterThan(0.15);
    expect(count / (20 * 40)).toBeLessThan(0.35);
  });

  it('cross the whole field: water, shallows, a bridge, or a footbridge at every row, and no rock in the water', () => {
    for (const rows of [ROWS, FIELD]) {
      for (const { t, rv } of rivers(5, rows)) {
        const [c0, c1] = span(rv, rows, 0);
        for (let r = 0; r < rows; r++) {
          let wet = false;
          for (let c = c0; c <= c1; c++) {
            const m = t.tile(c, r)!.mat;
            if (m === 'water' || m === 'shallows' || m === 'bridge' || m === 'lightBridge' || m === 'footbridge') wet = true;
          }
          expect(wet).toBe(true);
        }
      }
    }
  });

  it('block tracked units everywhere except at the fords and bridges, and every one is usable', () => {
    let fords = 0;
    let bridges = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const rows of [ROWS, FIELD]) {
        for (const { t, rv } of rivers(seed, rows, 30)) {
          const [c0, c1] = span(rv, rows, 3);
          const crossings = [...rv.fords, ...(rv.bridge ? [rv.bridge.rows] : [])];
          const inCrossing = (r: number) => crossings.some(([a, b]) => r >= a && r < b);
          expect(crossable(t, c0, c1, rows, inCrossing)).toBe(false);
          if (rv.bridge) bridges++;
          for (const [a, b] of crossings) {
            if (rv.fords.some((f) => f[0] === a)) fords++;
            expect(b - a).toBeGreaterThanOrEqual(Math.min(TERRAIN_GEN.fordWidth[0], TERRAIN_GEN.bridgeWidth));
            // Through this ford alone, from the open ground on one side to the other.
            const row = Math.floor((a + b) / 2);
            const center = riverCenter(rv, row + 0.5, rows);
            const near = Math.floor(center - rv.half - 1.5);
            const far = Math.floor(center + rv.half + 1.5);
            expect(crossable(t, near, far, rows, (r) => r < a || r >= b)).toBe(true);
          }
        }
      }
    }
    expect(fords).toBeGreaterThan(20);
    expect(bridges).toBeGreaterThan(3);
  });

  it("can't be damaged and don't block fire", () => {
    const { t, rv } = rivers(5, FIELD)[0]!;
    const row = 0;
    const col = Math.floor(riverCenter(rv, 0.5, FIELD));
    const tile = t.tile(col, row)!;
    const events: SimEvent[] = [];
    t.damage(col, row, 1000, events);
    expect(tile.state).toBe('intact');
    expect(events).toHaveLength(0);
    expect(t.blocksShotAt((col + 0.5) * ts, (row + 0.5) * ts)).toBe(false);
  });

  it('reports how much of a footprint is in the water', () => {
    const { t, rv } = rivers(5, FIELD)[0]!;
    // Find a deep tile and a shallow one.
    const find = (mat: string): [number, number] => {
      const [c0, c1] = span(rv, FIELD, 0);
      for (let c = c0; c <= c1; c++) for (let r = 0; r < FIELD; r++) if (t.tile(c, r)!.mat === mat) return [c, r];
      throw new Error(mat);
    };
    const [dc, dr] = find('water');
    const deep = t.groundAt({ x0: dc * ts, x1: (dc + 1) * ts, y0: dr * ts, y1: (dr + 1) * ts });
    expect(deep.min).toBeCloseTo(1);
    expect(deep.wear).toBeGreaterThan(0);
    const [sc, sr] = find('shallows');
    const half = t.groundAt({ x0: sc * ts, x1: (sc + 1) * ts, y0: (sr + 0.5) * ts, y1: (sr + 1) * ts });
    expect(half.cruise).toBeCloseTo(1);
    expect(half.wear).toBe(0);
    const dry = t.groundAt({ x0: 0, x1: ts * 4, y0: 0, y1: ts * 3 });
    expect(dry).toEqual({ cruise: 0, min: 0, wear: 0, grip: 1, label: null });
  });
});
