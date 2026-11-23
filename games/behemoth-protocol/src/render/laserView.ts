import Phaser from 'phaser';
import type { WeaponDef } from '../content/weapons';
import type { Effects } from './effects';
import { hex, PAL } from './palette';
import { viewX, viewY } from './viewTransform';

/**
 * The Behemoth's lasers (SPEC §6), pinned to their barrels. Each pulse only says how far the beam
 * reached; every frame the beam is redrawn from the mount's muzzle as it's drawn (the interpolated
 * hull and mount) along the barrel, so it pivots and travels with the gun instead of hanging where
 * the pulse fired. The beam laser's pulses come faster than one fades, so it reads as one steady
 * beam that swings smoothly with its mount.
 */

interface Look {
  /** Seconds at full strength after a pulse, then seconds to fade out. */
  hold: number;
  fade: number;
  /** Lines drawn, widest first: width (game px), color, alpha. */
  lines: { width: number; color: string; alpha: number }[];
  /** Sparks where it strikes. */
  sparks: number;
}

const LOOKS: Record<'S' | 'M' | 'L', Look> = {
  S: { hold: 0.02, fade: 0.09, lines: [{ width: 1, color: PAL.glow, alpha: 1 }], sparks: 1 },
  // Held a little past the next pulse (0.1 s apart), so steady fire never flickers out between them.
  M: {
    hold: 0.13,
    fade: 0.08,
    lines: [
      { width: 3, color: PAL.glowHot, alpha: 0.25 },
      { width: 1, color: PAL.glowHot, alpha: 1 },
    ],
    sparks: 1,
  },
  L: {
    hold: 0.04,
    fade: 0.2,
    lines: [
      { width: 3, color: PAL.glow, alpha: 0.7 },
      { width: 1, color: PAL.white, alpha: 1 },
    ],
    sparks: 8,
  },
};

interface Beam {
  look: Look;
  /** How far the last pulse reached, and whether it struck something. */
  len: number;
  hit: boolean;
  /** Seconds since the last pulse. */
  age: number;
}

export class LaserView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly beams = new Map<string, Beam>();

  constructor(
    scene: Phaser.Scene,
    private readonly fx: Effects,
  ) {
    this.g = scene.add.graphics().setDepth(7.5).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** A pulse from `slot`: (x0, y0) to (x1, y1) is where the sim traced it. */
  pulse(slot: string, weapon: WeaponDef, ev: { x0: number; y0: number; x1: number; y1: number; hit: boolean }): void {
    const look = LOOKS[weapon.size ?? 'M'];
    this.beams.set(slot, { look, len: Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0), hit: ev.hit, age: 0 });
    if (ev.hit) this.fx.laserSpark(ev.x1, ev.y1, look.sparks, weapon.size === 'L');
  }

  /** Redraw every live beam from its muzzle as drawn this frame (`muzzle`: null once the mount is gone). */
  update(dt: number, muzzle: (slot: string) => { x: number; y: number; angle: number } | null): void {
    this.g.clear();
    for (const [slot, beam] of this.beams) {
      beam.age += dt;
      const { hold, fade, lines } = beam.look;
      const m = muzzle(slot);
      if (beam.age >= hold + fade || !m) {
        this.beams.delete(slot);
        continue;
      }
      const t = Math.max(0, beam.age - hold) / fade;
      const strength = 1 - t * t;
      const x1 = m.x + Math.cos(m.angle) * beam.len;
      const y1 = m.y + Math.sin(m.angle) * beam.len;
      for (const l of lines) {
        this.g.lineStyle(l.width, hex(l.color), l.alpha * strength);
        this.g.lineBetween(viewX(m.x, m.y), viewY(m.x), viewX(x1, y1), viewY(x1));
      }
    }
  }
}
