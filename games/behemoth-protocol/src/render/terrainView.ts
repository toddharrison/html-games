import Phaser from 'phaser';
import type { Terrain } from '../sim/terrain';
import { hashSeed } from '../sim/rng';
import type { BiomeId } from '../content/biomes';
import { CLUMP, clumpSheet, TILE, tileFrame, tileOverlay, tileSheet } from './tileArt';

/** Water frame flips per second. */
const RIPPLE_RATE = 1.4;

interface Column {
  imgs: Phaser.GameObjects.Image[];
  frames: string[];
  /** Tree clumps over forest tiles, created on demand. */
  overlays: (Phaser.GameObjects.Image | null)[];
  overlayFrames: (string | null)[];
}

/**
 * Renders the visible window of the tile grid with a pool of images, one sim column (a screen
 * row, in the vertical view) at a time. Tile art isn't rotated, so its lighting stays screen-relative.
 */
export class TerrainView {
  private readonly columns = new Map<number, Column>();

  private readonly tiles: string;
  private readonly clumps: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly terrain: Terrain,
  ) {
    // Each biome has its own sheets (SPEC §4.6: the biome sets the tile palette).
    const biome: BiomeId = terrain.recipe.biome;
    this.tiles = tileSheet(biome);
    this.clumps = clumpSheet(biome);
  }

  /**
   * @param left trailing edge of the frame (sim x); @param length frame length along travel;
   * @param time seconds, for the water ripple.
   */
  update(left: number, length: number, time: number): void {
    const c0 = Math.floor(left / TILE) - 1;
    const c1 = Math.floor((left + length) / TILE) + 1;

    for (const [col, column] of this.columns) {
      if (col < c0 || col > c1) {
        column.imgs.forEach((i) => i.destroy());
        column.overlays.forEach((i) => i?.destroy());
        this.columns.delete(col);
      }
    }

    for (let col = c0; col <= c1; col++) {
      let column = this.columns.get(col);
      if (!column) {
        column = { imgs: [], frames: [], overlays: [], overlayFrames: [] };
        for (let row = 0; row < this.terrain.rows; row++) {
          // Sim tile (col, row) covers view x [row, row+1] and view y [-(col+1), -col] tiles.
          column.imgs.push(this.scene.add.image(row * TILE, -(col + 1) * TILE, this.tiles, 'ground0').setOrigin(0, 0).setDepth(0));
          column.frames.push('');
          column.overlays.push(null);
          column.overlayFrames.push(null);
        }
        this.columns.set(col, column);
      }
      for (let row = 0; row < this.terrain.rows; row++) {
        const t = this.terrain.tile(col, row);
        // Each tile ripples on its own beat, so the river shimmers rather than blinking in unison.
        const shimmer = Math.floor(time * RIPPLE_RATE + (hashSeed(col, row, 0x3a7e) & 7) / 8) & 1;
        const frame = t ? tileFrame(t, shimmer) : 'ground0';
        if (column.frames[row] !== frame) {
          column.frames[row] = frame;
          column.imgs[row]!.setFrame(frame);
        }
        const overlay = t ? tileOverlay(t) : null;
        if (column.overlayFrames[row] !== overlay) {
          column.overlayFrames[row] = overlay;
          column.overlays[row]?.destroy();
          column.overlays[row] = overlay ? this.makeOverlay(col, row, overlay) : null;
        }
      }
    }
  }

  private makeOverlay(col: number, row: number, frame: string): Phaser.GameObjects.Image {
    // Jitter each clump a little so the forest edge is ragged rather than a grid. Offsets are whole
    // pixels and the top-left corner is placed directly: a half-pixel position makes the sprite
    // flicker between two pixels as the view scrolls.
    const h = hashSeed(col, row, 0xc1);
    const jx = (h & 3) - 2;
    const jy = ((h >> 2) & 3) - 2;
    const flip = ((h >> 4) & 1) === 1;
    const half = Math.floor(CLUMP / 2);
    return this.scene.add
      .image(Math.round((row + 0.5) * TILE) - half + jx, Math.round(-(col + 0.5) * TILE) - half + jy, this.clumps, frame)
      .setOrigin(0, 0)
      .setFlipX(flip)
      .setDepth(0.5);
  }
}
