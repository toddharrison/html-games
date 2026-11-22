import { describe, expect, it } from 'vitest';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { WEAPONS } from '../../src/content/weapons';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { findCover } from '../../src/sim/ai/ambusher';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { coverProtection, damageEnemy, shotSpec } from '../../src/sim/projectiles';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/** Infantry cover (SPEC §4.5): forests protect a little, garrisoned buildings a lot. */

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

function world(): World {
  const w = createWorld(OPTS);
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function setTile(w: World, col: number, row: number, mat: MaterialId): void {
  const t = w.terrain.tile(col, row)!;
  t.mat = mat;
  t.state = 'intact';
  t.hp = MATERIALS[mat].maxHp;
}

/** A tile a little ahead of the Behemoth and off to one side (the start zone is clear ground). */
function spot(w: World, ahead: number, side: number): { col: number; row: number; x: number; y: number } {
  const ts = w.terrain.tileSize;
  const b = w.behemoth;
  const col = Math.floor((b.x + ahead) / ts);
  const row = Math.floor((b.y + side) / ts);
  return { col, row, x: (col + 0.5) * ts, y: (row + 0.5) * ts };
}

function parked(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, 'infantry', x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0 };
  e.vx = 0;
  return e;
}

describe('cover protection', () => {
  it('buildings protect troops better than forest, and the open not at all', () => {
    const w = world();
    const open = spot(w, 60, -60);
    const wood = spot(w, 60, 0);
    const house = spot(w, 60, 60);
    setTile(w, wood.col, wood.row, 'forest');
    setTile(w, house.col, house.row, 'building');
    const hp = (at: { x: number; y: number }) => {
      const e = parked(w, at.x, at.y);
      damageEnemy(w, e, shotSpec(WEAPONS.autocannon), 4, 'splash');
      return e.def.hp - e.hp;
    };
    const inOpen = hp(open);
    const inWood = hp(wood);
    const inHouse = hp(house);
    expect(inWood).toBeLessThan(inOpen);
    expect(inHouse).toBeLessThan(inWood);
    expect(inHouse).toBeCloseTo(inOpen * (1 - MATERIALS.building.protection.intact));
  });

  it('only troops on foot use cover', () => {
    const w = world();
    const wood = spot(w, 60, 0);
    setTile(w, wood.col, wood.row, 'forest');
    const tank = spawnEnemy(w, 'lightTank', wood.x, wood.y);
    expect(coverProtection(w, tank)).toBe(0);
    expect(coverProtection(w, parked(w, wood.x, wood.y))).toBeGreaterThan(0);
  });

  it('troops can walk into buildings; tanks cannot', () => {
    const w = world();
    const house = spot(w, 60, 40);
    setTile(w, house.col, house.row, 'building');
    expect(w.terrain.speedAt(house.x, house.y, 'foot')).toBeGreaterThan(0);
    expect(w.terrain.speedAt(house.x, house.y, 'tracked')).toBe(0);
    expect(w.terrain.isCover(house.col, house.row)).toBe(true);
    expect(w.terrain.concealsAt(house.x, house.y)).toBe(true);
  });
});

describe('garrisoned buildings', () => {
  it('walls stop direct fire aimed at the garrison, damaging the building instead', () => {
    const w = world();
    const b = w.behemoth;
    const house = spot(w, 80, 0);
    setTile(w, house.col, house.row, 'building');
    const e = parked(w, house.x, house.y);
    e.def = { ...e.def, fireRange: 0 };
    spawnProjectile(w, 'player', WEAPONS.autocannon, b.x + 30, house.y, 0);
    for (let i = 0; i < 60; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y });
    expect(e.hp).toBe(e.def.hp);
    expect(w.terrain.tile(house.col, house.row)!.hp).toBeLessThan(MATERIALS.building.maxHp);
  });

  it('a garrison fires out through its own walls, but not through the next building', () => {
    const w = world();
    const house = spot(w, 90, 0);
    setTile(w, house.col, house.row, 'building');
    const b = w.behemoth;
    expect(w.terrain.lineBlocked(house.x, house.y, b.x, b.y)).toBe(false);

    // The round leaves the building it was fired from.
    const r = spawnProjectile(w, 'enemy', WEAPONS.infantryRockets, house.x, house.y, Math.PI, { shelter: { col: house.col, row: house.row } });
    stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y });
    expect(r.alive).toBe(true);
    expect(w.terrain.tile(house.col, house.row)!.hp).toBe(MATERIALS.building.maxHp);

    // A second building between it and the Behemoth blocks the shot.
    setTile(w, house.col - 1, house.row, 'building');
    expect(w.terrain.lineBlocked(house.x, house.y, b.x, b.y)).toBe(true);
  });

  it('squads prefer a building to equally placed trees, if it has a window toward the Behemoth', () => {
    const w = world();
    const ts = w.terrain.tileSize;
    const wood = spot(w, 60, -50);
    const house = spot(w, 60, 50);
    setTile(w, wood.col, wood.row, 'forest');
    setTile(w, house.col, house.row, 'building');
    const e = parked(w, (wood.x + house.x) / 2, (wood.y + house.y) / 2);
    const pick = findCover(e, w)!;
    expect(Math.floor(pick.y / ts)).toBe(house.row);

    // Walled in on the sides facing the hull (behind and toward its path): nothing to shoot at.
    const toward = Math.sign(w.behemoth.y - house.y);
    setTile(w, house.col - 1, house.row, 'building');
    setTile(w, house.col, house.row + toward, 'building');
    const again = findCover(e, w)!;
    expect(Math.floor(again.y / ts)).not.toBe(house.row);
  });
});

describe('building salvage', () => {
  it('pays salvage when the player knocks a building down, once', () => {
    const w = world();
    const house = spot(w, 120, 60);
    setTile(w, house.col, house.row, 'building');
    const before = w.stats.salvage;
    w.terrain.damage(house.col, house.row, 1000, w.events);
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    expect(w.stats.salvage - before).toBe(MATERIALS.building.salvage);
    // Grinding the rubble flat pays nothing more.
    w.terrain.crush(house.col, house.row, w.events);
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    expect(w.stats.salvage - before).toBe(MATERIALS.building.salvage);
  });

  it('pays for buildings crushed under the treads, but not for ones enemy fire knocks down', () => {
    const w = world();
    const a = spot(w, 120, 60);
    const c = spot(w, 120, -60);
    setTile(w, a.col, a.row, 'building');
    setTile(w, c.col, c.row, 'building');
    w.terrain.crush(a.col, a.row, w.events);
    w.terrain.damage(c.col, c.row, 1000, w.events, false);
    expect(w.terrain.takeSalvage()).toBe(MATERIALS.building.salvage);
    expect(w.terrain.tile(c.col, c.row)!.state).toBe('destroyed');
  });

  it('pays nothing for trees', () => {
    const w = world();
    const wood = spot(w, 120, 60);
    setTile(w, wood.col, wood.row, 'forest');
    w.terrain.damage(wood.col, wood.row, 1000, w.events);
    expect(w.terrain.takeSalvage()).toBe(0);
  });
});
