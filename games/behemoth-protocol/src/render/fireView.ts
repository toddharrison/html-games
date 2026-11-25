import type { MaterialId } from '../content/terrain';
import { FIRE } from '../content/tuning';
import type { Owner } from '../sim/events';
import { frameRight } from '../sim/frame';
import { hashSeed } from '../sim/rng';
import type { World } from '../sim/world';
import type { Effects } from './effects';
import type { FlameLayer } from './flameLayer';
import type { Interp } from './interp';
import { pose } from './interp';

/**
 * Fire and EMP status on the field (SPEC §6 "Fire", §11.3), render-only: everything comes from sim
 * state. What burns feeds the flame layer (`flameLayer.ts`): burning tiles by what they are (a wood
 * goes up in tall flames, a house roars, fuel on the ground burns low in patches, a wreck burns
 * where it sits), burning units, and each flamethrower's stream from its drawn nozzle. Smoke rolls
 * off the tiles the sim says it hangs over, thick enough to hide what's under it. A tile that has
 * just burnt out smolders. Units knocked out by an EMP crackle blue. Hidden units give nothing away.
 */

/**
 * How a burning tile feeds the flames. A tile burns from a few **seats** at fixed spots in it (so
 * tongues of flame stand and lick from the same places, as they do off a burning thing, instead of
 * the whole square boiling): licks a second in all, their size (game px) and heat, and how much of
 * the tile the seats are spread over (0–1).
 */
interface Blaze {
  seats: number;
  rate: number;
  r: readonly [number, number];
  heat: readonly [number, number];
  cover: number;
}

/** Tiles that burn themselves, by material; anything not listed burns like `forest`. */
const BLAZE: Partial<Record<MaterialId, Blaze>> = {
  forest: { seats: 3, rate: 50, r: [2.4, 4.4], heat: [170, 255], cover: 0.8 },
  hedgerow: { seats: 3, rate: 40, r: [1.5, 2.8], heat: [150, 250], cover: 0.8 },
  building: { seats: 4, rate: 70, r: [2.4, 4.6], heat: [180, 255], cover: 0.85 },
  car: { seats: 2, rate: 34, r: [1.4, 2.8], heat: [160, 250], cover: 0.5 },
  fuelTank: { seats: 2, rate: 70, r: [3.5, 6], heat: [230, 255], cover: 0.5 },
  derrick: { seats: 2, rate: 70, r: [3, 5.5], heat: [230, 255], cover: 0.4 },
};
/** Burning fuel on the ground: low, in a few patches; and a wreck, burning where it sits. */
const FUEL: Blaze = { seats: 3, rate: 60, r: [1.8, 3.2], heat: [170, 250], cover: 0.8 };
const WRECK: Blaze = { seats: 2, rate: 46, r: [1.8, 3.6], heat: [170, 255], cover: 0.45 };
/** Seconds a tile's fire takes to build, and its fuel takes to gutter out. */
const BUILD = 0.6;
const GUTTER = 0.7;
/** Embers a second off a tile that burns itself. */
const EMBERS = 1.6;
/** Puffs of smoke a second over each smoky tile, their size, and their density at full strength. */
const SMOKE = { rate: 14, r: [6, 11] as const, density: [170, 255] as const };
/** A tile smolders this long after its fire goes out. */
const SMOLDER = 3.5;
/** Crackles a second off a unit knocked out by an EMP. */
const STUN_ARCS = 8;
/** A flamethrower's stream keeps flowing this long after its last lick (they come 0.1 s apart). */
const JET_HOLD = 0.14;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);

/** How many of a per-second event happen this frame (the fraction left over by chance). */
function count(rate: number, dt: number): number {
  const n = rate * dt;
  return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
}

interface Jet {
  /** Where the sim fired the last lick from, if the mount can't be found on the drawn hull. */
  x: number;
  y: number;
  angle: number;
  reach: number;
  cone: number;
  left: number;
  /** An enemy's stream: the blue flame that burns the hull. */
  hot: boolean;
}

export interface Muzzle {
  x: number;
  y: number;
  angle: number;
}

export class FireView {
  private readonly jets = new Map<string, Jet>();
  /** Tiles alight last frame (their key, and whether they burn themselves), to catch fires starting and going out. */
  private seen = new Map<number, { x: number; y: number; own: boolean }>();
  private readonly smolders: { x: number; y: number; left: number }[] = [];

  constructor(private readonly flames: FlameLayer) {}

  /** A flamethrower's lick (the sim's `flame` event): its stream flows from that mount for a moment. */
  jet(ev: { owner: Owner; slot: string; x: number; y: number; angle: number; reach: number; cone: number }): void {
    this.jets.set(ev.slot, { x: ev.x, y: ev.y, angle: ev.angle, reach: ev.reach, cone: ev.cone, left: JET_HOLD, hot: ev.owner === 'enemy' });
  }

  /**
   * @param muzzle where a mount's nozzle is drawn this frame (sim coordinates), or null
   * @param scorch leaves a burn mark on the ground at a sim point
   */
  update(w: World, ip: Interp, dt: number, fx: Effects, muzzle: (slot: string) => Muzzle | null, scorch: (x: number, y: number) => void): void {
    const flames = this.flames;
    const ts = w.terrain.tileSize;
    // Only what's near the screen: the frame, and a little either end.
    const near = (x: number) => x > w.frame.left - 2 * ts && x < frameRight(w.frame) + 2 * ts;

    for (const [slot, j] of this.jets) {
      j.left -= dt;
      if (j.left <= 0) {
        this.jets.delete(slot);
        continue;
      }
      const m = muzzle(slot) ?? j;
      flames.spray(m.x, m.y, m.angle, j.reach, j.cone, dt, j.hot);
    }

    const seen = new Map<number, { x: number; y: number; own: boolean }>();
    for (const [key, f] of w.fires) {
      const x0 = f.col * ts;
      const y0 = f.row * ts;
      const own = f.fuel === undefined;
      seen.set(key, { x: x0, y: y0, own });
      if (!near(x0)) continue;
      // Burning fuel leaves the ground scorched where it lands.
      if (!own && !this.seen.has(key)) scorch(x0 + rnd(0.3, 0.7) * ts, y0 + rnd(0.3, 0.7) * ts);
      const build = Math.min(1, (f.age + 0.1) / BUILD);
      if (own) {
        const blaze = BLAZE[w.terrain.tile(f.col, f.row)?.mat ?? 'forest'] ?? BLAZE.forest!;
        this.blaze(blaze, key, x0, y0, ts, build, dt, w.time);
        if (Math.random() < EMBERS * dt) fx.ember(x0 + Math.random() * ts, y0 + Math.random() * ts);
      } else if (f.smokes) {
        this.blaze(WRECK, key, x0, y0, ts, build * Math.min(1, (f.fuel ?? 0) / GUTTER + 0.2), dt, w.time);
        if (Math.random() < EMBERS * 0.5 * dt) fx.ember(x0 + Math.random() * ts, y0 + Math.random() * ts);
      } else {
        this.blaze(FUEL, key, x0, y0, ts, build * Math.min(1, (f.fuel ?? 0) / GUTTER), dt, w.time);
      }
    }
    // A tile whose own fire has just gone out (burnt down) smolders a while.
    for (const [key, was] of this.seen) {
      if (was.own && !seen.has(key) && near(was.x) && this.smolders.length < 120) this.smolders.push({ x: was.x, y: was.y, left: SMOLDER });
    }
    this.seen = seen;
    for (let i = this.smolders.length - 1; i >= 0; i--) {
      const s = this.smolders[i]!;
      s.left -= dt;
      if (s.left <= 0) {
        this.smolders.splice(i, 1);
        continue;
      }
      const k = s.left / SMOLDER;
      for (let n = count(10 * k, dt); n > 0; n--) flames.spot(s.x + Math.random() * ts, s.y + Math.random() * ts, rnd(0.8, 1.6), rnd(50, 70 + 90 * k));
    }

    // Smoke over the tiles the sim says it hangs on: thick while the fire feeds it, thinning as it clears.
    for (const [key, left] of w.smoke) {
      const col = Math.floor(key / 4096);
      const row = key - col * 4096;
      const x0 = col * ts;
      if (!near(x0)) continue;
      // Thick at a full `linger` left (a wood burning under it), thin over a wreck or as it clears.
      const k = Math.min(1, left / (FIRE.smoke.linger * 0.6));
      for (let n = count(SMOKE.rate, dt); n > 0; n--) flames.smoke(x0 + Math.random() * ts, row * ts + Math.random() * ts, rnd(...SMOKE.r), rnd(...SMOKE.density) * k);
    }

    for (const e of w.enemies) {
      if (!e.alive || e.hidden || (!e.burn && !e.stunned)) continue;
      const p = pose(ip, e);
      const r = e.def.radius;
      if (e.burn) {
        const big = Math.min(3, 1.2 + r * 0.2);
        for (let n = count(30 + r * 5, dt); n > 0; n--) flames.spot(p.x + rnd(-0.7, 0.7) * r, p.y + rnd(-0.7, 0.7) * r, rnd(1, big), rnd(160, 255));
        if (Math.random() < 1.2 * dt) flames.smoke(p.x, p.y, rnd(2, 3.5), rnd(60, 100));
      }
      if (e.stunned && Math.random() < STUN_ARCS * dt) fx.arc(p.x + rnd(-0.7, 0.7) * r, p.y + rnd(-0.7, 0.7) * r);
    }
  }

  /**
   * A tile's worth of flames, from its seats: each sits at its own spot in the tile (hashed from the
   * tile, within the middle `cover` of it), wanders a little, and flares and sinks on its own time.
   */
  private blaze(b: Blaze, key: number, x0: number, y0: number, ts: number, strength: number, dt: number, time: number): void {
    const inset = ((1 - b.cover) * ts) / 2;
    const span = ts - inset * 2;
    for (let i = 0; i < b.seats; i++) {
      const h = hashSeed(key, i);
      const phase = (h >>> 16) & 0xff;
      // Between 0.45 and 1: a seat never quite goes out while the tile burns.
      const flare = 0.725 + 0.275 * Math.sin(time * (2.2 + (phase & 7) * 0.35) + phase);
      const sx = x0 + inset + ((h & 0xff) / 255) * span + 1.5 * Math.sin(time * 1.7 + phase);
      const sy = y0 + inset + (((h >>> 8) & 0xff) / 255) * span;
      for (let n = count((b.rate / b.seats) * strength, dt); n > 0; n--) {
        this.flames.spot(sx + rnd(-1.5, 1.5), sy + rnd(-1.5, 1.5), rnd(...b.r) * (0.6 + 0.4 * flare) * Math.max(0.5, strength), rnd(...b.heat) * flare);
      }
    }
  }
}

