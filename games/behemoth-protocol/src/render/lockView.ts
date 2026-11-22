import Phaser from 'phaser';
import type { BehemothState } from '../sim/behemoth';
import type { Enemy } from '../sim/entities';
import { pose, type Interp } from './interp';
import { hex, PAL } from './palette';
import { viewX, viewY } from './viewTransform';

/** Corner brackets on the hull: how far out they start and where they close to (world units from its center). */
const BRACKET_FROM = 26;
const BRACKET_TO = 12;
const BRACKET_ARM = 4;

/**
 * Lock-on telegraphs (SPEC §7 heavy weapons team, fairness: a big attack gets a long, clear tell).
 * While a team paints the hull: a flickering designator beam from its launcher to the Behemoth, a
 * pulsing ring on the team so it can be found and shot, and corner brackets on the hull closing in
 * as the lock completes, blinking fast at the end. Drawn above the night veil (the crew sees the
 * designator in the dark). The beam and brackets go when the lock breaks or the missile is away.
 */
export class LockViews {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(6.3);
  }

  update(enemies: readonly Enemy[], b: BehemothState, ip: Interp, time: number): void {
    const g = this.g;
    g.clear();
    if (b.destroyed) return;
    const hull = pose(ip, b);
    const hx = viewX(hull.x, hull.y);
    const hy = viewY(hull.x);
    const red = hex(PAL.bad);
    for (const e of enemies) {
      if (!e.alive || e.hidden || !e.def.lockOn || e.windup <= 0 || !e.weapon) continue;
      const progress = Phaser.Math.Clamp(1 - e.windup / e.def.aimTime, 0, 1);
      const at = pose(ip, e, e.turret);
      const mx = at.x + Math.cos(at.turret) * e.weapon.muzzle;
      const my = at.y + Math.sin(at.turret) * e.weapon.muzzle;
      const sx = viewX(mx, my);
      const sy = viewY(mx);
      // Flickers faster as the lock firms up; solid for the last moment.
      const rate = 8 + 22 * progress;
      const on = progress > 0.85 || Math.sin(time * rate + e.id) > -0.4;

      if (on) {
        g.lineStyle(1, red, 0.3 + 0.5 * progress);
        g.lineBetween(sx, sy, hx, hy);
      }
      // The team: a ring around it, pulsing.
      g.lineStyle(1, red, 0.6 + 0.4 * Math.sin(time * 10));
      g.strokeCircle(viewX(at.x, at.y), viewY(at.x), 7 + Math.sin(time * 10) * 1.2);

      // The hull: brackets closing in, blinking hard in the last quarter.
      const blink = progress < 0.75 || Math.floor(time * 14) % 2 === 0;
      if (!blink) continue;
      const r = BRACKET_FROM + (BRACKET_TO - BRACKET_FROM) * progress;
      g.lineStyle(1, red, 0.7 + 0.3 * progress);
      for (const [cx, cy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const x = hx + cx * r;
        const y = hy + cy * r;
        g.lineBetween(x, y, x - cx * BRACKET_ARM, y);
        g.lineBetween(x, y, x, y - cy * BRACKET_ARM);
      }
    }
  }
}
