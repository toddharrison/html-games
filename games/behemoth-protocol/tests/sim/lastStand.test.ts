import { LAST_STAND, TERRAIN_GEN } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { IDLE_COMMAND, damageComponent, revealRadius } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import type { SimEvent } from '../../src/sim/events';
import { wavePlacement, waveBudget } from '../../src/sim/lastStand';
import { entryPoint } from '../../src/sim/spawner';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const TS = TERRAIN_GEN.tileSize;

function setTile(w: World, col: number, row: number, mat: MaterialId) {
  const t = w.terrain.tile(col, row)!;
  t.mat = mat;
  t.state = 'intact';
  t.hp = MATERIALS[mat].maxHp;
}

/** Steps the world, collecting every event (the renderer would normally drain them). */
function steps(w: World, n: number, log: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    log.push(...w.events);
    w.events.length = 0;
  }
  return log;
}

/** Cruise for a bit, then lose the treads and let the hull grind to a halt. */
function immobilized(seed = 1, opts: { waves?: boolean; autos?: boolean } = {}): World {
  const w = createWorld({ ...OPTS, seed });
  w.encounter.off = true;
  if (opts.autos === false) w.behemoth.autoEnabled.fill(false);
  steps(w, 60);
  damageComponent(w.behemoth, 'treads', 1e6, w.events);
  steps(w, 1);
  if (opts.waves === false) w.lastStand!.nextWave = 1e9;
  return w;
}

/** Turns every tile in a column range into open ground, so a test controls the obstacles. */
function clearGround(w: World, c0: number, c1: number) {
  for (let c = c0; c <= c1; c++) for (let r = 0; r < w.terrain.rows; r++) setTile(w, c, r, 'ground');
}

describe('last stand', () => {
  it('starts when the Behemoth is Immobilized, and the camera eases back to center the hull', () => {
    const w = createWorld(OPTS);
    steps(w, 60);
    expect(w.lastStand).toBeNull();
    damageComponent(w.behemoth, 'treads', 1e6, w.events);
    const log = steps(w, 1);
    expect(w.lastStand).not.toBeNull();
    expect(log.filter((e) => e.type === 'lastStand')).toHaveLength(1);

    const x = w.behemoth.x;
    const lefts: number[] = [];
    for (let i = 0; i < 60 * 6; i++) {
      steps(w, 1);
      lefts.push(w.frame.left);
    }
    // It grinds to a halt rather than stopping dead.
    expect(w.behemoth.vx).toBe(0);
    expect(w.behemoth.x).toBeGreaterThan(x);
    // The hull ended up low in the frame, so the camera moved back to put it in the middle.
    expect(Math.min(...lefts)).toBeLessThan(lefts[0]!);
    expect((w.behemoth.x - w.frame.left) / w.frame.config.width).toBeCloseTo(0.5, 1);
  });

  it('the regular spawner stops; reinforcements come in escalating waves, faster and faster', () => {
    const w = immobilized(1, { autos: false });
    // Outlast the waves so there's time to count them.
    w.behemoth.reactor.hp = w.behemoth.reactor.max = 1e9;
    w.encounter.off = false;
    const log = steps(w, 60 * (LAST_STAND.firstWave - 0.5));
    expect(w.enemies).toHaveLength(0);

    steps(w, 60 * 70, log);
    const waves = log.filter((e) => e.type === 'wave');
    expect(waves.length).toBeGreaterThanOrEqual(5);
    expect(waves.map((e) => e.wave)).toEqual(waves.map((_, i) => i + 1));
    // Later waves can come up short once the live-threat ceiling is full (nothing dies here).
    expect(waves.slice(0, 3).every((e) => e.units > 0)).toBe(true);
    for (let n = 1; n < 6; n++) expect(waveBudget(n + 1)).toBeGreaterThan(waveBudget(n));
    expect(w.lastStand!.nextWave).toBeLessThanOrEqual(LAST_STAND.interval - LAST_STAND.intervalShrink * (waves.length - 1) + 0.01);
    const live = w.enemies.reduce((s, e) => s + (e.alive ? e.def.threat : 0), 0);
    expect(live).toBeLessThanOrEqual(LAST_STAND.maxThreat);
  });

  it('every unit on the map converges to its siege ring, from any side', () => {
    const w = immobilized(1, { waves: false, autos: false });
    const b = w.behemoth;
    const units = [
      spawnEnemy(w, 'heavyTank', b.x + 220, b.y),
      spawnEnemy(w, 'lightTank', b.x - 60, b.y + 120),
      spawnEnemy(w, 'missileLauncher', b.x + 230, b.y - 60),
    ];
    for (const e of units) e.hp = 1e6;
    steps(w, 60 * 20);
    for (const e of units) {
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      expect(d).toBeGreaterThan(e.def.behavior.siege!.minRange * 0.6);
      expect(d).toBeLessThan(e.def.behavior.siege!.maxRange + 25);
    }
  });

  it('vehicles also come in across both edges of the field, level with the screen, and drive in', () => {
    const w = immobilized(1, { waves: false, autos: false });
    const t = w.terrain;
    const c0 = Math.floor(w.frame.left / TS) - 2;
    clearGround(w, c0, c0 + Math.ceil(w.frame.config.width / TS) + 4);
    const b = w.behemoth;
    const units = (['left', 'right'] as const).map((side) => {
      const at = entryPoint(w, ENEMIES.lightTank, side)!;
      expect(side === 'left' ? at.y < 0 : at.y > t.height).toBe(true);
      expect(at.x).toBeGreaterThan(w.frame.left);
      expect(at.x).toBeLessThan(w.frame.left + w.frame.config.width);
      const e = spawnEnemy(w, 'lightTank', at.x, at.y);
      e.hp = 1e6;
      return e;
    });
    steps(w, 60 * 12);
    for (const e of units) {
      expect(e.y).toBeGreaterThanOrEqual(e.def.radius);
      expect(e.y).toBeLessThanOrEqual(t.height - e.def.radius);
      expect(Math.hypot(e.x - b.x, e.y - b.y)).toBeLessThan(e.def.behavior.siege!.maxRange + 25);
    }
  });

  it('waves arrive from every side', () => {
    const w = immobilized(1, { waves: false, autos: false });
    const sides = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const at = wavePlacement(w, ENEMIES.heavyTank);
      if (!at) continue;
      if (at.y < 0) sides.add('left');
      else if (at.y > w.terrain.height) sides.add('right');
      else sides.add(at.x > w.behemoth.x ? 'ahead' : 'behind');
    }
    expect(sides).toEqual(new Set(['ahead', 'behind', 'left', 'right']));
  });

  it('nobody fires from beyond the field edge', () => {
    const fires = (y: number) => {
      const w = immobilized(1, { waves: false, autos: false });
      const e = spawnEnemy(w, 'missileLauncher', w.behemoth.x, y);
      e.hp = 1e6;
      e.def = { ...e.def, maxSpeed: 0 };
      return steps(w, 60 * 10).some((ev) => ev.type === 'fire' && ev.owner === 'enemy');
    };
    expect(fires(-LAST_STAND.flankDistance)).toBe(false);
    // The same unit just inside the edge does open fire.
    expect(fires(ENEMIES.missileLauncher.radius)).toBe(true);
  });

  it('units route around a rock wall instead of snagging on it', () => {
    const w = immobilized(1, { waves: false, autos: false });
    const b = w.behemoth;
    const c0 = Math.floor(b.x / TS);
    clearGround(w, c0 - 2, c0 + 16);
    // A wall across most of the field between the tank and the Behemoth, open only at the edges.
    const wall = c0 + 9;
    for (let r = 2; r < w.terrain.rows - 2; r++) setTile(w, wall, r, 'rock');
    const e = spawnEnemy(w, 'lightTank', (wall + 4.5) * TS, b.y);
    e.hp = 1e6;
    steps(w, 60 * 25);
    expect(e.x).toBeLessThan(wall * TS);
    expect(Math.hypot(e.x - b.x, e.y - b.y)).toBeLessThan(e.def.behavior.siege!.maxRange + 25);
  });

  it('nobody drives into the stopped hull and gets crushed', () => {
    for (const seed of [2, 4, 9]) {
      const w = immobilized(seed);
      const log = steps(w, 60 * 60);
      const crushed = log.filter((e) => e.type === 'enemyDestroyed' && e.cause === 'crushed');
      expect(crushed).toHaveLength(0);
    }
  });

  it('infantry reinforcements infiltrate hidden cover beyond the sensor reveal radius', () => {
    const w = immobilized(1, { waves: false });
    const b = w.behemoth;
    const c0 = Math.floor(b.x / TS);
    clearGround(w, c0 - 12, c0 + 18);
    const wood = c0 + 12;
    setTile(w, wood, 3, 'forest');
    setTile(w, c0 + 2, 3, 'forest'); // too close: inside the reveal radius
    for (let i = 0; i < 10; i++) {
      const at = wavePlacement(w, ENEMIES.infantry)!;
      expect(w.terrain.concealsAt(at.x, at.y)).toBe(true);
      expect(Math.hypot(at.x - b.x, at.y - b.y)).toBeGreaterThan(revealRadius(b) + LAST_STAND.infiltrateMargin);
    }
    const sq = spawnEnemy(w, 'infantry', (wood + 0.5) * TS, 3.5 * TS);
    expect(sq.hidden).toBe(true);
  });

  it('ends only when the reactor goes: a Behemoth that just sits there is overrun', () => {
    const w = immobilized(3);
    for (let i = 0; i < 60 * 240 && !w.behemoth.destroyed; i++) steps(w, 1);
    expect(w.behemoth.destroyed).toBe(true);
    expect(w.lastStand!.time).toBeGreaterThan(30);
  });
});
