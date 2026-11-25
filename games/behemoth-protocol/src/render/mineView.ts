import type Phaser from 'phaser';
import type { Terrain } from '../sim/terrain';
import { hex, PAL } from './palette';
import { TILE } from './tileFrames';

/**
 * A swept mine's warning ring (SPEC §4.5): it swells from the mine's lid out to the edge of its
 * tile and fades as it goes, then starts again, so a marked mine never sits still on the ground.
 */
export const MINE_RING = {
  /** Seconds a pulse. */
  period: 1.1,
  /** The ring's radius (game px) as a pulse starts and as it dies. */
  r0: 3,
  r1: 7.5,
  /** Its opacity as a pulse starts. */
  alpha: 0.95,
  /** Each tile's pulse runs this many seconds behind its neighbor's, so a field ripples instead of blinking. */
  ripple: 0.09,
};

/** The ring round the mine in tile (col, row) at `time`: its radius (game px) and opacity. */
export function mineRing(time: number, col: number, row: number): { r: number; alpha: number } {
  const t = time - (col + row) * MINE_RING.ripple;
  const u = (((t / MINE_RING.period) % 1) + 1) % 1;
  // Out fast, slowing at the edge; it fades the same way, so it's brightest at the mine.
  const out = 1 - (1 - u) * (1 - u);
  return { r: MINE_RING.r0 + (MINE_RING.r1 - MINE_RING.r0) * out, alpha: MINE_RING.alpha * (1 - u) };
}

/**
 * Warning rings on the mines the sensors have swept (SPEC §4.5), in the color of an artillery
 * zone's ring (`BarrageViews`): both say "don't be here". Drawn just under those rings, above the
 * night's and a storm's veil, since it's the sensors' mark and not something lit by the sun. A mine
 * not yet swept shows nothing, and a mine that has blown is a crater and loses its ring.
 */
export class MineRings {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(5.85);
  }

  /** @param left trailing edge of the frame (sim x); @param length frame length along travel. */
  update(terrain: Terrain, left: number, length: number, time: number): void {
    const g = this.g;
    g.clear();
    const color = hex(PAL.enemyHi);
    const c0 = Math.floor(left / TILE) - 1;
    const c1 = Math.floor((left + length) / TILE) + 1;
    for (let col = c0; col <= c1; col++) {
      for (let row = 0; row < terrain.rows; row++) {
        const t = terrain.tile(col, row);
        if (!t || t.mat !== 'mine' || !t.seen) continue;
        const { r, alpha } = mineRing(time, col, row);
        // Sim tile (col, row) covers view x [row, row+1] and view y [-(col+1), -col] tiles.
        g.lineStyle(1, color, alpha);
        g.strokeCircle((row + 0.5) * TILE, -(col + 0.5) * TILE, r);
      }
    }
  }
}
