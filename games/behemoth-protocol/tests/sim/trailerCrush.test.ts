import { describe, expect, it } from 'vitest';
import { ADDONS, type TrailerAddon } from '../../src/content/addons';
import { ENEMIES, type EnemyId } from '../../src/content/enemies';
import { OBSTACLE_CLASSES } from '../../src/content/obstacles';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { RAM, TERRAIN_GEN } from '../../src/content/tuning';
import { damageComponent, footprint, IDLE_COMMAND, towedFootprint, trailerBox, type BehemothState, type PlayerCommand } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { boxBounds } from '../../src/sim/math';
import { newRun } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const T = ADDONS.trailer as TrailerAddon;
const TS = TERRAIN_GEN.tileSize;
const OPTS = { seed: 1, frameWidth: 480, fieldRows: 21 };

/** A Behemoth towing a trailer over open ground, with nothing else on the field. */
function world(addons: ('trailer' | 'ramPlow')[] = ['trailer']): World {
  const w = createWorld({ ...OPTS, behemoth: newRun(1, 'class2', addons).behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 80; c++) for (let r = 0; r < w.terrain.rows; r++) setTile(w, c, r, 'ground');
  return w;
}

function setTile(w: World, col: number, row: number, mat: MaterialId) {
  const t = w.terrain.tile(col, row);
  if (t) Object.assign(t, { mat, state: 'intact', hp: MATERIALS[mat].maxHp });
}

/** Steps the world, collecting every event. */
function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}, log: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
    log.push(...w.events);
    w.events.length = 0;
  }
  return log;
}

/** A unit that holds still and never fires. */
function parked(w: World, x: number, y: number, id: EnemyId = 'lightTank'): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0 };
  e.guns = [];
  e.vx = 0;
  return e;
}

const trailer = (b: BehemothState) => b.trailer!;
const worn = (b: BehemothState) => T.armor - trailer(b).armor.hp;
/** How hard the hull is moving, as a share of cruise (what a ram's damage scales with). */
const impact = (b: BehemothState) => b.vx / b.chassis.speed.cruise;
const crushed = (log: SimEvent[]) => log.filter((e) => e.type === 'enemyDestroyed' && e.cause === 'crushed');

describe('the trailer crushes what it meets', () => {
  it('a vehicle against its flank is crushed, and the trailer pays for it: no ram gear back there', () => {
    const w = world(['trailer', 'ramPlow']);
    const b = w.behemoth;
    const t = trailer(b);
    const hull = { ...b.armor.frontLeft, treads: b.treads.hp, plow: b.addons.find((a) => a.def.kind === 'plow')!.integrity!.hp };
    // Just off its side, well behind the hull: only the trailer reaches it.
    const e = parked(w, t.x, t.y - T.width / 2 - 2);
    const hit = impact(b);
    const log = steps(w, 1);
    expect(e.alive).toBe(false);
    expect(crushed(log)).toHaveLength(1);
    const light = OBSTACLE_CLASSES.light;
    // The whole of the class's wear, on the trailer's armor.
    expect(worn(b)).toBeCloseTo((light.armorDamage + light.treadDamage) * hit, 1);
    expect(trailer(b).frame.hp).toBe(T.hp);
    expect(b.armor.frontLeft.hp).toBe(hull.hp);
    expect(b.treads.hp).toBe(hull.treads);
    expect(b.addons.find((a) => a.def.kind === 'plow')!.integrity!.hp).toBe(hull.plow);
    expect(log).toContainEqual({ type: 'collision', obstacle: 'light', x: e.x, y: e.y, trailer: true });
  });

  it('troops under it go without a jolt', () => {
    const w = world();
    const t = trailer(w.behemoth);
    const e = parked(w, t.x, t.y, 'infantry');
    const log = steps(w, 1);
    expect(e.alive).toBe(false);
    expect(log.filter((ev) => ev.type === 'collision')).toHaveLength(0);
    expect(worn(w.behemoth)).toBeLessThan(0.1);
  });

  it('a building it is dragged into is flattened: the trailer takes the wear and the tow slows the hull', () => {
    const w = world();
    const b = w.behemoth;
    const t = trailer(b);
    const col = Math.floor(t.x / TS);
    const row = Math.floor(t.y / TS);
    setTile(w, col, row, 'building');
    const hit = impact(b);
    const log = steps(w, 1);
    expect(w.terrain.tile(col, row)!.state).toBe('flattened');
    const medium = OBSTACLE_CLASSES.medium;
    expect(worn(b)).toBeCloseTo((medium.armorDamage + medium.treadDamage) * hit, 1);
    expect(impact(b)).toBeLessThan(hit * (1 - medium.speedDip) + 0.02);
    expect(log.some((ev) => ev.type === 'collision' && ev.trailer)).toBe(true);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
  });

  it('rock is not crushed: the trailer still rides over it', () => {
    const w = world();
    const t = trailer(w.behemoth);
    const col = Math.floor(t.x / TS);
    const row = Math.floor(t.y / TS);
    setTile(w, col, row, 'rock');
    const log = steps(w, 1);
    expect(w.terrain.tile(col, row)!.state).toBe('intact');
    expect(worn(w.behemoth)).toBe(0);
    expect(log.filter((ev) => ev.type === 'collision')).toHaveLength(0);
  });

  it('a unit too big to crush is rammed aside and survives, once', () => {
    const w = world();
    const b = w.behemoth;
    const t = trailer(b);
    const e = parked(w, t.x, t.y + 4, 'siegeTank');
    const hit = impact(b);
    steps(w, 1);
    expect(e.alive).toBe(true);
    // The unit's ram damage at this speed, with no gear behind it.
    expect(ENEMIES.siegeTank.hp - e.hp).toBeCloseTo(ENEMIES.siegeTank.ramDamage! * hit, 0);
    expect(e.y).toBeGreaterThan(t.y + 4);
    const after = worn(b);
    expect(after).toBeGreaterThan(0);
    // Still sliding off it: no second ram.
    steps(w, Math.floor((RAM.again * 60) / 2));
    expect(worn(b)).toBe(after);
  });

  it('wears through to the frame, and a trailer worn out this way cooks off', () => {
    const w = world();
    const b = w.behemoth;
    trailer(b).armor.hp = 0;
    trailer(b).frame.hp = 1;
    const t = trailer(b);
    setTile(w, Math.floor(t.x / TS), Math.floor(t.y / TS), 'bunker');
    const log = steps(w, 2);
    expect(trailer(b).status).toBe('wrecked');
    expect(log.some((ev) => ev.type === 'trailerBlast')).toBe(true);
  });

  it('crushes nothing once it is no longer in tow', () => {
    const w = world();
    const t = trailer(w.behemoth);
    t.status = 'wrecked';
    const e = parked(w, t.x, t.y);
    steps(w, 1);
    expect(e.alive).toBe(true);
  });
});

describe('units and the trailer', () => {
  it('the ground enemies route round runs back over the trailer in tow', () => {
    const w = world();
    const b = w.behemoth;
    const box = boxBounds(trailerBox(trailer(b)));
    expect(towedFootprint(b).x0).toBeCloseTo(box.x0);
    expect(towedFootprint(b).x1).toBe(footprint(b).x1);
    trailer(b).status = 'jettisoned';
    expect(towedFootprint(b)).toEqual(footprint(b));
  });

  it('nobody drives into the trailer of a stranded hull and gets crushed', () => {
    for (const seed of [2, 4, 9]) {
      const w = createWorld({ ...OPTS, seed, behemoth: newRun(seed, 'class2', ['trailer']).behemoth });
      w.encounter.off = true;
      steps(w, 60);
      damageComponent(w.behemoth, 'treads', 1e6, w.events);
      const log = steps(w, 60 * 60);
      expect(w.lastStand).not.toBeNull();
      expect(crushed(log)).toHaveLength(0);
    }
  });
});
