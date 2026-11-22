import Phaser from 'phaser';
import type { BehemothState, TrailerState } from '../sim/behemoth';
import type { Mine } from '../sim/entities';
import { pose, type Interp, type Pose } from './interp';
import { BH, TR } from './placeholder';
import { viewAngle, viewX, viewY } from './viewTransform';

const FLASH_SECONDS = 0.06;
const SHAKE_SECONDS = 0.12;

/**
 * The towed trailer, from component sprites like the hull (SPEC §11.2): tread pods, the bed, the
 * tow bar, and a module (or an empty bay) per bay. Wrecked modules char. Once jettisoned it lies
 * where the mine is, its warning light blinking faster as it's about to go; once it blows (or is
 * wrecked in tow) it's gone, and the scene leaves a burnt-out bed behind.
 */
export class TrailerView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Image;
  private readonly treads: Phaser.GameObjects.Sprite[];
  private readonly modules: (Phaser.GameObjects.Image | null)[];
  private readonly light: Phaser.GameObjects.Image;
  /** The mine it became, once jettisoned. */
  private mineId: number | null = null;
  private gone = false;
  private flash = 0;
  private shake = 0;
  private treadDist = 0;
  private last: { x: number; y: number } | null = null;
  private lastHeading = 0;

  constructor(scene: Phaser.Scene, t: TrailerState) {
    this.treads = [-1, 1].map((side) => scene.add.sprite(0, side * TR.treadOffset, 'tr_tread', 0).setFlipY(side > 0));
    this.body = scene.add.image(0, 0, 'tr_body');
    this.bar = scene.add.image(t.def.length / 2 + TR.bar.w / 2 - 1, 0, 'tr_bar');
    this.modules = t.bays.map((bay, i) => {
      const at = t.def.bays[i]!;
      return scene.add.image(at.x, at.y, bay ? `tr_${bay.def.id}` : 'tr_empty');
    });
    this.light = scene.add.image(-t.def.length / 2 + 3, 0, 'tr_light').setVisible(false);
    this.root = scene.add.container(viewX(t.x, t.y), viewY(t.x), [
      ...this.treads,
      this.bar,
      this.body,
      ...this.modules.filter((m): m is Phaser.GameObjects.Image => m !== null),
      this.light,
    ]);
  }

  /** A hit on the trailer: it flashes and jolts. */
  onHit(): void {
    this.flash = FLASH_SECONDS;
    this.shake = SHAKE_SECONDS;
  }

  /** Cut loose: from now on it's drawn where mine `id` lies. */
  onJettison(id: number): void {
    this.mineId = id;
    this.bar.setVisible(false);
  }

  /** Blown (in tow or as a mine): nothing left to draw. */
  onGone(): void {
    this.gone = true;
    this.root.setVisible(false);
  }

  /** The mine this view stands for, if it was jettisoned. */
  get mine(): number | null {
    return this.mineId;
  }

  update(b: BehemothState, mines: readonly Mine[], ip: Interp, dt: number, time: number): void {
    const t = b.trailer;
    if (!t || this.gone) return;
    let at: Pose;
    let mine: Mine | undefined;
    if (this.mineId !== null) {
      mine = mines.find((m) => m.id === this.mineId);
      if (!mine) return;
      at = pose(ip, mine);
    } else {
      at = pose(ip, t);
    }
    this.flash = Math.max(0, this.flash - dt);
    this.shake = Math.max(0, this.shake - dt);
    const jolt = this.shake > 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    this.root.setPosition(viewX(at.x, at.y) + jolt, viewY(at.x)).setRotation(viewAngle(at.heading));
    this.lastHeading = at.heading;

    // Tread links roll with the ground covered.
    if (this.last) this.treadDist += Math.hypot(at.x - this.last.x, at.y - this.last.y);
    this.last = { x: at.x, y: at.y };
    const frame = Math.floor(this.treadDist) % BH.tread.frames;
    for (const tr of this.treads) tr.setFrame(frame);

    t.bays.forEach((bay, i) => {
      const img = this.modules[i];
      if (!img || !bay) return;
      const key = `tr_${bay.def.id}`;
      const want = bay.integrity.hp > 0 || this.mineId !== null ? key : `${key}_stub`;
      if (img.texture.key !== want) img.setTexture(want);
    });

    for (const img of [this.body, ...this.treads, ...this.modules]) {
      if (!img) continue;
      if (this.flash > 0) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }

    // A jettisoned trailer blinks: slowly while it's arming, fast once it's set off.
    if (mine) {
      const rate = mine.fuse !== null ? 16 : mine.arm > 0 ? 2 : 5;
      this.light.setVisible(Math.floor(time * rate) % 2 === 0);
    }
  }

  /** The heading it was last drawn at (sim radians), for the wreck decal. */
  get heading(): number {
    return this.lastHeading;
  }
}
