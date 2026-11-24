import Phaser from 'phaser';
import { gunPivot } from '../sim/enemies';
import type { Enemy, EnemyGun, Projectile } from '../sim/entities';
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
  /** Extra turrets (SPEC §7 siege tank), each with its own glint, in `def.turrets` order. */
  private readonly extra: { img: Phaser.GameObjects.Image; glint: Phaser.GameObjects.Image }[];
  /** Last sim heading, so the wreck can be oriented after the entity is gone. */
  heading: number;
  private static readonly HIDE_SECONDS = 0.5;
  private static readonly REVEAL_SECONDS = 0.12;
  private lastHp: number;
  private flash = 0;
  /** Seconds this view has run, for a charging bomb truck's strobe. */
  private clock = 0;
  /** World units walked, for a walker's leg frames. */
  private walked = 0;
  /** 0 = hidden in the trees, 1 = fully visible; fades between the two. */
  private visibility: number;
  private wasHidden: boolean;

  constructor(scene: Phaser.Scene, e: Enemy) {
    const art = ENEMY_ART[e.def.id];
    this.body = scene.add.image(0, 0, art.body).setDepth(3);
    this.turret = art.turret ? scene.add.image(0, 0, art.turret.key).setOrigin(art.turret.pivotX / art.turret.w, 0.5).setDepth(3.1) : null;
    this.glint = scene.add.image(0, 0, 'glint').setDepth(6.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.extra = (art.extra ?? []).map((t) => ({
      img: scene.add.image(0, 0, t.key).setOrigin(t.pivotX / t.w, 0.5).setDepth(3.05),
      glint: scene.add.image(0, 0, 'glint').setDepth(6.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
    }));
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
    // Legs step through their frames as it walks, and hold their pose when it stops.
    const gait = ENEMY_ART[e.def.id].gait;
    if (gait) {
      this.walked += Math.hypot(e.vx, e.vy) * dt;
      this.body.setTexture(gait.frames[Math.floor(this.walked / gait.stride) % gait.frames.length]!);
    }
    const lid = ENEMY_ART[e.def.id].lid;
    if (lid) {
      // A trapdoor: the lid while it's down, the open pit (turned to its target) while it's up.
      const shut = (e.ai.lid ?? 'shut') === 'shut';
      this.body.setTexture(shut ? lid.shut : lid.open).setPosition(x, y).setRotation(shut ? 0 : viewAngle(at.turret));
    } else if (this.turret) {
      this.body.setPosition(x, y).setRotation(viewAngle(at.heading));
      this.turret.setPosition(x, y).setRotation(viewAngle(at.turret));
    } else if (e.def.mobility !== 'foot') {
      // An unarmed vehicle (convoy): just the hull.
      this.body.setPosition(x, y).setRotation(viewAngle(at.heading));
    } else {
      // A squad thins out as it takes casualties.
      const squad = ENEMY_ART[e.def.id].squad ?? { prefix: 'inf_', soldiers: INFANTRY.soldiers };
      const left = Math.max(1, Math.ceil((e.hp / e.def.hp) * squad.soldiers));
      const facing = squad.faceCourse ? at.heading : at.turret;
      this.body.setTexture(`${squad.prefix}${left}`).setPosition(x, y).setRotation(viewAngle(facing));
    }
    // Telegraph: the glint grows and brightens as the shot approaches.
    showGlint(this.glint, e, e.def.aimTime, at.x, at.y, at.turret);
    // Extra turrets ride the hull at their pivots (their angles aren't interpolated).
    e.guns.forEach((g, i) => {
      const v = this.extra[i];
      if (!v) return;
      const p = gunPivot(at, g.def.pivot);
      v.img.setPosition(viewX(p.x, p.y), viewY(p.x)).setRotation(viewAngle(g.turret));
      showGlint(v.glint, g, g.def.aimTime, p.x, p.y, g.turret);
    });
    // Being hit or spotted flashes white.
    if (e.hp < this.lastHp || (this.wasHidden && !e.hidden)) this.flash = 0.06;
    this.lastHp = e.hp;
    this.wasHidden = e.hidden;
    this.flash = Math.max(0, this.flash - dt);
    this.clock += dt;
    // A bomb truck on its run strobes white like a Behemoth on its reactor fuse (SPEC §7.4), faster
    // in the last stretch.
    // A train's vehicle abandoned behind a wreck strobes the same way while its scuttling charge counts down (SPEC §7.3).
    const strobe = (!!e.def.bomb || !!e.train) && !!e.ai.charging && Math.floor(this.clock * (e.ai.close ? 20 : 8)) % 2 === 0;
    // Concealed units melt into the trees, and pop out quickly when spotted.
    const fade = e.hidden ? -dt / EnemyView.HIDE_SECONDS : dt / EnemyView.REVEAL_SECONDS;
    this.visibility = Phaser.Math.Clamp(this.visibility + fade, 0, 1);
    for (const img of [this.body, ...(this.turret ? [this.turret] : []), ...this.extra.map((v) => v.img)]) {
      if (this.flash > 0 || strobe) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      // A train's vehicle in a tunnel is under the ground.
      img.setAlpha(this.visibility).setVisible(this.visibility > 0 && !e.ai.under);
    }
    if (e.ai.under) {
      this.glint.setVisible(false);
      for (const v of this.extra) v.glint.setVisible(false);
    }
  }

  destroy(): void {
    this.body.destroy();
    this.turret?.destroy();
    this.glint.destroy();
    for (const v of this.extra) {
      v.img.destroy();
      v.glint.destroy();
    }
  }
}

/** A gun's aim telegraph at its muzzle: grows and brightens as the shot approaches; hidden otherwise. */
function showGlint(glint: Phaser.GameObjects.Image, g: EnemyGun, aimTime: number, x: number, y: number, turret: number): void {
  if (!(g.windup > 0 && g.weapon)) {
    glint.setVisible(false);
    return;
  }
  const progress = 1 - g.windup / aimTime;
  const mx = x + Math.cos(turret) * g.weapon.muzzle;
  const my = y + Math.sin(turret) * g.weapon.muzzle;
  glint
    .setPosition(viewX(mx, my), viewY(mx))
    .setScale(progress < 0.5 ? 1 : 2)
    .setAlpha(0.5 + 0.5 * progress)
    .setVisible(true);
}

function roundTexture(p: Projectile): string {
  // An armor-piercing round from a main gun reads as a shell, not a bullet; canister pellets are bullets.
  if (p.kind === 'bullet') return p.weapon.size === 'L' && !(p.weapon.projectile.kind === 'bullet' && p.weapon.projectile.pellets) ? 'shell' : 'bullet';
  if (p.kind === 'missile') return p.owner === 'enemy' ? 'emissile' : p.weapon.projectile.kind === 'missile' && p.weapon.projectile.swarm ? 'swarmMissile' : 'missile';
  if (p.kind === 'shell' && p.weapon.projectile.kind === 'shell' && p.weapon.projectile.pool) return 'plasma';
  if (p.kind === 'shell' && p.weapon.projectile.kind === 'shell' && p.weapon.projectile.look) return p.weapon.projectile.look;
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
