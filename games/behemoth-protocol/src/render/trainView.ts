import Phaser from 'phaser';
import type { TrainState, TrainVehicle } from '../sim/train';
import type { Terrain } from '../sim/terrain';
import { ENEMY_ART } from './placeholder';
import { viewAngle, viewX, viewY } from './viewTransform';

/**
 * What an armored train (SPEC §7.3) leaves that isn't a unit any more: the burnt-out hulks it drags
 * along in the chain, and the wrecks of vehicles that left the rails or were scuttled, where they
 * lie. Its live vehicles are ordinary units (`UnitViews`).
 */
export class TrainView {
  private readonly hulks = new Map<number, Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {}

  update(train: TrainState | null, terrain: Terrain): void {
    if (!train) return;
    train.vehicles.forEach((v, i) => {
      const show = !v.alive && v.state !== 'gone' && !this.plowed(v, terrain);
      let img = this.hulks.get(i);
      if (!show) {
        img?.destroy();
        this.hulks.delete(i);
        return;
      }
      if (!img) {
        const key = ENEMY_ART[v.car.enemy].hulk ?? ENEMY_ART[v.car.enemy].body;
        // A wreck lies on the ground under the units; a hulk rides the rails among them.
        img = this.scene.add.image(0, 0, key);
        this.hulks.set(i, img);
      }
      img
        .setDepth(v.state === 'wrecked' ? 2 : 3)
        .setPosition(viewX(v.x, v.y), viewY(v.x))
        .setRotation(viewAngle(v.heading));
    });
  }

  /** A derailed wreck the Behemoth has since driven through: its tile is flat, so nothing stands there. */
  private plowed(v: TrainVehicle, terrain: Terrain): boolean {
    if (v.state !== 'wrecked') return false;
    const t = terrain.tileAt(v.x, v.y);
    return !!t && t.mat === 'wreck' && t.state === 'flattened';
  }

  destroy(): void {
    for (const img of this.hulks.values()) img.destroy();
    this.hulks.clear();
  }
}
