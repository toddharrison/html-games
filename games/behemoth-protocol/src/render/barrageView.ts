import Phaser from 'phaser';
import type { Barrage } from '../sim/entities';
import { hex, PAL } from './palette';
import { viewX, viewY } from './viewTransform';

/** Dashes around a zone's ring. */
const DASHES = 12;
/** Ring turn rate (rad/s), so it reads as live rather than painted on. */
const SPIN = 0.8;

/**
 * Artillery target zones (SPEC §7 fairness: big attacks get long, loud telegraphs). A dashed red
 * ring on the ground where a battery's volley is coming down, with a disc that closes in from the
 * ring as the shells fall, so the timing reads, and blinks faster in the last half-second. The
 * rings are drawn over the hull and just above the night veil (the crew can always see where the
 * shells will land); the zone's faint fill goes under the hull, so it doesn't tint the machine.
 * Zones don't move, so no interpolation.
 */
export class BarrageViews {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly fill: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(5.9);
    this.fill = scene.add.graphics().setDepth(4.4);
  }

  update(zones: readonly Barrage[], time: number): void {
    const g = this.g;
    g.clear();
    this.fill.clear();
    for (const z of zones) {
      const x = viewX(z.x, z.y);
      const y = viewY(z.x);
      const left = z.lands - time;
      const progress = Phaser.Math.Clamp((time - z.from) / Math.max(0.01, z.lands - z.from), 0, 1);
      // Blinks faster as the first round nears; steady while the volley lands.
      const blink = left > 0.5 ? 0.75 + 0.25 * Math.sin(time * 12) : left > 0 ? (Math.floor(time * 16) % 2 === 0 ? 1 : 0.45) : 1;
      this.fill.fillStyle(hex(PAL.enemy), 0.12 + 0.15 * progress);
      this.fill.fillCircle(x, y, z.radius);
      g.lineStyle(1, hex(PAL.enemyHi), 0.55 * blink);
      g.strokeCircle(x, y, z.radius * Math.max(0.08, 1 - progress));
      g.lineStyle(2, hex(PAL.enemyHi), 0.9 * blink);
      const turn = time * SPIN;
      for (let i = 0; i < DASHES; i++) {
        const a = turn + (i / DASHES) * Math.PI * 2;
        g.beginPath();
        g.arc(x, y, z.radius, a, a + (Math.PI / DASHES) * 0.9);
        g.strokePath();
      }
      // Crosshair ticks at the center.
      g.lineStyle(1, hex(PAL.amber), 0.8 * blink);
      g.lineBetween(x - 4, y, x + 4, y);
      g.lineBetween(x, y - 4, x, y + 4);
    }
  }

  destroy(): void {
    this.g.destroy();
    this.fill.destroy();
  }
}
