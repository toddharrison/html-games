// Draws the game to the canvas (SPEC 12.1): tiles and sprites at the logical 384×216, then the
// time-of-day grade, firelight, and darkness with a lit circle round each light. It reads GameState and
// never writes to it; its own randomness (shimmer, flicker) never feeds back (SPEC 11.3, rule 3).

import { MIN, SCREEN_H, SCREEN_W, SUB, TILE } from '../content/balance.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import type { Fire, GameState } from '../sim/state.ts';
import { burning } from '../sim/surroundings.ts';
import { sightCircles } from '../sim/step.ts';
import { clock, daylight } from '../sim/time.ts';
import { WEATHER } from '../content/weather.ts';
import { snowBand, weatherAt, weatherNow } from '../sim/weather.ts';
import { arcOpens, flightNow } from '../sim/arc.ts';
import { FLIGHT_MINUTES } from '../content/arc.ts';
import { idx, type World } from '../sim/world.ts';
import { gradeAt } from './grade.ts';
import { PALETTE } from './palette.ts';
import { buildAtlas, rh, type Atlas } from './tiles.ts';
import { Ground } from './ground.ts';
import { type AspenLeaf, CONIFER_VARIANTS, type ConiferForm, LOG_SIZE, aspen, boulder, conifer, crag, log, spanLog, stunted, type Tall } from './flora.ts';
import { bearDen, bonePile, carcass, rockArch, tallSnag } from './landmarks.ts';
import { drawLay } from './fireArt.ts';
import { buildArt, drawGhost, drawSite } from './buildArt.ts';
import { siteProgress } from '../sim/craft.ts';
import { WRECK_W, crashScar, forwardWreck, tailWreck } from './wreck.ts';
import { type Fall, type FallsArt, faceOn, fallsArt, findFalls } from './falls.ts';
import { LooseArt } from './looseArt.ts';
import { L, isTracks } from '../content/loose.ts';
import { looseAt, looseData } from '../sim/loose.ts';
import { barkStripped } from '../sim/materials.ts';
import { hashString } from '../sim/rng.ts';
import { perlin } from '../sim/worldgen/noise.ts';

/** Each dealt stone's look in an outcrop: body and mark (content/decks.ts STONES order). */
const STONE_LOOK: [string, string][] = [
  ['#3e4350', '#6d7aa6'],
  ['#6f736f', '#a9aea8'],
  ['#8a4a32', '#c4552b'],
  ['#8f8f88', '#e9ece6'],
  ['#77746b', '#3b3a33'],
];

/** How much of the darkness the survivor's own sight lifts, with no light: a dim, colourless circle. */
const OWN_SIGHT_LIFT = 0.62;
/** How dark full night is, 0–1. */
const NIGHT_DARKNESS = 0.95;
/** How far behind the survivor the camera eases, in seconds (the time to close about two-thirds of a gap). */
const FOLLOW_TAU = 0.14;
/** A jump bigger than this (world pixels) is a teleport, not a walk: the camera snaps to it. */
const FOLLOW_SNAP = 4 * TILE;

export interface Camera {
  /** Top-left of the view, in world pixels. */
  x: number;
  y: number;
  /** The survivor's drawn position, in tiles (between tiles mid-step). */
  px: number;
  py: number;
}

function offscreen(w = SCREEN_W, h = SCREEN_H): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

export class Renderer {
  private readonly g: CanvasRenderingContext2D;
  private readonly atlas: Atlas = buildAtlas();
  private readonly looseArt = new LooseArt();
  /**
   * Device pixels to a screen pixel (`resize`). Everything is drawn in screen pixels (384×216) through a
   * scale of `k`, so the camera can stand between screen pixels and the land glides instead of stepping.
   * Sprites and blocks still land on whole screen pixels of the world, so they stay as crisp as before.
   */
  private k = 1;
  // The firelight's buffers, at `k` like the canvas (drawn into through a scale of `k`).
  private readonly color = offscreen();
  private readonly tmp = offscreen();
  /** The darkness: soft gradients only, so one pixel a screen pixel, smoothed as it's laid over. */
  private readonly mask = offscreen();
  /** Sun shadows, at one pixel a screen pixel and fixed to the world (a pixel wider than the screen each way). */
  private readonly shadowLayer = offscreen(SCREEN_W + 2, SCREEN_H + 2);
  private world: World | null = null;
  private ground: Ground | null = null;
  private readonly lastX = new Map<number, number>();
  private readonly facingLeft = new Map<number, boolean>();
  /** When the last lightning flashed (ms), and whether flashes are toned down (SPEC 12.4). */
  private flashAt = -1e9;
  reduceFlashes = false;
  /** Per tile: a tree's size (0 sapling to 4 giant), and low ground near water where dawn mist lies. */
  private treeSize = new Uint8Array(0);
  /** Per tile, which conifer grows there (ConiferForm): from the ground's history, height, and aspect. */
  private treeForm = new Uint8Array(0);
  private lowland = new Uint8Array(0);
  /** Where each fish is drawn (world pixels), easing toward its tile; rings where trout rise at dusk. */
  private readonly fishAt = new Map<number, { x: number; y: number; left: boolean }>();
  private rings: { x: number; y: number; t: number }[] = [];
  private lastFrame = 0;
  /** Where the camera's eased aim is (the survivor's sprite corner, world pixels); null snaps it next frame. */
  private follow: { x: number; y: number } | null = null;
  private readonly trees = new Map<string, Tall>();
  private readonly boulders = new Map<string, HTMLCanvasElement>();
  private readonly tall = new Map<string, Tall>();
  /** Per tile: a rock's size (rockMass), bigger where rocks crowd into a formation. */
  private rockSize = new Uint8Array(0);
  /** Seeds the field that says when each aspen grove turns. */
  private groveSeed = 0;
  /** The forward wreck: its left tile, how many tiles wide, which way it lies, and the scar under it. */
  private wreck: { x: number; y: number; wide: number; mirror: boolean; scar: HTMLCanvasElement; ox: number; oy: number } | null = null;
  /** Each waterfall's drawing, by the tile it stands on; and per falling-water tile, the way it runs. */
  private falls = new Map<number, Fall>();
  private fallDir = new Map<number, [number, number]>();
  /** Per tile, 1 beside falling water or near a falls' foot: the cliff there is left to the falls' own rock. */
  private byFalls = new Uint8Array(0);
  private clouds: HTMLCanvasElement | null = null;
  private mistBlob: HTMLCanvasElement | null = null;

  lightning(now: number): void {
    this.flashAt = now;
  }

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
  }

  /** Draw at `k` device pixels to a screen pixel (the window's whole-number scale; more on a high-density screen). */
  resize(k: number): void {
    if (k === this.k && this.canvas.width === SCREEN_W * k) return;
    this.k = k;
    for (const b of [{ c: this.canvas, g: this.g }, this.color, this.tmp]) {
      b.c.width = SCREEN_W * k;
      b.c.height = SCREEN_H * k;
      b.g.setTransform(k, 0, 0, k, 0, 0);
      b.g.imageSmoothingEnabled = false;
    }
  }

  /** Fill the whole screen with one colour (behind the title before its valley is drawn). */
  clear(colour: string): void {
    this.g.setTransform(this.k, 0, 0, this.k, 0, 0);
    this.g.fillStyle = colour;
    this.g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  /** The whole screen pixels covering (x0, y0)–(x1, y1), kept on the screen: [x, y, width, height]. */
  private box(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
    const bx = Math.max(0, Math.floor(x0));
    const by = Math.max(0, Math.floor(y0));
    return [bx, by, Math.min(SCREEN_W, Math.ceil(x1)) - bx, Math.min(SCREEN_H, Math.ceil(y1)) - by];
  }

  /** A position in screen pixels rounded to the nearest device pixel. */
  private snap(v: number): number {
    return Math.round(v * this.k) / this.k;
  }

  setWorld(world: World): void {
    this.world = world;
    this.follow = null;
    this.ground = new Ground(world, hashString(`${world.genSeed}/look`)[0]);
    this.groveSeed = hashString(`${world.genSeed}/groves`)[0];
    const n = world.size;
    this.treeSize = new Uint8Array(n * n);
    this.treeForm = new Uint8Array(n * n);
    this.rockSize = new Uint8Array(n * n);
    this.lowland = new Uint8Array(n * n);
    this.wreck = this.layWreck(world);
    const found = findFalls(world);
    this.falls = new Map(found.falls.map((f) => [idx(f.x, f.y), f]));
    this.fallDir = found.dir;
    this.byFalls = new Uint8Array(n * n);
    const near = (cx: number, cy: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < n && cy + dy < n) this.byFalls[idx(cx + dx, cy + dy)] = 1;
    };
    for (const i of found.dir.keys()) near(i % n, Math.floor(i / n), 1);
    for (const f of found.falls) near(f.x, f.y, 2);
    const isTree = (i: number) => {
      const f = world.feature[i];
      return f === F.conifer || f === F.aspen || f === F.stunted;
    };
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = idx(x, y);
        if (isTree(i)) {
          // Trees grow bigger in the heart of a stand, and smaller up high; the hash varies the rest.
          let near = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isTree(idx(x + dx, y + dy))) near++;
          let size = near >= 3 ? 3 : 2;
          const r = rh(x, y, 71);
          if (r < 0.2) size++;
          else if (r > 0.86) size--;
          if (r > 0.95) size = 0;
          if (world.band[i]! >= 2) size--;
          // Where the forest has a history, its age decides: seedlings in a burn, tall in old growth.
          const age = world.age?.[i] ?? 0;
          if (age > 0) size = age < 20 ? (r < 0.5 ? 0 : 1) : age < 50 ? 1 : age < 100 ? 2 : age < 170 ? 3 : r < 0.4 ? 4 : 3;
          if (world.band[i]! >= 2 && age > 0) size--;
          if (world.feature[i] === F.aspen) size = Math.min(3, size);
          this.treeSize[i] = Math.max(0, Math.min(4, size));
        }
        if (world.feature[i] === F.conifer || world.feature[i] === F.thicket) this.treeForm[i] = this.formAt(world, x, y);
        const f = world.feature[i];
        if (f === F.boulder || f === F.outcrop) {
          // Rocks that crowd together grow into one outcropping; a lone one is a boulder.
          let near = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const n2 = idx(x + dx, y + dy);
              const nf = world.feature[n2];
              if (nf === F.boulder || nf === F.outcrop || nf === F.overhang || world.terrain[n2] === T.cliff) near++;
            }
          const r = rh(x, y, 74);
          // Boulders come in all sizes, mostly small; an outcrop is a crag, bigger where rock crowds round it.
          let size = f === F.boulder ? (r < 0.4 ? 0 : r < 0.75 ? 1 : r < 0.93 ? 2 : 3) : near >= 3 ? 3 : 2;
          if (f === F.boulder && near >= 3 && size < 3) size++;
          this.rockSize[i] = Math.max(0, Math.min(3, size));
        }
        if (world.band[i] === 0) {
          let wet = false;
          for (let dy = -3; dy <= 3 && !wet; dy++) for (let dx = -3; dx <= 3 && !wet; dx++) if (TERRAIN[world.terrain[idx(x + dx, y + dy)] ?? 0]?.water) wet = true;
          this.lowland[i] = wet || world.terrain[i] === T.marsh || world.terrain[i] === T.reeds ? 1 : 0;
        }
      }
    }
    this.fishAt.clear();
    this.rings = [];
  }

  /**
   * Where the camera is for this frame (`x`, `y` in screen pixels, on a device pixel: between screen
   * pixels when `k` > 1). `alpha` is how far into the next tick we are (0–1); `dt` is the seconds since
   * the last frame. The camera eases after the survivor (`FOLLOW_TAU`) rather than being bolted to them,
   * and snaps on a jump (a new run, a load, a debug teleport). The lag is snapped on its own and the
   * survivor's position is the one the sprite is drawn at, so the survivor holds still on screen while
   * the world glides under them, instead of the two rounding apart.
   */
  camera(state: GameState, alpha: number, dt = 0): Camera {
    const p = state.player;
    let px: number;
    let py: number;
    if (state.walk === 'free' && p.fx !== undefined && p.fy !== undefined) {
      // Free walking: between where the feet were a tick ago and where they are, the sprite's corner half a tile up and left of them.
      const fx = (p.lastFx ?? p.fx) + (p.fx - (p.lastFx ?? p.fx)) * alpha;
      const fy = (p.lastFy ?? p.fy) + (p.fy - (p.lastFy ?? p.fy)) * alpha;
      px = fx / SUB - 0.5;
      py = fy / SUB - 0.5;
    } else {
      let t = 1;
      if (p.stepLeft > 0 && p.stepTotal > 0) t = Math.min(1, Math.max(0, 1 - (p.stepLeft - alpha) / p.stepTotal));
      px = p.fromX + (p.x - p.fromX) * t;
      py = p.fromY + (p.y - p.fromY) * t;
    }
    const wx = px * TILE;
    const wy = py * TILE;
    let f = this.follow;
    if (!f || Math.abs(wx - f.x) > FOLLOW_SNAP || Math.abs(wy - f.y) > FOLLOW_SNAP) f = this.follow = { x: wx, y: wy };
    else {
      const k = 1 - Math.exp(-dt / FOLLOW_TAU);
      f.x += (wx - f.x) * k;
      f.y += (wy - f.y) * k;
    }
    const size = (this.world?.size ?? 256) * TILE;
    const x = Math.max(0, Math.min(size - SCREEN_W, this.snap(wx) - this.snap(wx - f.x) + TILE / 2 - SCREEN_W / 2));
    const y = Math.max(0, Math.min(size - SCREEN_H, this.snap(wy) - this.snap(wy - f.y) + TILE / 2 - SCREEN_H / 2));
    return { x, y, px, py };
  }

  /**
   * Which conifer grows on a tile. Pine comes back first after a fire and holds the dry slopes facing
   * the sun; fir is the tree of the high ground up to the treeline; spruce has the damp valley and the old
   * forest. Each mixed a little with the others, by hash.
   */
  private formAt(world: World, x: number, y: number): ConiferForm {
    const i = idx(x, y);
    const age = world.age[i] ?? 0;
    const north = world.elev[idx(x, Math.max(0, y - 1))]!;
    const south = world.elev[idx(x, Math.min(world.size - 1, y + 1))]!;
    const sunny = (north - south) / 12;
    const r = rh(x, y, 96);
    if (age > 0 && age < 120) return r < 0.75 ? 2 : r < 0.9 ? 0 : 1;
    if (world.band[i]! >= 2) return r < 0.7 ? 1 : r < 0.9 ? 0 : 2;
    if (sunny > 0.3) return r < 0.55 ? 2 : r < 0.85 ? 0 : 1;
    return r < 0.65 ? 0 : r < 0.9 ? 1 : 2;
  }

  /**
   * How far a thing on (tx, ty) sits off its tile's centre, in pixels: up to `mx` across, `up` up, and
   * `down` down. A smooth noise field (things near each other drift together a little, as seedlings do
   * along a log or a seep, or stones down a slope) plus a per-tile hash, each its own for every kind
   * (`salt`), so nothing lines up in rows or columns. Kept inside the tile, so clicking finds the thing.
   */
  private offset(tx: number, ty: number, salt: number, mx: number, up: number, down: number): [number, number] {
    const span = (up + down) / 2;
    const nx = perlin(this.groveSeed + salt, tx / 3.3, ty / 3.3) * mx * 0.7 + (rh(tx, ty, 200 + salt * 2) - 0.5) * mx * 1.3;
    const ny = perlin(this.groveSeed + salt + 1, tx / 3.3, ty / 3.3) * span * 0.7 + (rh(tx, ty, 201 + salt * 2) - 0.5) * span * 1.3 + (down - up) / 2;
    return [Math.max(-mx, Math.min(mx, Math.round(nx))), Math.max(-up, Math.min(down, Math.round(ny)))];
  }

  /** A tree's offset: up to 7 px across, 5 up, 4 down (thickets half that). */
  private treeOffset(tx: number, ty: number): [number, number] {
    return this.offset(tx, ty, 7, 7, 5, 4);
  }

  private tree(kind: number, size: number, v: number, leaf: AspenLeaf = 0, form: ConiferForm = 0): Tall {
    const key = `${kind}:${size}:${v}:${leaf}:${form}`;
    let t = this.trees.get(key);
    if (!t) {
      t = kind === F.aspen ? aspen(size, v, leaf) : kind === F.stunted ? stunted(v) : conifer(size, v, form);
      this.trees.set(key, t);
    }
    return t;
  }

  /**
   * An aspen's leaves on a day: green from late summer, then gold, then thinning. Each grove is one clone
   * and turns together (a smooth field), higher ones sooner, from about day 8 to day 26.
   */
  private aspenLeaf(world: World, tx: number, ty: number, day: number): AspenLeaf {
    const turn = 8 + (perlin(this.groveSeed, tx / 9, ty / 9) + 0.7) * 10 - world.band[idx(tx, ty)]! * 2;
    return day < turn ? 0 : day < turn + 5 ? 1 : day < turn + 22 ? 2 : 3;
  }

  /**
   * A rock of a size: a boulder (`stone` -2, weathered grey), or a crag (-1 plain grey rock for cliffs and
   * the overhang, or a dealt stone's look for an outcrop). `v` is the variant, 0–5.
   */
  private rock(size: number, stone: number, v: number): Tall {
    const key = `rock:${size}:${stone}:${v}`;
    let r = this.tall.get(key);
    if (!r) {
      const [body, mark] = stone === -2 ? ['#858277', '#5b5850'] : stone < 0 ? ['#6f7472', '#4a4f52'] : (STONE_LOOK[stone] ?? STONE_LOOK[1]!);
      r = stone === -2 ? boulder(size, v, body, mark) : crag(size, v, body, mark);
      this.tall.set(key, r);
    }
    return r;
  }

  /** The forward wreck across its tiles (world gen lays it on one or two side by side), and the scar it left, with water left clear. */
  private layWreck(world: World): Renderer['wreck'] {
    const { x, y } = world.crash;
    if (x < 0) return null;
    const right = world.feature[idx(x + 1, y)] === F.crash;
    const left = world.feature[idx(x - 1, y)] === F.crash;
    const lx = left ? x - 1 : x;
    const wide = left || right ? 2 : 1;
    const mirror = rh(x, y, 90) < 0.5;
    const s = crashScar(wide);
    const [c, g] = (() => {
      const cc = document.createElement('canvas');
      cc.width = s.c.width;
      cc.height = s.c.height;
      return [cc, cc.getContext('2d')!] as const;
    })();
    if (mirror) {
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(s.c, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const ox = mirror ? -(c.width + s.ox) + TILE * wide : s.ox;
    for (let ty = 0; ty < c.height / TILE; ty++) {
      for (let tx = 0; tx < c.width / TILE; tx++) {
        const wx = lx + tx + ox / TILE;
        const wy = y + ty + s.oy / TILE;
        const t = world.terrain[idx(Math.max(0, Math.min(world.size - 1, wx)), Math.max(0, Math.min(world.size - 1, wy)))] ?? 0;
        if (TERRAIN[t]?.water) g.clearRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    return { x: lx, y, wide, mirror, scar: c, ox, oy: s.oy };
  }

  /** Tall one-off art: the snag, the wreckage. */
  private once(key: string, make: () => Tall): Tall {
    let t = this.tall.get(key);
    if (!t) {
      t = make();
      this.tall.set(key, t);
    }
    return t;
  }

  /**
   * The deadfall on a tile, and where its canvas's corner goes relative to the tile's. In a recent burn
   * the dead trunks came down in the prevailing westerly, so they lie mostly one way, roots to the west;
   * anywhere else they fell every which way. Trunks are different lengths and lie off-centre, often
   * reaching into the next tile.
   */
  private logArt(world: World, tx: number, ty: number): { art: HTMLCanvasElement; dx: number; dy: number } {
    const age = world.age[idx(tx, ty)]!;
    const burnt = age > 0 && age < 20;
    const r = rh(tx, ty, 80);
    const angle = burnt ? (r < 0.5 ? 1 : r < 0.7 ? 0 : r < 0.9 ? 2 : 15) % 8 : Math.floor(r * 8);
    const len = 12 + Math.floor(rh(tx, ty, 81) * 4) * 4;
    const v = Math.floor(rh(tx, ty, 82) * 3);
    const key = `log:${angle}:${len}:${burnt ? 1 : 0}:${v}`;
    let b = this.boulders.get(key);
    if (!b) {
      b = log(angle, len, burnt, v);
      this.boulders.set(key, b);
    }
    const [ox, oy] = this.offset(tx, ty, 37, 5, 3, 3);
    const dx = 8 - LOG_SIZE / 2 + ox;
    const dy = 9 - LOG_SIZE / 2 + oy;
    return { art: b, dx, dy };
  }

  /** The sun's direction and the length of shadows (SPEC 12.1: long at dawn and dusk), or null at night. */
  private sun(state: GameState): { dx: number; len: number; alpha: number } | null {
    const m = clock(state.tick).minute;
    if (m < 330 || m > 1230) return null;
    const t = (m - 330) / 900;
    const dx = t * 2 - 1;
    const gloom = WEATHER[weatherAt(state)].gloom;
    const alpha = Math.min(1, daylight(state.tick) / 60) * (1 - gloom * 1.1) * 0.3;
    if (alpha <= 0.02) return null;
    return { dx, len: 0.35 + 1.4 * Math.abs(dx) ** 1.6, alpha };
  }

  draw(
    state: GameState,
    alpha: number,
    timeMs: number,
    hover?: { x: number; y: number } | null,
    mark?: { x: number; y: number } | null,
    /** Where a fire or build would go, while choosing (drawn over the light, so it shows at night). */
    ghost?: { x: number; y: number; ok: boolean; kind: string } | null,
  ): Camera {
    const world = this.world;
    const g = this.g;
    const dt = Math.min(0.1, Math.max(0, (timeMs - this.lastFrame) / 1000));
    this.lastFrame = timeMs;
    const cam = this.camera(state, alpha, dt);
    if (!world || !this.ground) return cam;
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = PALETTE.ink;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    const x0 = Math.floor(cam.x / TILE);
    const y0 = Math.floor(cam.y / TILE);
    const x1 = Math.min(world.size - 1, x0 + Math.ceil(SCREEN_W / TILE));
    const y1 = Math.min(world.size - 1, y0 + Math.ceil(SCREEN_H / TILE));
    const snow = snowBand(state.tick);
    this.ground.draw(g, cam.x, cam.y, SCREEN_W, SCREEN_H, snow);
    this.water(cam, timeMs, x0, y0, x1, y1);
    this.fish(state, cam, timeMs, dt);
    // The scar the crash ploughed, flat on the ground under everything that stands.
    const wr = this.wreck;
    if (wr) g.drawImage(wr.scar, wr.x * TILE - cam.x + wr.ox, wr.y * TILE - cam.y + wr.oy);
    // Fallen trees across the streams, flat on the ground under everything that stands.
    for (const b of world.bridges ?? []) {
      const across = (b.len + 1) * TILE + 4;
      const x0 = (b.x - b.dx) * TILE + (b.dx ? 6 : 8) - cam.x;
      const y0 = (b.y - b.dy) * TILE + (b.dy ? 6 : 9) - cam.y;
      if (x0 > SCREEN_W + 40 || y0 > SCREEN_H + 40 || x0 + across < -40 || y0 + across < -40) continue;
      const v = (b.x * 7 + b.y) % 3;
      const art = this.boulders.get(`span:${b.len}:${v}`) ?? spanLog(across, v);
      this.boulders.set(`span:${b.len}:${v}`, art);
      if (b.dx) g.drawImage(art, x0, y0 - 7);
      else {
        g.save();
        g.translate(x0 + 7, y0);
        g.rotate(Math.PI / 2);
        g.drawImage(art, 0, 0);
        g.restore();
      }
    }

    const wind = weatherNow(state, world).wind;
    const sway = (x: number, y: number) => Math.round(Math.sin(timeMs / (900 - wind * 400) + x * 0.9 + y * 0.43) * (0.55 + wind * 1.6));
    const sun = this.sun(state);
    const day = clock(state.tick).day;
    const shadows: [number, number, number, number][] = [];
    const survivorPx = this.snap(cam.px * TILE) - cam.x;
    const survivorPy = this.snap(cam.py * TILE) - cam.y;
    const prow = Math.round(cam.py);

    // Features, loose things, and the survivor, row by row, so things lower on the screen stand in front.
    // Rows below the view are included: a tall tree there can reach up into it (three tiles).
    const layer: (() => void)[] = [];
    const over: (() => void)[] = [];
    // Whether anything tall stands over the survivor this frame (each fades, but several together can hide them).
    let hidden = false;
    const pcol = Math.round(cam.px);
    for (let ty = y0; ty <= Math.min(world.size - 1, y1 + 3); ty++) {
      // Two columns either side too: a wide tree, rock, or the wreck there can reach into the view.
      for (let tx = Math.max(0, x0 - 2); tx <= Math.min(world.size - 1, x1 + 2); tx++) {
        const i = idx(tx, ty);
        const sx = tx * TILE - cam.x;
        const sy = ty * TILE - cam.y;
        if (ty <= y1) {
          const l = looseAt(state, world, i);
          if (l) {
            const v = Math.floor(rh(tx, ty, 77) * 3);
            const [ox, oy] = this.offset(tx, ty, 41, 5, 4, 3);
            const stoneTint = l === L.chip ? (looseData(world, i, 'outcrop') ?? 1) : 1;
            const art = this.looseArt.get(l, v, stoneTint);
            layer.push(() => g.drawImage(art, sx + ox, sy + oy));
            if (!isTracks(l)) shadows.push([sx + 8 + ox, sy + 14 + oy, 9, 2]);
          }
        }
        // A falls seen face-on only where its river runs toward the viewer; any other way it's the cascade on the ground.
        const fall = this.falls.get(i);
        if (fall && faceOn(fall) && this.drawFalls(fall, sx, sy, timeMs, layer, survivorPx, survivorPy, prow, ty)) hidden = true;
        const f = state.arc.felled[i] ? F.log : world.feature[i]!;
        if (!f) {
          // Cliffs and the rim are rock: the face is the ground (ground.ts); buttresses stand along its
          // open edge, most of the way, and here and there a big one back on the rim.
          const tt = world.terrain[i];
          if ((tt === T.cliff || tt === T.headwall) && !arcOpens(state, world, i) && !this.byFalls[i]) {
            let open = false;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const n = world.terrain[idx(Math.max(0, Math.min(world.size - 1, tx + dx)), Math.max(0, Math.min(world.size - 1, ty + dy)))];
              if (n !== T.cliff && n !== T.headwall) open = true;
            }
            const roll = rh(tx, ty, 77);
            if (open ? roll > 0.7 : tt !== T.headwall || roll > 0.12) continue;
            const big = rh(tx, ty, 78);
            const size = !open ? 3 : tt === T.headwall ? (big < 0.5 ? 2 : 3) : big < 0.45 ? 1 : big < 0.85 ? 2 : 3;
            const r = this.rock(size, -1, Math.floor(rh(tx, ty, 75) * 6));
            const [bx, by] = this.offset(tx, ty, 29, 4, 3, 2);
            const left = sx + 8 + bx - Math.floor(r.c.width / 2);
            const top = sy + 16 + by - r.c.height;
            const behind = prow < ty && survivorPx + 12 > left + 3 && survivorPx + 4 < left + r.c.width - 3 && survivorPy + 14 > top && survivorPy < sy;
            if (behind) hidden = true;
            layer.push(() => {
              if (behind) g.globalAlpha = 0.5;
              g.drawImage(r.c, left, top);
              g.globalAlpha = 1;
            });
          }
          continue;
        }
        if (f === F.conifer || f === F.aspen || f === F.stunted) {
          const size = this.treeSize[i]!;
          const t = this.tree(
            f,
            size,
            Math.floor(rh(tx, ty, 73) * (f === F.conifer ? CONIFER_VARIANTS : 3)),
            f === F.aspen ? this.aspenLeaf(world, tx, ty, day) : 0,
            this.treeForm[i] as ConiferForm,
          );
          // Trees grow where their seed fell, not on the grid: each off its tile's centre (`treeOffset`).
          const [jx, jy] = this.treeOffset(tx, ty);
          const left = sx + 8 + jx - Math.floor(t.c.width / 2);
          const top = sy + 16 + jy - t.c.height;
          const h = t.c.height;
          shadows.push([sx + 8 + jx, sy + 15 + jy, 6 + size * 2, h]);
          // The canopy fades when the survivor is behind it, or under it: standing among the trunks, the
          // tree is drawn over them (SPEC 12.1).
          const under = tx === pcol && ty === prow;
          const behind = under || (prow < ty && survivorPx + 12 > left + 3 && survivorPx + 4 < left + t.c.width - 3 && survivorPy + 14 > top && survivorPy < sy);
          if (behind) hidden = true;
          const s = sway(tx, ty);
          // Stripped bark leaves the raw wood showing, for the rest of the run.
          const stripped = barkStripped(state, i);
          (under ? over : layer).push(() => {
            if (behind) g.globalAlpha = 0.45;
            g.drawImage(t.c, 0, 0, t.c.width, t.crown, left + s, top, t.c.width, t.crown);
            g.drawImage(t.c, 0, t.crown, t.c.width, h - t.crown, left, top + t.crown, t.c.width, h - t.crown);
            if (stripped) {
              g.fillStyle = '#d2b07c';
              g.fillRect(sx + 7 + jx, sy + 12 + jy, 2, 3);
            }
            g.globalAlpha = 1;
          });
          continue;
        }
        if (f === F.thicket) {
          // A tangle of young trees, too close to push between: three saplings crowded on the tile.
          const v = Math.floor(rh(tx, ty, 73) * 3);
          const parts = [
            [-4, -1, 1],
            [4, -2, 1],
            [0, 1, rh(tx, ty, 74) < 0.5 ? 1 : 2],
          ] as const;
          shadows.push([sx + 8, sy + 15, 14, 22]);
          const behind = prow < ty && Math.abs(survivorPx - sx) < 14 && survivorPy + 14 > sy - 24 && survivorPy < sy;
          if (behind) hidden = true;
          layer.push(() => {
            if (behind) g.globalAlpha = 0.5;
            const [jx, jy] = this.treeOffset(tx, ty);
            for (const [ox, oy, size] of parts) {
              const t = this.tree(F.conifer, size, (v + ox + 9) % CONIFER_VARIANTS, 0, this.treeForm[i] as ConiferForm);
              g.drawImage(t.c, sx + 8 + Math.round(jx / 2) + ox - Math.floor(t.c.width / 2), sy + 16 + Math.round(jy / 2) + oy - t.c.height);
            }
            g.globalAlpha = 1;
          });
          continue;
        }
        // Things taller than their tile: rocks, the snag, the wreckage. Each blocks only its own tile(s);
        // the survivor can stand behind it, and it fades a little then (SPEC 12.1).
        const standUp = (t: Tall, cx: number, mirror = false, shadowW = 12, dy = 0) => {
          const left = cx - Math.floor(t.c.width / 2);
          const top = sy + 16 + dy - t.c.height;
          const behind = prow < ty && survivorPx + 12 > left + 3 && survivorPx + 4 < left + t.c.width - 3 && survivorPy + 14 > top && survivorPy < sy;
          if (behind) hidden = true;
          shadows.push([cx, sy + 15 + dy, shadowW, t.c.height]);
          layer.push(() => {
            if (behind) g.globalAlpha = 0.5;
            if (mirror) {
              g.save();
              g.translate(left + t.c.width, top);
              g.scale(-1, 1);
              g.drawImage(t.c, 0, 0);
              g.restore();
            } else g.drawImage(t.c, left, top);
            g.globalAlpha = 1;
          });
        };
        const v3 = Math.floor(rh(tx, ty, 75) * 3);
        if (f === F.boulder || f === F.outcrop || f === F.overhang) {
          const size = f === F.overhang ? 3 : this.rockSize[i]!;
          const r = this.rock(size, f === F.boulder ? -2 : f === F.overhang ? -1 : world.data[i]!, Math.floor(rh(tx, ty, 75) * 6));
          // Boulders sit anywhere on their tile, and either way round; an outcrop shifts a little; the overhang stays put.
          const [ox, oy] = f === F.boulder ? this.offset(tx, ty, 21, 5, 4, 3) : f === F.outcrop ? this.offset(tx, ty, 25, 3, 2, 2) : [0, 0];
          standUp(r, sx + 8 + ox, f === F.boulder && rh(tx, ty, 80) < 0.5, r.c.width - 2, oy);
          continue;
        }
        if (f === F.snag) {
          standUp(this.once(`snag:${v3 % 2}`, () => tallSnag(v3 % 2)), sx + 8, false, 10);
          continue;
        }
        // Landmarks and the bear's den, drawn over several tiles (landmarks.ts).
        if (f === F.arch) {
          standUp(this.once(`arch:${v3 % 2}`, () => rockArch(v3 % 2)), sx + 8, rh(tx, ty, 92) < 0.5, 40);
          continue;
        }
        if (f === F.bones) {
          standUp(this.once(`bones:${v3 % 2}`, () => bonePile(v3 % 2)), sx + 8, rh(tx, ty, 92) < 0.5, 8);
          continue;
        }
        if (f === F.carcass) {
          standUp(this.once(`carcass:${v3 % 2}`, () => carcass(v3 % 2)), sx + 8, rh(tx, ty, 92) < 0.5, 22);
          continue;
        }
        if (f === F.den && world.data[i] === 0) {
          standUp(this.once(`bear-den:${v3 % 2}`, () => bearDen(v3 % 2)), sx + 8, rh(tx, ty, 92) < 0.5, 44);
          continue;
        }
        if (f === F.tail) {
          standUp(this.once('tail', tailWreck), sx + 8, rh(tx, ty, 91) < 0.5, 26);
          continue;
        }
        if (f === F.crash) {
          const wr = this.wreck;
          if (wr && ty === wr.y && tx === wr.x) standUp(this.once('wreck', () => ({ c: forwardWreck(), crown: 0 })), sx + 8 * wr.wide, wr.mirror, WRECK_W - 16);
          continue;
        }
        if (ty > y1) continue;
        // A picked-over patch looks thin until it comes back.
        const bare = (f === F.plant || f === F.herb || f === F.bush) && (state.regrow[i] ?? 0) > state.tick;
        if (f === F.log) {
          const lg = this.logArt(world, tx, ty);
          layer.push(() => g.drawImage(lg.art, sx + lg.dx, sy + lg.dy));
          continue;
        }
        const art = this.atlas.feature(f, world.data[i]!);
        // Bushes and plants grow where they took root, not on a grid: off-centre, and either way round.
        const grows = f === F.plant || f === F.herb || f === F.bush;
        const [ox, oy] = grows ? this.offset(tx, ty, 33, 5, 4, 3) : [0, 0];
        const flip = grows && rh(tx, ty, 87) < 0.5;
        layer.push(() => {
          if (bare) g.globalAlpha = 0.4;
          if (flip) {
            g.save();
            g.translate(sx + ox + TILE, sy + oy);
            g.scale(-1, 1);
            g.drawImage(art, 0, 0);
            g.restore();
          } else g.drawImage(art, sx + ox, sy + oy);
          g.globalAlpha = 1;
        });
      }
      if (ty <= y1) this.rowThings(state, cam, ty, x0, x1, timeMs, layer, shadows);
      if (ty === prow) {
        layer.push(() => this.drawSurvivor(state, cam));
        // A tree the survivor stands under goes on top of them.
        for (const d of over) layer.push(d);
        over.length = 0;
        shadows.push([survivorPx + 8, survivorPy + 15, 7, 14]);
      }
    }
    // Every shadow first, then everything in row order, so rows below stand in front of rows above.
    this.shadows(cam, sun, shadows);
    for (const d of layer) d();
    if (prow > y1 + 3) this.drawSurvivor(state, cam);
    // Faded trees and rocks stack: in a thick stand three or four can stand over the survivor and hide
    // them. So when anything does, they're drawn again on top, a little see-through, always in sight.
    if (hidden) {
      g.globalAlpha = 0.7;
      this.drawSurvivor(state, cam);
      g.globalAlpha = 1;
    }

    if (hover) {
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.strokeRect(hover.x * TILE - cam.x + 0.5, hover.y * TILE - cam.y + 0.5, TILE - 1, TILE - 1);
    }
    if (mark) this.brackets(mark.x * TILE - cam.x, mark.y * TILE - cam.y, timeMs);

    this.cloudShadows(state, cam, timeMs, wind);
    this.mist(state, cam, timeMs, x0, y0, x1, y1);
    this.light(state, cam, timeMs);
    this.ground.warm(cam.x, cam.y, SCREEN_W, SCREEN_H, snow);
    if (ghost) drawGhost(g, ghost.kind, ghost.x * TILE - cam.x, ghost.y * TILE - cam.y, ghost.ok);
    return cam;
  }

  /**
   * A waterfall's drawing, standing on its foot tile and rising over the tiles behind (SPEC 12.1): the
   * rock and the sheet, then the water's moving streaks down the sheet and spray off the pool. It fades
   * when the survivor is behind it, like a tall rock. Returns whether it does.
   */
  private drawFalls(fall: Fall, sx: number, sy: number, timeMs: number, layer: (() => void)[], survivorPx: number, survivorPy: number, prow: number, ty: number): boolean {
    const big = fall.size >= 4;
    const v = Math.floor(rh(fall.x, fall.y, 95) * 3);
    const art = this.once(`falls:${big ? 1 : 0}:${v}`, () => fallsArt(big, v)) as FallsArt;
    // The pool's middle on the foot tile's centre, where the stream below carries on.
    const left = sx + 8 - Math.floor(art.c.width / 2);
    const top = sy + 8 - (art.sheet.y1 + 2);
    const behind = prow < ty && survivorPx + 12 > left + 3 && survivorPx + 4 < left + art.c.width - 3 && survivorPy + 14 > top && survivorPy < sy;
    const g = this.g;
    const { x0, x1, y0, y1 } = art.sheet;
    layer.push(() => {
      if (behind) g.globalAlpha = 0.5;
      g.drawImage(art.c, left, top);
      // Streaks of white sliding down the sheet, quicker toward the bottom.
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < (x1 - x0) * 1.4; k++) {
        const x = x0 + ((k * 7) % (x1 - x0));
        const h = y1 - y0;
        const p = ((timeMs / 420 + k * 0.37 + ((k * 13) % 5) * 0.11) % 1) ** 1.4;
        g.fillRect(left + x, top + y0 + Math.floor(p * (h - 3)), 1, 2 + Math.floor(p * 3));
      }
      // Spray off the pool: soft puffs rising and fading.
      for (let k = 0; k < 6; k++) {
        const p = (timeMs / 1300 + k / 6) % 1;
        const x = art.c.width / 2 + (((k * 11) % 7) - 3) * 2.4 + Math.sin(p * 4 + k) * 2;
        const y = y1 - p * 9;
        g.fillStyle = `rgba(236,244,244,${0.45 * (1 - p)})`;
        g.fillRect(left + Math.round(x - 2), top + Math.round(y - 1), 4, 3);
      }
      g.globalAlpha = 1;
    });
    return behind;
  }

  /** Builds, stashes, fires, and animals on one row. */
  private rowThings(state: GameState, cam: Camera, ty: number, x0: number, x1: number, timeMs: number, layer: (() => void)[], shadows: [number, number, number, number][]): void {
    const g = this.g;
    for (const bd of state.builds) {
      if (bd.y !== ty || bd.x < x0 || bd.x > x1) continue;
      const bx = bd.x * TILE - cam.x;
      const by = bd.y * TILE - cam.y;
      layer.push(() => {
        if (bd.kind === 'fire-lay') {
          const items = bd.items ?? [];
          drawLay(g, bx, by, { tinder: items.some((i) => i.k === 'tinder'), sticks: items.filter((i) => i.k === 'stick').reduce((n, i) => n + i.n, 0), wood: items.some((i) => i.k === 'firewood') });
        } else if (bd.kind.startsWith('site:')) drawSite(g, bd.kind.slice(5), bx, by, siteProgress(bd));
        else buildArt(g, bd.kind, bx, by);
      });
    }
    const sm = state.smoulder;
    if (sm && sm.y === ty) {
      const sx = sm.x * TILE - cam.x;
      const sy = sm.y * TILE - cam.y;
      layer.push(() => {
        g.fillStyle = rh(2, Math.floor(timeMs / 200), 9) < 0.5 ? PALETTE.ember : PALETTE.fire;
        g.fillRect(sx + 7, sy + 4, 2, 2);
        for (let k = 0; k < 4; k++) {
          const age = (timeMs / 1100 + k / 4) % 1;
          g.fillStyle = `rgba(200,200,195,${0.5 * (1 - age)})`;
          g.fillRect(sx + 6 + Math.round(Math.sin(age * 5 + k) * 2), sy + 2 - Math.round(age * 30), 3, 3);
        }
      });
    }
    for (const st of state.stashes) {
      if (st.y !== ty || st.x < x0 || st.x > x1 || !st.items.length) continue;
      const art = this.looseArt.item(st.items[0]!.k) ?? this.atlas.sprite('stash');
      const sx = st.x * TILE - cam.x;
      const sy = st.y * TILE - cam.y;
      const glint = st.items[0]!.k === 'metal-scrap' && Math.floor(timeMs / 140) % 11 === 0;
      shadows.push([sx + 8, sy + 14, 9, 3]);
      layer.push(() => {
        g.drawImage(art, sx, sy);
        if (glint) {
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fillRect(sx + 6, sy + 6, 1, 5);
          g.fillRect(sx + 4, sy + 8, 5, 1);
        }
      });
    }
    for (const f of state.fires) if (f.y === ty) layer.push(() => this.drawFire(f, f.x * TILE - cam.x, f.y * TILE - cam.y, timeMs));
    for (const a of state.animals) {
      if (a.y !== ty || a.x < x0 || a.x > x1 || a.mode === 'gone') continue;
      const near = Math.max(Math.abs(a.x - state.player.x), Math.abs(a.y - state.player.y));
      if (a.kind === 'grouse' && a.mode !== 'flee' && near > 2) continue;
      const last = this.lastX.get(a.id) ?? a.x;
      if (last !== a.x) this.facingLeft.set(a.id, a.x < last);
      this.lastX.set(a.id, a.x);
      const bob = a.mode === 'flee' || a.mode === 'leave' ? Math.floor(timeMs / 120 + a.id) % 2 : 0;
      const ax = a.x * TILE - cam.x;
      const ay = a.y * TILE - cam.y;
      if (a.kind !== 'jay') shadows.push([ax + 8, ay + 15, 8, 8]);
      layer.push(() => g.drawImage(this.atlas.animal(a.kind, this.facingLeft.get(a.id) ?? false), ax, ay - bob));
    }
  }

  /** Every shadow on the screen, cast away from the sun, merged so overlaps don't darken twice. */
  private shadows(cam: Camera, sun: { dx: number; len: number; alpha: number } | null, list: [number, number, number, number][]): void {
    if (!sun || !list.length) return;
    const s = this.shadowLayer.g;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'copy';
    s.fillStyle = 'rgba(0,0,0,0)';
    s.fillRect(0, 0, this.shadowLayer.c.width, this.shadowLayer.c.height);
    s.globalCompositeOperation = 'source-over';
    // The layer's pixels lie on the world's, so the shadows keep their blocky edge and don't shimmer as
    // the camera glides: draw shifted by the camera's part-pixel, then lay the layer back by it.
    const fx = cam.x - Math.floor(cam.x);
    const fy = cam.y - Math.floor(cam.y);
    s.translate(fx, fy);
    s.fillStyle = '#0a0d12';
    for (const [x, y, w, h] of list) {
      const reach = h * sun.len * 0.55;
      const cx = x + sun.dx * reach * 0.7;
      const cy = y - 1 - reach * 0.18;
      s.beginPath();
      s.ellipse(cx, cy, w / 2 + Math.abs(sun.dx) * reach * 0.5, 1.5 + Math.min(3, h * 0.08), 0, 0, Math.PI * 2);
      s.fill();
    }
    this.g.globalAlpha = sun.alpha;
    this.g.drawImage(this.shadowLayer.c, -fx, -fy);
    this.g.globalAlpha = 1;
  }

  /** Water that moves: shimmer on the lake and streams, foam falling down the waterfall. */
  private water(cam: Camera, timeMs: number, x0: number, y0: number, x1: number, y1: number): void {
    const world = this.world!;
    const g = this.g;
    const shimmer = Math.floor(timeMs / 450);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = world.terrain[idx(tx, ty)]!;
        if (!TERRAIN[t]!.water) continue;
        const dx = tx * TILE - cam.x;
        const dy = ty * TILE - cam.y;
        if (t === T.waterfall) {
          // Foam racing the way the water runs.
          const [fx, fy] = this.fallDir.get(idx(tx, ty)) ?? [0, 1];
          g.fillStyle = 'rgba(244,250,248,0.7)';
          for (let k = 0; k < 5; k++) {
            const run = ((timeMs / 7 + k * 9 + (tx * 7 + ty * 3) * 5) % 22) - 11;
            const side = ((k * 5 + tx + ty) % 9) - 4;
            const x = dx + 8 + fx * run - fy * side;
            const y = dy + 8 + fy * run + fx * side;
            if (x < dx || y < dy || x > dx + TILE - 2 || y > dy + TILE - 2) continue;
            // Rounded on the world's pixels, not the screen's (the camera can stand between them).
            g.fillRect(Math.round(x + cam.x) - cam.x, Math.round(y + cam.y) - cam.y, Math.abs(fx) > 0.5 ? 3 : 1, Math.abs(fy) > 0.5 ? 3 : 1);
          }
          continue;
        }
        const n = t === T.stream || t === T.gravel ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const r = rh(tx * 3 + k, ty, shimmer + k * 7);
          if (r < 0.3) {
            g.fillStyle = 'rgba(200,225,225,0.5)';
            g.fillRect(dx + (Math.floor(r * 50) % 14), dy + (Math.floor(r * 170) % 15), t === T.stream ? 3 : 2, 1);
          }
        }
      }
    }
  }

  /** The trout (SPEC 7.4): dark shapes easing between their tiles, darting when startled; rings at dusk. */
  private fish(state: GameState, cam: Camera, timeMs: number, dt: number): void {
    const g = this.g;
    const minute = clock(state.tick).minute;
    const dusk = minute >= 1110 && minute <= 1290;
    const seenIds = new Set<number>();
    for (const f of state.fish) {
      seenIds.add(f.id);
      const tx = f.x * TILE + 3 + Math.floor(rh(f.id, 1, 81) * 10);
      const ty = f.y * TILE + 4 + Math.floor(rh(f.id, 2, 81) * 9);
      let at = this.fishAt.get(f.id);
      if (!at) {
        at = { x: tx, y: ty, left: false };
        this.fishAt.set(f.id, at);
      }
      const k = Math.min(1, dt * (f.spook > 0 ? 9 : 1.6));
      if (Math.abs(tx - at.x) > 0.5) at.left = tx < at.x;
      at.x += (tx - at.x) * k;
      at.y += (ty - at.y) * k;
      const sx = Math.round(at.x + Math.sin(timeMs / 600 + f.id) * 0.8) - cam.x;
      const sy = Math.round(at.y) - cam.y;
      if (sx < -8 || sy < -8 || sx > SCREEN_W + 8 || sy > SCREEN_H + 8) continue;
      const tail = Math.floor(timeMs / (f.spook > 0 ? 80 : 260) + f.id) % 2;
      g.fillStyle = 'rgba(16,26,30,0.55)';
      const dir = at.left ? -1 : 1;
      g.fillRect(sx - 2, sy, 5, 2);
      g.fillRect(sx - 1, sy - 1, 3, 1);
      g.fillRect(sx - 3 * dir, sy + tail, 1, 1);
      g.fillStyle = 'rgba(16,26,30,0.35)';
      g.fillRect(sx - 4 * dir, sy - 1 + tail * 2, 1, 1);
      if (dusk && rh(f.id, Math.floor(timeMs / 500), 82) < 0.012) this.rings.push({ x: at.x, y: at.y, t: timeMs });
    }
    for (const id of [...this.fishAt.keys()]) if (!seenIds.has(id)) this.fishAt.delete(id);
    this.rings = this.rings.filter((r) => timeMs - r.t < 1600);
    for (const r of this.rings) {
      const age = (timeMs - r.t) / 1600;
      g.strokeStyle = `rgba(220,235,232,${0.55 * (1 - age)})`;
      g.beginPath();
      g.ellipse(Math.round(r.x) - cam.x + 0.5, Math.round(r.y) - cam.y + 0.5, 1 + age * 6, 0.6 + age * 3, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }

  /** Corner marks round the tile under the mouse, when a click would do something there. */
  private brackets(x: number, y: number, timeMs: number): void {
    const g = this.g;
    const a = 0.55 + Math.sin(timeMs / 260) * 0.2;
    g.fillStyle = `rgba(240,232,210,${a})`;
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]] as const) {
      g.fillRect(x + cx + (sx < 0 ? -2 : 0), y + cy, 3, 1);
      g.fillRect(x + cx, y + cy + (sy < 0 ? -2 : 0), 1, 3);
    }
  }

  /** Cloud shadows drifting over the ground on a broken-cloud day (SPEC 12.1). */
  private cloudShadows(state: GameState, cam: Camera, timeMs: number, wind: number): void {
    const def = WEATHER[weatherAt(state)];
    if (def.fog > 0 || def.gloom > 0.4 || daylight(state.tick) < 35) return;
    if (!this.clouds) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 96;
      const cg = c.getContext('2d')!;
      const img = cg.createImageData(96, 96);
      for (let y = 0; y < 96; y++) {
        for (let x = 0; x < 96; x++) {
          // Wrapped noise, so the texture tiles without a seam.
          const a = Math.sin((x / 96) * Math.PI * 2);
          const b = Math.cos((x / 96) * Math.PI * 2);
          const cc = Math.sin((y / 96) * Math.PI * 2);
          const d = Math.cos((y / 96) * Math.PI * 2);
          const v = perlin(901, a * 1.6 + 5, cc * 1.6 + 5) + perlin(902, b * 1.6 + 9, d * 1.6 + 9) * 0.8 + perlin(903, a * 3.2 + cc * 2, b * 3.2 + d * 2) * 0.35;
          const o = (y * 96 + x) * 4;
          img.data[o + 3] = Math.max(0, Math.min(255, (v - 0.18) * 900));
        }
      }
      cg.putImageData(img, 0, 0);
      this.clouds = c;
    }
    const scale = 9;
    const size = 96 * scale;
    const drift = (timeMs / 1000) * (3 + wind * 14);
    const ox = (((-cam.x * 0.98 + drift) % size) + size) % size;
    const oy = (((-cam.y * 0.98 + drift * 0.35) % size) + size) % size;
    const g = this.g;
    g.globalAlpha = def.gloom > 0.1 ? 0.12 : 0.16;
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'multiply';
    for (let y = oy - size; y < SCREEN_H; y += size) for (let x = ox - size; x < SCREEN_W; x += size) g.drawImage(this.clouds, x, y, size, size);
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
  }

  /** Mist on the valley floor at dawn (SPEC 12.1), thinning as the morning goes on. */
  private mist(state: GameState, cam: Camera, timeMs: number, x0: number, y0: number, x1: number, y1: number): void {
    const m = clock(state.tick).minute;
    const a = Math.max(0, 1 - Math.abs(m - 390) / 140);
    if (a <= 0.01) return;
    if (!this.mistBlob) {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 32;
      const mg = c.getContext('2d')!;
      const grad = mg.createRadialGradient(24, 16, 0, 24, 16, 22);
      grad.addColorStop(0, 'rgba(225,230,232,0.9)');
      grad.addColorStop(1, 'rgba(225,230,232,0)');
      mg.fillStyle = grad;
      mg.scale(1, 32 / 48);
      mg.fillRect(0, 0, 48, 48);
      this.mistBlob = c;
    }
    const g = this.g;
    g.globalAlpha = a * 0.22;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.lowland[idx(tx, ty)] || (tx + ty) % 2) continue;
        const drift = Math.sin(timeMs / 4000 + tx * 0.7 + ty * 0.3) * 5;
        g.drawImage(this.mistBlob, tx * TILE - cam.x - 16 + drift, ty * TILE - cam.y - 8);
      }
    }
    g.globalAlpha = 1;
  }

  private drawSurvivor(state: GameState, cam: Camera): void {
    const p = state.player;
    const free = state.walk === 'free' && p.fx !== undefined && p.fy !== undefined;
    const moving = free ? p.fx !== p.lastFx || p.fy !== p.lastFy : p.stepLeft > 0;
    // Walking alternates feet (free walking: every half tile walked); working (a task) rocks slowly between the frames.
    const stride = free ? ((p.fx! >> 7) + (p.fy! >> 7)) & 1 : p.stepLeft * 2 > p.stepTotal ? 1 : 0;
    const frame = moving ? stride : state.task ? Math.floor(performance.now() / 350) % 2 : 0;
    const asleep = state.sleep !== null && !state.sleep.awake;
    const sprite = this.atlas.person(state.protagonist, asleep ? -1 : p.facing, frame);
    // On a device pixel, not a screen pixel: the survivor moves as smoothly as the camera (see `camera`).
    this.g.drawImage(sprite, this.snap(cam.px * TILE) - cam.x, this.snap(cam.py * TILE) - cam.y);
  }

  private drawFire(fire: Fire, x: number, y: number, timeMs: number): void {
    const g = this.g;
    const f = Math.floor(timeMs / 120);
    // The ring of stones, and the ash.
    g.fillStyle = PALETTE.stone;
    for (const [sx, sy] of [[2, 12], [5, 14], [9, 14], [12, 12], [2, 9], [12, 9]] as const) g.fillRect(x + sx, y + sy, 2, 2);
    g.fillStyle = fire.banked ? PALETTE.fog : PALETTE.bark;
    g.fillRect(x + 4, y + 11, 8, 3);
    if (burning(fire)) {
      const tall = Math.min(1, fire.fuel / 40) * 0.6 + 0.4;
      for (let k = 0; k < 4; k++) {
        const h = Math.round((3 + Math.floor(rh(k, f, 3) * 6)) * tall);
        g.fillStyle = k % 2 ? PALETTE.fire : PALETTE.ember;
        g.fillRect(x + 4 + k * 2, y + 11 - h, 2, h);
      }
      g.fillStyle = PALETTE.cream;
      g.fillRect(x + 7, y + 9, 2, 2);
      // Smoke drifts up from a smoky fire: what an aircraft would see.
      if (fire.smoke > 0) {
        for (let k = 0; k < 6; k++) {
          const age = ((timeMs / 900 + k / 6) % 1);
          g.fillStyle = `rgba(220,220,215,${0.55 * (1 - age)})`;
          g.fillRect(x + 6 + Math.round(Math.sin(age * 6 + k) * 3), y + 6 - Math.round(age * 40), 4, 3);
        }
      }
    } else if (fire.coals > 0 || fire.banked) {
      g.fillStyle = fire.banked ? '#8a3a22' : PALETTE.ember;
      g.fillRect(x + 6, y + 12, 1, 1);
      g.fillRect(x + 9, y + 12, 1, 1);
      if (!fire.banked && rh(1, f, 5) < 0.5) g.fillRect(x + 7, y + 11, 2, 1);
    }
  }

  /** The grade, firelight, and darkness, over the finished scene. */
  private light(state: GameState, cam: Camera, timeMs: number): void {
    const g = this.g;
    const minute = clock(state.tick).minute;
    const grade = gradeAt(minute);
    const fires = sightCircles(state).filter((c) => c.fire);

    const flicker = (k: number) => 1 + (rh(k, Math.floor(timeMs / 90), 11) - 0.5) * 0.06;
    const centre = (x: number, y: number) => [x * TILE + TILE / 2 - cam.x, y * TILE + TILE / 2 - cam.y] as const;
    const pool = (f: { x: number; y: number; r: number }, k: number) => {
      const [cx, cy] = centre(f.x, f.y);
      const r = (f.r + 0.5) * TILE * flicker(k);
      return { cx, cy, r, box: this.box(cx - r, cy - r, cx + r, cy + r) };
    };

    // Keep the full-colour scene for the firelit pools: only round the fires (a box over them all), since
    // the buffers are the screen's full size. Drawn through the same scale, a whole buffer is SCREEN_W × SCREEN_H.
    let [ux0, uy0, ux1, uy1] = [SCREEN_W, SCREEN_H, 0, 0];
    fires.forEach((f, k) => {
      const [bx, by, bw, bh] = pool(f, k).box;
      if (bw <= 0 || bh <= 0) return;
      [ux0, uy0, ux1, uy1] = [Math.min(ux0, bx), Math.min(uy0, by), Math.max(ux1, bx + bw), Math.max(uy1, by + bh)];
    });
    if (ux1 > ux0 && uy1 > uy0) {
      const d = this.k;
      this.color.g.globalCompositeOperation = 'copy';
      this.color.g.drawImage(this.canvas, ux0 * d, uy0 * d, (ux1 - ux0) * d, (uy1 - uy0) * d, ux0, uy0, ux1 - ux0, uy1 - uy0);
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

    this.weather(state, cam, timeMs);

    const dark = (1 - daylight(state.tick) / 100) * NIGHT_DARKNESS;

    // A fire is a warm pool of light, and the only colour at night.
    fires.forEach((f, k) => {
      // The scene in full colour, lit warm, fading out from the fire. Only the box round the fire's
      // light is worked on: the buffers are the screen's full size, and whole-screen passes add up.
      const { cx, cy, r, box } = pool(f, k);
      const [bx, by, bw, bh] = box;
      if (bw <= 0 || bh <= 0) return;
      const d = this.k;
      const t = this.tmp.g;
      t.globalCompositeOperation = 'copy';
      t.drawImage(this.color.c, bx * d, by * d, bw * d, bh * d, bx, by, bw, bh);
      t.globalCompositeOperation = 'multiply';
      t.fillStyle = 'rgb(255,190,125)';
      t.fillRect(bx, by, bw, bh);
      t.globalCompositeOperation = 'destination-in';
      const keep = t.createRadialGradient(cx, cy, 0, cx, cy, r);
      const strength = 0.35 + 0.65 * dark;
      keep.addColorStop(0, `rgba(0,0,0,${strength})`);
      keep.addColorStop(0.45, `rgba(0,0,0,${0.85 * strength})`);
      keep.addColorStop(0.8, `rgba(0,0,0,${0.3 * strength})`);
      keep.addColorStop(1, 'rgba(0,0,0,0)');
      t.fillStyle = keep;
      t.fillRect(bx, by, bw, bh);
      t.globalCompositeOperation = 'source-over';
      g.drawImage(this.tmp.c, bx * d, by * d, bw * d, bh * d, bx, by, bw, bh);
      // A glow at the heart of it.
      g.globalCompositeOperation = 'screen';
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
      glow.addColorStop(0, `rgba(255,150,60,${0.1 + 0.15 * dark})`);
      glow.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = glow;
      g.fillRect(...this.box(cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5));
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
    g.imageSmoothingEnabled = true;
    g.drawImage(this.mask.c, 0, 0, SCREEN_W, SCREEN_H);
    g.imageSmoothingEnabled = false;
    this.flash(timeMs);
    this.aircraft(state);
  }

  /** A search aircraft crossing the sky, high over everything (SPEC 10). */
  private aircraft(state: GameState): void {
    const f = flightNow(state);
    if (!f) return;
    const t = (state.tick - f.t) / (FLIGHT_MINUTES * MIN);
    this.g.globalAlpha = daylight(state.tick) > 20 ? 0.9 : 0.4;
    this.g.drawImage(this.atlas.sprite('plane'), Math.round(-20 + t * (SCREEN_W + 40)), 18 + Math.round(t * 30));
    this.g.globalAlpha = 1;
  }

  /** Lightning lights everything for a moment (toned down if the setting asks). */
  private flash(timeMs: number): void {
    const age = timeMs - this.flashAt;
    if (age > 220) return;
    const g = this.g;
    const strength = (this.reduceFlashes ? 0.12 : 0.55) * (1 - age / 220);
    g.fillStyle = `rgba(235,240,255,${strength})`;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  /** Rain, snow, fog, and cloud over the graded scene (SPEC 12.1: weather you can feel). */
  private weather(state: GameState, cam: Camera, timeMs: number): void {
    const g = this.g;
    const id = weatherAt(state);
    const def = WEATHER[id];
    const here = this.world ? weatherNow(state, this.world) : null;
    if (def.gloom > 0) {
      g.globalCompositeOperation = 'multiply';
      const v = Math.round(255 * (1 - def.gloom * 0.45));
      g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 8)})`;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.globalCompositeOperation = 'source-over';
    }
    if (def.fog > 0) {
      g.fillStyle = `rgba(196,202,206,${def.fog * 0.55})`;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    if (def.wet) {
      const n = id === 'drizzle' ? 60 : id === 'rain' ? 140 : 220;
      const snowing = here?.snow ?? false;
      const t = timeMs / (snowing ? 2600 : 420);
      const slant = Math.round(def.wind * 6);
      g.fillStyle = snowing ? 'rgba(240,244,248,0.85)' : 'rgba(190,205,220,0.45)';
      for (let k = 0; k < n; k++) {
        const fx = rh(k, 1, 77) * (SCREEN_W + 40) - 20;
        const fy = (rh(k, 2, 77) + t + k * 0.013) % 1;
        const x = Math.round(fx + fy * slant * 8 - ((cam.x * 0.2) % SCREEN_W) * 0) % SCREEN_W;
        const y = Math.round(fy * (SCREEN_H + 20)) - 10;
        if (snowing) g.fillRect((x + Math.round(Math.sin(t * 6 + k) * 3) + SCREEN_W) % SCREEN_W, y, 2, 2);
        else g.fillRect((x + SCREEN_W) % SCREEN_W, y, 1, id === 'drizzle' ? 3 : 6);
      }
    }
  }
}
