import Phaser from 'phaser';
import type { BattleLayout } from '../config';
import { frameRight } from '../sim/frame';
import type { TrainState } from '../sim/train';
import type { World } from '../sim/world';
import { FONT_KEY, fontText } from './pixelFont';
import { hex, PAL } from './palette';
import { damageLevel } from './statusFx';

/** Pip width, the gap a pip leaves below it, and the most and least room a pip gets (game pixels). */
const PIP = { w: 9, gap: 2, max: 12, min: 7 };
/** Space kept clear above and below the strip (the top banner, the field's bottom edge). */
const MARGIN = 24;
/** Cut-loose cars flash this many times a second until they blow. */
const FLASH_HZ = 6;

/**
 * The armored train strip (SPEC-armored-train.md §T13): a narrow column down the battlefield's edge
 * on the line's narrow side, one pip per vehicle, the front at the top. Each pip is colored by
 * integrity (dark for a hulk, an empty frame for a wreck or a vehicle gone), with its car's letter
 * (`TrainCarDef.glyph`); engines are framed, the railway gun framed in amber. A bracket beside it
 * marks the vehicles in the frame, a notch where the Behemoth is along the train, and cut-loose
 * cars flash until their charges go. The train is longer than the screen: this is how the player
 * finds the engines. Fixed to the screen.
 */
export class TrainStrip {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glyphs: Phaser.GameObjects.BitmapText[];
  private readonly x: number;
  private readonly top: number;
  private readonly pitch: number;
  /** +1: the field's middle is to the right of the strip (it's on the left edge); -1 the other way. */
  private readonly inward: 1 | -1;

  constructor(scene: Phaser.Scene, layout: BattleLayout, train: TrainState, lineSide: number) {
    const n = Math.max(1, train.vehicles.length);
    this.pitch = Math.max(PIP.min, Math.min(PIP.max, Math.floor((layout.height - 2 * MARGIN) / n)));
    const height = n * this.pitch;
    this.top = Math.round((layout.height - height) / 2);
    // On the line's narrow side (sim y is screen x): the train runs a few tiles in from that edge.
    this.inward = lineSide < 0 ? 1 : -1;
    this.x = this.inward > 0 ? layout.fieldX + 3 : layout.fieldX + layout.fieldW - 3 - PIP.w;
    const bx = this.inward > 0 ? this.x - 2 : this.x - 8;
    this.bg = scene.add
      .rectangle(bx, this.top - 3, PIP.w + 10, height + 4, hex(PAL.hudBg), 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(99);
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(99.5);
    const glyphs = this.pitch - PIP.gap >= 5;
    this.glyphs = train.vehicles.map((v, i) =>
      scene.add
        .bitmapText(this.x + Math.floor((PIP.w - 3) / 2), this.top + i * this.pitch + Math.floor((this.pitch - PIP.gap - 5) / 2), FONT_KEY, fontText(v.car.glyph))
        .setScrollFactor(0)
        .setDepth(99.6)
        .setVisible(glyphs),
    );
  }

  update(w: World, time: number): void {
    const tr = w.train;
    const g = this.g;
    g.clear();
    if (!tr) return;
    const h = this.pitch - PIP.gap;
    const units = new Map(w.enemies.filter((e) => e.train && e.alive).map((e) => [e.id, e]));
    const coasting = new Set<number>();
    for (const p of tr.pieces) if (p.state === 'coasting') for (let i = p.first; i <= p.last; i++) coasting.add(i);
    const flash = Math.floor(time * FLASH_HZ * 2) % 2 === 0;
    const left = w.frame.left;
    const right = frameRight(w.frame);
    let first = -1;
    let last = -1;
    tr.vehicles.forEach((v, i) => {
      const y = this.top + i * this.pitch;
      const glyph = this.glyphs[i]!;
      const e = v.alive ? units.get(v.enemyId) : undefined;
      if (v.state !== 'gone' && v.x + v.car.length / 2 >= left && v.x - v.car.length / 2 <= right) {
        if (first < 0) first = i;
        last = i;
      }
      // Engines framed in the HUD's text color, the railway gun in amber.
      if (v.car.engine || v.car.massive) {
        g.fillStyle(hex(v.car.engine ? PAL.hudText : PAL.amber));
        g.fillRect(this.x - 1, y - 1, PIP.w + 2, h + 2);
        g.fillStyle(hex(PAL.hudBg)).fillRect(this.x, y, PIP.w, h);
      }
      if (v.state !== 'coupled') {
        // A wreck, or gone: an empty frame.
        g.fillStyle(hex(PAL.hudLine));
        g.fillRect(this.x, y, PIP.w, 1).fillRect(this.x, y + h - 1, PIP.w, 1);
        g.fillRect(this.x, y, 1, h).fillRect(this.x + PIP.w - 1, y, 1, h);
        glyph.setTint(hex(PAL.hudLine)).setVisible(v.state !== 'gone' && h >= 5);
        return;
      }
      let color = e ? integrityColor(e.hp / e.def.hp) : hex(PAL.hudLine);
      if (coasting.has(i) && flash) color = 0xffffff;
      g.fillStyle(color).fillRect(this.x, y, PIP.w, h);
      glyph.setTint(hex(e ? PAL.hudBg : PAL.hudDim)).setVisible(h >= 5);
    });
    // The bracket: which vehicles are in the frame.
    const bx = this.inward > 0 ? this.x + PIP.w + 2 : this.x - 3;
    if (first >= 0) {
      const y0 = this.top + first * this.pitch;
      const y1 = this.top + last * this.pitch + h;
      g.fillStyle(hex(PAL.glowDim));
      g.fillRect(bx, y0, 1, y1 - y0);
      g.fillRect(this.inward > 0 ? bx - 1 : bx, y0, 2, 1).fillRect(this.inward > 0 ? bx - 1 : bx, y1 - 1, 2, 1);
    }
    // The notch: where the Behemoth is along the train.
    const f = this.along(tr, w.behemoth.x);
    if (f === null || w.behemoth.destroyed) return;
    const ny = Math.round(this.top + (f + 0.5) * this.pitch - PIP.gap / 2);
    const nx = this.inward > 0 ? bx + 2 : bx - 2;
    g.fillStyle(hex(PAL.glow));
    for (let k = 0; k < 3; k++) g.fillRect(this.inward > 0 ? nx + k : nx - k, ny - k, 1, 2 * k + 1);
  }

  /** Where x falls along the train, in vehicles from the front (fractional); null with nothing left. */
  private along(tr: TrainState, x: number): number | null {
    const on = tr.vehicles.map((v, i) => ({ v, i })).filter(({ v }) => v.state !== 'gone');
    const head = on[0];
    const tail = on[on.length - 1];
    if (!head || !tail) return null;
    if (x >= head.v.x) return Math.max(-0.5, head.i - (x - head.v.x) / head.v.car.length);
    for (let k = 1; k < on.length; k++) {
      const a = on[k - 1]!;
      const b = on[k]!;
      if (x < b.v.x) continue;
      const span = a.v.x - b.v.x;
      return span > 0 ? a.i + ((a.v.x - x) / span) * (b.i - a.i) : a.i;
    }
    return Math.min(tr.vehicles.length - 0.5, tail.i + (tail.v.x - x) / tail.v.car.length);
  }

  destroy(): void {
    this.bg.destroy();
    this.g.destroy();
    for (const t of this.glyphs) t.destroy();
  }
}

function integrityColor(f: number): number {
  const level = damageLevel(f);
  if (level === 'ok') return hex(PAL.good);
  if (level === 'amber') return hex(PAL.warn);
  return hex(PAL.bad);
}
