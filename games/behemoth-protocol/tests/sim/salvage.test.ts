import { describe, expect, it } from 'vitest';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { CONCEALMENT, TERRAIN_GEN } from '../../src/content/tuning';
import { IDLE_COMMAND, revealRadius } from '../../src/sim/behemoth';
import { stepConcealment } from '../../src/sim/concealment';
import { destroyEnemy, spawnEnemy } from '../../src/sim/enemies';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const TS = TERRAIN_GEN.tileSize;

function world(): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16 });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 80; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
  return w;
}

function put(w: World, col: number, row: number, mat: MaterialId): void {
  Object.assign(w.terrain.tile(col, row)!, { mat, state: 'intact', hp: MATERIALS[mat].maxHp });
}

describe('salvage pickups', () => {
  it('a kill banks its salvage and says where it came from', () => {
    const w = world();
    const e = spawnEnemy(w, 'heavyTank', w.behemoth.x + 120, w.behemoth.y);
    const before = w.stats.salvage;
    destroyEnemy(w, e, 'shot');
    expect(w.stats.salvage - before).toBe(e.def.salvage);
    expect(w.events.find((ev) => ev.type === 'salvage')).toMatchObject({ x: e.x, y: e.y, amount: e.def.salvage, source: 'unit' });
  });

  it('bunkers, walls, fuel tanks, and tank traps pay when knocked down, from their tile', () => {
    for (const mat of ['bunker', 'wall', 'fuelTank', 'tankTrap'] as const) expect(MATERIALS[mat].salvage ?? 0).toBeGreaterThan(0);
    expect(MATERIALS.bunker.salvage!).toBeGreaterThan(MATERIALS.building.salvage!);
    const w = world();
    const col = Math.floor((w.behemoth.x + 150) / TS);
    const row = 3;
    put(w, col, row, 'bunker');
    w.terrain.damage(col, row, 1e6, w.events);
    stepWorld(w, { ...IDLE_COMMAND });
    const ev = w.events.find((e) => e.type === 'salvage' && e.source === 'tile');
    expect(ev).toMatchObject({ x: (col + 0.5) * TS, y: (row + 0.5) * TS, amount: MATERIALS.bunker.salvage });
  });
});

describe('mine sweep', () => {
  it('sweeps mines a little past the reveal radius, even on Gen 1 sensors', () => {
    expect(CONCEALMENT.mineSweep).toBeCloseTo(1.15);
    const w = world();
    const b = w.behemoth;
    const r = revealRadius(b);
    // One just past the reveal radius (inside the sweep), one past the sweep.
    const near = Math.floor((b.x + r * 1.08) / TS);
    const far = Math.floor((b.x + r * 1.3) / TS);
    const row = Math.floor(b.y / TS);
    put(w, near, row, 'mine');
    put(w, far, row, 'mine');
    stepConcealment(w, 1 / 60);
    expect(w.terrain.tile(near, row)!.seen).toBe(true);
    expect(w.terrain.tile(far, row)!.seen).toBeFalsy();
  });
});
