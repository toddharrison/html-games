// Waterfalls (SPEC 6.3, 12.1): where a stream or the outlet drops over rock. The world marks the falling
// water's tiles (T.waterfall); here they're grouped into falls, each given the way its water runs, and a
// drawing that stands at its foot over several tiles: rock either side, the water's glassy lip, the
// falling sheet, and the churned pool below. Render only.

import { T, TERRAIN } from '../content/terrain.ts';
import { idx, type World } from '../sim/world.ts';
import { canvas, type Lump, paintRock, px, type Tall } from './flora.ts';
import { rh } from './tiles.ts';

export interface Fall {
  /** The tile the drawing stands on, and the way the water runs (a unit vector). */
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** How many tiles of falling water. */
  size: number;
  /** Where the water comes from: the middle of the water beside it above its foot (tiles), or the falls' own middle. */
  ux: number;
  uy: number;
  /** Whether water (not falling) carries on just below the foot, for the pool to run into. */
  below: boolean;
}

/** Every falls in the valley, and per tile of falling water the way it runs. */
export function findFalls(world: World): { falls: Fall[]; dir: Map<number, [number, number]> } {
  const S = world.size;
  const isFall = (i: number) => world.terrain[i] === T.waterfall;
  const seen = new Uint8Array(S * S);
  const falls: Fall[] = [];
  const dir = new Map<number, [number, number]>();
  for (let s = 0; s < S * S; s++) {
    if (!isFall(s) || seen[s]) continue;
    const part = [s];
    seen[s] = 1;
    for (let h = 0; h < part.length; h++) {
      const i = part[h]!;
      const x = i % S;
      const y = (i - x) / S;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const j = idx(nx, ny);
          if (isFall(j) && !seen[j]) {
            seen[j] = 1;
            part.push(j);
          }
        }
    }
    // Where the water comes from: the other water beside the falls that lies higher than its foot.
    let lo = Infinity;
    for (const i of part) lo = Math.min(lo, world.elev[i]!);
    let cx = 0;
    let cy = 0;
    for (const i of part) {
      cx += i % S;
      cy += Math.floor(i / S);
    }
    cx /= part.length;
    cy /= part.length;
    let ux = 0;
    let uy = 0;
    let up = 0;
    for (const i of part) {
      const x = i % S;
      const y = (i - x) / S;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const j = idx(nx, ny);
        if (isFall(j) || !TERRAIN[world.terrain[j]!]!.water || world.elev[j]! <= lo) continue;
        ux += nx;
        uy += ny;
        up++;
      }
    }
    let fx = 0;
    let fy = 1;
    if (up) {
      fx = cx - ux / up;
      fy = cy - uy / up;
    } else {
      // No water above it in view: from its highest tile to its lowest.
      let hi = part[0]!;
      let low = part[0]!;
      for (const i of part) {
        if (world.elev[i]! > world.elev[hi]!) hi = i;
        if (world.elev[i]! < world.elev[low]!) low = i;
      }
      fx = (low % S) - (hi % S);
      fy = Math.floor(low / S) - Math.floor(hi / S);
    }
    const len = Math.hypot(fx, fy) || 1;
    fx /= len;
    fy /= len;
    if (!up && fx === 0 && fy === 0) fy = 1;
    for (const i of part) dir.set(i, [fx, fy]);
    // The foot: the furthest down the water's way, kept two tiles in from the map's edge so the drawing shows.
    const inside = (i: number) => {
      const x = i % S;
      const y = (i - x) / S;
      return x >= 2 && y >= 2 && x < S - 2 && y < S - 2;
    };
    const pool = part.some(inside) ? part.filter(inside) : part;
    let foot = pool[0]!;
    let far = -Infinity;
    for (const i of pool) {
      const d = (i % S) * fx + Math.floor(i / S) * fy - world.elev[i]! * 0.01;
      if (d > far) [far, foot] = [d, i];
    }
    const footX = foot % S;
    const footY = Math.floor(foot / S);
    let below = false;
    for (let dx = -1; dx <= 1; dx++) {
      const bx = footX + dx;
      const by = footY + 1;
      if (bx >= 0 && by < S && bx < S && !isFall(idx(bx, by)) && TERRAIN[world.terrain[idx(bx, by)]!]!.water) below = true;
    }
    falls.push({ x: footX, y: footY, dx: fx, dy: fy, size: part.length, ux: up ? ux / up : cx, uy: up ? uy / up : cy, below });
  }
  return { falls, dir };
}

/**
 * Whether a falls is seen face-on, as a sheet: only where its river drops straight down the screen
 * (running toward the viewer, the water above lined up over the foot, and water below it for the pool
 * to run into). Any other way it's the cascade
 * drawn on the ground.
 */
export function faceOn(f: Fall): boolean {
  return f.dy >= 0.6 && Math.abs(f.ux - f.x) <= 0.6 && f.uy < f.y && f.below;
}

/** A falls' drawing, and where its sheet of water is on it (for the moving water drawn over it). */
export interface FallsArt extends Tall {
  sheet: { x0: number; x1: number; y0: number; y1: number };
}

const WET_ROCK = '#5b6260';
const WET_MARK = '#3d4446';

/**
 * A waterfall seen from below, where the river runs toward the viewer: a low face of wet dark rock across
 * the river's line, the river sliding glassy over its lip, falling white as a sheet the width of a
 * stream, into a churned pool that runs on into the stream below. The top rows are left clear, so the
 * stream above shows coming to the lip. `big` (the outlet, or a falls of four tiles or more) is wider and
 * higher; `v` the variant.
 */
export function fallsArt(big: boolean, v: number): FallsArt {
  const W = big ? 40 : 34;
  const H = big ? 34 : 28;
  const [c, g] = canvas(W, H);
  const gap = big ? 12 : 9;
  const x0 = Math.floor((W - gap) / 2);
  const x1 = x0 + gap;
  const lip = 5;
  const base = H - 8;
  // The face: a band of wet rock across, rounded at its ends, its foot hidden in the spray.
  const lumps: Lump[] = [
    { cx: W / 2, cy: (lip + base) / 2 + 1, rx: W / 2 - 1, ry: (base - lip) / 2 + 2, p: 4.5 },
    { cx: 7, cy: base - 3, rx: 6, ry: 4, p: 2.6 },
    { cx: W - 7, cy: base - 2, rx: 6, ry: 4, p: 2.6 },
  ];
  for (let k = 0; k < 3; k++) {
    const side = k % 2 ? 1 : -1;
    lumps.push({ cx: W / 2 + side * (gap / 2 + 3 + rh(k, v, 270) * 6), cy: lip + 3 + rh(v, k, 271) * 3, rx: 4 + rh(k, v, 272) * 2, ry: 3, p: 3 });
  }
  g.drawImage(paintRock(W, H, lumps, WET_ROCK, WET_MARK, v, 2), 0, 0);
  // The water: dark and glassy where it slides to the lip, a pale line where it tips over, then white,
  // streaked, falling; darker at its edges where it's thin.
  for (let y = 0; y < base; y++) {
    for (let x = x0; x < x1; x++) {
      const edge = x === x0 || x === x1 - 1;
      let col: string;
      if (y < lip - 1) col = edge ? '#3f7a83' : '#4c8890';
      else if (y < lip + 1) col = '#8cc1c4';
      else {
        const r = rh(x, 0, 264 + v);
        col = r < 0.22 ? '#a9ccd0' : r < 0.55 ? '#dcecea' : '#f3f8f6';
        if (edge) col = '#7fa9ae';
      }
      px(g, x, y, col);
    }
  }
  // The pool: white where the sheet hits, spreading and going green-blue toward its edge, into the stream below.
  for (let y = base - 2; y < H; y++) {
    const half = gap / 2 + 1 + (y - base + 2) * 0.9;
    for (let x = Math.floor(W / 2 - half); x < Math.ceil(W / 2 + half); x++) {
      const out = Math.abs(x + 0.5 - W / 2) / half;
      const r = rh(x, y, 266 + v);
      if (out > 0.9 && r < 0.6) continue;
      const fade = (y - base) / (H - base) + out * 0.6;
      px(g, x, y, r < 0.18 ? '#9fc4c9' : fade > 0.95 ? '#5d969c' : fade > 0.6 ? '#bcd9d8' : '#f4f9f7');
    }
  }
  return { c, crown: 0, sheet: { x0: x0 + 1, x1: x1 - 1, y0: lip + 1, y1: base } };
}
