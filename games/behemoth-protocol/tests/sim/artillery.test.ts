import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies';
import { MODES } from '../../src/content/modes';
import { BARRAGE, SPAWNER } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import { IDLE_COMMAND, type ArmorArc } from '../../src/sim/behemoth';
import { barrageLead, spawnEnemy } from '../../src/sim/enemies';
import { createEncounter, stepEncounter } from '../../src/sim/encounter';
import type { Enemy } from '../../src/sim/entities';
import { frameRight } from '../../src/sim/frame';
import { SIM_DT } from '../../src/sim/loop';
import { edgeSpot, mobileMix } from '../../src/sim/spawner';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const GUNS = WEAPONS.batteryShells;
const SALVO = GUNS.salvo!;
const BAR = GUNS.barrage!;

function world(seed = 1): World {
  const w = createWorld({ ...OPTS, seed });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  openGround(w, 120);
  return w;
}

/** Levels the first `cols` columns to open ground, so cover and rock don't get in the way. */
function openGround(w: World, cols: number) {
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
}

function steps(w: World, n: number) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
}

/** A battery ahead of the Behemoth near the field's edge, guns already laid and ready. */
function battery(w: World, ahead = 200): Enemy {
  const b = w.behemoth;
  const e = spawnEnemy(w, 'artillery', b.x + ahead, 20);
  e.cooldown = 0;
  e.turret = Math.atan2(b.y - e.y, b.x + b.vx * barrageLead(GUNS) - e.x);
  return e;
}

const armorTotal = (w: World) => (Object.keys(w.behemoth.armor) as ArmorArc[]).reduce((sum, a) => sum + w.behemoth.armor[a].hp, 0);
const shells = (w: World) => w.projectiles.filter((p) => p.owner === 'enemy' && p.weapon.id === 'batteryShells');

describe('field battery', () => {
  it('lays its guns for the aim time, then marks a zone where the Behemoth is headed', () => {
    const w = world();
    const b = w.behemoth;
    const e = battery(w);
    steps(w, 1);
    expect(e.windup).toBeGreaterThan(0);
    expect(w.barrages).toHaveLength(0);
    steps(w, Math.ceil(e.def.aimTime / SIM_DT) + 1);
    expect(w.barrages).toHaveLength(1);
    const z = w.barrages[0]!;
    expect(z.radius).toBe(BAR.radius);
    // On its present course: ahead of the hull by its speed × the lead, level with it.
    expect(z.x).toBeCloseTo(b.x + b.vx * barrageLead(GUNS), -1);
    expect(Math.abs(z.y - b.y)).toBeLessThan(5);
    expect(z.lands - z.from).toBeCloseTo(BAR.flight, 5);
    expect(z.until - z.lands).toBeCloseTo((SALVO.count - 1) * SALVO.interval, 5);
    expect(w.events.some((ev) => ev.type === 'barrage')).toBe(true);
  });

  it('fires its guns one after another, every round coming down inside the zone', () => {
    const w = world();
    battery(w);
    steps(w, Math.ceil((ENEMIES.artillery.aimTime + (SALVO.count - 1) * SALVO.interval) / SIM_DT) + 4);
    const z = w.barrages[0]!;
    const rounds = shells(w);
    expect(rounds).toHaveLength(SALVO.count);
    for (const p of rounds) {
      expect(Math.hypot(p.tx - z.x, p.ty - z.y)).toBeLessThanOrEqual(BAR.radius + 1e-6);
      // Each lands `flight` seconds after it's fired.
      expect(p.fuse / Math.hypot(p.vx, p.vy)).toBeCloseTo(BAR.flight, 5);
    }
  });

  it('hits a Behemoth that holds its course, from above: cover in the way does not stop it', () => {
    const w = world();
    const e = battery(w);
    // A row of buildings between the battery and the Behemoth's track.
    const ts = w.terrain.tileSize;
    for (let c = 0; c < 120; c++) {
      const t = w.terrain.tile(c, Math.floor((e.y + 40) / ts));
      if (t) Object.assign(t, { mat: 'building', state: 'intact', hp: 200 });
    }
    const before = armorTotal(w);
    steps(w, Math.ceil((ENEMIES.artillery.aimTime + BAR.flight + SALVO.count * SALVO.interval) / SIM_DT) + 10);
    expect(armorTotal(w)).toBeLessThan(before);
    expect(w.barrages).toHaveLength(0);
  });

  it('misses a Behemoth that gets clear of the zone once it is marked', () => {
    const w = world();
    const b = w.behemoth;
    battery(w);
    steps(w, Math.ceil(ENEMIES.artillery.aimTime / SIM_DT) + 2);
    expect(w.barrages).toHaveLength(1);
    // Swung well across the field the moment the zone went down.
    b.y += 90;
    const before = armorTotal(w);
    steps(w, Math.ceil((BAR.flight + SALVO.count * SALVO.interval) / SIM_DT) + 10);
    expect(armorTotal(w)).toBe(before);
  });

  it('cannot lay its guns on a Behemoth inside its minimum range', () => {
    const w = world();
    const e = battery(w, 60);
    e.y = w.behemoth.y + 20;
    steps(w, 200);
    expect(w.barrages).toHaveLength(0);
    expect(shells(w)).toHaveLength(0);
  });

  it('its shells hit the enemy’s own units in the zone, at a share of the damage', () => {
    const w = world();
    battery(w);
    steps(w, Math.ceil(ENEMIES.artillery.aimTime / SIM_DT) + 2);
    const z = w.barrages[0]!;
    // The Behemoth swings clear, so it doesn't run the tank down.
    w.behemoth.y += 90;
    const tank = spawnEnemy(w, 'heavyTank', z.x, z.y);
    tank.def = { ...tank.def, maxSpeed: 0, accel: 0, fireRange: 0 };
    steps(w, Math.ceil((BAR.flight + SALVO.count * SALVO.interval) / SIM_DT) + 10);
    expect(tank.hp).toBeLessThan(tank.def.hp);
    // Never more than the whole volley at the friendly-fire share (a top hit counts as the rear).
    const damage = GUNS.projectile.kind === 'shell' ? GUNS.projectile.damage : 0;
    const rear = tank.def.facing?.rear ?? 1;
    expect(tank.def.hp - tank.hp).toBeLessThanOrEqual(SALVO.count * damage * BARRAGE.friendlyFire * rear + 1e-6);
  });

  it('extraction calls off the volley and clears the zone', () => {
    const w = world();
    const b = w.behemoth;
    battery(w);
    steps(w, Math.ceil(ENEMIES.artillery.aimTime / SIM_DT) + 2);
    expect(w.barrages).toHaveLength(1);
    w.exitX = b.x - 1;
    steps(w, 1);
    expect(w.barrages).toHaveLength(0);
    expect(shells(w)).toHaveLength(0);
  });
});

describe('battery placement', () => {
  it('digs in near a side of the field, on open dry ground', () => {
    const w = world();
    const band = w.terrain.height * SPAWNER.edgeBand;
    for (let i = 0; i < 40; i++) {
      const at = edgeSpot(w, ENEMIES.artillery, w.behemoth.x + 300)!;
      expect(at).not.toBeNull();
      expect(Math.min(at.y, w.terrain.height - at.y)).toBeLessThanOrEqual(band);
    }
  });

  it('a post holding a battery puts it near an edge, ahead of the frame', () => {
    const w = createWorld({ ...OPTS, mix: { artillery: 1 }, threat: 4 });
    openGround(w, 400);
    w.encounter = createEncounter(1, { threat: 4, mix: { artillery: 1 }, postScale: 1, waveScale: 0 }, w.behemoth.x, w.exitX);
    w.frame.left = w.encounter.posts[0]!.x;
    stepEncounter(w, SIM_DT);
    const placed = w.enemies.filter((e) => e.def.id === 'artillery');
    expect(placed.length).toBeGreaterThan(0);
    for (const e of placed) {
      expect(e.x).toBeGreaterThan(frameRight(w.frame));
      expect(Math.min(e.y, w.terrain.height - e.y)).toBeLessThanOrEqual(w.terrain.height * SPAWNER.edgeBand);
    }
  });

  it('never comes in a last-stand wave: fixed units are only ever found dug in', () => {
    expect(mobileMix({ artillery: 3, lightTank: 1, gunEmplacement: 1 })).toEqual({ lightTank: 1 });
  });

  it('the long guns field batteries; a Breach fortress has its own behind the wall', () => {
    const f = MODES.breach.fortress!;
    expect(f.batteries.normal).toBeGreaterThan(0);
    const w = createWorld({ ...OPTS, seed: 3, objective: { mode: 'breach', strength: 'normal' } });
    w.encounter.off = true;
    const wall = w.objective.fortress!.x;
    w.frame.left = wall;
    steps(w, 1);
    const guns = w.enemies.filter((e) => e.def.id === 'artillery');
    expect(guns).toHaveLength(f.batteries.normal);
    for (const g of guns) {
      expect(g.x).toBeGreaterThan(wall);
      expect(g.objective).toBe(false);
    }
  });
});
