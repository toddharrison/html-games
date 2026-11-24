import Phaser from 'phaser';
import type { OilSpill, Pool } from '../sim/entities';
import type { Effects } from './effects';
import { viewX, viewY } from './viewTransform';

/** The pool textures are drawn this many game px across. */
const TEX_SIZE = 24;
/** Seconds a new pool takes to spread to its full size. */
const SPREAD = 0.15;
/** Share of its burn at the end over which a pool fades out. */
const FADE = 0.3;
/** Violet sparks per second off a burning pool. */
const SPARK_RATE = 6;

/**
 * Plasma pools (SPEC §6): a flickering violet puddle on the ground per pool, spreading when it
 * lands and fading as it burns out. Pools don't move, so no interpolation.
 */
export class PoolViews {
  private readonly views = new Map<number, Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {}

  update(pools: readonly Pool[], dt: number, time: number, fx: Effects): void {
    const live = new Set<number>();
    for (const p of pools) {
      live.add(p.id);
      let img = this.views.get(p.id);
      if (!img) {
        // Above the scorch decals, below units and the hull (which drives over it).
        img = this.scene.add.image(viewX(p.x, p.y), viewY(p.x), 'plasma_pool0').setDepth(1.8).setRotation(p.id * 2.399);
        this.views.set(p.id, img);
      }
      const life = p.age / p.pool.duration;
      const size = (2 * p.pool.radius * Math.min(1, p.age / SPREAD + 0.3)) / TEX_SIZE;
      const fade = life > 1 - FADE ? Math.max(0, (1 - life) / FADE) : 1;
      img
        .setTexture(`plasma_pool${Math.floor(time * 9 + p.id) % 2}`)
        .setScale(size)
        .setAlpha(fade * (0.8 + 0.15 * Math.sin(time * 23 + p.id)));
      if (Math.random() < SPARK_RATE * dt * fade) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * p.pool.radius * 0.8;
        fx.plasmaSpark(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
    }
    for (const [id, img] of this.views) {
      if (live.has(id)) continue;
      img.destroy();
      this.views.delete(id);
    }
  }
}

/** Seconds an oil slick takes to spread to its full size. */
const OIL_SPREAD = 0.8;

/** Oil slicks (`sim/spills.ts`): a dark puddle with a sheen per slick, spreading as it leaks out. Gone when it catches (the fire takes over) or soaks away. */
export class OilViews {
  private readonly views = new Map<number, Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {}

  update(spills: readonly OilSpill[]): void {
    const live = new Set<number>();
    for (const s of spills) {
      live.add(s.id);
      let img = this.views.get(s.id);
      if (!img) {
        // On the ground with the scorch marks, under the plasma pools.
        img = this.scene.add
          .image(viewX(s.x, s.y), viewY(s.x), `oil_spill${s.id % 2}`)
          .setDepth(1.7)
          .setRotation(s.id * 2.399)
          .setAlpha(0.85);
        this.views.set(s.id, img);
      }
      img.setScale((2 * s.radius * Math.min(1, s.age / OIL_SPREAD + 0.25)) / TEX_SIZE);
    }
    for (const [id, img] of this.views) {
      if (live.has(id)) continue;
      img.destroy();
      this.views.delete(id);
    }
  }
}
