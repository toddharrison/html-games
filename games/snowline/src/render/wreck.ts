// The wreckage, drawn in code (SPEC 6.4, 12.1): the forward section lying broken on the shore across two
// tiles, the scar it ploughed and the pieces it shed, and the tail section high in the alpine. Built once
// into canvases; the renderer anchors them at their tiles' feet.

import { rh } from './tiles.ts';
import type { Tall } from './flora.ts';

const SNOW = '#e9ece6';
const PALE = '#c4c9c4';
const STONE = '#5f666c';
const SLATE = '#3b4350';
const INK = '#14161a';
const RED = '#9a3a32';
const RUST = '#6e3a2c';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function px(g: CanvasRenderingContext2D, x: number, y: number, col: string, w = 1, h = 1): void {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/** Fill a polygon pixel by pixel, colouring each by `col(x, y)` (null leaves it). */
function poly(g: CanvasRenderingContext2D, pts: [number, number][], col: (x: number, y: number) => string | null): void {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.floor(y0); y <= y1; y++) {
    for (let x = Math.floor(x0); x <= x1; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) continue;
      const c = col(x, y);
      if (c) px(g, x, y, c);
    }
  }
}

/** Width of the forward wreck's canvas; its middle sits over the middle of its two tiles. */
export const WRECK_W = 64;

/**
 * The forward section, tail to the left (the renderer mirrors it): the fuselage broken behind the cabin,
 * the nose crumpled into the ground with the propeller bent back, one wing snapped and pointing at the sky,
 * the other gone. Sits on its tiles' foot line.
 */
export function forwardWreck(): HTMLCanvasElement {
  const H = 44;
  const [c, g] = canvas(WRECK_W, H);
  const base = H - 4;
  const mid = (x: number) => base - 8 + Math.floor((x - 8) * 0.07); // the nose dug in lower
  const half = (x: number) => (x < 22 ? 2 + (x - 8) * 0.4 : x < 46 ? 7.6 : 7.6 - (x - 46) * 0.7);

  // The wing torn up and back, behind the fuselage: root over the cabin, tip high to the left.
  const wingTop = mid(34) - 8;
  poly(
    g,
    [
      [39, wingTop + 2],
      [31, wingTop + 1],
      [13, 3],
      [19, 1],
    ],
    (x, y) => {
      const edge = y <= 2 && x < 20;
      if (x < 17 && y < 6) return RED; // the painted wingtip
      if (edge || rh(x, y, 200) < 0.05) return SLATE;
      return y < wingTop - (x - 13) * 0.3 ? SNOW : PALE;
    },
  );
  // The broken strut, hanging.
  for (let k = 0; k < 9; k++) px(g, 36 - Math.floor(k * 0.6), mid(36) + 3 - k, INK);

  // The fuselage.
  for (let x = 8; x < 54; x++) {
    const h = half(x);
    if (h <= 0) continue;
    // The break behind the cabin: the tail section sits a pixel higher and the skin is torn open.
    const lift = x < 22 ? -1 : 0;
    const top = Math.round(mid(x) - h) + lift;
    const bot = Math.round(mid(x) + h * 0.75) + lift;
    for (let y = top; y <= bot; y++) {
      const from = y - top;
      let col = from === 0 ? SNOW : y >= bot - 1 ? SLATE : PALE;
      const stripe = Math.round(mid(x) + 1) + lift;
      if ((y === stripe || y === stripe + 1) && x > 10 && x < 46) col = RED;
      if (x >= 22 && x <= 24) col = rh(x, y, 201) < 0.6 ? INK : STONE; // the tear
      if (x >= 46) col = rh(x, y, 202) < 0.35 ? STONE : rh(x, y, 203) < 0.3 ? SLATE : rh(x, y, 204) < 0.15 ? INK : PALE; // the crumpled nose
      if (rh(x, y, 205) < 0.04 && x < 46) col = STONE; // dents
      px(g, x, y, col);
    }
    // Jagged edges where the nose folded.
    if (x >= 46 && rh(x, 0, 206) < 0.5) px(g, x, top - 1, STONE);
  }
  // Cabin windows, one smashed, and the door sprung open.
  for (let x = 27; x < 43; x++) {
    if ((x - 27) % 5 === 4) continue;
    const y = mid(x) - 4;
    const smashed = x >= 37 && x < 41;
    px(g, x, y, smashed ? (rh(x, y, 207) < 0.5 ? STONE : INK) : INK, 1, 2);
  }
  px(g, 29, mid(29) - 2, SLATE, 4, 6);
  px(g, 26, mid(26) + 1, PALE, 3, 6);
  px(g, 26, mid(26) + 1, STONE, 1, 6);
  // The tail fin, at the left end.
  poly(
    g,
    [
      [8, mid(8) - 2],
      [15, mid(15) - 3],
      [11, mid(11) - 15],
      [7, mid(7) - 14],
    ],
    (x, y) => (y < mid(8) - 11 ? RED : x === 7 || x === 8 ? SNOW : PALE),
  );
  px(g, 4, mid(8) - 1, SLATE, 8, 1);
  // The propeller, bent back against the nose.
  const nx = 53;
  const ny = mid(nx);
  for (const [dx, dy] of [
    [1, -1],
    [2, -2],
    [2, -3],
    [1, -5],
    [0, -6],
    [1, 1],
    [3, 2],
    [4, 2],
    [6, 3],
  ] as const)
    px(g, nx + dx, ny + dy, SLATE);
  px(g, nx, ny - 1, INK, 2, 2);
  // A streak of rust and oil down from the engine.
  for (let y = ny + 2; y < base; y++) if (rh(y, 0, 208) < 0.7) px(g, 49 + (y % 2), y, RUST);
  return c;
}

/**
 * What the crash left on the ground (drawn under everything else): a furrow ploughed behind the tail, a
 * long torn panel, and bits scattered round. In tile-sized pieces so the renderer can leave out water.
 * Returns the canvas and its offset from the left wreck tile's top-left, in pixels.
 */
export function crashScar(tilesWide: number): { c: HTMLCanvasElement; ox: number; oy: number } {
  const W = 16 * 7;
  const H = 16 * 5;
  const [c, g] = canvas(W, H);
  // The wreck's own tiles start at (3 tiles, 2 tiles) in this canvas.
  const ox = -16 * 3;
  const oy = -16 * 2;
  const wx = 48;
  const wy = 32;
  // The furrow: torn turf and bare earth, widening toward the wreck, from the left.
  for (let x = 2; x < wx + 10; x++) {
    const t = x / (wx + 10);
    const half = 1 + t * 3;
    const cy = wy + 12 - Math.round(t * 2 + Math.sin(x * 0.3) * 0.6);
    for (let y = Math.floor(cy - half - 1); y <= cy + half + 1; y++) {
      const inner = Math.abs(y - cy) <= half;
      if (!inner && rh(x, y, 210) > 0.5) continue;
      px(g, x, y, inner ? (rh(x, y, 211) < 0.3 ? '#4a3b2b' : '#5d4a36') : '#3f4a2a');
    }
  }
  // A long panel of skin torn off, lying askew in front.
  poly(
    g,
    [
      [wx + 14, wy + 22],
      [wx + 30, wy + 19],
      [wx + 31, wy + 22],
      [wx + 15, wy + 25],
    ],
    (x, y) => (y === Math.floor(wy + 22 - (x - wx - 14) * 0.18) ? SNOW : rh(x, y, 212) < 0.1 ? STONE : PALE),
  );
  // Bits everywhere: paint flakes, glass, a red piece, a seat cushion.
  for (let k = 0; k < 46; k++) {
    const x = Math.floor(rh(k, 1, 213) * (W - 4)) + 2;
    const y = Math.floor(rh(k, 2, 214) * (H - 4)) + 2;
    if (x >= wx && x < wx + 16 * tilesWide && y >= wy && y < wy + 16) continue;
    const r = rh(k, 3, 215);
    px(g, x, y, r < 0.4 ? PALE : r < 0.6 ? STONE : r < 0.75 ? RED : r < 0.9 ? '#a9c7cf' : SLATE, r < 0.15 ? 2 : 1, 1);
  }
  px(g, wx - 10, wy + 22, '#4b5a8a', 4, 3);
  px(g, wx - 10, wy + 22, '#5e6c9a', 4, 1);
  return { c, ox, oy };
}

/** The tail section, torn off and lying in the snow with its fin standing up: two tiles tall. */
export function tailWreck(): Tall {
  const W = 30;
  const H = 36;
  const [c, g] = canvas(W, H);
  const base = H - 3;
  // The torn tube, open end to the left showing the dark inside.
  for (let x = 3; x < 24; x++) {
    const h = 6 - (x - 3) * 0.17;
    const top = Math.round(base - 6 - h);
    const bot = Math.round(base - 6 + h * 0.8);
    for (let y = top; y <= bot; y++) {
      let col = y === top ? SNOW : y >= bot - 1 ? SLATE : PALE;
      if (y === base - 5 || y === base - 4) col = RED;
      if (x < 6) col = x === 3 && rh(x, y, 220) < 0.5 ? STONE : INK;
      px(g, x, y, col);
    }
  }
  // Jagged torn skin round the open end.
  for (let y = base - 13; y < base; y++) if (rh(0, y, 221) < 0.6) px(g, 2 + (y % 2), y, STONE);
  // The fin.
  poly(
    g,
    [
      [16, base - 10],
      [25, base - 10],
      [26, 2],
      [21, 1],
    ],
    (x, y) => (y < 9 ? RED : y < 11 ? SNOW : x <= 17 ? SNOW : x >= 24 ? SLATE : PALE),
  );
  // Snow drifted on top, and the horizontal stabiliser sticking out.
  px(g, 20, 0, SNOW, 4, 1);
  for (let x = 8; x < 20; x++) if (rh(x, 0, 222) < 0.7) px(g, x, Math.round(base - 12 + (x - 8) * 0.0), SNOW);
  px(g, 22, base - 11, SLATE, 8, 1);
  px(g, 22, base - 12, PALE, 7, 1);
  return { c, crown: 0 };
}
