// The kid's map (SPEC 6.4): the valley as the survivor would draw it on a page torn from a notebook.
// Only what they have seen and learned, not to scale: what's near camp drawn big, what's far squeezed
// small, north still up, every line a little wobbly. Water as crayon blobs, streams as squiggles,
// mountains as peaks, forest as little trees, trails dotted, and the places they know with their own
// labels ("PLANE", "camp", "BEAR!!", "good berries"). A "me" only when they're near somewhere drawn on
// it. Render only: it reads the state and the world and never feeds back.

import { BAND, F, T, WATER } from '../content/terrain.ts';
import { PLANTS, REMEDIES } from '../content/decks.ts';
import { fact, lookName } from '../sim/knowledge.ts';
import type { GameState } from '../sim/state.ts';
import { isExplored } from '../sim/step.ts';
import { clock } from '../sim/time.ts';
import { idx, type World } from '../sim/world.ts';
import { perlin } from '../sim/worldgen/noise.ts';
import { hashString } from '../sim/rng.ts';
import { rh } from './tiles.ts';

/** The page, in pixels. */
export const KID_MAP_SIZE = 720;
/** Tiles to a cell of the rough survey the drawing is made from. */
const CELL = 4;
const HAND = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", "Comic Neue", cursive';
const PENCIL = '#4a4438';
const PAPER = '#efe6cc';
const RULE = 'rgba(110,150,190,0.28)';
const MARGIN = 'rgba(200,80,80,0.45)';
const WATER_INK = '#3f6f9a';
const WATER_CRAYON = 'rgba(90,150,205,0.55)';
const ICE_INK = '#7f9fb5';
const TREE_INK = '#4d7a3a';
const ROCK_INK = '#6b6152';
const RED = '#b23a2e';

type Pt = [number, number];

/** Where things go on the page: a fisheye about home, scaled to fit what's known, wobbled by hand. */
interface Page {
  at(x: number, y: number): Pt;
  /** About how many page pixels a tile spans near (x, y). */
  scale(x: number, y: number): number;
}

function makePage(state: GameState, world: World, home: Pt, seed: number): Page {
  const S = KID_MAP_SIZE;
  const bend = (x: number, y: number): Pt => {
    const dx = x - home[0];
    const dy = y - home[1];
    const r = Math.hypot(dx, dy);
    if (r < 1e-6) return [0, 0];
    // Near home at full size; further out, squeezed more and more (as remembered, not as measured).
    const rr = 12 * Math.pow(r / 12, r < 12 ? 1 : 0.72);
    return [(dx / r) * rr, (dy / r) * rr];
  };
  // Fit what's been seen onto the page.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const fitIn = (x: number, y: number) => {
    const [bx, by] = bend(x, y);
    x0 = Math.min(x0, bx);
    y0 = Math.min(y0, by);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  fitIn(home[0], home[1]);
  for (let y = 0; y < world.size; y += 2) for (let x = 0; x < world.size; x += 2) if (isExplored(state, idx(x, y))) fitIn(x, y);
  // Below the title and the day count, inside the margins.
  const top = 130;
  const bottom = S - 40;
  const left = 70;
  const right = S - 40;
  // At most about 11 px a tile near home: a map begun with little known is drawn small mid-page.
  const k = Math.min(11, (right - left) / Math.max(x1 - x0, 24), (bottom - top) / Math.max(y1 - y0, 24));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const at = (x: number, y: number): Pt => {
    const [bx, by] = bend(x, y);
    const wx = perlin(seed + 1, x / 30, y / 30) * 10;
    const wy = perlin(seed + 2, x / 30, y / 30) * 10;
    return [(left + right) / 2 + (bx - cx) * k + wx, (top + bottom) / 2 + (by - cy) * k + wy];
  };
  return {
    at,
    scale(x, y) {
      const [ax, ay] = at(x, y);
      const [bx, by] = at(x + 2, y);
      return Math.max(1.2, Math.hypot(bx - ax, by - ay) / 2);
    },
  };
}

/** A wobbly pencil line through points. */
function pencil(g: CanvasRenderingContext2D, pts: Pt[], col: string, width: number, salt: number): void {
  if (pts.length < 2) return;
  g.strokeStyle = col;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1]!;
    const [bx, by] = pts[k]!;
    const mx = (ax + bx) / 2 + (rh(k, salt, 501) - 0.5) * 2.4;
    const my = (ay + by) / 2 + (rh(salt, k, 502) - 0.5) * 2.4;
    g.quadraticCurveTo(mx, my, bx, by);
  }
  g.stroke();
}

/** Text in the kid's hand, tilted a little, with a box for keeping labels apart. */
function write(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, col: string, salt: number, placed: number[][]): boolean {
  g.font = `${size}px ${HAND}`;
  const w = g.measureText(text).width;
  const box = [x - 4, y - size - 2, x + w + 4, y + 5];
  if (placed.some((b) => !(box[2]! < b[0]! || box[0]! > b[2]! || box[3]! < b[1]! || box[1]! > b[3]!))) return false;
  if (box[0]! < 8 || box[2]! > KID_MAP_SIZE - 8 || box[1]! < 8 || box[3]! > KID_MAP_SIZE - 8) return false;
  placed.push(box);
  g.save();
  g.translate(x, y);
  g.rotate((rh(salt, 3, 503) - 0.5) * 0.12);
  g.fillStyle = col;
  g.fillText(text, 0, 0);
  g.restore();
  return true;
}

/** A label beside a point: to the right, left, above, or below, whichever is free. */
function label(g: CanvasRenderingContext2D, text: string, p: Pt, size: number, col: string, salt: number, placed: number[][]): void {
  g.font = `${size}px ${HAND}`;
  const w = g.measureText(text).width;
  const tries: Pt[] = [];
  for (const d of [12, 20, 30]) {
    tries.push([p[0] + d, p[1] + 5], [p[0] - d - w, p[1] + 5], [p[0] - w / 2, p[1] - d + 2], [p[0] - w / 2, p[1] + d + 10], [p[0] + d, p[1] + 5 + d], [p[0] - d - w, p[1] - d + 5]);
  }
  for (const [x, y] of tries) if (write(g, text, x, y, size, col, salt, placed)) return;
}

// ---- Little drawings ----

function tree(g: CanvasRenderingContext2D, x: number, y: number, s: number, salt: number): void {
  const h = 7 * s;
  pencil(g, [[x, y], [x, y - h * 0.35]], '#6b5236', 1.2, salt);
  pencil(g, [[x - h * 0.35, y - h * 0.3], [x, y - h], [x + h * 0.35, y - h * 0.3], [x - h * 0.35, y - h * 0.3]], TREE_INK, 1.3, salt + 1);
}

function mountain(g: CanvasRenderingContext2D, x: number, y: number, s: number, snowy: boolean, salt: number): void {
  const w = 11 * s;
  const h = 10 * s;
  pencil(g, [[x - w, y], [x - w * 0.1, y - h], [x + w * 0.15, y - h * 0.8], [x + w, y]], ROCK_INK, 1.4, salt);
  if (snowy) pencil(g, [[x - w * 0.45, y - h * 0.55], [x - w * 0.2, y - h * 0.4], [x, y - h * 0.6], [x + w * 0.3, y - h * 0.45]], ICE_INK, 1.1, salt + 1);
}

function icon(g: CanvasRenderingContext2D, kind: string, x: number, y: number, salt: number, tint = PENCIL): void {
  const ln = (pts: Pt[], col = PENCIL, w = 1.6) => pencil(g, pts, col, w, salt++);
  const dot = (dx: number, dy: number, r: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    g.fill();
  };
  switch (kind) {
    case 'plane':
      ln([[x - 11, y], [x + 11, y]], PENCIL, 2.2);
      ln([[x - 2, y - 9], [x + 2, y + 9]], PENCIL, 2);
      ln([[x - 11, y - 4], [x - 9, y + 4]], PENCIL, 1.6);
      break;
    case 'tail':
      ln([[x - 8, y + 4], [x + 6, y + 4], [x + 4, y - 8], [x, y - 8], [x - 2, y + 4]], PENCIL, 1.6);
      break;
    case 'camp':
      ln([[x - 9, y + 5], [x, y - 8], [x + 9, y + 5], [x - 9, y + 5]], '#7a5a2e', 1.8);
      ln([[x, y - 8], [x, y + 5]], '#7a5a2e', 1.2);
      ln([[x + 12, y + 5], [x + 14, y - 1], [x + 16, y + 3], [x + 18, y - 3], [x + 19, y + 5]], RED, 1.6);
      break;
    case 'cave':
      g.fillStyle = '#3a342c';
      g.beginPath();
      g.ellipse(x, y + 3, 7, 6, 0, Math.PI, 0);
      g.fill();
      ln([[x - 11, y + 3], [x - 6, y - 7], [x + 6, y - 7], [x + 11, y + 3]], ROCK_INK, 1.4);
      break;
    case 'berries':
      dot(-3, 0, 2.6, tint);
      dot(3, 0, 2.6, tint);
      dot(0, -4, 2.6, tint);
      break;
    case 'falls':
      ln([[x - 4, y - 7], [x - 4, y + 6]], WATER_INK, 1.4);
      ln([[x, y - 8], [x, y + 7]], WATER_INK, 1.4);
      ln([[x + 4, y - 7], [x + 4, y + 6]], WATER_INK, 1.4);
      break;
    case 'snag':
      ln([[x, y + 8], [x, y - 2], [x - 4, y - 9]], '#6b5236', 1.8);
      ln([[x, y - 2], [x + 4, y - 8]], '#6b5236', 1.8);
      ln([[x + 7, y - 10], [x + 4, y - 5], [x + 8, y - 5], [x + 5, y]], '#c9a227', 1.4);
      break;
    case 'bones':
      g.strokeStyle = PENCIL;
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(x, y - 2, 5, 0, Math.PI * 2);
      g.stroke();
      dot(-2, -3, 1.2, PENCIL);
      dot(2, -3, 1.2, PENCIL);
      ln([[x - 7, y + 7], [x + 7, y + 5]]);
      break;
    case 'arch':
      ln([[x - 9, y + 6], [x - 8, y - 4], [x - 3, y - 9], [x + 3, y - 9], [x + 8, y - 4], [x + 9, y + 6]], ROCK_INK, 2.2);
      ln([[x - 4, y + 6], [x - 3, y - 2], [x + 3, y - 2], [x + 4, y + 6]], ROCK_INK, 1.4);
      break;
    case 'tarn':
      g.fillStyle = WATER_CRAYON;
      g.beginPath();
      g.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = WATER_INK;
      g.lineWidth = 1.3;
      g.stroke();
      break;
    case 'avalanche':
      for (const dx of [-6, 0, 6]) ln([[x + dx, y - 7], [x + dx, y + 6], [x + dx - 2, y + 3], [x + dx, y + 6], [x + dx + 2, y + 3]], ROCK_INK, 1.2);
      break;
    case 'dam':
      for (let k = -2; k <= 2; k++) ln([[x + k * 3 - 2, y - 4], [x + k * 3 + 2, y + 4]], '#6b5236', 1.4);
      break;
    case 'carcass':
    case 'x':
      ln([[x - 6, y - 6], [x + 6, y + 6]], RED, 2);
      ln([[x + 6, y - 6], [x - 6, y + 6]], RED, 2);
      break;
    case 'lookout':
      ln([[x - 8, y + 6], [x, y - 6], [x + 8, y + 6]], ROCK_INK, 1.4);
      ln([[x, y - 6], [x, y - 15]], PENCIL, 1.2);
      g.fillStyle = RED;
      g.beginPath();
      g.moveTo(x, y - 15);
      g.lineTo(x + 7, y - 12);
      g.lineTo(x, y - 9);
      g.fill();
      break;
    case 'knoll':
      ln([[x - 10, y + 5], [x - 4, y - 3], [x + 4, y - 3], [x + 10, y + 5]], ROCK_INK, 1.6);
      break;
    case 'spark':
      dot(0, 2, 5, '#8a8274');
      ln([[x + 5, y - 9], [x + 7, y - 4]], '#d9952a', 1.4);
      ln([[x + 9, y - 7], [x + 6, y - 5]], '#d9952a', 1.4);
      break;
    case 'me':
      g.strokeStyle = RED;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y - 9, 3, 0, Math.PI * 2);
      g.stroke();
      ln([[x, y - 6], [x, y + 2]], RED, 1.6);
      ln([[x - 4, y - 3], [x + 4, y - 3]], RED, 1.4);
      ln([[x, y + 2], [x - 3, y + 7]], RED, 1.4);
      ln([[x, y + 2], [x + 3, y + 7]], RED, 1.4);
      break;
  }
}

// ---- The drawing ----

/**
 * A smooth blob from points (metaballs): each point pulls the field up near it, and the blob is where
 * the field is over a half (`max`: each point on its own, for a line of even width). Built on a coarse
 * grid and read smoothly, so its edge is a soft curve.
 */
function blobField(points: { x: number; y: number; r: number }[], merge: 'sum' | 'max' = 'sum'): (x: number, y: number) => number {
  const S = KID_MAP_SIZE;
  const STEP = 3;
  const n = Math.ceil(S / STEP) + 1;
  const f = new Float32Array(n * n);
  for (const p of points) {
    const reach = p.r * 2.2;
    const gx0 = Math.max(0, Math.floor((p.x - reach) / STEP));
    const gx1 = Math.min(n - 1, Math.ceil((p.x + reach) / STEP));
    const gy0 = Math.max(0, Math.floor((p.y - reach) / STEP));
    const gy1 = Math.min(n - 1, Math.ceil((p.y + reach) / STEP));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const d2 = ((gx * STEP - p.x) ** 2 + (gy * STEP - p.y) ** 2) / (p.r * p.r);
        if (d2 >= 4.84) continue;
        const v = (1 - d2 / 4.84) ** 2;
        f[gy * n + gx] = merge === 'sum' ? f[gy * n + gx]! + v : Math.max(f[gy * n + gx]!, v);
      }
    }
  }
  return (x, y) => {
    const fx = Math.min(n - 1.001, Math.max(0, x / STEP));
    const fy = Math.min(n - 1.001, Math.max(0, y / STEP));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = fx - x0;
    const v = fy - y0;
    const a = f[y0 * n + x0]! + (f[y0 * n + x0 + 1]! - f[y0 * n + x0]!) * u;
    const b = f[(y0 + 1) * n + x0]! + (f[(y0 + 1) * n + x0 + 1]! - f[(y0 + 1) * n + x0]!) * u;
    return a + (b - a) * v;
  };
}

/** Fill where `inside` holds with crayon scribble (or solid), and run a pencil line round its edge. */
function crayon(g: CanvasRenderingContext2D, inside: (x: number, y: number) => boolean, fill: string, edge: string | null, salt: number, solid = false): void {
  const S = KID_MAP_SIZE;
  const mask = document.createElement('canvas');
  mask.width = mask.height = S;
  const mg = mask.getContext('2d')!;
  const img = mg.createImageData(S, S);
  const on = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x, y)) (on[y * S + x] = 1), (img.data[(y * S + x) * 4 + 3] = 255);
  mg.putImageData(img, 0, 0);
  const fillC = document.createElement('canvas');
  fillC.width = fillC.height = S;
  const fg = fillC.getContext('2d')!;
  if (solid) {
    fg.fillStyle = fill;
    fg.fillRect(0, 0, S, S);
  } else {
    fg.strokeStyle = fill;
    fg.lineWidth = 3;
    fg.lineCap = 'round';
    for (let k = -S; k < S; k += 5) {
      fg.beginPath();
      fg.moveTo(k + (rh(k, salt, 510) - 0.5) * 4, 0);
      fg.lineTo(k + S * 0.7 + (rh(salt, k, 511) - 0.5) * 6, S);
      fg.stroke();
    }
  }
  fg.globalCompositeOperation = 'destination-in';
  fg.drawImage(mask, 0, 0);
  g.drawImage(fillC, 0, 0);
  if (!edge) return;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && on[y * S + x] === 1;
  g.fillStyle = edge;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!at(x, y) || (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1))) continue;
      g.fillRect(x - 0.6, y - 0.6, 1.8, 1.8);
    }
  }
}

/** The survivor's map of the valley, drawn into `g` (KID_MAP_SIZE square). */
export function drawKidMap(g: CanvasRenderingContext2D, state: GameState, world: World): void {
  const S = KID_MAP_SIZE;
  const seed = hashString(`${world.genSeed}/kid-map`)[0];
  const seen = (x: number, y: number) => x >= 0 && y >= 0 && x < world.size && y < world.size && isExplored(state, idx(x, y));

  // The page: notebook paper, ruled, a red margin, a little grain.
  g.fillStyle = PAPER;
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S * S; y += 997) {
    const px = y % S;
    const py = Math.floor(y / S) * 13 % S;
    g.fillStyle = 'rgba(120,100,70,0.08)';
    g.fillRect(px, py, 2, 2);
  }
  g.strokeStyle = RULE;
  g.lineWidth = 1;
  for (let y = 70; y < S; y += 26) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(S, y + 0.5);
    g.stroke();
  }
  g.strokeStyle = MARGIN;
  g.beginPath();
  g.moveTo(54.5, 0);
  g.lineTo(54.5, S);
  g.stroke();

  // Home: the camp, or the plane until there's a camp.
  const camp = state.builds[0] ?? state.fires[0];
  const home: Pt = camp ? [camp.x, camp.y] : [world.crash.x, world.crash.y];
  const page = makePage(state, world, home, seed);
  const placed: number[][] = [];

  // A rough survey, cell by cell, of what's been seen: water, ice, rock, forest.
  const C = Math.ceil(world.size / CELL);
  const kind = new Uint8Array(C * C); // 0 unseen, 1 open, 2 water, 3 ice, 4 rock, 5 forest
  const high = new Uint8Array(C * C);
  for (let cy = 0; cy < C; cy++) {
    for (let cx = 0; cx < C; cx++) {
      let n = 0;
      let water = 0;
      let ice = 0;
      let rock = 0;
      let trees = 0;
      let band = 0;
      for (let y = cy * CELL; y < Math.min(world.size, cy * CELL + CELL); y++) {
        for (let x = cx * CELL; x < Math.min(world.size, cx * CELL + CELL); x++) {
          const i = idx(x, y);
          if (!isExplored(state, i)) continue;
          n++;
          const t = world.terrain[i]!;
          const w = world.water[i]!;
          if ((w === WATER.lake || w === WATER.tarn) && (t === T.deep || t === T.shallows)) water++;
          else if (t === T.snow) ice++;
          else if (t === T.headwall || t === T.cliff || t === T.rock || t === T.talus || t === T.scree || t === T.boulders) rock++;
          const f = world.feature[i]!;
          if (f === F.conifer || f === F.aspen || f === F.thicket) trees++;
          band = Math.max(band, world.band[i]!);
        }
      }
      if (!n) continue;
      const c = cy * C + cx;
      high[c] = band;
      kind[c] = water / n > 0.45 ? 2 : ice / n > 0.5 ? 3 : rock / n > 0.55 ? 4 : trees / n > 0.3 ? 5 : 1;
    }
  }
  const centre = (cx: number, cy: number) => page.at(cx * CELL + CELL / 2, cy * CELL + CELL / 2);

  // Water and ice: smooth blobs from the cells, crayon inside and a pencil edge.
  for (const [want, fill, edge] of [
    [2, WATER_CRAYON, WATER_INK],
    [3, 'rgba(235,242,247,0.95)', ICE_INK],
  ] as const) {
    const pts: { x: number; y: number; r: number }[] = [];
    for (let cy = 0; cy < C; cy++) {
      for (let cx = 0; cx < C; cx++) {
        if (kind[cy * C + cx] !== want) continue;
        const [x, y] = centre(cx, cy);
        pts.push({ x, y, r: page.scale(cx * CELL, cy * CELL) * CELL * 0.75 });
      }
    }
    if (!pts.length) continue;
    const field = blobField(pts);
    crayon(g, (x, y) => field(x, y) > 0.5, fill, edge, want);
  }

  // Streams: one pencil line, however wide the stream: its seen tiles gathered into small cells (the
  // middle of each), each joined to the cells beside it, filled in so the line never breaks where the
  // page is stretched.
  const SC = 3;
  const sn = Math.ceil(world.size / SC);
  const sum = new Float64Array(sn * sn * 3);
  for (let y = 0; y < world.size; y++) {
    for (let x = 0; x < world.size; x++) {
      if (!seen(x, y)) continue;
      const t = world.terrain[idx(x, y)]!;
      if (t !== T.stream && t !== T.gravel && t !== T.waterfall) continue;
      const c = (Math.floor(y / SC) * sn + Math.floor(x / SC)) * 3;
      sum[c]! += x + 0.5;
      sum[c + 1]! += y + 0.5;
      sum[c + 2]! += 1;
    }
  }
  const mid = (cx: number, cy: number): Pt | null => {
    if (cx < 0 || cy < 0 || cx >= sn || cy >= sn) return null;
    const c = (cy * sn + cx) * 3;
    return sum[c + 2] ? [sum[c]! / sum[c + 2]!, sum[c + 1]! / sum[c + 2]!] : null;
  };
  const stream: { x: number; y: number; r: number }[] = [];
  for (let cy = 0; cy < sn; cy++) {
    for (let cx = 0; cx < sn; cx++) {
      const m = mid(cx, cy);
      if (!m) continue;
      const r = Math.max(1.6, Math.min(3.2, page.scale(m[0], m[1]) * 0.3));
      const a = page.at(m[0], m[1]);
      stream.push({ x: a[0], y: a[1], r });
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
        const o = mid(cx + dx, cy + dy);
        if (!o) continue;
        const b = page.at(o[0], o[1]);
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / r);
        for (let k = 1; k < steps; k++) stream.push({ x: a[0] + ((b[0] - a[0]) * k) / steps, y: a[1] + ((b[1] - a[1]) * k) / steps, r });
      }
    }
  }
  if (stream.length) {
    const field = blobField(stream, 'max');
    crayon(g, (x, y) => field(x, y) > 0.5, WATER_INK, null, 9, true);
  }

  // Trails the survivor has seen: dotted, along each trail's line.
  g.setLineDash([2, 5]);
  for (const line of world.trailLines ?? []) {
    const pts: Pt[] = [];
    for (const i of line) {
      const x = i % world.size;
      const y = Math.floor(i / world.size);
      if (!seen(x, y)) {
        if (pts.length > 1) pencil(g, pts, '#8a6a44', 1.3, i);
        pts.length = 0;
        continue;
      }
      pts.push(page.at(x + 0.5, y + 0.5));
    }
    if (pts.length > 1) pencil(g, pts, '#8a6a44', 1.3, line[0] ?? 0);
  }
  g.setLineDash([]);

  // Mountains and trees: a few drawn, not every one, the way a kid would.
  for (let cy = 0; cy < C; cy++) {
    for (let cx = 0; cx < C; cx++) {
      const k = kind[cy * C + cx]!;
      if (k !== 4 && k !== 5) continue;
      const r = rh(cx, cy, 520);
      const [x, y] = centre(cx, cy);
      const s = Math.min(1.6, Math.max(0.6, page.scale(cx * CELL, cy * CELL) / 3));
      if (k === 4 && (cx + cy) % 2 === 0 && r < 0.7) mountain(g, x, y, s, high[cy * C + cx]! >= BAND.alpine, cx * 31 + cy);
      if (k === 5 && r < 0.55) tree(g, x + (rh(cx, cy, 521) - 0.5) * 6, y, s, cx * 17 + cy);
    }
  }

  // The places, with what's known of them.
  const places: { x: number; y: number; first: boolean; draw: () => void; write: () => void }[] = [];
  const written = new Set<string>();
  // Each drawn first (keeping its room clear of labels); then labels, each written once (the first, the
  // most important or nearest home, gets it).
  const put = (kindName: string, x: number, y: number, text: string, col = PENCIL, size = 16, tint?: string) => {
    const p = page.at(x + 0.5, y + 0.5);
    places.push({
      x,
      y,
      // What matters most is labelled first: home, the wreckage, and warnings (in red).
      first: size >= 17 || col === RED,
      draw: () => {
        icon(g, kindName, p[0], p[1], x * 13 + y, tint);
        placed.push([p[0] - 5, p[1] - 6, p[0] + 5, p[1] + 5]);
      },
      write: () => {
        if (!text || written.has(text)) return;
        written.add(text);
        label(g, text, p, size, col, x * 7 + y, placed);
      },
    });
  };
  put('plane', world.crash.x, world.crash.y, 'PLANE', PENCIL, 18);
  if (camp) put('camp', camp.x, camp.y, 'camp', PENCIL, 18);
  const { shelter } = world.overhang;
  if (seen(shelter.x, shelter.y)) put('cave', shelter.x, shelter.y, 'dry spot under the rock');
  if (seen(world.wreck.x, world.wreck.y)) put('tail', world.wreck.x, world.wreck.y, 'TAIL of the plane!', PENCIL, 17);
  if (seen(world.knoll.x, world.knoll.y)) put('knoll', world.knoll.x, world.knoll.y, 'high open spot');
  world.viewpoints.forEach((v, i) => {
    if (state.viewpoints[i]) put('lookout', v.x, v.y, 'lookout');
  });
  // Rocks that spark, once a stone from them has.
  const sx = world.sparkOutcrop.x;
  const sy = world.sparkOutcrop.y;
  const stone = world.data[idx(sx, sy)]!;
  if (seen(sx, sy) && fact(state, 'stone', stone)?.value === 'sparks') put('spark', sx, sy, 'spark rocks');
  // Landmarks noticed.
  const LANDMARK_LABEL: Record<string, [string, string]> = {
    waterfall: ['falls', 'waterfall'],
    snag: ['snag', 'lightning tree'],
    bones: ['bones', 'bones'],
    avalanche: ['avalanche', 'knocked-down trees'],
    tarn: ['tarn', 'little lake'],
    arch: ['arch', 'hole in the rock'],
    'beaver-dam': ['dam', 'stick dam'],
    carcass: ['carcass', 'dead thing in the water'],
  };
  world.landmarks.forEach((lm, k) => {
    if (!state.memory[`noticed-${k}`]) return;
    const [ic, text] = LANDMARK_LABEL[lm.kind] ?? ['x', lm.kind];
    put(ic, lm.x, lm.y, text);
  });
  // Dens: once looked into, what lives there.
  for (let i = 0; i < world.size * world.size; i++) {
    if (world.feature[i] !== F.den) continue;
    const x = i % world.size;
    const y = Math.floor(i / world.size);
    if (!seen(x, y)) continue;
    const d = world.data[i]!;
    const animal = d === 0 ? 'bear' : d === 1 ? 'cougar' : 'marmot';
    const looked = !!state.memory[`den-${animal}`];
    if (animal === 'bear') put('cave', x, y, looked ? 'BEAR!! stay away' : 'big hole under a rock', looked ? RED : PENCIL, looked ? 18 : 15);
    else if (animal === 'cougar') put('cave', x, y, looked ? 'something hunts from here' : 'rock shelf', looked ? RED : PENCIL);
    else put('cave', x, y, 'little holes (whistlers)');
  }
  // Berries and plants: where seen, drawn; labelled by look once something is known of them (what
  // tasting taught), and berries not yet tried just "berries?". Nearest home first.
  const TINT: Record<string, string> = { red: '#b8352c', blue: '#3f5f9a', white: '#e8e4d6', pale: '#d8cfa8', purple: '#6a3f7a', green: '#4d7a3a', brown: '#7a5a3a', orange: '#d9822b' };
  const patches = world.patches
    .filter((p) => seen(p.center.x, p.center.y))
    .map((p) => ({ p, d: (p.center.x - home[0]) ** 2 + (p.center.y - home[1]) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.p);
  for (const p of patches) {
    const row = p.role === 'herb' ? 'remedy' : 'plant';
    const def = row === 'plant' ? PLANTS[p.thing] : REMEDIES[p.thing];
    const name = lookName(row, p.thing);
    const f = fact(state, row, p.thing);
    let text = '';
    let col = PENCIL;
    if (f && row === 'plant') {
      const good = f.value === 'safe' || f.value === 'nourishing' || f.value === 'poor';
      text = good ? `${name} - ok to eat${f.level === 'suspected' ? '?' : ''}` : `${name} - BAD!`;
      col = good ? '#3f6f2e' : RED;
    } else if (f) text = `${name} - ${f.value}`;
    else if ((def as { kind?: string } | undefined)?.kind === 'berry') text = 'berries?';
    put('berries', p.center.x, p.center.y, text, col, 14, TINT[(def as { tint?: string } | undefined)?.tint ?? ''] ?? '#6b8a3a');
  }
  // Water the survivor has found to be foul.
  world.waterCauseSites.forEach((site, i) => {
    const f = fact(state, 'water', i);
    if (f?.value === 'foul' && seen(site.x, site.y)) put('x', site.x, site.y, f.level === 'known' ? 'BAD WATER' : 'bad water?', RED, 16);
  });
  // The most important first, so their labels get the best places.
  for (const p of places) p.draw();
  for (const p of places) if (p.first) p.write();
  for (const p of places) if (!p.first) p.write();

  // Me: only near somewhere drawn on the map.
  const pl = state.player;
  let near: { x: number; y: number } | null = null;
  let best = 13 * 13;
  for (const p of places) {
    const d = (p.x - pl.x) ** 2 + (p.y - pl.y) ** 2;
    if (d < best) [best, near] = [d, p];
  }
  if (near) {
    const p = page.at(pl.x + 0.5, pl.y + 0.5);
    icon(g, 'me', p[0], p[1], 7);
    write(g, 'me', p[0] + 7, p[1] + 14, 15, RED, 9, placed);
  } else write(g, "(not sure where I am now)", 70, S - 22, 15, RED, 11, placed);

  // The title, a north arrow, and the days, counted in fives.
  write(g, `${state.protagonist.name}'s map`, 70, 46, 26, PENCIL, 1, placed);
  pencil(g, [[S - 46, 92], [S - 46, 52]], PENCIL, 2, 3);
  pencil(g, [[S - 53, 62], [S - 46, 50], [S - 39, 62]], PENCIL, 2, 4);
  write(g, 'N', S - 52, 46, 18, PENCIL, 5, placed);
  const day = clock(state.tick).day;
  g.strokeStyle = PENCIL;
  g.lineWidth = 1.6;
  for (let k = 0; k < day; k++) {
    const group = Math.floor(k / 5);
    const inGroup = k % 5;
    const gx = S - 150 + (group % 4) * 26;
    const gy = 108 + Math.floor(group / 4) * 22;
    g.beginPath();
    if (inGroup < 4) {
      g.moveTo(gx + inGroup * 5, gy);
      g.lineTo(gx + inGroup * 5 + 1, gy + 14);
    } else {
      g.moveTo(gx - 3, gy + 11);
      g.lineTo(gx + 19, gy + 2);
    }
    g.stroke();
  }
  write(g, 'days', S - 150, 100, 14, PENCIL, 6, placed);
}
