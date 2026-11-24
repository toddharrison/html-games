import Phaser from 'phaser';
import type { BiomeId } from '../content/biomes';
import { stormy, type ConditionId } from '../content/conditions';
import { CONCEALMENT, CONDITION } from '../content/tuning';
import type { BattleLayout } from '../config';
import { sightRadius } from '../sim/conditions';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';
import { pose, type Interp } from './interp';
import { viewX, viewY } from './viewTransform';

/**
 * The battle's condition on screen (SPEC §4.6), render-only. A **veil** over the field column (a
 * render texture filled dark, or with the storm's haze) has soft holes erased in it wherever there's
 * light: the Behemoth's sight, muzzle flashes and blasts for a moment, plasma and fires burning, and a fading
 * glow on a unit that has just fired (it gave itself away). The veil sits over the ground and the
 * units but under rounds and effects, so tracers and fireballs light up the dark. A storm also
 * blows particles across the column (rain, snow, sand, or ash) that thicken in a squall. In a
 * thunderstorm, a glow builds where lightning is about to strike, and a strike whitens the column
 * and lifts the haze for a moment.
 */

/** What the veil and the particles look like per biome (storm) and for the night. */
const NIGHT = { color: 0x04060d, alpha: 0.8 };
const STORM: Record<BiomeId, { color: number; haze: number; squall: number; particle: number; kind: 'rain' | 'snow' | 'sand' | 'ash' }> = {
  temperate: { color: 0x2a333c, haze: 0.12, squall: 0.55, particle: 0x9fb4c8, kind: 'rain' },
  industrial: { color: 0x2b2a2a, haze: 0.14, squall: 0.55, particle: 0x9ca3a8, kind: 'rain' },
  arctic: { color: 0xdfe7ef, haze: 0.1, squall: 0.7, particle: 0xffffff, kind: 'snow' },
  desert: { color: 0xa9845a, haze: 0.12, squall: 0.72, particle: 0xe8cf9c, kind: 'sand' },
  wasteland: { color: 0x55524c, haze: 0.14, squall: 0.66, particle: 0x8d877c, kind: 'ash' },
};

/** Depth: over the units (3) and the Behemoth (5), under rounds (6) and effects. */
const VEIL_DEPTH = 5.8;
/** Most burning tiles that light the night at once (each is an image erased from the veil). */
const MAX_FIRE_LIGHTS = 70;
const LIGHT_KEY = 'veil_light';
const LIGHT_SIZE = 128;

interface Glow {
  x: number;
  y: number;
  r: number;
  life: number;
  t: number;
}

interface Mote {
  x: number;
  y: number;
  /** 0–1: how far along its speed and size range. */
  k: number;
}

export class WeatherView {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private readonly glows: Glow[] = [];
  private readonly motes: Mote[] = [];
  private readonly g: Phaser.GameObjects.Graphics | null;
  /** A lightning strike's white flash over the column (thunderstorm only). */
  private readonly flashRect: Phaser.GameObjects.Rectangle | null;
  /** Seconds left of the haze lifting after a strike. */
  private flashLeft = 0;
  private wind = 0;

  private constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: BattleLayout,
    private readonly id: ConditionId,
    private readonly biome: BiomeId,
  ) {
    makeLightTexture(scene);
    this.rt = scene.add.renderTexture(layout.fieldX, 0, layout.fieldW, layout.height).setOrigin(0, 0).setScrollFactor(0).setDepth(VEIL_DEPTH);
    this.g = stormy(id) ? scene.add.graphics().setScrollFactor(0).setDepth(VEIL_DEPTH + 0.1) : null;
    this.flashRect =
      id === 'thunderstorm'
        ? scene.add.rectangle(layout.fieldX, 0, layout.fieldW, layout.height, 0xeef4ff, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(7.6).setBlendMode(Phaser.BlendModes.ADD)
        : null;
    if (this.g) for (let i = 0; i < 260; i++) this.motes.push({ x: Math.random() * layout.fieldW, y: Math.random() * layout.height, k: Math.random() });
  }

  /** Null when the battle is clear. */
  static create(scene: Phaser.Scene, layout: BattleLayout, w: World): WeatherView | null {
    const c = w.condition;
    return c ? new WeatherView(scene, layout, c.id, w.terrain.recipe.biome) : null;
  }

  /** Removes the veil and weather (the dev console switching the condition mid-battle). */
  destroy(): void {
    this.rt.destroy();
    this.g?.destroy();
    this.flashRect?.destroy();
    for (const img of this.lights) img.destroy();
  }

  /** Flashes and blasts light the dark for a moment. */
  handle(events: readonly SimEvent[]): void {
    if (this.flashRect) {
      for (const ev of events) {
        if (ev.type !== 'lightning') continue;
        this.flashLeft = CONDITION.lightning.flash;
        // A double flicker, as real lightning does.
        const r = this.flashRect;
        this.scene.tweens.killTweensOf(r);
        r.setAlpha(ev.hit ? 0.5 : 0.4);
        this.scene.tweens.chain({
          targets: r,
          tweens: [
            { alpha: 0.08, duration: 50 },
            { alpha: 0.3, duration: 30 },
            { alpha: 0, duration: 260, ease: 'quad.in' },
          ],
        });
      }
    }
    if (this.id !== 'night') return;
    for (const ev of events) {
      if (ev.type === 'fire') this.glow(ev.x, ev.y, 26, 0.18);
      else if (ev.type === 'beam') this.glow(ev.x1, ev.y1, 18, 0.12);
      else if (ev.type === 'explosion') this.glow(ev.x, ev.y, 16 + ev.radius * 2.5, 0.45);
      else if (ev.type === 'enemyDestroyed') this.glow(ev.x, ev.y, 46, 0.9);
      else if (ev.type === 'trailerBlast' || ev.type === 'detonation') this.glow(ev.x, ev.y, ev.radius * 2.5 + 40, 1.6);
    }
  }

  private glow(x: number, y: number, r: number, life: number): void {
    if (this.glows.length < 80) this.glows.push({ x, y, r, life, t: 0 });
  }

  update(w: World, interp: Interp, cam: Phaser.Cameras.Scene2D.Camera, dt: number): void {
    const c = w.condition;
    if (!c) return;
    const b = w.behemoth;
    // A sim point on the veil: its screen position (view coordinates less the camera scroll), from the column's left edge.
    const local = (x: number, y: number) => ({ x: viewX(x, y) - cam.scrollX - this.layout.fieldX, y: viewY(x) - cam.scrollY });
    const lights: { x: number; y: number; r: number; a: number }[] = [];
    const sight = sightRadius(w);
    const bp = pose(interp, b);

    const rt = this.rt;
    rt.clear();
    if (this.id === 'night') {
      rt.fill(NIGHT.color, NIGHT.alpha);
      if (sight !== null && !b.destroyed) lights.push({ ...local(bp.x, bp.y), r: sight * 1.3, a: 1 });
      for (const e of w.enemies) {
        // A unit that just fired glows where it stands, fading as it slips back into the dark.
        if (!e.alive || e.hidden || e.exposed <= 0) continue;
        const at = pose(interp, e, e.turret);
        lights.push({ ...local(at.x, at.y), r: 16 + e.def.radius, a: Math.min(1, e.exposed / CONCEALMENT.afterFire + 0.2) });
      }
      for (const p of w.pools) lights.push({ ...local(p.x, p.y), r: 30, a: 0.8 });
      // Fire lights the dark: what burns shows, and whatever stands near it.
      const ts = w.terrain.tileSize;
      let lit = 0;
      for (const f of w.fires.values()) {
        const at = local((f.col + 0.5) * ts, (f.row + 0.5) * ts);
        if (at.y < -40 || at.y > this.layout.height + 40 || lit++ >= MAX_FIRE_LIGHTS) continue;
        lights.push({ ...at, r: f.fuel === undefined || f.smokes ? 34 : 24, a: Math.min(1, 0.3 + f.age) * (0.75 + 0.15 * Math.sin(w.time * 13 + f.col * 2.3 + f.row)) });
      }
      for (const e of w.enemies) {
        if (!e.alive || e.hidden || !e.burn) continue;
        const at = pose(interp, e);
        lights.push({ ...local(at.x, at.y), r: 20 + e.def.radius, a: 0.8 });
      }
      for (let i = this.glows.length - 1; i >= 0; i--) {
        const gl = this.glows[i]!;
        gl.t += dt;
        if (gl.t >= gl.life) {
          this.glows.splice(i, 1);
          continue;
        }
        lights.push({ ...local(gl.x, gl.y), r: gl.r, a: 1 - gl.t / gl.life });
      }
    } else {
      const look = STORM[this.biome];
      // A strike lifts the haze for a moment: the glimpse of what the squall was hiding.
      this.flashLeft = Math.max(0, this.flashLeft - dt);
      const lift = 1 - this.flashLeft / CONDITION.lightning.flash;
      rt.fill(look.color, (look.haze + look.squall * c.squall) * lift);
      if (sight !== null && !b.destroyed) lights.push({ ...local(bp.x, bp.y), r: sight * 1.3, a: 1 });
    }

    // One image per light: the texture's commands are buffered until `render`, so each needs its own.
    lights.forEach((l, i) => {
      let img = this.lights[i];
      if (!img) {
        img = new Phaser.GameObjects.Image(this.scene, 0, 0, LIGHT_KEY);
        this.lights.push(img);
      }
      img.setPosition(l.x, l.y).setScale((2 * l.r) / LIGHT_SIZE).setAlpha(l.a);
    });
    if (lights.length > 0) rt.erase(this.lights.slice(0, lights.length));
    rt.render();

    if (this.g) {
      this.drawMotes(c.squall, dt);
      if (c.lightning) this.drawMarks(c.lightning.marks, w.time, local);
    }
  }

  /**
   * Where lightning is about to strike: a flickering glow that tightens and brightens until it
   * lands, with sparks crawling over it (St Elmo's fire), so there's a moment to steer off it.
   */
  private drawMarks(marks: readonly { x: number; y: number; lands: number }[], time: number, local: (x: number, y: number) => { x: number; y: number }): void {
    const g = this.g!;
    const warn = CONDITION.lightning.warn;
    for (const m of marks) {
      const k = Math.max(0, Math.min(1, 1 - (m.lands - time) / warn));
      const p = local(m.x, m.y);
      const x = this.layout.fieldX + p.x;
      const flicker = 0.7 + 0.3 * Math.random();
      const r = 16 - 9 * k;
      g.fillStyle(0x9fd4ff, (0.25 + 0.35 * k) * flicker).fillCircle(x, p.y, r);
      g.lineStyle(2, 0xdff2ff, (0.6 + 0.4 * k) * flicker).strokeCircle(x, p.y, r);
      g.lineStyle(1, 0x9fd4ff, 0.5 * flicker).strokeCircle(x, p.y, r + 5 - 3 * k);
      g.fillStyle(0xffffff, 0.6 + 0.4 * k).fillRect(Math.round(x) - 1, Math.round(p.y) - 1, 3, 3);
      for (let i = 0; i < 2 + Math.round(4 * k); i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        g.fillStyle(0xeaf6ff, 0.9).fillRect(Math.round(x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 1, 1);
      }
    }
  }

  /** The storm blowing across the column: more, faster, and longer in a squall. */
  private drawMotes(squall: number, dt: number): void {
    const g = this.g!;
    const look = STORM[this.biome];
    const { fieldW, height } = this.layout;
    g.clear();
    this.wind += (Math.random() - 0.5) * dt * 2;
    this.wind = Math.max(-1, Math.min(1, this.wind));
    const count = Math.round(30 + (this.motes.length - 30) * squall);
    // Direction: rain falls down the screen at a slant; snow drifts; sand and ash blow across.
    const across = look.kind === 'rain' ? 0.35 : look.kind === 'snow' ? 0.6 : 1;
    const down = look.kind === 'rain' ? 1 : look.kind === 'snow' ? 0.5 : 0.25;
    const pace = (look.kind === 'rain' ? 260 : look.kind === 'snow' ? 60 : 160) * (0.6 + 0.8 * squall);
    for (let i = 0; i < count; i++) {
      const m = this.motes[i]!;
      const v = pace * (0.6 + 0.6 * m.k);
      const vx = (across + 0.3 * this.wind) * v;
      const vy = down * v;
      m.x = (m.x + vx * dt + fieldW) % fieldW;
      m.y = (m.y + vy * dt + height) % height;
      const alpha = (0.25 + 0.5 * m.k) * (0.5 + 0.5 * squall);
      g.fillStyle(look.particle, alpha);
      if (look.kind === 'snow' || look.kind === 'ash') g.fillRect(this.layout.fieldX + Math.round(m.x), Math.round(m.y), m.k > 0.6 ? 2 : 1, m.k > 0.8 ? 2 : 1);
      else {
        // A streak along its travel, longer when it's blowing harder.
        const len = 2 + Math.round((3 + 5 * squall) * m.k);
        const n = Math.hypot(vx, vy);
        for (let s = 0; s < len; s++) g.fillRect(this.layout.fieldX + Math.round(m.x - (vx / n) * s), Math.round(m.y - (vy / n) * s), 1, 1);
      }
    }
  }
}

/** A soft round light: full in the middle, fading out over its outer half. */
function makeLightTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(LIGHT_KEY)) return;
  const tex = scene.textures.createCanvas(LIGHT_KEY, LIGHT_SIZE, LIGHT_SIZE)!;
  const ctx = tex.getContext();
  const r = LIGHT_SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LIGHT_SIZE, LIGHT_SIZE);
  tex.refresh();
}
