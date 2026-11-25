import Phaser from 'phaser';
import type { FlameLayer } from './flameLayer';
import { hex, PAL } from './palette';
import type { StatusEmitter } from './statusFx';
import { viewAngle, viewX, viewY } from './viewTransform';

/**
 * Chunky particle effects: explosions, muzzle flashes, debris, dust, smoke. Render-only.
 * Public methods take sim coordinates and map them to the view. Anything that burns (a fireball,
 * a blast's flash of flame, a burning part) goes to the flame layer (`flameLayer.ts`), so all fire
 * in the game is the same stuff; particles are for what flies: sparks, debris, dust, embers.
 */

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

const FIRE_RAMP = [0xffffff, 0xfff0b0, 0xffb347, 0xe0602a, 0x8a2e1c, 0x2a2220];

/**
 * The EMP pulse's look (`empRing`): milliseconds for the front to cross its reach, and for the
 * wash and the glowing edge to fade after it; forks of ground lightning; and the depth of what
 * lies on the ground (over decals and pools, under the units).
 */
const EMP_FX = { sweep: 420, linger: 800, forks: 10, groundDepth: 2.2 };

export class Effects implements StatusEmitter {
  private readonly fire: Emitter;
  private readonly smoke: Emitter;
  private readonly debris: Emitter;
  private readonly sparkBurst: Emitter;
  private readonly dust: Emitter;
  private readonly leaves: Emitter;
  private readonly trail: Emitter;
  private readonly spray: Emitter;
  private readonly plasma: Emitter;
  private readonly blackSmoke: Emitter;
  private readonly embers: Emitter;
  private readonly arcs: Emitter;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly flames: FlameLayer,
  ) {
    // Burning fragments thrown out of a blast: small, fast, gone quickly. The fireball itself is the flame layer's.
    this.fire = scene.add
      .particles(0, 0, 'px2', {
        emitting: false,
        lifespan: { min: 160, max: 420 },
        speed: { min: 30, max: 110 },
        scale: { start: 1, end: 0.5 },
        color: FIRE_RAMP,
        colorEase: 'quad.out',
      })
      .setDepth(7.1);
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

  /** Glowing bits carried up off a fire (up the screen, as the flames rise), wandering as they go. */
  private makeEmbers(): Emitter {
    return this.scene.add
      .particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 500, max: 1300 },
        speed: { min: 12, max: 38 },
        angle: { min: -125, max: -55 },
        accelerationX: { min: -30, max: 30 },
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
    this.flames.burst(x, y, Math.max(3, radius * 0.42), 0.16 + radius * 0.004);
    [x, y] = [viewX(x, y), viewY(x)];
    const k = radius / 18;
    this.fire.explode(Math.round(7 * k), x, y);
    this.debris.explode(Math.round(10 * k), x, y);
    this.smoke.explode(Math.round(6 * k), x, y);
    this.sparkBurst.explode(8, x, y);
    this.ring(x, y, radius);
  }

  bigExplosion(x: number, y: number): void {
    this.flames.burst(x, y, 11, 0.3);
    [x, y] = [viewX(x, y), viewY(x)];
    this.fire.explode(12, x, y);
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
    this.flames.burst(x, y, radius * 0.45, 1.1);
    this.fire.explode(60, vx, vy);
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
        // View → sim: x = -view y, y = view x.
        this.flames.burst(-ey, ex, 7 + Math.random() * 6, 0.35);
        this.fire.explode(8, ex, ey);
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

  /** Trees burnt or blasted down to a clearing: a last flare, cinders, and smoke. */
  forestBurnt(x: number, y: number): void {
    this.flames.burst(x, y, 5, 0.25);
    [x, y] = [viewX(x, y), viewY(x)];
    this.leaves.explode(5, x, y);
    this.embers.explode(4, x, y);
    this.smoke.explode(2, x, y);
  }

  /**
   * A magazine cook-off venting through blowout panels: a jet of flame and smoke straight up out
   * of the deck (seen from above, a tall fire burst), with sparks.
   */
  vent(x: number, y: number): void {
    const [sx, sy] = [x, y];
    this.flames.burst(sx, sy, 9, 0.5);
    [x, y] = [viewX(x, y), viewY(x)];
    this.fire.explode(20, x, y);
    this.smoke.explode(16, x, y);
    this.sparkBurst.explode(16, x, y);
    this.scene.time.delayedCall(120, () => {
      this.flames.burst(sx, sy, 7, 0.4);
      this.fire.explode(10, x, y);
    });
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
    if (heavy) this.flames.burst(simX, simY, 3.5, 0.12);
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
    this.flame(x, y);
    [x, y] = [viewX(x, y), viewY(x)];
    this.plasma.explode(3, x, y);
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

  /**
   * A burning component: a lick of flame where it sits (called many times a second while it burns).
   * `hot`: the blue flame of an enemy's projector, where it plays on the hull.
   */
  flame(x: number, y: number, hot = false): void {
    this.flames.spot(x, y, 1.3 + Math.random() * 1.3, 190 + Math.random() * 65, hot);
    this.flames.spot(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, 1 + Math.random(), 150 + Math.random() * 80, hot);
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

  /** A fireball (a thermobaric or incendiary burst, fuel going up): a rolling ball of flame over the whole blast, then smoke. */
  fireball(x: number, y: number, radius: number): void {
    this.flames.burst(x, y, radius * 0.8, 0.55);
    [x, y] = [viewX(x, y), viewY(x)];
    this.fire.explode(8 + Math.round(radius * 0.4), x, y);
    this.debris.explode(4, x, y);
    this.sparkBurst.explode(8, x, y);
    this.embers.explode(6 + Math.round(radius * 0.3), x, y);
    const flash = this.scene.add.circle(x, y, radius, hex(PAL.ember), 0.35).setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3);
    this.scene.tweens.add({ targets: flash, scale: 1, alpha: 0, duration: 320, ease: 'quad.out', onComplete: () => flash.destroy() });
  }

  /** A crackle of electricity: a unit knocked out by an EMP. */
  arc(x: number, y: number): void {
    [x, y] = [viewX(x, y), viewY(x)];
    this.arcs.explode(2 + Math.floor(Math.random() * 3), x, y);
  }

  /**
   * An EMP pulse rolling out over the ground from (x, y) to `radius` (user's call, Nov 2026: the
   * old thin ring was easy to miss). A charged wash floods the whole reach under the units, a
   * bright wavefront rolls out with two echoes behind it, forks of lightning crawl out along the
   * ground, sparks jump along the front as it passes, and the edge of its reach is left glowing
   * for a moment, so where it got to is plain.
   */
  empRing(x: number, y: number, radius: number): void {
    const [cx, cy] = [viewX(x, y), viewY(x)];
    const { scene } = this;
    const ADD = Phaser.BlendModes.ADD;
    const { sweep, linger } = EMP_FX;

    // The wash: on the ground, under the units, spreading with the front and fading after it.
    const wash = scene.add.circle(cx, cy, radius, hex(PAL.glow), 0.36).setDepth(EMP_FX.groundDepth).setBlendMode(ADD).setScale(0.05);
    scene.tweens.add({ targets: wash, scale: 1, duration: sweep, ease: 'quad.out' });
    scene.tweens.add({ targets: wash, alpha: 0, duration: linger, delay: sweep * 0.6, ease: 'quad.in', onComplete: () => wash.destroy() });

    // The wavefront, and two echoes following it out.
    for (const [delay, width, color, alpha] of [[0, 5, PAL.white, 1], [70, 3, PAL.glow, 0.95], [150, 2, PAL.glowDim, 0.85]] as const) {
      const ring = scene.add.circle(cx, cy, radius).setStrokeStyle(width, hex(color), alpha).setDepth(7.5).setScale(0.05).setVisible(false);
      scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: sweep, delay, ease: 'quad.out', onStart: () => ring.setVisible(true), onComplete: () => ring.destroy() });
    }
    // The discharge at the emitter.
    const flash = scene.add.circle(cx, cy, radius * 0.3, hex(PAL.glowHot), 0.75).setDepth(7.4).setBlendMode(ADD).setScale(0.3);
    scene.tweens.add({ targets: flash, scale: 1.5, alpha: 0, duration: 260, ease: 'quad.out', onComplete: () => flash.destroy() });

    // Forks of lightning crawling out along the ground, redrawn as they reach farther.
    const forks = scene.add.graphics().setDepth(EMP_FX.groundDepth + 0.1).setBlendMode(ADD);
    const base = Math.random() * Math.PI * 2;
    const drawForks = (reach: number) => {
      forks.clear();
      for (let i = 0; i < EMP_FX.forks; i++) {
        const a = base + ((i + (Math.random() - 0.5) * 0.5) / EMP_FX.forks) * Math.PI * 2;
        const end = radius * reach * (0.75 + 0.25 * Math.random());
        const path: [number, number][] = [];
        for (let r = 6; r <= end; r += 9) {
          const jag = (Math.random() - 0.5) * 9;
          path.push([cx + Math.cos(a) * r - Math.sin(a) * jag, cy + Math.sin(a) * r + Math.cos(a) * jag]);
        }
        if (path.length < 2) continue;
        for (const [width, color, alpha] of [[3, PAL.glowDim, 0.7], [1, PAL.white, 1]] as const) {
          forks.lineStyle(width, hex(color), alpha);
          forks.beginPath();
          forks.moveTo(path[0]![0], path[0]![1]);
          for (const [px, py] of path.slice(1)) forks.lineTo(px, py);
          forks.strokePath();
        }
      }
    };
    [0.4, 0.7, 1, 1].forEach((reach, i) => scene.time.delayedCall((i * sweep) / 4, () => forks.active && drawForks(reach)));
    scene.tweens.add({ targets: forks, alpha: 0, duration: 240, delay: sweep, ease: 'quad.in', onComplete: () => forks.destroy() });

    // Sparks jumping along the front as it passes.
    for (const f of [0.35, 0.7, 1]) {
      scene.time.delayedCall(sweep * f * 0.8, () => {
        const r = radius * f;
        const n = Math.max(6, Math.round(r / 5));
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          this.arcs.explode(2, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
      });
    }

    // Its reach, left glowing on the ground: a broken ring that flickers out.
    const edge = scene.add.graphics().setDepth(EMP_FX.groundDepth + 0.05).setBlendMode(ADD).setAlpha(0);
    const dashes = Math.max(12, Math.round(radius / 4));
    edge.lineStyle(2, hex(PAL.glow), 0.9);
    for (let i = 0; i < dashes; i++) {
      const a0 = (i / dashes) * Math.PI * 2;
      edge.beginPath();
      edge.arc(cx, cy, radius, a0, a0 + (Math.PI * 2 * 0.6) / dashes);
      edge.strokePath();
    }
    scene.tweens.add({ targets: edge, alpha: 1, duration: 60, delay: sweep * 0.8 });
    scene.tweens.add({ targets: edge, alpha: 0, duration: linger, delay: sweep * 0.8 + 120, ease: 'bounce.in', onComplete: () => edge.destroy() });
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
