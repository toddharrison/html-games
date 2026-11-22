import Phaser from 'phaser';
import type { Drone } from '../sim/entities';
import type { Effects } from './effects';
import { pose, type Interp } from './interp';
import { viewAngle, viewX, viewY } from './viewTransform';

/** Shadow offset (game px, screen space): the drone flies above whatever it's over. */
const SHADOW = { x: 2, y: 3 };
/** Sparks per second at the pod while a drone is patching it. */
const SPARK_RATE = 8;

/**
 * Repair drones (SPEC §5.1): a small rotor sprite each, with a shadow below, sparking at the tread
 * pod while it works. Views come and go with the sim's drones (launched, docked, lost).
 */
export class DroneViews {
  private readonly views = new Map<number, { body: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image }>();

  constructor(private readonly scene: Phaser.Scene) {}

  update(drones: readonly Drone[], ip: Interp, dt: number, time: number, fx: Effects): void {
    const live = new Set<number>();
    for (const d of drones) {
      if (!d.alive) continue;
      live.add(d.id);
      let v = this.views.get(d.id);
      if (!v) {
        v = {
          shadow: this.scene.add.image(0, 0, 'drone_shadow').setDepth(5.2).setAlpha(0.45),
          body: this.scene.add.sprite(0, 0, 'drone', 0).setDepth(7),
        };
        this.views.set(d.id, v);
      }
      const at = pose(ip, d);
      const x = viewX(at.x, at.y);
      const y = viewY(at.x);
      // Rotors flicker; each drone a little out of step with the others.
      v.body.setPosition(x, y).setRotation(viewAngle(at.heading)).setFrame(Math.floor(time * 24 + d.id) % 2);
      v.shadow.setPosition(Math.round(x + SHADOW.x), Math.round(y + SHADOW.y));
      if (d.working && Math.random() < SPARK_RATE * dt) fx.sparks(at.x + (Math.random() - 0.5) * 6, at.y + (Math.random() - 0.5) * 6);
    }
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      v.body.destroy();
      v.shadow.destroy();
      this.views.delete(id);
    }
  }
}
