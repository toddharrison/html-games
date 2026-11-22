import Phaser from 'phaser';
import { hex, PAL } from './palette';
import type { BattleLayout } from '../config';
import type { Enemy } from '../sim/entities';
import { frameRight, type FrameState } from '../sim/frame';

/**
 * Edge arrows for enemies outside the visible frame (SPEC §10 threat indicators). Each arrow sits
 * on the battlefield edge the enemy is beyond, level with it and pointing toward it: the top or
 * bottom edge for units ahead or behind, the left or right edge for units coming in across the
 * field's sides (last stand). Arrows get bolder as the enemy gets closer. Hidden units get none.
 */
export class ThreatIndicators {
  private readonly pool: Phaser.GameObjects.Image[] = [];

  /** Arrows fade in from this distance beyond the frame edge (world units). */
  private static readonly RANGE = 260;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: BattleLayout,
  ) {}

  update(enemies: readonly Enemy[], frame: FrameState, time: number): void {
    const { fieldX, fieldW, height } = this.layout;
    const ahead = frameRight(frame);
    let n = 0;
    for (const e of enemies) {
      // Concealed units give no warning (SPEC §4.5).
      if (!e.alive || e.hidden) continue;
      const fwd = e.x > ahead ? e.x - ahead : 0;
      const behind = e.x < frame.left ? frame.left - e.x : 0;
      const leftOf = e.y < 0 ? -e.y : 0;
      const rightOf = e.y > fieldW ? e.y - fieldW : 0;
      const beyond = Math.max(fwd, behind, leftOf, rightOf);
      // A battle mode's targets (SPEC §4.4) are always marked, however far off, in amber.
      if (beyond <= 0 || (beyond > ThreatIndicators.RANGE && !e.objective)) continue;
      const img = this.arrow(n++);
      if (e.objective) img.setTint(hex(PAL.amber)).setTintMode(Phaser.TintModes.FILL);
      else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      if (fwd > 0 || behind > 0) {
        const x = Phaser.Math.Clamp(fieldX + Math.round(e.y), fieldX + 5, fieldX + fieldW - 5);
        img.setPosition(x, fwd > 0 ? 3 : height - 3).setRotation(fwd > 0 ? 0 : Math.PI);
      } else {
        // The frame's trailing edge is at the bottom of the screen.
        const y = Phaser.Math.Clamp(height - Math.round(e.x - frame.left), 5, height - 5);
        img.setPosition(leftOf > 0 ? fieldX + 3 : fieldX + fieldW - 3, y).setRotation(leftOf > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      // Pulse, and fade with distance so the nearest threats stand out.
      const near = Math.max(e.objective ? 0.5 : 0, 1 - beyond / ThreatIndicators.RANGE);
      const pulse = 0.75 + 0.25 * Math.sin(time * 8 + e.id);
      img.setAlpha((0.35 + 0.65 * near) * pulse).setVisible(true);
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i]!.setVisible(false);
  }

  private arrow(i: number): Phaser.GameObjects.Image {
    let img = this.pool[i];
    if (!img) {
      img = this.scene.add.image(0, 0, 'threat').setScrollFactor(0).setDepth(90);
      this.pool[i] = img;
    }
    return img;
  }
}
