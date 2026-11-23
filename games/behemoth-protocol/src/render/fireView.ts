import Phaser from 'phaser';
import type { Enemy, TileFire } from '../sim/entities';
import type { Effects } from './effects';
import type { Interp } from './interp';
import { pose } from './interp';
import { hex, PAL } from './palette';
import { viewX, viewY } from './viewTransform';

/** Flames a second off a burning tile, and smoke puffs and embers. */
const TILE_FLAMES = 9;
const TILE_SMOKE = 1.2;
const TILE_EMBERS = 1.5;
/** Flames a second off a burning unit. */
const UNIT_FLAMES = 14;
/** Crackles a second off a unit knocked out by an EMP. */
const STUN_ARCS = 8;

/** Whether a rate-per-second event happens this frame. */
const chance = (rate: number, dt: number) => Math.random() < rate * dt;

/**
 * Fire and EMP status on the field (SPEC §6): burning tiles flicker with an orange glow and throw
 * flames, smoke, and embers until they're down; burning units lick with flame; units knocked out by
 * an EMP crackle blue. Hidden units give nothing away. Render-only: everything comes from sim state.
 */
export class FireView {
  private readonly glow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    // Over the ground and its scorch marks, under the units and the hull.
    this.glow = scene.add.graphics().setDepth(1.9).setBlendMode(Phaser.BlendModes.ADD);
  }

  update(fires: ReadonlyMap<number, TileFire>, enemies: readonly Enemy[], tileSize: number, ip: Interp, dt: number, time: number, fx: Effects): void {
    this.glow.clear();
    for (const f of fires.values()) {
      const x0 = f.col * tileSize;
      const y0 = f.row * tileSize;
      // A tile's glow swells as it catches, then flickers.
      const grow = Math.min(1, f.age / 0.6);
      const flicker = 0.18 + 0.08 * Math.sin(time * 17 + f.col * 3.1 + f.row * 1.7);
      this.glow.fillStyle(hex(PAL.ember), flicker * grow);
      this.glow.fillRect(viewX(x0, y0), viewY(x0 + tileSize), tileSize, tileSize);
      const at = () => [x0 + Math.random() * tileSize, y0 + Math.random() * tileSize] as const;
      if (chance(TILE_FLAMES * grow, dt)) fx.flame(...at());
      if (chance(TILE_SMOKE, dt)) fx.heavySmoke(...at());
      if (chance(TILE_EMBERS, dt)) fx.ember(...at());
    }
    for (const e of enemies) {
      if (!e.alive || e.hidden || (!e.burn && !e.stunned)) continue;
      const p = pose(ip, e);
      const r = e.def.radius;
      const near = () => [p.x + (Math.random() - 0.5) * r * 1.4, p.y + (Math.random() - 0.5) * r * 1.4] as const;
      if (e.burn && chance(UNIT_FLAMES, dt)) fx.flame(...near());
      if (e.stunned && chance(STUN_ARCS, dt)) fx.arc(...near());
    }
  }
}
