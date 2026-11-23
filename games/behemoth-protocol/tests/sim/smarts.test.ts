import { afterEach, describe, expect, it } from 'vitest';
import type { SkirmisherDef } from '../../src/content/behaviors';
import { ENEMIES } from '../../src/content/enemies';
import { AI } from '../../src/content/tuning';
import { hitArc } from '../../src/sim/behemoth';
import { holdAhead } from '../../src/sim/ai/holdAhead';
import { arcAt, bestBearing, chargeOffset, fallBack, gunBearing } from '../../src/sim/ai/smarts';
import { skirmisher } from '../../src/sim/ai/skirmisher';
import { spawnEnemy } from '../../src/sim/enemies';
import { angleDiff } from '../../src/sim/math';
import { createWorld, type World } from '../../src/sim/world';

function world(): World {
  const w = createWorld({ seed: 1, frameWidth: 324, fieldRows: 21 });
  w.encounter.off = true;
  return w;
}

/** Lays the main gun on a world bearing. */
function layGun(w: World, bearing: number) {
  const b = w.behemoth;
  b.turrets.find((t) => t.def.id === 'main')!.angle = bearing - b.heading;
}

const smarts = AI.smarts;
afterEach(() => {
  AI.smarts = smarts;
});

describe('enemy smarts', () => {
  it('reads the armor arc a bearing would hit the same way hits do', () => {
    const w = world();
    const b = w.behemoth;
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * 2 * Math.PI - Math.PI + 0.01;
      const fx = Math.cos(t);
      const fy = Math.sin(t);
      expect(arcAt(b, t)).toBe(hitArc(b, fx, fy, b.x + fx * 20, b.y + fy * 20));
    }
  });

  it('a skirmisher works out of the main gun’s line', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 100, b.y);
    const here = Math.atan2(e.y - b.y, e.x - b.x);
    layGun(w, here);
    expect(Math.abs(angleDiff(gunBearing(b), bestBearing(e, w, here)))).toBeGreaterThan(AI.bearing.gunCone * 0.6);
    // With the gun laid elsewhere, it stays where it is.
    layGun(w, here + Math.PI);
    expect(Math.abs(angleDiff(here, bestBearing(e, w, here)))).toBeLessThan(0.3);
  });

  it('goes for worn armor', () => {
    const w = world();
    const b = w.behemoth;
    layGun(w, Math.PI);
    b.armor.left.hp = b.armor.left.max * 0.1;
    const e = spawnEnemy(w, 'lightTank', b.x + 60, b.y - 60);
    const t = bestBearing(e, w, Math.atan2(e.y - b.y, e.x - b.x));
    expect(arcAt(b, t)).toBe('left');
  });

  it('skirmishers spread round the hull instead of bunching', () => {
    const w = world();
    const b = w.behemoth;
    layGun(w, Math.PI);
    const a = spawnEnemy(w, 'lightTank', b.x + 90, b.y + 50);
    spawnEnemy(w, 'lightTank', b.x + 92, b.y + 52);
    const here = Math.atan2(a.y - b.y, a.x - b.x);
    expect(Math.abs(angleDiff(here, bestBearing(a, w, here)))).toBeGreaterThan(AI.bearing.spreadCone * 0.5);
  });

  it('works toward its bearing at its own angular speed; with smarts off it circles as before', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 100, b.y);
    const d = e.def.behavior as SkirmisherDef;
    e.ai.retargetIn = 100;
    const a0 = e.ai.orbitAngle;
    skirmisher(e, d, w, 0.1);
    expect(Math.abs(e.ai.orbitAngle - a0)).toBeLessThanOrEqual(d.orbit.angularSpeed * 0.1 + 1e-9);
    AI.smarts = 0;
    const a1 = e.ai.orbitAngle;
    skirmisher(e, d, w, 0.1);
    expect(e.ai.orbitAngle - a1).toBeCloseTo(e.ai.orbitDir * d.orbit.angularSpeed * 0.1);
  });

  it('a hurt unit falls back, but stays within its own fire range', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 80, b.y);
    const g = { x: b.x + 80, y: b.y, mode: 'pace' as const };
    expect(fallBack(e, w, g)).toBe(g);
    e.hp = e.def.hp * AI.hurt.share * 0.5;
    const back = fallBack(e, w, g);
    expect(back.x).toBeCloseTo(b.x + 80 + ENEMIES.lightTank.behavior.fallBack!);
    const far = fallBack(e, w, { ...g, x: b.x + e.def.fireRange * 0.85 });
    expect(far.x - b.x).toBeCloseTo(e.def.fireRange * AI.hurt.reach);
    // A fixed goal (cover) isn't moved.
    expect(fallBack(e, w, { ...g, mode: 'arrive' })).toEqual({ ...g, mode: 'arrive' });
  });

  it('a hold-ahead unit drifts to the side of its arc in front of the weaker front half', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'heavyTank', b.x + 120, b.y);
    b.armor.frontRight.hp = b.armor.frontRight.max * 0.3;
    for (let i = 0; i < 5; i++) {
      e.ai.retargetIn = 0;
      holdAhead(e, e.def.behavior as never, w, 1 / 60);
      expect(e.ai.orbitDir).toBe(1);
    }
  });

  it('a bomb truck comes in wide of the main gun’s line while it’s still out there', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'bombTruck', b.x + 200, b.y + 20);
    const bearing = Math.atan2(e.y - b.y, e.x - b.x);
    layGun(w, bearing);
    const p = chargeOffset(e, w, b.x, b.y);
    expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeCloseTo(AI.charge.offset);
    // Its new line runs farther from the gun's.
    expect(Math.abs(angleDiff(gunBearing(b), Math.atan2(e.y - p.y, e.x - p.x)))).toBeGreaterThan(Math.abs(angleDiff(gunBearing(b), bearing)));
    // The gun laid elsewhere, or the truck close: straight in.
    layGun(w, bearing + Math.PI);
    expect(chargeOffset(e, w, b.x, b.y)).toEqual({ x: b.x, y: b.y });
    layGun(w, bearing);
    e.x = b.x + AI.charge.until * 0.5;
    e.y = b.y;
    expect(chargeOffset(e, w, b.x, b.y)).toEqual({ x: b.x, y: b.y });
  });
});
