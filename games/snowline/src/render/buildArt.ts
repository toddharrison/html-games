// Builds drawn in the world (SPEC 7.6, 12.1): finished, as a site going up (faint, firmer as its parts go
// in), and as the see-through preview while choosing where one goes.

import { PALETTE } from './palette.ts';
import { drawLay } from './fireArt.ts';
import { SPRITES, paint } from './sprites.ts';

type G = CanvasRenderingContext2D;

const sprites = new Map<string, HTMLCanvasElement>();

function sprite(kind: string): HTMLCanvasElement {
  let c = sprites.get(kind);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const def = SPRITES[kind];
    if (def) paint(c.getContext('2d')!, def);
    sprites.set(kind, c);
  }
  return c;
}

/** Stones set round a spot, lit on top. */
function stones(g: G, x: number, y: number, at: readonly (readonly [number, number])[]): void {
  for (const [sx, sy] of at) {
    g.fillStyle = PALETTE.stone;
    g.fillRect(x + sx, y + sy, 2, 2);
    g.fillStyle = PALETTE.fog;
    g.fillRect(x + sx, y + sy, 1, 1);
  }
}

const REFLECTOR = [[0, 4], [0, 9], [14, 4], [14, 9], [4, 0], [10, 0]] as const;
const WEIR = [[1, 3], [3, 6], [5, 9], [7, 11], [9, 11], [11, 9], [13, 6], [14, 3]] as const;

/** A finished build of this kind on the 16×16 tile at (x, y). */
export function buildArt(g: G, kind: string, x: number, y: number): void {
  if (kind === 'reflector') stones(g, x, y, REFLECTOR);
  else if (kind === 'weir') stones(g, x, y, WEIR);
  else g.drawImage(sprite(kind), x, y);
}

/** A build begun: the finished thing, faint, firming up as `done` (0–1) of its parts go in, with stakes marking it out. */
export function drawSite(g: G, kind: string, x: number, y: number, done: number): void {
  g.save();
  g.globalAlpha = 0.25 + 0.55 * done;
  buildArt(g, kind, x, y);
  g.restore();
  g.fillStyle = '#6b4f36';
  for (const [sx, sy] of [[1, 13], [14, 13], [1, 2], [14, 2]] as const) g.fillRect(x + sx, y + sy, 1, 2);
}

/** The preview while choosing where something goes: a tint for whether it can go there, the thing see-through over it. */
export function drawGhost(g: G, kind: string, x: number, y: number, ok: boolean): void {
  g.save();
  g.globalAlpha = 0.3;
  g.fillStyle = ok ? '#7fd06a' : '#e0563f';
  g.fillRect(x, y, 16, 16);
  g.globalAlpha = 0.8;
  if (kind === 'fire') drawLay(g, x, y, { tinder: true, sticks: 2, wood: false });
  else buildArt(g, kind, x, y);
  g.restore();
  g.strokeStyle = ok ? 'rgba(160,230,140,0.9)' : 'rgba(240,110,90,0.9)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, 15, 15);
}
