import Phaser from 'phaser';
import type { TrainState, TrainVehicle } from '../sim/train';
import type { Terrain } from '../sim/terrain';
import { ENEMY_ART } from './placeholder';
import { viewAngle, viewX, viewY } from './viewTransform';

/**
 * What an armored train (SPEC §7.3) leaves that isn't a unit any more: the wrecks of vehicles
 * destroyed, piled up, or scuttled, where they lie. Its live vehicles are ordinary units (`UnitViews`). Also its mine flingers' mines on their
 * way (SPEC-armored-train.md §T6): arcing over in the air, then lying blinking until they're live.
 */
export class TrainView {
  private readonly hulks = new Map<number, Phaser.GameObjects.Image>();
  private readonly mines: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  update(train: TrainState | null, terrain: Terrain): void {
    if (!train) return;
    this.drawMines(train);
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
        // A wreck lies on the ground under the units.
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

  private drawMines(train: TrainState): void {
    while (this.mines.length < train.flung.length) this.mines.push(this.scene.add.image(0, 0, 'flung_mine').setDepth(6));
    this.mines.forEach((img, i) => {
      const m = train.flung[i];
      if (!m) {
        img.setVisible(false);
        return;
      }
      const k = Math.min(1, m.t / m.flight);
      const x = m.x0 + (m.x - m.x0) * k;
      const y = m.y0 + (m.y - m.y0) * k;
      // Swelling toward the top of its arc, like a lobbed shell; on the ground it blinks till it's live.
      const lying = m.t >= m.flight;
      img
        .setVisible(!lying || Math.floor(m.t * 8) % 2 === 0)
        .setPosition(viewX(x, y), viewY(x))
        .setScale(lying ? 1 : 1 + 1.4 * Math.sin(Math.PI * k))
        .setDepth(lying ? 2.5 : 6);
    });
  }

  destroy(): void {
    for (const img of this.hulks.values()) img.destroy();
    this.hulks.clear();
    for (const img of this.mines) img.destroy();
    this.mines.length = 0;
  }
}
