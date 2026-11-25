import Phaser from 'phaser';
import type { SalvageSource } from '../sim/events';
import { hex, PAL } from './palette';
import { FONT_KEY, fontText } from './pixelFont';
import { textWidth } from './textLayout';
import { viewX, viewY } from './viewTransform';

/** Salvage per mote: a kill worth 12 throws 3 of them. */
const PER_MOTE = 4;
const MAX_MOTES = 8;
/** Seconds of the opening scatter before a mote turns for the hull. */
const SCATTER = 0.22;
/** Homing: the speed it builds up to (world units/s), how fast it gets there, and how hard it turns. */
const TOP_SPEED = 420;
const RAMP = 0.55;
const STEER = 7;
/** Close enough to count as gathered (world units from the hull's center), and the longest a mote flies. */
const ARRIVE = 7;
const MAX_LIFE = 2;
/** A "+N" tag rises over pickups worth at least this much. */
const TAG_MIN = 5;
const TAG_SECONDS = 1;

const COLORS: Record<SalvageSource, number> = {
  unit: hex(PAL.amber),
  tile: hex(PAL.amber),
  objective: hex(PAL.amberHot),
};

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  delay: number;
  amount: number;
  color: number;
  /** Where it was last frame, for the streak. */
  px: number;
  py: number;
}

interface Tag {
  text: Phaser.GameObjects.BitmapText;
  age: number;
}

/**
 * Salvage pickups (SPEC §8.1, user request Nov 2026): what a kill, a knocked-down structure, or an
 * objective share pays flies from where it was earned to the Behemoth as a spray of glowing motes,
 * and the HUD counts it as each one lands. The sim banks it at once; this only shows the gathering
 * (`inFlight` is what the HUD holds back). In sim coordinates; drawn through the view transform.
 */
export class SalvageMotes {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private motes: Mote[] = [];
  private tags: Tag[] = [];

  /** `fieldW`: the battlefield's width, which the "+N" tags stay inside (the HUD's panels cover what's past it). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fieldW: number,
  ) {
    // Over units and the hull, under the aim glints.
    this.gfx = scene.add.graphics().setDepth(6.4).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** A pickup earned at (x, y). */
  add(x: number, y: number, amount: number, source: SalvageSource): void {
    if (amount <= 0) return;
    const n = Math.min(MAX_MOTES, Math.max(1, Math.round(amount / PER_MOTE)));
    const color = COLORS[source];
    for (let i = 0; i < n; i++) {
      // Whole salvage per mote; the first few carry the remainder.
      const share = Math.floor(amount / n) + (i < amount % n ? 1 : 0);
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 50;
      this.motes.push({ x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, delay: Math.random() * 0.12, amount: share, color });
    }
    if (amount >= TAG_MIN) {
      const label = fontText(`+${amount}`);
      // Centered on the pickup, but pulled in from the field's edge so the whole number shows.
      const half = Math.ceil(textWidth(label) / 2) + 1;
      const text = this.scene.add
        .bitmapText(Math.min(Math.max(viewX(x, y), half), this.fieldW - half), viewY(x) - 6, FONT_KEY, label)
        .setOrigin(0.5, 1)
        .setTint(color)
        .setDepth(6.45);
      this.tags.push({ text, age: 0 });
    }
  }

  /** Salvage still on its way to the hull. */
  inFlight(): number {
    return this.motes.reduce((sum, m) => sum + m.amount, 0);
  }

  /**
   * Flies every mote toward `to` (the hull's center, null once it's gone: they just fade). Returns
   * the salvage that arrived this frame.
   */
  update(dt: number, to: { x: number; y: number } | null): number {
    let landed = 0;
    const keep: Mote[] = [];
    for (const m of this.motes) {
      m.px = m.x;
      m.py = m.y;
      m.age += dt;
      if (m.age < m.delay) {
        keep.push(m);
        continue;
      }
      const t = m.age - m.delay;
      if (to && t > SCATTER) {
        const dx = to.x - m.x;
        const dy = to.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < ARRIVE || m.age > MAX_LIFE) {
          landed += m.amount;
          continue;
        }
        const speed = TOP_SPEED * Math.min(1, (t - SCATTER) / RAMP + 0.15);
        const k = 1 - Math.exp(-STEER * dt);
        m.vx += ((dx / d) * speed - m.vx) * k;
        m.vy += ((dy / d) * speed - m.vy) * k;
        // Don't overshoot the hull in one frame.
        const step = Math.hypot(m.vx, m.vy) * dt;
        if (step >= d) {
          landed += m.amount;
          continue;
        }
      } else {
        // The opening scatter slows as it spreads (and, with no hull, they drift and fade).
        const damp = Math.exp(-4 * dt);
        m.vx *= damp;
        m.vy *= damp;
        if (!to && m.age > MAX_LIFE) continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      keep.push(m);
    }
    this.motes = keep;

    const g = this.gfx;
    g.clear();
    for (const m of this.motes) {
      if (m.age < m.delay) continue;
      const x = viewX(m.x, m.y);
      const y = viewY(m.x);
      // A short streak behind it, then a bright 2-pixel core.
      g.lineStyle(1, m.color, 0.45);
      g.lineBetween(viewX(m.px, m.py), viewY(m.px), x, y);
      g.fillStyle(m.color, 1);
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }

    this.tags = this.tags.filter((tag) => {
      tag.age += dt;
      if (tag.age >= TAG_SECONDS) {
        tag.text.destroy();
        return false;
      }
      tag.text.setY(tag.text.y - 14 * dt).setAlpha(1 - (tag.age / TAG_SECONDS) ** 2);
      return true;
    });
    return landed;
  }
}
