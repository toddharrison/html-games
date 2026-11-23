import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies';
import { HEAT, HeatGauge } from '../../src/audio/music/heat';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { frameRight } from '../../src/sim/frame';
import { createWorld, type World } from '../../src/sim/world';

function world(): World {
  const w = createWorld({ seed: 1, frameWidth: 324, fieldRows: 21 });
  w.encounter.off = true;
  w.enemies = [];
  return w;
}

/** A unit on screen, already sighted. */
function onScreen(w: World, id: Parameters<typeof spawnEnemy>[1], ahead = 120): Enemy {
  const e = spawnEnemy(w, id, w.behemoth.x + ahead, w.behemoth.y);
  e.ai.sighted = true;
  return e;
}

const gauge = () => new HeatGauge((id) => id === 'siegeTank');

describe('music heat', () => {
  it('is cold with nothing in view', () => {
    expect(gauge().read(world())).toEqual({ heat: 0, bosses: [], downed: [] });
  });

  it('grows with the threat on screen, up to its share', () => {
    const w = world();
    const g = gauge();
    onScreen(w, 'heavyTank');
    expect(g.read(w).heat).toBeCloseTo((ENEMIES.heavyTank.threat / HEAT.presenceFull) * HEAT.presenceShare);
    for (let i = 0; i < 10; i++) onScreen(w, 'heavyTank', 60 + i * 10);
    expect(g.read(w).heat).toBeCloseTo(HEAT.presenceShare);
  });

  it('ignores the hidden, the unsighted, the dead, and anything off screen', () => {
    const w = world();
    onScreen(w, 'heavyTank').hidden = true;
    onScreen(w, 'heavyTank').alive = false;
    spawnEnemy(w, 'heavyTank', w.behemoth.x + 100, w.behemoth.y); // not yet sighted
    const far = onScreen(w, 'heavyTank');
    far.x = frameRight(w.frame) + 50;
    expect(gauge().read(w).heat).toBe(0);
  });

  it('bumps on hits, enemy fire, losses, and alert waves, then cools off', () => {
    const w = world();
    const g = gauge();
    g.observe([{ type: 'behemothHit', arc: 'top', damage: 10, x: 0, y: 0 }], 0);
    expect(g.read(w).heat).toBeCloseTo(10 * HEAT.hit);
    g.observe(
      [
        { type: 'fire', owner: 'player', weapon: 'heavyCannon', x: 0, y: 0, angle: 0 },
        { type: 'fire', owner: 'enemy', weapon: 'heavyTankGun', x: 0, y: 0, angle: 0 },
        { type: 'alert', wave: 1 },
      ],
      0,
    );
    const hot = g.read(w).heat;
    expect(hot).toBeCloseTo(10 * HEAT.hit + HEAT.incoming + HEAT.alertWave);
    w.time = HEAT.decay;
    expect(g.read(w).heat).toBeCloseTo(hot / Math.E);
  });

  it('caps a single hit and the bumps together', () => {
    const w = world();
    const g = gauge();
    g.observe([{ type: 'behemothHit', arc: 'top', damage: 500, x: 0, y: 0 }], 0);
    expect(g.read(w).heat).toBeCloseTo(HEAT.hitMax);
    g.observe(Array.from({ length: 10 }, () => ({ type: 'componentDestroyed' as const, component: 'treads' })), 0);
    expect(g.read(w).heat).toBeCloseTo(HEAT.bumpMax);
  });

  it('is full in the last stand', () => {
    const w = world();
    w.lastStand = { time: 0, wave: 0, nextWave: 5 };
    expect(gauge().read(w).heat).toBe(1);
  });

  it('keeps a themed big enemy on the field from first sight until it dies, even off screen', () => {
    const w = world();
    const g = gauge();
    const tank = onScreen(w, 'siegeTank');
    onScreen(w, 'heavyTank');
    expect(g.read(w).bosses).toEqual(['siegeTank']);
    tank.x = frameRight(w.frame) + 80; // backed out ahead of the frame
    expect(g.read(w).bosses).toEqual(['siegeTank']);
    tank.alive = false;
    g.observe([{ type: 'enemyDestroyed', id: tank.id, enemy: 'siegeTank', x: 0, y: 0, cause: 'shot' }], 0);
    expect(g.read(w)).toMatchObject({ bosses: [], downed: ['siegeTank'] });
    expect(g.read(w).downed).toEqual([]); // handed over once
  });
});
