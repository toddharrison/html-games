// Draws the game to the canvas (SPEC 12.1): tiles and sprites at the logical 384×216, then the
// time-of-day grade, firelight, and darkness with a lit circle round each light. It reads GameState and
// never writes to it; its own randomness (shimmer, flicker) never feeds back (SPEC 11.3, rule 3).

import { SCREEN_H, SCREEN_W, TILE } from '../content/balance.ts';
import { F, FLAG, T, TERRAIN } from '../content/terrain.ts';
import type { GameState } from '../sim/state.ts';
import { sightCircles } from '../sim/step.ts';
import { clock, daylight } from '../sim/time.ts';
import { idx, type World } from '../sim/world.ts';
import { gradeAt } from './grade.ts';
import { PALETTE } from './palette.ts';
import { VARIANTS, buildAtlas, rh, type Atlas } from './tiles.ts';

/** How much of the darkness the survivor's own sight lifts, with no light: a dim, colourless circle. */
const OWN_SIGHT_LIFT = 0.62;
/** How dark full night is, 0–1. */
const NIGHT_DARKNESS = 0.95;

export interface Camera {
  /** Top-left of the view, in world pixels. */
  x: number;
  y: number;
  /** The survivor's drawn position, in tiles (between tiles mid-step). */
  px: number;
  py: number;
}

function offscreen(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = SCREEN_W;
  c.height = SCREEN_H;
  return { c, g: c.getContext('2d')! };
}

export class Renderer {
  private readonly g: CanvasRenderingContext2D;
  private readonly atlas: Atlas = buildAtlas();
  private readonly color = offscreen();
  private readonly tmp = offscreen();
  private readonly mask = offscreen();
  private world: World | null = null;
  /** Hill shading per tile: light on slopes facing north-west, shadow on the others. */
  private shade = new Float32Array(0);

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
  }

  setWorld(world: World): void {
    this.world = world;
    const n = world.size;
    this.shade = new Float32Array(n * n);
    for (let y = 1; y < n; y++) {
      for (let x = 1; x < n; x++) {
        const i = idx(x, y);
        const d = world.elev[i]! - world.elev[idx(x - 1, y - 1)]!;
        this.shade[i] = Math.max(-0.2, Math.min(0.2, d * 0.05));
      }
    }
  }

  /** Where the camera is for this frame. `alpha` is how far into the next tick we are (0–1). */
  camera(state: GameState, alpha: number): Camera {
    const p = state.player;
    let t = 1;
    if (p.stepLeft > 0 && p.stepTotal > 0) t = Math.min(1, Math.max(0, 1 - (p.stepLeft - alpha) / p.stepTotal));
    const px = p.fromX + (p.x - p.fromX) * t;
    const py = p.fromY + (p.y - p.fromY) * t;
    const size = (this.world?.size ?? 256) * TILE;
    const x = Math.round(Math.max(0, Math.min(size - SCREEN_W, px * TILE + TILE / 2 - SCREEN_W / 2)));
    const y = Math.round(Math.max(0, Math.min(size - SCREEN_H, py * TILE + TILE / 2 - SCREEN_H / 2)));
    return { x, y, px, py };
  }

  draw(state: GameState, alpha: number, timeMs: number, hover?: { x: number; y: number } | null): Camera {
    const world = this.world;
    const g = this.g;
    const cam = this.camera(state, alpha);
    if (!world) return cam;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = PALETTE.ink;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    const x0 = Math.floor(cam.x / TILE);
    const y0 = Math.floor(cam.y / TILE);
    const x1 = Math.min(world.size - 1, x0 + Math.ceil(SCREEN_W / TILE));
    const y1 = Math.min(world.size - 1, y0 + Math.ceil(SCREEN_H / TILE));
    const shimmer = Math.floor(timeMs / 450);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = idx(tx, ty);
        const t = world.terrain[i]!;
        const dx = tx * TILE - cam.x;
        const dy = ty * TILE - cam.y;
        const v = Math.floor(rh(tx, ty, 1) * VARIANTS);
        g.drawImage(this.atlas.terrain, v * TILE, t * TILE, TILE, TILE, dx, dy, TILE, TILE);
        const s = this.shade[i]!;
        if (s > 0.01 || s < -0.01) {
          g.fillStyle = s > 0 ? `rgba(255,250,235,${s})` : `rgba(10,12,20,${-s})`;
          g.fillRect(dx, dy, TILE, TILE);
        }
        if (world.flags[i]! & FLAG.trail && !TERRAIN[t]!.water) {
          g.fillStyle = 'rgba(110,90,70,0.45)';
          g.fillRect(dx + 3, dy + 6, 3, 2);
          g.fillRect(dx + 10, dy + 11, 3, 2);
        }
        if (TERRAIN[t]!.water && t !== T.waterfall) {
          // The water's shimmer: a few bright pixels that come and go.
          for (let k = 0; k < 2; k++) {
            const r = rh(tx * 3 + k, ty, shimmer + k * 7);
            if (r < 0.3) {
              g.fillStyle = 'rgba(200,225,225,0.55)';
              g.fillRect(dx + Math.floor(r * 50) % 14, dy + Math.floor(r * 170) % 15, 2, 1);
            }
          }
        }
      }
    }

    // Features and the survivor, row by row, so things lower on the screen stand in front.
    const prow = Math.round(cam.py);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = idx(tx, ty);
        const f = world.feature[i]!;
        if (!f) continue;
        // A picked-over patch looks thin until it comes back.
        const bare = (f === F.plant || f === F.herb || f === F.bush) && (state.regrow[i] ?? 0) > state.tick;
        if (bare) g.globalAlpha = 0.4;
        g.drawImage(this.atlas.feature(f, world.data[i]!), tx * TILE - cam.x, ty * TILE - cam.y);
        g.globalAlpha = 1;
      }
      for (const st of state.stashes) {
        if (st.y === ty && st.x >= x0 && st.x <= x1) g.drawImage(this.atlas.sprite('stash'), st.x * TILE - cam.x, st.y * TILE - cam.y);
      }
      for (const l of state.lights) if (l.y === ty) this.drawFire(l.x * TILE - cam.x, l.y * TILE - cam.y, timeMs);
      if (ty === prow) this.drawSurvivor(state, cam);
    }
    if (prow > y1) this.drawSurvivor(state, cam);

    if (hover) {
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.strokeRect(hover.x * TILE - cam.x + 0.5, hover.y * TILE - cam.y + 0.5, TILE - 1, TILE - 1);
    }

    this.light(state, cam, timeMs);
    return cam;
  }

  private drawSurvivor(state: GameState, cam: Camera): void {
    const p = state.player;
    const moving = p.stepLeft > 0;
    const frame = moving && p.stepLeft * 2 > p.stepTotal ? 1 : 0;
    const asleep = state.sleep !== null && !state.sleep.awake;
    const sprite = this.atlas.person(state.protagonist, asleep ? -1 : p.facing, frame);
    this.g.drawImage(sprite, Math.round(cam.px * TILE) - cam.x, Math.round(cam.py * TILE) - cam.y);
  }

  private drawFire(x: number, y: number, timeMs: number): void {
    const g = this.g;
    const f = Math.floor(timeMs / 120);
    g.fillStyle = PALETTE.bark;
    g.fillRect(x + 3, y + 12, 10, 2);
    for (let k = 0; k < 5; k++) {
      const h = 3 + Math.floor(rh(k, f, 3) * 6);
      g.fillStyle = k % 2 ? PALETTE.fire : PALETTE.ember;
      g.fillRect(x + 4 + k * 2, y + 12 - h, 2, h);
    }
    g.fillStyle = PALETTE.cream;
    g.fillRect(x + 7, y + 9, 2, 2);
  }

  /** The grade, firelight, and darkness, over the finished scene. */
  private light(state: GameState, cam: Camera, timeMs: number): void {
    const g = this.g;
    const minute = clock(state.tick).minute;
    const grade = gradeAt(minute);
    const fires = sightCircles(state).filter((c) => c.fire);

    // Keep the full-colour scene for the firelit pools.
    if (fires.length) {
      this.color.g.globalCompositeOperation = 'copy';
      this.color.g.drawImage(this.canvas, 0, 0);
      this.color.g.globalCompositeOperation = 'source-over';
    }

    if (grade.desat > 0.01) {
      g.globalCompositeOperation = 'saturation';
      g.globalAlpha = grade.desat;
      g.fillStyle = '#808080';
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${grade.tint.join(',')})`;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.globalCompositeOperation = 'source-over';

    const flicker = (k: number) => 1 + (rh(k, Math.floor(timeMs / 90), 11) - 0.5) * 0.06;
    const centre = (x: number, y: number) => [x * TILE + TILE / 2 - cam.x, y * TILE + TILE / 2 - cam.y] as const;
    const dark = (1 - daylight(state.tick) / 100) * NIGHT_DARKNESS;

    // A fire is a warm pool of light, and the only colour at night.
    fires.forEach((f, k) => {
      const [cx, cy] = centre(f.x, f.y);
      const r = (f.r + 0.5) * TILE * flicker(k);
      if (cx < -r || cy < -r || cx > SCREEN_W + r || cy > SCREEN_H + r) return;
      // The scene in full colour, lit warm, fading out from the fire.
      const t = this.tmp.g;
      t.globalCompositeOperation = 'copy';
      t.drawImage(this.color.c, 0, 0);
      t.globalCompositeOperation = 'multiply';
      t.fillStyle = 'rgb(255,190,125)';
      t.fillRect(0, 0, SCREEN_W, SCREEN_H);
      t.globalCompositeOperation = 'destination-in';
      const keep = t.createRadialGradient(cx, cy, 0, cx, cy, r);
      const strength = 0.35 + 0.65 * dark;
      keep.addColorStop(0, `rgba(0,0,0,${strength})`);
      keep.addColorStop(0.45, `rgba(0,0,0,${0.85 * strength})`);
      keep.addColorStop(0.8, `rgba(0,0,0,${0.3 * strength})`);
      keep.addColorStop(1, 'rgba(0,0,0,0)');
      t.fillStyle = keep;
      t.fillRect(0, 0, SCREEN_W, SCREEN_H);
      t.globalCompositeOperation = 'source-over';
      g.drawImage(this.tmp.c, 0, 0);
      // A glow at the heart of it.
      g.globalCompositeOperation = 'screen';
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
      glow.addColorStop(0, `rgba(255,150,60,${0.1 + 0.15 * dark})`);
      glow.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.globalCompositeOperation = 'source-over';
    });

    if (dark < 0.01) return;
    const m = this.mask.g;
    m.globalCompositeOperation = 'copy';
    m.fillStyle = `rgba(${grade.dark.join(',')},${dark})`;
    m.fillRect(0, 0, SCREEN_W, SCREEN_H);
    m.globalCompositeOperation = 'destination-out';
    for (const [k, c] of sightCircles(state).entries()) {
      const own = !c.fire;
      const [cx, cy] = own ? [cam.px * TILE + TILE / 2 - cam.x, cam.py * TILE + TILE / 2 - cam.y] : centre(c.x, c.y);
      const r = (c.r + 0.5) * TILE * (own ? 1 : flicker(k));
      const hole = m.createRadialGradient(cx, cy, 0, cx, cy, r);
      const lift = own ? OWN_SIGHT_LIFT : 1;
      hole.addColorStop(0, `rgba(0,0,0,${lift})`);
      hole.addColorStop(0.4, `rgba(0,0,0,${lift * 0.9})`);
      hole.addColorStop(0.75, `rgba(0,0,0,${lift * 0.45})`);
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = hole;
      m.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    m.globalCompositeOperation = 'source-over';
    g.drawImage(this.mask.c, 0, 0);
  }
}
