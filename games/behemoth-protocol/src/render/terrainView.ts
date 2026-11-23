import Phaser from 'phaser';
import type { Terrain } from '../sim/terrain';
import { hashSeed } from '../sim/rng';
import { TERRAIN_GEN } from '../content/tuning';
import { GroundPainter } from './ground';
import { lookFor, lookPalette, type Look, type Pal } from './looks';
import { CLUMP, lookSheets, TILE, tileFrame, tileOverlay } from './tileArt';

const CHUNK = TERRAIN_GEN.chunkCols;
/** Ground columns painted per frame for the chunk coming up next (all of a chunk in view at once). */
const PAINT_BUDGET = 4;

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
 * row, in the vertical view) at a time, over the open ground painted a chunk at a time
 * (render/ground.ts). Tile art isn't rotated, so its lighting stays screen-relative.
 */
export class TerrainView {
  private readonly columns = new Map<number, Column>();
  /** Painted ground under each chunk in view, and its texture key. */
  private readonly grounds = new Map<number, { img: Phaser.GameObjects.Image; key: string }>();
  /** Chunks being painted ahead of the view, and the next column each needs. */
  private readonly painting = new Map<number, { painter: GroundPainter; next: number }>();

  /** The battle's look: its season or the like (SPEC §4.6 "Looks"). */
  readonly look: Look;
  private readonly pal: Pal;
  private readonly tiles: string;
  private readonly clumps: string;

  /** @param wanted a look id to use instead of the seed's (the `?look=` playtest shortcut). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly terrain: Terrain,
    wanted?: string,
  ) {
    // Each biome and look has its own sheets (SPEC §4.6: the biome sets the tile palette).
    this.look = lookFor(terrain.recipe.biome, terrain.seed, wanted);
    this.pal = lookPalette(terrain.recipe.biome, this.look);
    ({ tiles: this.tiles, clumps: this.clumps } = lookSheets(scene, terrain.recipe.biome, this.look));
    // Drop every chunk's ground with the scene (a retry or the next battle starts a new view).
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const ci of [...this.grounds.keys()]) this.dropGround(ci);
      this.painting.clear();
    });
  }

  /**
   * @param left trailing edge of the frame (sim x); @param length frame length along travel;
   * @param time seconds, for the water ripple.
   */
  update(left: number, length: number, time: number): void {
    const c0 = Math.floor(left / TILE) - 1;
    const c1 = Math.floor((left + length) / TILE) + 1;

    const k0 = Math.floor(c0 / CHUNK);
    const k1 = Math.floor(c1 / CHUNK);
    for (const ci of this.grounds.keys()) if (ci < k0 || ci > k1 + 1) this.dropGround(ci);
    for (const ci of this.painting.keys()) if (ci < k0) this.painting.delete(ci);
    // Chunks in view are painted now; the next one up a few columns a frame.
    for (let ci = k0; ci <= k1 + 1; ci++) if (!this.grounds.has(ci)) this.paintGround(ci, ci <= k1 ? CHUNK : PAINT_BUDGET);

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
          column.imgs.push(this.scene.add.image(row * TILE, -(col + 1) * TILE, this.tiles, 'clear').setOrigin(0, 0).setDepth(0).setVisible(false));
          column.frames.push('clear');
          column.overlays.push(null);
          column.overlayFrames.push(null);
        }
        this.columns.set(col, column);
      }
      for (let row = 0; row < this.terrain.rows; row++) {
        const t = this.terrain.tile(col, row);
        // Each tile ripples on its own beat, so the river shimmers rather than blinking in unison.
        const shimmer = Math.floor(time * RIPPLE_RATE + (hashSeed(col, row, 0x3a7e) & 7) / 8) & 1;
        const frame = t ? tileFrame(t, shimmer) : 'clear';
        if (column.frames[row] !== frame) {
          column.frames[row] = frame;
          // Open ground is the painted layer underneath: skip drawing its see-through tile.
          column.imgs[row]!.setFrame(frame).setVisible(frame !== 'clear');
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

  /**
   * Paint up to `budget` more columns of chunk `ci`'s open ground; once it's all painted, it becomes a
   * texture of its own under the tiles.
   */
  private paintGround(ci: number, budget: number): void {
    if (!this.terrain.tile(ci * CHUNK, 0)) return;
    let job = this.painting.get(ci);
    if (!job) {
      job = { painter: new GroundPainter(this.terrain, this.look, this.pal, ci, CHUNK, TILE), next: 0 };
      this.painting.set(ci, job);
    }
    // The top column's fringes come from the next chunk: it waits until the world has made it (by
    // then this chunk is still above the frame).
    const last = this.terrain.tile((ci + 1) * CHUNK, 0) ? CHUNK : CHUNK - 1;
    const end = Math.min(last, job.next + budget);
    for (; job.next < end; job.next++) job.painter.paintColumn(job.next);
    if (job.next < CHUNK) return;
    this.painting.delete(ci);

    const { painter } = job;
    const key = `ground_${ci}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const tex = this.scene.textures.createCanvas(key, painter.width, painter.height);
    if (!tex) return;
    tex.getContext().putImageData(new ImageData(painter.pixels as Uint8ClampedArray<ArrayBuffer>, painter.width, painter.height), 0, 0);
    tex.refresh();
    const img = this.scene.add
      .image(0, -(ci + 1) * CHUNK * TILE, key)
      .setOrigin(0, 0)
      .setDepth(-0.5);
    this.grounds.set(ci, { img, key });
  }

  private dropGround(ci: number): void {
    const g = this.grounds.get(ci);
    if (!g) return;
    g.img.destroy();
    this.scene.textures.remove(g.key);
    this.grounds.delete(ci);
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
