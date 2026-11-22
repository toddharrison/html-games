import { describe, expect, it } from 'vitest';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { TERRAIN_GEN } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import { footprint, hullBox, hullWidth } from '../../src/sim/behemoth';
import { resolveBehemothCollisions } from '../../src/sim/collision';
import { spawnEnemy } from '../../src/sim/enemies';
import { boxBounds, closestInBox, distanceToBox, orientedBox, pointInBox, rectIntersectsBox } from '../../src/sim/math';
import { stepProjectiles } from '../../src/sim/projectiles';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, type World } from '../../src/sim/world';

const TS = TERRAIN_GEN.tileSize;

function world(): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16 });
  w.encounter.off = true;
  for (let c = 0; c < 80; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
  return w;
}

/** The hull turned hard to its right (sim +y), as far as steering takes it. */
function turned(w: World, angle = 0.7): World {
  w.behemoth.heading = angle;
  return w;
}

/** A point on the hull's own axes (u along, v across), in the world. */
function onHull(w: World, u: number, v: number): { x: number; y: number } {
  const b = w.behemoth;
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  return { x: b.x + u * c - v * s, y: b.y + u * s + v * c };
}

describe('oriented boxes', () => {
  const box = orientedBox(10, 20, 8, 4, Math.PI / 2);

  it('tests points, distances, and the nearest point in the box’s own frame', () => {
    // Turned a quarter: long along +y.
    expect(pointInBox(box, 10, 27)).toBe(true);
    expect(pointInBox(box, 17, 20)).toBe(false);
    expect(pointInBox(box, 15, 20, 2)).toBe(true);
    expect(distanceToBox(box, 10, 31)).toBeCloseTo(3);
    expect(distanceToBox(box, 10, 20)).toBe(0);
    const at = closestInBox(box, 20, 20);
    expect(at.x).toBeCloseTo(14);
    expect(at.y).toBeCloseTo(20);
  });

  it('bounds hold the turned box, and rects overlap only where it really reaches', () => {
    const b = boxBounds(orientedBox(0, 0, 10, 2, Math.PI / 4));
    expect(b.x1).toBeCloseTo((12 * Math.SQRT2) / 2);
    const diag = orientedBox(0, 0, 10, 2, Math.PI / 4);
    // In the bounds' corner, off the diagonal: no overlap.
    expect(rectIntersectsBox(diag, { x0: 5, y0: -7, x1: 7, y1: -5 })).toBe(false);
    // On the diagonal: overlap.
    expect(rectIntersectsBox(diag, { x0: 4, y0: 4, x1: 6, y1: 6 })).toBe(true);
    // Edges that only touch don't count.
    expect(rectIntersectsBox(orientedBox(0, 0, 5, 5, 0), { x0: 5, y0: -1, x1: 6, y1: 1 })).toBe(false);
  });
});

describe('the Behemoth’s hit box follows its heading', () => {
  it('the box is the hull turned to its heading, and the footprint holds it', () => {
    const w = turned(world());
    const b = w.behemoth;
    const box = hullBox(b);
    expect(box.hl).toBe(b.chassis.length / 2);
    expect(box.hw).toBe(hullWidth(b) / 2);
    const fp = footprint(b);
    const nose = onHull(w, b.chassis.length / 2, 0);
    expect(nose.x).toBeLessThanOrEqual(fp.x1 + 1e-9);
    expect(nose.y).toBeLessThanOrEqual(fp.y1 + 1e-9);
    // Turned, the bounds are deeper across the field than the hull is wide.
    expect(fp.y1 - fp.y0).toBeGreaterThan(hullWidth(b));
  });

  it('a round past the turned hull’s corner misses; one on its nose-corner hits', () => {
    const shoot = (x: number, y: number) => {
      const w = turned(world());
      const before = w.behemoth.armor.frontLeft.hp + w.behemoth.armor.frontRight.hp + w.behemoth.armor.left.hp + w.behemoth.armor.right.hp;
      // An enemy round passing straight down the field at that point.
      spawnProjectile(w, 'enemy', WEAPONS.lightTankGun, x, y - 2, Math.PI / 2, {});
      for (let i = 0; i < 4; i++) stepProjectiles(w, 1 / 60);
      const b = w.behemoth;
      const after = b.armor.frontLeft.hp + b.armor.frontRight.hp + b.armor.left.hp + b.armor.right.hp;
      return after < before || w.events.some((e) => e.type === 'behemothHit');
    };
    const w = turned(world());
    const b = w.behemoth;
    const hl = b.chassis.length / 2;
    const hw = hullWidth(b) / 2;
    // Where the unturned box's front-left corner was: now open ground beside the turned hull.
    const oldCorner = { x: b.x + hl - 2, y: b.y - hw + 2 };
    expect(pointInBox(hullBox(b), oldCorner.x, oldCorner.y)).toBe(false);
    expect(shoot(oldCorner.x, oldCorner.y)).toBe(false);
    // The turned hull's own nose corner, beyond the unturned box.
    const nose = onHull(w, hl - 2, hw - 2);
    expect(nose.y).toBeGreaterThan(b.y + hw);
    expect(shoot(nose.x, nose.y)).toBe(true);
  });

  it('crushes what the turned hull covers, and leaves what only the unturned box would have', () => {
    const w = turned(world());
    const b = w.behemoth;
    const hl = b.chassis.length / 2;
    const hw = hullWidth(b) / 2;
    const tileAt = (p: { x: number; y: number }) => [Math.floor(p.x / TS), Math.floor(p.y / TS)] as const;
    const put = (p: { x: number; y: number }, mat: MaterialId) => {
      const [c, r] = tileAt(p);
      Object.assign(w.terrain.tile(c, r)!, { mat, state: 'intact', hp: MATERIALS[mat].maxHp });
      return [c, r] as const;
    };
    const covered = put(onHull(w, hl - 3, hw - 3), 'forest');
    const missed = put({ x: b.x + hl - 3, y: b.y - hw + 3 }, 'forest');
    resolveBehemothCollisions(w, 1 / 60, 0);
    expect(w.terrain.tile(...covered)!.state).toBe('flattened');
    expect(w.terrain.tile(...missed)!.state).toBe('intact');
  });

  it('runs over a squad under its turned nose, not one beside it', () => {
    const w = turned(world());
    const b = w.behemoth;
    const hl = b.chassis.length / 2;
    const hw = hullWidth(b) / 2;
    const p = onHull(w, hl - 2, hw - 2);
    const under = spawnEnemy(w, 'infantry', p.x, p.y);
    const beside = spawnEnemy(w, 'infantry', b.x + hl - 2, b.y - hw - 1);
    resolveBehemothCollisions(w, 1 / 60, 0);
    expect(under.alive).toBe(false);
    expect(beside.alive).toBe(true);
  });
});
