import { TERRAIN_GEN } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { IDLE_COMMAND, footprint, groundFootprint, speedLimits, type BehemothState, type PlayerCommand } from '../../src/sim/behemoth';
import { applyObstacle } from '../../src/sim/collision';
import type { SimEvent } from '../../src/sim/events';
import { Rng } from '../../src/sim/rng';
import { generateChunk, laneCenter, Terrain } from '../../src/sim/terrain';
import { battleRecipe, battleSeed, newRun } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const ROWS = 16;
const TS = TERRAIN_GEN.tileSize;

function world(): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: ROWS });
  w.encounter.off = true;
  return w;
}

function setTile(w: World, col: number, row: number, mat: MaterialId) {
  const t = w.terrain.tile(col, row)!;
  t.mat = mat;
  t.state = 'intact';
  t.hp = MATERIALS[mat].maxHp;
}

function rockColumn(w: World, col: number, r0: number, r1: number) {
  for (let r = r0; r <= r1; r++) setTile(w, col, r, 'rock');
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

/** Column just ahead of the Behemoth's nose. */
function aheadCol(w: World, gap = 2): number {
  return Math.floor(footprint(w.behemoth).x1 / TS) + gap;
}

describe('ramming', () => {
  const worn = (b: BehemothState) => ({
    left: b.armor.frontLeft.max - b.armor.frontLeft.hp,
    right: b.armor.frontRight.max - b.armor.frontRight.hp,
  });

  it('wears the front half on the side of the nose that struck', () => {
    const b = world().behemoth;
    applyObstacle(b, 'heavy', [], b.x + 30, b.y + 10);
    expect(worn(b).right).toBeGreaterThan(0);
    expect(worn(b).left).toBe(0);
    applyObstacle(b, 'heavy', [], b.x + 30, b.y - 10);
    expect(worn(b).left).toBeGreaterThan(0);
  });

  it('splits a dead-center ram evenly over both halves', () => {
    const b = world().behemoth;
    applyObstacle(b, 'heavy', [], b.x + 30, b.y);
    expect(worn(b).left).toBeGreaterThan(0);
    expect(worn(b).left).toBeCloseTo(worn(b).right, 9);
  });

  it('on an angled hull, a ram straight ahead strikes the leading corner', () => {
    const b = world().behemoth;
    b.heading = 0.35; // nose turned right: the front-left corner leads
    applyObstacle(b, 'heavy', [], b.x + 32, b.y);
    expect(worn(b).left).toBeGreaterThan(0);
    expect(worn(b).right).toBe(0);
  });
});

describe('deflecting off rock', () => {
  it('a head-on hit shoves the Behemoth sideways toward the nearer end; it never stops', () => {
    const w = world();
    const b = w.behemoth;
    const col = aheadCol(w);
    // Face spans rows 7–10 (y 112–176); the hull spans y 108–148, so the top end is nearer.
    rockColumn(w, col, 7, 10);
    const y0 = b.y;
    const v0 = b.vx;
    let minV = v0;
    let held = false;
    for (let i = 0; i < 240; i++) {
      steps(w, 1);
      minV = Math.min(minV, b.vx);
      held ||= b.deflect.dir !== 0;
      expect(w.terrain.tile(col, 7)!.state).toBe('intact');
      // While the hull still overlaps the face sideways, the nose stays at it.
      const fp = groundFootprint(b);
      if (fp.y1 > 7 * TS + 0.001) expect(fp.x1).toBeLessThanOrEqual(col * TS + 0.001);
    }
    expect(held).toBe(true);
    expect(b.y).toBeLessThan(y0 - 30);
    expect(footprint(b).x0).toBeGreaterThan((col + 1) * TS); // drove past the face
    expect(minV).toBeLessThan(v0 * 0.8);
    expect(minV).toBeGreaterThan(0);
    // It slid off to the left, so the face was off its right side for most of the scrape.
    const worn = (arc: 'frontLeft' | 'frontRight') => b.armor[arc].max - b.armor[arc].hp;
    expect(worn('frontRight')).toBeGreaterThan(worn('frontLeft'));
    // Rock isn't crushed or damaged.
    for (let r = 7; r <= 10; r++) expect(w.terrain.tile(col, r)!.state).toBe('intact');
    expect(w.events.some((e) => e.type === 'collision' && e.obstacle === 'immovable')).toBe(true);
  });

  it('rock grazing only the outer edge of the hull lets it pass (the ground box is smaller)', () => {
    const w = world();
    const b = w.behemoth;
    const col = aheadCol(w);
    // Rows 0–6 end at y 112: inside the full hull (y 108–148), just outside its ground box (112–144).
    rockColumn(w, col, 0, 6);
    const y0 = b.y;
    steps(w, 240);
    expect(footprint(b).x0).toBeGreaterThan((col + 1) * TS);
    expect(b.y).toBeCloseTo(y0, 3);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max);
    expect(w.events.some((e) => e.type === 'collision' || e.type === 'scrape')).toBe(false);
  });

  it('water lapping at the outer edge of the hull does not slow it (fording uses the ground box)', () => {
    const w = world();
    const b = w.behemoth;
    const fp = footprint(b);
    const flood = (r1: number) => {
      for (let c = Math.floor(fp.x0 / TS) - 4; c <= Math.floor(fp.x1 / TS) + 30; c++) for (let r = 0; r <= r1; r++) setTile(w, c, r, 'water');
    };
    flood(6); // to y 112: inside the full hull (y 108–148), outside the ground box (112–144)
    steps(w, 60);
    expect(b.wading.min).toBe(0);
    expect(b.vx).toBeCloseTo(speedLimits(b).cruise, 3);
    flood(7); // to y 128: now it's in
    steps(w, 1);
    expect(b.wading.min).toBeGreaterThan(0);
  });

  it('steering picks the slide direction', () => {
    const w = world();
    const b = w.behemoth;
    rockColumn(w, aheadCol(w), 7, 10); // top end is nearer, but the player steers right (+y)
    const y0 = b.y;
    steps(w, 180, { steer: 1 });
    expect(b.y).toBeGreaterThan(y0 + 30);
  });

  it('heads the other way when there is no room for the hull between the face and the field edge', () => {
    const w = world();
    const b = w.behemoth;
    // Face rows 1–9: the top end is nearer, but row 0 leaves no room for a 40-unit hull.
    const col = aheadCol(w);
    rockColumn(w, col, 1, 9);
    const y0 = b.y;
    steps(w, 360);
    expect(b.y).toBeGreaterThan(y0);
    expect(footprint(b).x0).toBeGreaterThan((col + 1) * TS);
  });

  it('sliding alongside rock scrapes that side without slowing forward travel', () => {
    const w = world();
    const b = w.behemoth;
    const fp = footprint(b);
    // A ridge along the travel direction just off the left (−y) side.
    const row = Math.floor(fp.y0 / TS) - 1;
    const c0 = Math.floor(fp.x0 / TS);
    for (let c = c0; c < c0 + 30; c++) setTile(w, c, row, 'rock');
    const ridgeEdge = (row + 1) * TS;
    let scrapes = 0;
    for (let i = 0; i < 180; i++) {
      steps(w, 1, { steer: -1 });
      scrapes += w.events.filter((e) => e.type === 'scrape').length;
      w.events.length = 0;
      expect(groundFootprint(b).y0).toBeGreaterThanOrEqual(ridgeEdge - 0.001);
    }
    expect(b.armor.left.hp).toBeLessThan(b.armor.left.max);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max);
    expect(b.vx).toBeCloseTo(speedLimits(b).cruise, 3);
    expect(scrapes).toBeGreaterThan(5);
  });

  it('a face with no way around crumbles rather than stopping it for good', () => {
    const w = world();
    const b = w.behemoth;
    const col = aheadCol(w);
    rockColumn(w, col, 0, ROWS - 1); // wall across the whole field (the generator never does this)
    steps(w, 300);
    expect(footprint(b).x0).toBeGreaterThan((col + 1) * TS);
    expect(w.terrain.tile(col, Math.floor(b.y / TS))!.state).not.toBe('intact');
  });
});

describe('rock terrain', () => {
  it('generated rock never boxes in a Behemoth driving blind (no grinding through)', () => {
    // Contacts summed over the seeds, so the test always touches rock (a seed's route may not).
    let contacts = 0;
    const seeds = [1, 2, 8, 12, 18, 39];
    for (const seed of seeds) {
      const w = createWorld({ seed, frameWidth: 324, fieldRows: 21 });
      w.encounter.off = true;
      const rng = new Rng(seed);
      let steer: -1 | 0 | 1 = 0;
      for (let i = 0; i < 60 * 180; i++) {
        if (i % 90 === 0) steer = rng.pick([-1, 0, 0, 1] as const);
        const was = w.behemoth.deflect.dir;
        steps(w, 1, { steer });
        if (was === 0 && w.behemoth.deflect.dir !== 0) contacts++;
        for (const e of w.events) {
          if (e.type === 'tileChanged' && w.terrain.tile(e.col, e.row)?.mat === 'rock') throw new Error(`seed ${seed}: crumbled rock`);
        }
        w.events.length = 0;
      }
    }
    expect(contacts).toBeGreaterThan(seeds.length);
  });

  it('a hull that never steers slides clear of a face and stays clear (no stall flush against its end)', () => {
    // Practice seed 4, industrial: the hull slid off a face into a gap exactly its ground box wide,
    // and the easing left over from the shove pulled it back onto the face's corner every other
    // tick, a fresh head-on hit each time, until it crawled to a stop at x ≈ 774.
    const run = newRun(4);
    const w = createWorld({ seed: battleSeed(run), frameWidth: 324, fieldRows: 21, recipe: battleRecipe(run, { biome: 'industrial' }) });
    w.encounter.off = true;
    steps(w, 60 * 40);
    expect(w.behemoth.x).toBeGreaterThan(1200);
  });

  it('is generated, but never inside the guaranteed lane', () => {
    let rocks = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (let ci = 1; ci < 40; ci++) {
        const cols = generateChunk(seed, ci, 21);
        cols.forEach((column, i) => {
          const col = ci * TERRAIN_GEN.chunkCols + i;
          const center = laneCenter(seed, col + 0.5, 21);
          column.forEach((tile, row) => {
            if (tile.mat !== 'rock') return;
            rocks++;
            expect(Math.abs(row + 0.5 - center)).toBeGreaterThanOrEqual(TERRAIN_GEN.laneWidth / 2);
          });
        });
      }
    }
    expect(rocks).toBeGreaterThan(100);
  });

  it('the lane stays inside the field and drifts gently enough to steer along', () => {
    for (const rows of [16, 21]) {
      let prev = laneCenter(9, 0, rows);
      for (let col = 1; col < 2000; col++) {
        const c = laneCenter(9, col, rows);
        expect(c - TERRAIN_GEN.laneWidth / 2).toBeGreaterThanOrEqual(0);
        expect(c + TERRAIN_GEN.laneWidth / 2).toBeLessThanOrEqual(rows);
        expect(Math.abs(c - prev)).toBeLessThan(0.5);
        prev = c;
      }
    }
  });

  it("can't be crushed or shot apart, and blocks shots", () => {
    const t = new Terrain(3, ROWS);
    t.ensure(0, 1000);
    t.tile(30, 5)!.mat = 'rock';
    const events: SimEvent[] = [];
    expect(t.obstacleAt(30, 5)).toBe('immovable');
    expect(t.crush(30, 5, events)).toBe('none');
    t.damage(30, 5, 1e6, events);
    expect(t.tile(30, 5)!.state).toBe('intact');
    expect(events).toHaveLength(0);
    expect(t.blocksShotAt(30.5 * TS, 5.5 * TS)).toBe(true);
    expect(t.speedAt(30.5 * TS, 5.5 * TS, 'tracked')).toBe(0);
    expect(t.speedAt(30.5 * TS, 5.5 * TS, 'foot')).toBe(0);
  });
});

describe('fording rivers', () => {
  /** A band of `mat` across the whole field, `width` columns starting at `col`. */
  function band(w: World, col: number, width: number, mat: MaterialId) {
    for (let c = col; c < col + width; c++) for (let r = 0; r < ROWS; r++) setTile(w, c, r, mat);
  }

  /** Clear a stretch ahead of features the generator put there. */
  function clear(w: World, c0: number, c1: number) {
    w.terrain.ensure(c0 * TS, (c1 + 1) * TS);
    for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) setTile(w, c, r, 'ground');
  }

  it('deep water drags the Behemoth down to minimum speed and wears the treads by distance', () => {
    const w = world();
    const b = w.behemoth;
    const col = aheadCol(w, 3);
    clear(w, col - 3, col + 20);
    band(w, col, 8, 'water');
    const lim = speedLimits(b);
    let minV = Infinity;
    let wet = 0;
    for (let i = 0; i < 60 * 12 && footprint(b).x0 < (col + 9) * TS; i++) {
      steps(w, 1);
      if (b.wading.min > 0.99) {
        wet += b.vx / 60;
        minV = Math.min(minV, b.vx);
      }
    }
    // Minimum speed itself drops a little as the treads wear.
    expect(minV).toBeLessThan(lim.min);
    expect(minV).toBeCloseTo(speedLimits(b).min, 0);
    expect(footprint(b).x0).toBeGreaterThan((col + 8) * TS); // never stuck
    // Wear is per distance: the share of the treads lost matches the distance driven fully in.
    const lost = b.treads.max - b.treads.hp;
    expect(lost).toBeGreaterThan((wet * MATERIALS.water.wading!.wear) / 100);
    expect(lost).toBeLessThan(12);
    // Back on dry ground it picks up speed again.
    steps(w, 120);
    expect(b.vx).toBeGreaterThan(lim.min + 5);
  });

  it('a surge carries the hull further into deep water before it slows', () => {
    const into = (throttle: -1 | 0 | 1) => {
      const w = world();
      const b = w.behemoth;
      const col = aheadCol(w, 6);
      clear(w, col - 6, col + 12);
      band(w, col, 10, 'water');
      steps(w, 180, { throttle }); // get up to speed
      // Distance driven after the nose enters until the hull is down to minimum speed.
      const entry = col * TS;
      for (let i = 0; i < 600 && b.vx > speedLimits(b).min + 0.5; i++) steps(w, 1, { throttle });
      return footprint(b).x1 - entry;
    };
    expect(into(1)).toBeGreaterThan(into(0));
  });

  it('shallows hold it to cruise speed but cost no treads', () => {
    const w = world();
    const b = w.behemoth;
    const col = aheadCol(w, 2);
    clear(w, col - 2, col + 40);
    band(w, col, 30, 'shallows');
    let maxV = 0;
    for (let i = 0; i < 60 * 6; i++) {
      steps(w, 1, { throttle: 1 });
      if (b.wading.cruise > 0.99) maxV = Math.max(maxV, b.vx);
    }
    expect(maxV).toBeGreaterThan(0);
    expect(maxV).toBeLessThanOrEqual(speedLimits(b).cruise + 0.01);
    expect(b.treads.hp).toBe(b.treads.max);
  });
});
