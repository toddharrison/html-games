import Phaser from 'phaser';
import type { Enemy, Projectile } from '../sim/entities';
import { pose, type Interp } from './interp';
import { ENEMY_ART, INFANTRY } from './placeholder';
import { viewAngle, viewX, viewY } from './viewTransform';

/** Sprites for enemies and projectiles, kept in sync with sim entities by id. */

class EnemyView {
  readonly body: Phaser.GameObjects.Image;
  /** Null for infantry, whose whole squad turns to face the target. */
  readonly turret: Phaser.GameObjects.Image | null;
  /** Aim telegraph: glows at the muzzle while the unit lines up a shot. */
  private readonly glint: Phaser.GameObjects.Image;
  /** Last sim heading, so the wreck can be oriented after the entity is gone. */
  heading: number;
  private static readonly HIDE_SECONDS = 0.5;
  private static readonly REVEAL_SECONDS = 0.12;
  private lastHp: number;
  private flash = 0;
  /** 0 = hidden in the trees, 1 = fully visible; fades between the two. */
  private visibility: number;
  private wasHidden: boolean;

  constructor(scene: Phaser.Scene, e: Enemy) {
    const art = ENEMY_ART[e.def.id];
    this.body = scene.add.image(0, 0, art.body).setDepth(3);
    this.turret = art.turret ? scene.add.image(0, 0, art.turret.key).setOrigin(art.turret.pivotX / art.turret.w, 0.5).setDepth(3.1) : null;
    this.glint = scene.add.image(0, 0, 'glint').setDepth(6.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.heading = e.heading;
    this.lastHp = e.hp;
    this.visibility = e.hidden ? 0 : 1;
    this.wasHidden = e.hidden;
  }

  update(e: Enemy, ip: Interp, dt: number): void {
    const at = pose(ip, e, e.turret);
    const x = viewX(at.x, at.y);
    const y = viewY(at.x);
    this.heading = e.heading;
    if (this.turret) {
      this.body.setPosition(x, y).setRotation(viewAngle(at.heading));
      this.turret.setPosition(x, y).setRotation(viewAngle(at.turret));
    } else if (e.def.mobility !== 'foot') {
      // An unarmed vehicle (convoy): just the hull.
      this.body.setPosition(x, y).setRotation(viewAngle(at.heading));
    } else {
      // A squad thins out as it takes casualties.
      const left = Math.max(1, Math.ceil((e.hp / e.def.hp) * INFANTRY.soldiers));
      this.body.setTexture(`inf_${left}`).setPosition(x, y).setRotation(viewAngle(at.turret));
    }
    // Telegraph: the glint grows and brightens as the shot approaches.
    if (e.windup > 0 && e.weapon) {
      const progress = 1 - e.windup / e.def.aimTime;
      const mx = at.x + Math.cos(at.turret) * e.weapon.muzzle;
      const my = at.y + Math.sin(at.turret) * e.weapon.muzzle;
      this.glint
        .setPosition(viewX(mx, my), viewY(mx))
        .setScale(progress < 0.5 ? 1 : 2)
        .setAlpha(0.5 + 0.5 * progress)
        .setVisible(true);
    } else {
      this.glint.setVisible(false);
    }
    // Being hit or spotted flashes white.
    if (e.hp < this.lastHp || (this.wasHidden && !e.hidden)) this.flash = 0.06;
    this.lastHp = e.hp;
    this.wasHidden = e.hidden;
    this.flash = Math.max(0, this.flash - dt);
    // Concealed units melt into the trees, and pop out quickly when spotted.
    const fade = e.hidden ? -dt / EnemyView.HIDE_SECONDS : dt / EnemyView.REVEAL_SECONDS;
    this.visibility = Phaser.Math.Clamp(this.visibility + fade, 0, 1);
    for (const img of this.turret ? [this.body, this.turret] : [this.body]) {
      if (this.flash > 0) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      img.setAlpha(this.visibility).setVisible(this.visibility > 0);
    }
  }

  destroy(): void {
    this.body.destroy();
    this.turret?.destroy();
    this.glint.destroy();
  }
}

function roundTexture(p: Projectile): string {
  // An armor-piercing round from a main gun reads as a shell, not a bullet; canister pellets are bullets.
  if (p.kind === 'bullet') return p.weapon.size === 'L' && !(p.weapon.projectile.kind === 'bullet' && p.weapon.projectile.pellets) ? 'shell' : 'bullet';
  if (p.kind === 'missile') return p.owner === 'player' ? 'missile' : 'emissile';
  if (p.kind === 'shell' && p.weapon.projectile.kind === 'shell' && p.weapon.projectile.pool) return 'plasma';
  return p.owner === 'player' ? 'shell' : 'eshell';
}

export class UnitViews {
  private readonly enemies = new Map<number, EnemyView>();
  private readonly shells = new Map<number, Phaser.GameObjects.Image>();
  private readonly decals: { img: Phaser.GameObjects.Image; simX: number }[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /** @param cullBehind sim x behind which decals are dropped. */
  update(enemies: readonly Enemy[], projectiles: readonly Projectile[], ip: Interp, dt: number, cullBehind: number): void {
    const liveE = new Set<number>();
    for (const e of enemies) {
      if (!e.alive) continue;
      liveE.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        v = new EnemyView(this.scene, e);
        this.enemies.set(e.id, v);
      }
      v.update(e, ip, dt);
    }
    for (const [id, v] of this.enemies) {
      if (!liveE.has(id)) {
        v.destroy();
        this.enemies.delete(id);
      }
    }

    const liveP = new Set<number>();
    for (const p of projectiles) {
      if (!p.alive) continue;
      liveP.add(p.id);
      let img = this.shells.get(p.id);
      if (!img) {
        img = this.scene.add.image(0, 0, roundTexture(p)).setDepth(6);
        this.shells.set(p.id, img);
      }
      const at = pose(ip, p);
      img.setPosition(viewX(at.x, at.y), viewY(at.x)).setRotation(viewAngle(Math.atan2(p.vy, p.vx)));
      // Lobbed shells swell toward the top of their arc, so they read as flying over things.
      const spec = p.weapon.projectile;
      if (spec.kind === 'shell' && spec.lobbed) img.setScale(1 + 1.2 * Math.sin(Math.PI * Math.min(1, p.traveled / Math.max(1, p.fuse))));
    }
    for (const [id, img] of this.shells) {
      if (!liveP.has(id)) {
        img.destroy();
        this.shells.delete(id);
      }
    }

    // Wrecks and scorch marks scroll away and are dropped once well off-screen.
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]!;
      if (d.simX < cullBehind) {
        d.img.destroy();
        this.decals.splice(i, 1);
      }
    }
  }

  /** Ground decal at a sim position; `heading` is a sim angle. */
  addDecal(key: string, x: number, y: number, heading: number, depth: number, scale = 1): void {
    const img = this.scene.add.image(viewX(x, y), viewY(x), key).setRotation(viewAngle(heading)).setDepth(depth).setScale(scale);
    this.decals.push({ img, simX: x });
  }

  /** Sim heading of an enemy whose view still exists (for orienting its wreck). */
  enemyHeading(id: number): number {
    return this.enemies.get(id)?.heading ?? 0;
  }
}
