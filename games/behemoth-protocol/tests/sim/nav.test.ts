import { describe, expect, it } from 'vitest';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { NAV, TERRAIN_GEN } from '../../src/content/tuning';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { navigate, pathBlocked, plan, separation, type Goal } from '../../src/sim/ai/nav';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { footprint } from '../../src/sim/behemoth';
import { circleIntersectsRect } from '../../src/sim/math';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const TS = TERRAIN_GEN.tileSize;

function setTile(w: World, col: number, row: number, mat: MaterialId) {
  const t = w.terrain.tile(col, row)!;
  t.mat = mat;
  t.state = 'intact';
  t.hp = MATERIALS[mat].maxHp;
}

/** A world with open ground from `c0 - 4` to `c0 + 30` columns past the hull, and the encounters off. */
function field(rows = 21) {
  const w = createWorld({ seed: 1, frameWidth: 324, fieldRows: rows });
  w.encounter.off = true;
  const c0 = Math.floor(w.behemoth.x / TS);
  for (let c = c0 - 4; c <= c0 + 30; c++) for (let r = 0; r < w.terrain.rows; r++) setTile(w, c, r, 'ground');
  return { w, c0 };
}

/** Drives one unit toward a fixed goal with nothing but navigation, no behavior. Returns where it went. */
function drive(w: World, e: Enemy, g: Goal, seconds: number): { x: number; y: number }[] {
  const track: { x: number; y: number }[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    const v = navigate(e, w, g, dt);
    const nx = e.x + v.vx * dt;
    const ny = e.y + v.vy * dt;
    if (w.terrain.speedAt(nx, ny, e.def.mobility) > 0) {
      e.x = nx;
      e.y = ny;
    }
    track.push({ x: e.x, y: e.y });
  }
  return track;
}

/** Every leg of a route keeps to ground the unit can cross. */
function passable(w: World, e: Enemy, path: { x: number; y: number }[]): boolean {
  let p = { x: e.x, y: e.y };
  for (const q of path) {
    if (pathBlocked(w.terrain, e.def.mobility, 0, p.x, p.y, q.x, q.y)) return false;
    p = q;
  }
  return true;
}

describe('navigation', () => {
  it('pathBlocked sees rock across the way, including off to the side of the unit', () => {
    const { w, c0 } = field();
    setTile(w, c0 + 5, 6, 'rock');
    const y = 6.5 * TS;
    expect(pathBlocked(w.terrain, 'tracked', 7, (c0 + 1) * TS, y, (c0 + 9) * TS, y)).toBe(true);
    // Passing just beside it: clear for a point, blocked for a unit with some width.
    const yBeside = 7 * TS + 3;
    expect(pathBlocked(w.terrain, 'tracked', 0, (c0 + 1) * TS, yBeside, (c0 + 9) * TS, yBeside)).toBe(false);
    expect(pathBlocked(w.terrain, 'tracked', 7, (c0 + 1) * TS, yBeside, (c0 + 9) * TS, yBeside)).toBe(true);
  });

  it('routes round a wall through its gap, every leg over open ground, and gets there', () => {
    const { w, c0 } = field();
    // A rock wall across the field with a gap at rows 16-18, far from the straight line at row 4.
    for (let r = 0; r < w.terrain.rows; r++) if (r < 16 || r > 18) setTile(w, c0 + 18, r, 'rock');
    const e = spawnEnemy(w, 'lightTank', (c0 + 12.5) * TS, 4.5 * TS);
    const g: Goal = { x: (c0 + 24.5) * TS, y: 4.5 * TS, mode: 'arrive' };
    const route = plan(e, w, g)!;
    expect(route.reaches).toBe(true);
    expect(passable(w, e, route.path)).toBe(true);
    expect(Math.max(...route.path.map((p) => p.y))).toBeGreaterThan(15 * TS);
    // Smoothed: a handful of legs, not one per tile.
    expect(route.path.length).toBeLessThan(8);
    const track = drive(w, e, g, 8);
    const end = track[track.length - 1]!;
    expect(Math.hypot(end.x - g.x, end.y - g.y)).toBeLessThan(4);
  });

  it('crosses a river at its ford, where tracks can go; a hovercraft goes straight over', () => {
    const { w, c0 } = field();
    // Deep water down two columns, shallow all the way across at rows 15-17 (a ford).
    for (const c of [c0 + 16, c0 + 17]) for (let r = 0; r < w.terrain.rows; r++) setTile(w, c, r, r >= 15 && r <= 17 ? 'shallows' : 'water');
    const g: Goal = { x: (c0 + 24.5) * TS, y: 4.5 * TS, mode: 'arrive' };
    const tank = spawnEnemy(w, 'lightTank', (c0 + 10.5) * TS, 4.5 * TS);
    const route = plan(tank, w, g)!;
    expect(route.reaches).toBe(true);
    expect(passable(w, tank, route.path)).toBe(true);
    const crossing = drive(w, tank, g, 10).filter((p) => p.x > (c0 + 16) * TS && p.x < (c0 + 18) * TS);
    expect(crossing.length).toBeGreaterThan(0);
    for (const p of crossing) expect(p.y).toBeGreaterThan(14.5 * TS);

    const hover = spawnEnemy(w, 'hovercraft', (c0 + 10.5) * TS, 4.5 * TS);
    const over = drive(w, hover, g, 4).filter((p) => p.x > (c0 + 16) * TS && p.x < (c0 + 18) * TS);
    expect(over.length).toBeGreaterThan(0);
    for (const p of over) expect(p.y).toBeLessThan(6 * TS);
  });

  it('goes round a wood when that is quicker than ploughing through it', () => {
    const { w, c0 } = field();
    // A wood 6 columns deep, 5 rows tall, across the straight line.
    for (let c = c0 + 14; c < c0 + 20; c++) for (let r = 2; r <= 6; r++) setTile(w, c, r, 'forest');
    const e = spawnEnemy(w, 'lightTank', (c0 + 10.5) * TS, 4.5 * TS);
    const g: Goal = { x: (c0 + 24.5) * TS, y: 4.5 * TS, mode: 'arrive' };
    const track = drive(w, e, g, 8);
    const inWood = track.filter((p) => w.terrain.tileAt(p.x, p.y)?.mat === 'forest');
    expect(inWood.length).toBeLessThan(10);
  });

  it('ends a route as near as it can get to a goal it cannot reach', () => {
    const { w, c0 } = field();
    // The goal is boxed in by rock.
    for (let c = c0 + 19; c <= c0 + 23; c++) for (let r = 2; r <= 6; r++) if (c === c0 + 19 || c === c0 + 23 || r === 2 || r === 6) setTile(w, c, r, 'rock');
    const e = spawnEnemy(w, 'lightTank', (c0 + 10.5) * TS, 4.5 * TS);
    const route = plan(e, w, { x: (c0 + 21.5) * TS, y: 4.5 * TS, mode: 'arrive' })!;
    expect(route.reaches).toBe(false);
    const last = route.path[route.path.length - 1]!;
    expect(Math.hypot(last.x - (c0 + 21.5) * TS, last.y - 4.5 * TS)).toBeLessThanOrEqual(3 * TS + 1);
  });

  it('goes round the Behemoth rather than under its treads', () => {
    const { w } = field();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 30, b.y - 60);
    const g: Goal = { x: b.x + 30, y: b.y + 60, mode: 'arrive' };
    const route = plan(e, w, g)!;
    expect(route.reaches).toBe(true);
    let p = { x: e.x, y: e.y };
    const hull = footprint(b);
    for (const q of route.path) {
      for (let s = 0; s <= 1; s += 0.05) expect(circleIntersectsRect(p.x + (q.x - p.x) * s, p.y + (q.y - p.y) * s, 0, hull)).toBe(false);
      p = q;
    }
  });

  it('steers out of a marked barrage zone once it has seen it coming', () => {
    const { w } = field();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 120, b.y);
    const zone = { x: e.x, y: e.y, radius: 30, from: w.time, lands: w.time + 2.4, until: w.time + 3 };
    w.barrages.push(zone);
    const g: Goal = { x: e.x, y: e.y, mode: 'arrive' };
    // Before it reacts it holds its ground; then it gets clear.
    drive(w, e, g, NAV.zone.react * 0.5);
    expect(Math.hypot(e.x - zone.x, e.y - zone.y)).toBeLessThan(2);
    w.time += NAV.zone.react;
    drive(w, e, g, 1.5);
    expect(Math.hypot(e.x - zone.x, e.y - zone.y)).toBeGreaterThan(zone.radius + e.def.radius);
  });

  it('a charge ignores the hull and the zones: it means to hit', () => {
    const { w } = field();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'bombTruck', b.x + 100, b.y);
    w.barrages.push({ x: b.x + 50, y: b.y, radius: 30, from: w.time - 5, lands: w.time, until: w.time + 3 });
    expect(plan(e, w, { x: b.x, y: b.y, mode: 'speed', speed: 50, contact: true })!.path.length).toBe(1);
  });

  it('units on top of each other push apart', () => {
    const { w } = field();
    const b = w.behemoth;
    const a = spawnEnemy(w, 'lightTank', b.x + 120, b.y + 40);
    const c = spawnEnemy(w, 'lightTank', b.x + 121, b.y + 40);
    const sa = separation(a, w);
    const sc = separation(c, w);
    expect(sa.vx).toBeLessThan(0);
    expect(sc.vx).toBeGreaterThan(0);
    // In the full sim they end up apart.
    for (let i = 0; i < 60; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y });
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(a.def.radius + c.def.radius);
  });
});
