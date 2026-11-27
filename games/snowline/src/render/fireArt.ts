// A fire laid but not lit (SPEC 8.3, 12.1): a ring of stones, then each part as it goes in: a nest of
// tinder, a little tent of sticks, a split piece of wood leaning on them. Drawn in the world, as the
// see-through preview while placing one, and as the fire's picture on the Make page.

import { PALETTE } from './palette.ts';

type G = CanvasRenderingContext2D;

export interface LayLook {
  tinder: boolean;
  sticks: number;
  wood: boolean;
}

/** Stones round the cleared spot: lit on top, dark below. */
const RING: [number, number][] = [[2, 11], [4, 13], [7, 14], [10, 14], [12, 12], [13, 9], [2, 8], [4, 6], [11, 6]];

function px(g: G, x: number, y: number, c: string, w = 1, h = 1): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

/** The laid fire on the 16×16 tile at (x, y). */
export function drawLay(g: G, x: number, y: number, lay: LayLook): void {
  // The scraped spot: bare earth.
  px(g, x + 4, y + 8, '#5a4a38', 8, 5);
  px(g, x + 5, y + 7, '#5a4a38', 6, 1);
  px(g, x + 5, y + 13, '#4a3c2e', 6, 1);
  for (const [sx, sy] of RING) {
    px(g, x + sx, y + sy, PALETTE.stone, 2, 2);
    px(g, x + sx, y + sy, '#c4c3b8');
    px(g, x + sx + 1, y + sy + 1, '#56544d');
  }
  if (lay.tinder) {
    px(g, x + 6, y + 10, '#d8c27a', 4, 2);
    px(g, x + 7, y + 9, '#e9d9a0', 2, 1);
    px(g, x + 5, y + 11, '#b8a058');
    px(g, x + 10, y + 11, '#b8a058');
  }
  if (lay.sticks > 0) {
    // A little tent of sticks over the tinder.
    for (let k = 0; k < 4; k++) px(g, x + 5 + k, y + 11 - k, k % 2 ? '#8a6d4c' : '#5e4a36');
    if (lay.sticks > 1) for (let k = 0; k < 4; k++) px(g, x + 10 - k, y + 11 - k, k % 2 ? '#5e4a36' : '#8a6d4c');
  }
  if (lay.wood) {
    px(g, x + 3, y + 12, '#6b4f36', 6, 2);
    px(g, x + 3, y + 12, '#c9a676', 1, 2);
    px(g, x + 4, y + 12, '#8a6a48', 4, 1);
  }
}

/** The preview while choosing where a fire goes: the ring, see-through, tinted by whether it can go there. */
export function drawLayGhost(g: G, x: number, y: number, ok: boolean): void {
  g.save();
  g.globalAlpha = 0.6;
  drawLay(g, x, y, { tinder: true, sticks: 2, wood: false });
  g.globalAlpha = 0.35;
  px(g, x, y, ok ? '#7fd06a' : '#e0563f', 16, 16);
  g.restore();
  g.strokeStyle = ok ? 'rgba(160,230,140,0.9)' : 'rgba(240,110,90,0.9)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, 15, 15);
}
