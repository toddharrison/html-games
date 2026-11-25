import Phaser from 'phaser';
import type { BattleLayout } from '../config';
import { FLAME_RAMP, HeatField, HOT_RAMP, rampTable, type RampStop } from './flameField';
import { viewX, viewY } from './viewTransform';

/**
 * Flames and smoke on the battlefield (SPEC §11.3), render-only: heat fields (`flameField.ts`)
 * the size of the field column, kept in step with the ground as the view scrolls, and drawn as
 * images (each left where it was last drawn until its next redraw): the fire's glow on the ground, the smoke, and the flames over it. Everything that
 * burns feeds it through `spot` (a lick of flame), `smoke`, `burst` (a fireball), and `spray` (a
 * flamethrower's stream), all in sim coordinates. With nothing alight it does no work.
 *
 * There are two kinds of flame, each its own field: ordinary fire (red through yellow), and the
 * **hot** blue flame of an enemy's projector, the only fire that burns the Behemoth (`HOT_RAMP`).
 */

/**
 * Game pixels of field kept past each side of the column, above the screen, and below it (flames
 * rise into view; and the picture trails the camera by up to a redraw, a few pixels at speed).
 */
const PAD_X = 4;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;
/** Steps a second: flames flicker at about a hand-animated frame rate; smoke rolls slower. */
const FIRE_RATE = 30;
const SMOKE_RATE = 13;
/** The glow is drawn at 1/`GLOW_CELL` scale and smoothed up. */
const GLOW_CELL = 4;
const GLOW_COLOR = [255, 132, 40] as const;
const HOT_GLOW_COLOR = [70, 150, 255] as const;
const GLOW_ALPHA = 0.42;

/**
 * Depths: the glow on the ground under the units (3); smoke over the ground and the enemy's units
 * but under the Behemoth and its trailer (4.5, 5), so it hides them and never the player's own
 * machine; flames over everything on the field.
 */
const GLOW_DEPTH = 1.95;
const SMOKE_DEPTH = 4.2;
const FLAME_DEPTH = 7;

/** Smoke's own ramp: thin grey at the edges, near-black and nearly solid where it's thick. */
const SMOKE_RAMP: readonly RampStop[] = [
  { heat: 20, color: 0x6e6a64, alpha: 0.3 },
  { heat: 46, color: 0x5e5a55, alpha: 0.5 },
  { heat: 80, color: 0x4e4b47, alpha: 0.66 },
  { heat: 120, color: 0x403d3a, alpha: 0.78 },
  { heat: 165, color: 0x33302e, alpha: 0.84 },
];

/** A flamethrower's stream (SPEC §6): burning fuel thrown `reach`, widening as it goes. */
const STREAM = {
  /** Gobs of fuel a second, and seconds each takes to fly its reach. */
  rate: 150,
  life: 0.4,
  /** Share of the weapon's cone the stream fills (the fire billows the rest of the way). */
  cone: 0.55,
  /** A gob's size (game px) at the nozzle and how much it swells by the far end, at a cone of 0.2 rad. */
  r0: 1.3,
  swell: 6.5,
};

interface Gob {
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  dist: number;
  swell: number;
  age: number;
  hot: boolean;
}

interface Burst {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
}

/** One field with its canvas texture and image. */
class Sheet {
  readonly field: HeatField;
  readonly image: Phaser.GameObjects.Image;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly data: ImageData;
  private readonly pixels: Uint32Array;
  private readonly ramp: Uint32Array;
  private acc = 0;
  private shown = false;
  /** View y of the field's top row when the texture was last drawn: where its image belongs. */
  paintedAt = 0;

  constructor(scene: Phaser.Scene, key: string, width: number, height: number, depth: number, ramp: readonly RampStop[], field: HeatField) {
    this.field = field;
    this.ramp = rampTable(ramp);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.tex = scene.textures.createCanvas(key, width, height)!;
    this.data = new ImageData(width, height);
    this.pixels = new Uint32Array(this.data.data.buffer);
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth).setVisible(false);
  }

  /**
   * Steps the field at `rate` and redraws if it moved (`origin`: view y of the field's top row
   * now). Returns whether it was redrawn. Between redraws the image stays where it was drawn: the
   * field has scrolled on with the camera but the texture hasn't, so moving the image with it would
   * make the picture jump ahead and snap back at each redraw.
   */
  update(dt: number, rate: number, origin: number): boolean {
    if (!this.field.alight && !this.shown) return false;
    this.acc = Math.min(this.acc + dt, 3 / rate);
    let stepped = false;
    while (this.acc >= 1 / rate) {
      this.acc -= 1 / rate;
      this.field.step();
      stepped = true;
    }
    if (!stepped) return false;
    this.field.paint(this.pixels, this.ramp);
    this.tex.getContext().putImageData(this.data, 0, 0);
    this.tex.refresh();
    this.shown = this.field.alight;
    this.paintedAt = origin;
    this.image.setPosition(-PAD_X, origin).setVisible(this.shown);
    return true;
  }
}

export class FlameLayer {
  private readonly fire: Sheet;
  /** The blue flame that burns the hull: its own field, so it keeps its own colors where the two meet. */
  private readonly hot: Sheet;
  private readonly smokeSheet: Sheet;
  private readonly glowTex: Phaser.Textures.CanvasTexture;
  private readonly glowImage: Phaser.GameObjects.Image;
  private readonly glowData: ImageData;
  private readonly glowHeat: Uint8Array;
  private readonly hotGlowHeat: Uint8Array;
  /** View y of the fields' top row; null until the first update. */
  private originY: number | null = null;
  private readonly gobs: Gob[] = [];
  private readonly bursts: Burst[] = [];
  private gobDebt = 0;

  constructor(scene: Phaser.Scene, layout: BattleLayout) {
    const w = layout.fieldW + PAD_X * 2;
    const h = layout.height + PAD_TOP + PAD_BOTTOM;
    this.fire = new Sheet(scene, 'flame_field', w, h, FLAME_DEPTH, FLAME_RAMP, new HeatField(w, h));
    this.hot = new Sheet(scene, 'hot_flame_field', w, h, FLAME_DEPTH, HOT_RAMP, new HeatField(w, h, { seed: 0xb1ce }));
    // Smoke: it barely cools, so it hangs and rolls; its own noise, so it doesn't move with the flames.
    this.smokeSheet = new Sheet(scene, 'smoke_field', w, h, SMOKE_DEPTH, SMOKE_RAMP, new HeatField(w, h, { cool: 1, coolNoise: 9, jitter: 0.4, seed: 0x5e0ce }));

    const gw = Math.floor(w / GLOW_CELL);
    const gh = Math.floor(h / GLOW_CELL);
    if (scene.textures.exists('flame_glow')) scene.textures.remove('flame_glow');
    this.glowTex = scene.textures.createCanvas('flame_glow', gw, gh)!;
    this.glowTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.glowData = new ImageData(gw, gh);
    this.glowHeat = new Uint8Array(gw * gh);
    this.hotGlowHeat = new Uint8Array(gw * gh);
    this.glowImage = scene.add.image(0, 0, 'flame_glow').setOrigin(0, 0).setScale(GLOW_CELL).setDepth(GLOW_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  /** Field coordinates of a sim point (before the first update there's no field to put it in). */
  private at(simX: number, simY: number): [number, number] | null {
    if (this.originY === null) return null;
    return [viewX(simX, simY) + PAD_X, viewY(simX) - this.originY];
  }

  /**
   * A lick of flame at a sim point: `r` game px across its middle, `heat` 0–255 (255 = white-hot).
   * `hot`: the blue flame that burns the hull.
   */
  spot(simX: number, simY: number, r: number, heat: number, hot = false): void {
    const p = this.at(simX, simY);
    if (p) (hot ? this.hot : this.fire).field.add(p[0], p[1], r, heat);
  }

  /** A puff of smoke at a sim point: `density` 0–255. */
  smoke(simX: number, simY: number, r: number, density: number): void {
    const p = this.at(simX, simY);
    if (p) this.smokeSheet.field.add(p[0], p[1], r, density, true);
  }

  /** A fireball `r` across that swells and burns out over `seconds`, leaving smoke. */
  burst(simX: number, simY: number, r: number, seconds: number): void {
    if (this.bursts.length < 64) this.bursts.push({ x: simX, y: simY, r, age: 0, life: seconds });
  }

  /**
   * A flamethrower's stream for this frame, from a nozzle at (x, y) along `angle` (sim): gobs of
   * burning fuel that fly `reach` and swell. Each keeps the line it left on, so a swinging nozzle
   * bends the stream the way a real one does. `hot`: an enemy's, in blue.
   */
  spray(x: number, y: number, angle: number, reach: number, cone: number, dt: number, hot = false): void {
    this.gobDebt += STREAM.rate * dt;
    while (this.gobDebt >= 1 && this.gobs.length < 160) {
      this.gobDebt -= 1;
      const a = angle + (Math.random() - Math.random()) * cone * STREAM.cone;
      this.gobs.push({ ox: x, oy: y, dx: Math.cos(a), dy: Math.sin(a), dist: reach * (0.8 + 0.25 * Math.random()), swell: STREAM.swell * (cone / 0.2) * (0.7 + 0.6 * Math.random()), age: Math.random() * dt, hot });
    }
    this.gobDebt = Math.min(this.gobDebt, 1);
  }

  private stepGobs(dt: number): void {
    for (let i = this.gobs.length - 1; i >= 0; i--) {
      const g = this.gobs[i]!;
      g.age += dt;
      const u = g.age / STREAM.life;
      if (u >= 1) {
        this.gobs.splice(i, 1);
        continue;
      }
      // Fast out of the nozzle, slowing as it spreads.
      const d = g.dist * (1 - (1 - u) * (1 - u));
      const x = g.ox + g.dx * d;
      const y = g.oy + g.dy * d;
      // White-hot at the nozzle, cooling to orange (or to deep blue) where it billows out.
      this.spot(x, y, STREAM.r0 + g.swell * Math.pow(u, 1.4), 255 * (1 - 0.55 * Math.pow(u, 1.6)), g.hot);
      if (u > 0.75 && Math.random() < 0.08) this.smoke(x, y, 3 + Math.random() * 3, 70 + Math.random() * 50);
    }
  }

  private stepBursts(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.age += dt;
      const u = b.age / b.life;
      if (u >= 1) {
        this.smoke(b.x, b.y, b.r * 0.9, 150);
        this.bursts.splice(i, 1);
        continue;
      }
      // A ball that swells fast, then breaks up into licks of flame.
      const r = b.r * (0.45 + 0.55 * Math.sqrt(u));
      if (u < 0.5) this.spot(b.x, b.y, r, 255);
      for (let k = 0; k < 2 + b.r / 4; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = r * Math.sqrt(Math.random());
        this.spot(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 1.5 + Math.random() * Math.max(1.5, b.r * 0.22), 255 * (1 - 0.5 * u));
      }
      if (u > 0.4) this.smoke(b.x + (Math.random() - 0.5) * r, b.y + (Math.random() - 0.5) * r, 2 + Math.random() * b.r * 0.4, 90 + Math.random() * 60);
    }
  }

  /** Once a frame, after everything that burns has fed it: follows the camera, steps, and redraws. */
  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const origin = Math.floor(cam.scrollY) - PAD_TOP;
    if (this.originY !== null && origin !== this.originY) {
      // The view moved up the field: what's burning slides down the screen with the ground.
      this.fire.field.scroll(this.originY - origin);
      this.hot.field.scroll(this.originY - origin);
      this.smokeSheet.field.scroll(this.originY - origin);
    }
    this.originY = origin;
    this.stepGobs(dt);
    this.stepBursts(dt);

    this.smokeSheet.update(dt, SMOKE_RATE, origin);
    // One glow serves both flames: redrawn whenever either has moved.
    const fire = this.fire.update(dt, FIRE_RATE, origin);
    const hot = this.hot.update(dt, FIRE_RATE, origin);
    if (fire || hot) this.drawGlow(origin);
  }

  /** The light both flames throw on the ground: each cell colored by which flame lights it more. */
  private drawGlow(origin: number): void {
    const fire = this.fire.field;
    const hot = this.hot.field;
    const alight = fire.alight || hot.alight;
    this.glowImage.setPosition(-PAD_X, origin).setVisible(alight);
    if (!alight) return;
    fire.glow(this.glowHeat, GLOW_CELL);
    hot.glow(this.hotGlowHeat, GLOW_CELL);
    const px = this.glowData.data;
    for (let i = 0; i < this.glowHeat.length; i++) {
      const a = this.glowHeat[i]!;
      const b = this.hotGlowHeat[i]!;
      // Where they overlap the color leans to the stronger, by its share of the light.
      const k = a + b > 0 ? b / (a + b) : 0;
      px[i * 4] = GLOW_COLOR[0] + (HOT_GLOW_COLOR[0] - GLOW_COLOR[0]) * k;
      px[i * 4 + 1] = GLOW_COLOR[1] + (HOT_GLOW_COLOR[1] - GLOW_COLOR[1]) * k;
      px[i * 4 + 2] = GLOW_COLOR[2] + (HOT_GLOW_COLOR[2] - GLOW_COLOR[2]) * k;
      px[i * 4 + 3] = Math.min(255, Math.max(a, b) * GLOW_ALPHA);
    }
    this.glowTex.getContext().putImageData(this.glowData, 0, 0);
    this.glowTex.refresh();
  }
}
