import Phaser from 'phaser';
import { hex, PAL } from './palette';
import type { StatusEmitter } from './statusFx';
import { viewAngle, viewX, viewY } from './viewTransform';

/**
 * Chunky particle effects: explosions, muzzle flashes, debris, dust, smoke. Render-only.
 * Public methods take sim coordinates and map them to the view.
 */

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

const FIRE_RAMP = [0xffffff, 0xfff0b0, 0xffb347, 0xe0602a, 0x8a2e1c, 0x2a2220];

export class Effects implements StatusEmitter {
  private readonly fire: Emitter;
  private readonly smoke: Emitter;
  private readonly debris: Emitter;
  private readonly sparkBurst: Emitter;
  private readonly dust: Emitter;
  private readonly leaves: Emitter;
  private readonly trail: Emitter;
  private readonly flames: Emitter;
  private readonly spray: Emitter;
  private readonly plasma: Emitter;
  private readonly blackSmoke: Emitter;
  private readonly embers: Emitter;
  private readonly arcs: Emitter;

  constructor(private readonly scene: Phaser.Scene) {
    this.fire = scene.add
      .particles(0, 0, 'px3', {
        emitting: false,
        lifespan: { min: 220, max: 520 },
        speed: { min: 10, max: 70 },
        scale: { start: 1.6, end: 0.3 },
        color: FIRE_RAMP,
        colorEase: 'quad.out',
      })
      .setDepth(7);
    this.smoke = scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        lifespan: { min: 700, max: 1500 },
        speed: { min: 3, max: 16 },
        scale: { start: 0.8, end: 2 },
        alpha: { start: 0.55, end: 0 },
        tint: [0x3a3632, 0x4a4540, 0x2c2a27],
        accelerationY: 4,
      })
      .setDepth(8);
    this.debris = scene.add
      .particles(0, 0, 'px2', {
        emitting: false,
        lifespan: { min: 250, max: 600 },
        speed: { min: 30, max: 110 },
        scale: { start: 1, end: 0.5 },
        tint: [hex(PAL.rubbleDark), hex(PAL.steelDark), hex(PAL.outline), hex(PAL.rubble)],
      })
      .setDepth(7);
    this.sparkBurst = scene.add
      .particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 80, max: 220 },
        speed: { min: 40, max: 140 },
        color: [0xffffff, 0xffe080, 0xff8030],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7);
    this.dust = scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        lifespan: { min: 400, max: 900 },
        speed: { min: 5, max: 30 },
        scale: { start: 0.6, end: 1.6 },
        alpha: { start: 0.5, end: 0 },
        tint: [hex(PAL.dirt), hex(PAL.rubble), 0x8a7d60],
      })
      .setDepth(6.5);
    this.leaves = scene.add
      .particles(0, 0, 'px2', {
        emitting: false,
        lifespan: { min: 250, max: 600 },
        speed: { min: 15, max: 60 },
        tint: [hex(PAL.canopy), hex(PAL.canopyLight), hex(PAL.trunk)],
      })
      .setDepth(6.5);
    this.trail = scene.add
      .particles(0, 0, 'px2', {
        emitting: false,
        lifespan: { min: 250, max: 450 },
        speed: { min: 0, max: 6 },
        scale: { start: 1, end: 0.5 },
        alpha: { start: 0.7, end: 0 },
        color: [0xfff0b0, 0x8a8478, 0x4a4540],
      })
      .setDepth(5.5);
    // Small licking flames on a burning component: short-lived, slow, rising off the hull.
    this.flames = scene.add
      .particles(0, 0, 'px2', {
        emitting: false,
        lifespan: { min: 120, max: 300 },
        speed: { min: 2, max: 12 },
        scale: { start: 1.2, end: 0.3 },
        color: [0xfff0b0, 0xffb347, 0xe0602a, 0x8a2e1c],
        colorEase: 'quad.out',
      })
      .setDepth(7);
    // Water thrown up by shells and churned by treads.
    this.spray = scene.add
      .particles(0, 0, 'px2', {
        emitting: false,
        lifespan: { min: 200, max: 500 },
        speed: { min: 10, max: 50 },
        scale: { start: 1.2, end: 0.4 },
        alpha: { start: 0.9, end: 0 },
        tint: [hex(PAL.foam), 0xffffff, hex(PAL.waterLight)],
      })
      .setDepth(6.5);
    // Plasma: violet droplets and sparks, from splashing globs and burning pools.
    this.plasma = scene.add
      .particles(0, 0, 'px2', {
        emitting: false,
        lifespan: { min: 150, max: 420 },
        speed: { min: 8, max: 60 },
        scale: { start: 1.1, end: 0.3 },
        color: [hex(PAL.plasmaHot), hex(PAL.plasma), hex(PAL.plasmaDim)],
        colorEase: 'quad.out',
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7);
    // Electric crackle off a unit knocked out by an EMP: quick blue-white sparks.
    this.arcs = scene.add
      .particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 60, max: 180 },
        speed: { min: 15, max: 70 },
        color: [hex(PAL.glowHot), hex(PAL.glow), hex(PAL.glowDim)],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7.5);
    this.blackSmoke = this.makeBlackSmoke();
    this.embers = this.makeEmbers();
  }

  /** Thick black smoke from a badly damaged part: bigger, darker, slower to clear than `smoke`. */
  private makeBlackSmoke(): Emitter {
    return this.scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        lifespan: { min: 1100, max: 2200 },
        speed: { min: 2, max: 10 },
        scale: { start: 1, end: 2.8 },
        alpha: { start: 0.7, end: 0 },
        tint: [0x1c1a18, 0x24211e, 0x302c28],
        accelerationY: 6,
      })
      .setDepth(8.1);
  }

  /** Glowing bits drifting up off a fire. */
  private makeEmbers(): Emitter {
    return this.scene.add
      .particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 400, max: 900 },
        speed: { min: 6, max: 22 },
        alpha: { start: 1, end: 0 },
        color: [0xfff0b0, 0xffb347, 0xe0602a],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(8.2);
  }

  /** A shell or blast landing in water: a fountain of spray, no fireball. */
  splash(x: number, y: number, radius: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.spray.explode(Math.round(10 * Math.max(1, radius / 18)), x, y);
  }

  /** The treads churning through a river. */
  wake(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.spray.explode(2, x, y);
  }

  explosion(x: number, y: number, radius: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    const k = radius / 18;
    this.fire.explode(Math.round(18 * k), x, y);
    this.debris.explode(Math.round(10 * k), x, y);
    this.smoke.explode(Math.round(6 * k), x, y);
    this.sparkBurst.explode(8, x, y);
    this.ring(x, y, radius);
  }

  bigExplosion(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.fire.explode(30, x, y);
    this.debris.explode(18, x, y);
    this.smoke.explode(10, x, y);
    this.sparkBurst.explode(14, x, y);
    this.ring(x, y, 22);
  }

  /**
   * Reactor detonation: the single biggest effect in the game (SPEC §11.3). A shockwave ring out
   * to the blast radius, a chunky fireball, debris, and chained cook-offs across the blast zone.
   */
  detonation(x: number, y: number, radius: number): void {
    const vx = viewX(x, y);
    const vy = viewY(x);
    this.fire.explode(120, vx, vy);
    this.debris.explode(60, vx, vy);
    this.smoke.explode(30, vx, vy);
    this.sparkBurst.explode(40, vx, vy);
    this.shockwave(vx, vy, radius);

    // Secondary explosions: ammo and weapons cooking off near the hull, then fires across the zone.
    for (let i = 0; i < 14; i++) {
      this.scene.time.delayedCall(80 + i * 70 + Math.random() * 60, () => {
        const a = Math.random() * Math.PI * 2;
        const d = (i < 5 ? 0.15 : 0.6) * radius * Math.random();
        const ex = vx + Math.cos(a) * d;
        const ey = vy + Math.sin(a) * d;
        this.fire.explode(20, ex, ey);
        this.smoke.explode(5, ex, ey);
        this.ring(ex, ey, 10 + Math.random() * 10);
      });
    }
  }

  impact(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.sparkBurst.explode(5, x, y);
    this.dust.explode(1, x, y);
  }

  /**
   * A direct hit on a vehicle's flank or rear (SPEC §7): a hot flash and a spray of sparks on top
   * of the usual impact, bigger from behind, so players learn where the thin armor is.
   */
  weakSpot(x: number, y: number, rear: boolean): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.sparkBurst.explode(rear ? 12 : 6, x, y);
    if (!rear) return;
    this.fire.explode(3, x, y);
    const flash = this.scene.add.image(x, y, 'flash').setRotation(Math.random() * Math.PI * 2).setDepth(7.5).setScale(0.5);
    flash.setTint(hex(PAL.glowHot)).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.time.delayedCall(50, () => flash.destroy());
  }

  muzzle(x: number, y: number, angle: number, big: boolean): void {
    [x, y] = [viewX(x, y), viewY(x)];
    angle = viewAngle(angle);
    const flash = this.scene.add.image(x, y, 'flash').setRotation(angle).setDepth(7).setScale(big ? 1.4 : 0.6);
    this.scene.time.delayedCall(big ? 70 : 40, () => flash.destroy());
    if (big) {
      this.smoke.explode(4, x + Math.cos(angle) * 4, y + Math.sin(angle) * 4);
      this.sparkBurst.explode(4, x, y);
    }
  }

  buildingCollapse(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.dust.explode(8, x, y);
    this.debris.explode(10, x, y);
  }

  forestFlattened(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.leaves.explode(4, x, y);
  }

  forestBurnt(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.leaves.explode(5, x, y);
    this.fire.explode(4, x, y);
    this.smoke.explode(2, x, y);
  }

  /**
   * A magazine cook-off venting through blowout panels: a jet of flame and smoke straight up out
   * of the deck (seen from above, a tall fire burst), with sparks.
   */
  vent(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.fire.explode(45, x, y);
    this.smoke.explode(16, x, y);
    this.sparkBurst.explode(16, x, y);
    this.scene.time.delayedCall(120, () => this.fire.explode(25, x, y));
    this.scene.time.delayedCall(260, () => this.smoke.explode(10, x, y));
  }

  /** Armor grinding along rock. */
  scrape(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.sparkBurst.explode(3, x, y);
    if (Math.random() < 0.4) this.dust.explode(1, x, y);
  }

  plow(x: number, y: number, heavy: boolean): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.dust.explode(heavy ? 10 : 5, x, y);
    this.debris.explode(heavy ? 12 : 6, x, y);
  }

  /** Point-defense laser: a brief bright line from the emitter to the round it shot at. */
  beam(x0: number, y0: number, x1: number, y1: number, hit: boolean): void {
    const line = this.scene.add
      .line(0, 0, viewX(x0, y0), viewY(x0), viewX(x1, y1), viewY(x1), hex(PAL.glowHot))
      .setOrigin(0, 0)
      .setLineWidth(1)
      .setDepth(7.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.time.delayedCall(60, () => line.destroy());
    if (hit) {
      this.sparkBurst.explode(6, viewX(x1, y1), viewY(x1));
      this.fire.explode(3, viewX(x1, y1), viewY(x1));
    }
  }

  /** Where a laser strikes (sim coordinates): sparks, and a lick of fire from a heavy one. */
  laserSpark(simX: number, simY: number, sparks: number, heavy: boolean): void {
    const [x, y] = [viewX(simX, simY), viewY(simX)];
    this.sparkBurst.explode(sparks, x, y);
    if (heavy) this.fire.explode(4, x, y);
  }

  /** A plasma glob splashing: violet droplets and a quick ring. */
  plasmaBurst(x: number, y: number, radius: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.plasma.explode(10 + Math.round(radius), x, y);
    const ring = this.scene.add.circle(x, y, radius * 0.4).setStrokeStyle(1, hex(PAL.plasmaHot), 0.9).setDepth(7);
    this.scene.tweens.add({ targets: ring, scale: 2.5, alpha: 0, duration: 200, onComplete: () => ring.destroy() });
  }

  /** A spark off a burning plasma pool. */
  plasmaSpark(x: number, y: number): void {
    this.plasma.emitParticleAt(viewX(x, y), viewY(x));
  }

  /** Plasma eating at the treads or the trailer where they're over a pool. */
  plasmaBurn(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.plasma.explode(3, x, y);
    this.flames.explode(2, x, y);
  }

  /** Exhaust behind a flying missile. */
  missileTrail(x: number, y: number): void {
    this.trail.emitParticleAt(viewX(x, y), viewY(x));
  }

  /**
   * A round striking the Behemoth: sparks and chips of plating, more the harder it hits; a heavy
   * hit throws a puff of smoke too.
   */
  hullHit(x: number, y: number, damage: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.sparkBurst.explode(Math.min(16, 5 + Math.round(damage * 0.8)), x, y);
    this.debris.explode(Math.min(8, 1 + Math.round(damage / 3)), x, y);
    if (damage >= 8) this.smoke.explode(1, x, y);
    this.dust.explode(1, x, y);
  }

  /** A damaged component shorting out. */
  sparks(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.sparkBurst.explode(3 + Math.floor(Math.random() * 4), x, y);
  }

  /** A burning component. */
  flame(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.flames.explode(3, x, y);
  }

  /**
   * A railgun or coilgun slug (sim coordinates): a straight streak from the muzzle to where it
   * stopped, a hot core in a blue halo, fading; sparks and chips at each unit and wall it went through.
   */
  railStreak(x0: number, y0: number, x1: number, y1: number, heavy: boolean, hits: readonly { x: number; y: number }[]): void {
    const line = (width: number, color: string, alpha: number) =>
      this.scene.add
        .line(0, 0, viewX(x0, y0), viewY(x0), viewX(x1, y1), viewY(x1), hex(color), alpha)
        .setOrigin(0, 0)
        .setLineWidth(width)
        .setDepth(7.5)
        .setBlendMode(Phaser.BlendModes.ADD);
    const lines = heavy ? [line(4, PAL.glowDim, 0.6), line(2, PAL.glow, 0.9), line(1, PAL.white, 1)] : [line(2, PAL.glowDim, 0.5), line(1, PAL.glowHot, 1)];
    this.scene.tweens.add({ targets: lines, alpha: 0, duration: heavy ? 380 : 180, ease: 'quad.in', onComplete: () => lines.forEach((l) => l.destroy()) });
    for (const h of hits) {
      const [x, y] = [viewX(h.x, h.y), viewY(h.x)];
      this.sparkBurst.explode(heavy ? 8 : 3, x, y);
      if (heavy) this.debris.explode(4, x, y);
    }
  }

  /**
   * Lightning through `points` (sim coordinates, muzzle first): a jagged bolt between each pair, a
   * white core in a cyan glow, redrawn once mid-flash for flicker; a crackle at each strike.
   */
  lightning(points: readonly { x: number; y: number }[], heavy: boolean, hit: boolean): void {
    const g = this.scene.add.graphics().setDepth(7.5).setBlendMode(Phaser.BlendModes.ADD);
    const draw = () => {
      g.clear();
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(2, Math.round(len / 8));
        const path: [number, number][] = [];
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const jag = k === 0 || k === n ? 0 : (Math.random() - 0.5) * (heavy ? 7 : 4);
          // Sideways off the line by `jag`.
          const x = a.x + (b.x - a.x) * t - ((b.y - a.y) / (len || 1)) * jag;
          const y = a.y + (b.y - a.y) * t + ((b.x - a.x) / (len || 1)) * jag;
          path.push([viewX(x, y), viewY(x)]);
        }
        for (const [width, color, alpha] of heavy ? ([[3, PAL.glowDim, 0.7], [1, PAL.white, 1]] as const) : ([[1, PAL.glow, 1]] as const)) {
          g.lineStyle(width, hex(color), alpha);
          g.beginPath();
          g.moveTo(path[0]![0], path[0]![1]);
          for (const [x, y] of path.slice(1)) g.lineTo(x, y);
          g.strokePath();
        }
      }
    };
    draw();
    this.scene.time.delayedCall(60, draw);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: heavy ? 220 : 120, delay: 60, ease: 'quad.in', onComplete: () => g.destroy() });
    if (!hit) return;
    for (const p of points.slice(1)) this.arcs.explode(heavy ? 6 : 2, viewX(p.x, p.y), viewY(p.x));
  }

  /** A thermobaric fireball (sim coordinates): a rolling ball of flame, then black smoke. */
  fireball(x: number, y: number, radius: number): void {
    this.explosion(x, y, radius * 0.6);
    [x, y] = [viewX(x, y), viewY(x)];
    this.fire.explode(14 + Math.round(radius), x, y);
    this.flames.explode(10, x, y);
    const ring = this.scene.add.circle(x, y, radius, hex(PAL.ember), 0.35).setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 320, ease: 'quad.out', onComplete: () => ring.destroy() });
    this.scene.time.delayedCall(200, () => this.blackSmoke.explode(4, x, y));
  }

  /** A crackle of electricity: a unit knocked out by an EMP. */
  arc(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.arcs.explode(2 + Math.floor(Math.random() * 3), x, y);
  }

  /**
   * A lick of flame from a flamethrower's nozzle (sim coordinates): fire scattered down the cone,
   * thin at the nozzle and widening, bigger and redder toward the far end.
   */
  flameJet(x: number, y: number, angle: number, reach: number, cone: number): void {
    for (let i = 0; i < 6; i++) {
      const t = Math.sqrt(Math.random());
      const d = t * reach;
      const a = angle + (Math.random() * 2 - 1) * cone * t;
      const [px, py] = [x + Math.cos(a) * d, y + Math.sin(a) * d];
      if (t < 0.6) this.flames.explode(1, viewX(px, py), viewY(px));
      else this.fire.explode(1, viewX(px, py), viewY(px));
    }
  }

  /** An EMP pulse rolling out from (x, y) to `radius`: a fast ring and a pale flash. */
  empRing(x: number, y: number, radius: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    const ring = this.scene.add.circle(x, y, radius).setStrokeStyle(2, hex(PAL.glow), 0.9).setDepth(7.5).setScale(0.1);
    const flash = this.scene.add.circle(x, y, radius, hex(PAL.glowHot), 0.18).setDepth(7.4).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 380, ease: 'quad.out', onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: flash, scale: 1, alpha: 0, duration: 260, ease: 'quad.out', onComplete: () => flash.destroy() });
  }

  /** A badly damaged part pouring black smoke. */
  heavySmoke(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.blackSmoke.explode(1, x, y);
  }

  /** Embers lifting off a fire. */
  ember(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.embers.explode(1 + Math.floor(Math.random() * 2), x, y);
  }

  smokePuff(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.smoke.explode(1, x, y);
  }

  treadDust(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.dust.explode(1, x, y);
  }

  private shockwave(x: number, y: number, radius: number): void {
    const ring = this.scene.add.circle(x, y, radius).setStrokeStyle(3, 0xffffff, 1).setDepth(9).setScale(0.05);
    const core = this.scene.add.circle(x, y, radius * 0.45, 0xfff0b0, 0.9).setDepth(8.5).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0.2, duration: 450, ease: 'quad.out', onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: core, scale: 1.3, alpha: 0, duration: 700, ease: 'quad.out', onComplete: () => core.destroy() });
  }

  private ring(x: number, y: number, radius: number): void {
    const ring = this.scene.add.circle(x, y, radius * 0.4).setStrokeStyle(1, 0xfff0b0, 0.9).setDepth(7);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.5,
      alpha: 0,
      duration: 180,
      onComplete: () => ring.destroy(),
    });
  }
}
