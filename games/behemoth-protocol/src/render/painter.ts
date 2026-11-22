import Phaser from 'phaser';
import { Rng } from '../sim/rng';

/** Tiny pixel-plotting helper over a 2D canvas, for generating placeholder art in code. */
export class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    /** Offset so callers can draw a frame in local coordinates inside a larger sheet. */
    public ox = 0,
    public oy = 0,
  ) {}

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
  }

  px(x: number, y: number, color: string): void {
    this.rect(x, y, 1, 1, color);
  }

  clear(x: number, y: number, w: number, h: number): void {
    this.ctx.clearRect(this.ox + x, this.oy + y, w, h);
  }

  /** Filled disc with a lit upper-left and shaded lower-right rim. */
  disc(cx: number, cy: number, r: number, base: string, light?: string, dark?: string): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        let c = base;
        if (dark && d > r - 1.2 && dx + dy > 0) c = dark;
        else if (light && dx + dy < -r * 0.5) c = light;
        this.px(x, y, c);
      }
    }
  }

  /** Scatter `n` single pixels of `color` inside a rect using a deterministic stream. */
  speckle(rng: Rng, x: number, y: number, w: number, h: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) this.px(x + rng.int(0, w - 1), y + rng.int(0, h - 1), color);
  }
}

/** Create (or replace) a canvas texture and draw into it. */
export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (p: Painter) => void,
): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) throw new Error(`could not create canvas texture ${key}`);
  draw(new Painter(tex.getContext()));
  tex.refresh();
  return tex;
}
