import Phaser from 'phaser';
import { battleLayout, lookFromUrl, renderScale, RESOLUTION } from '../config';
import { APPROACH_IDS, type ApproachId } from '../content/approaches';
import { BIOME_IDS, type BiomeId } from '../content/biomes';
import { LOOKS } from '../render/looks';
import { FONT_KEY, fontText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { TILE } from '../render/tileArt';
import { TerrainView } from '../render/terrainView';
import { hashSeed } from '../sim/rng';
import { Terrain } from '../sim/terrain';
import { fitCamera } from './screen';

/**
 * Dev tool (`?terrain`): a battle's terrain with nothing on it, to look over the tile art (SPEC
 * §4.6). The same seed, biome, approach, and look URL params as a battle (`?terrain&seed=3&biome=
 * desert&approach=urban&look=redSand`, `&col=N` to start N tiles in, `&zoom=2` zoomed out); the
 * terrain is the one that battle would get. Keys: up/down
 * or W/S (Shift: faster) or the wheel to scroll, Z to zoom out, [ and ] for the seed, B for the
 * biome, A for the approach, L for the look.
 */
export class TerrainPreviewScene extends Phaser.Scene {
  private terrain!: Terrain;
  private view!: TerrainView;
  private left = 0;
  private zoomOut = 1;
  private info!: Phaser.GameObjects.BitmapText;
  private keys!: Record<'up' | 'down' | 'w' | 's' | 'shift', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('terrainPreview');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get('seed') ?? 1) || 1;
    const biome = (BIOME_IDS as string[]).includes(params.get('biome') ?? '') ? (params.get('biome') as BiomeId) : 'temperate';
    const a = params.get('approach');
    const approach = a && (APPROACH_IDS as string[]).includes(a) ? (a as ApproachId) : null;
    const layout = battleLayout(RESOLUTION, TILE);
    this.terrain = new Terrain(hashSeed(seed, 0x7e44), layout.fieldTiles, { biome, approach });
    this.view = new TerrainView(this, this.terrain, lookFromUrl());
    this.left = Number(params.get('col') ?? 0) * TILE;
    this.zoomOut = params.get('zoom') === '2' ? 2 : 1;
    fitCamera(this);
    this.cameras.main.setBackgroundColor('#0d0f0c');
    this.info = this.add.bitmapText(4, 4, FONT_KEY, '').setTint(hex(PAL.hudText)).setScrollFactor(0).setDepth(10);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { up: kb.addKey(K.UP), down: kb.addKey(K.DOWN), w: kb.addKey(K.W), s: kb.addKey(K.S), shift: kb.addKey(K.SHIFT) };
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => (this.left = Math.max(0, this.left - dy)));
    const reload = (change: Record<string, string | null>) => {
      for (const [k, v] of Object.entries(change)) v === null ? params.delete(k) : params.set(k, v);
      params.set('col', String(Math.floor(this.left / TILE)));
      params.set('zoom', String(this.zoomOut));
      window.location.search = params.toString();
    };
    kb.on('keydown-Z', () => (this.zoomOut = this.zoomOut === 1 ? 2 : 1));
    kb.on('keydown-OPEN_BRACKET', () => reload({ seed: String(Math.max(1, seed - 1)) }));
    kb.on('keydown-CLOSED_BRACKET', () => reload({ seed: String(seed + 1) }));
    kb.on('keydown-B', () => reload({ biome: BIOME_IDS[(BIOME_IDS.indexOf(biome) + 1) % BIOME_IDS.length]!, look: null }));
    kb.on('keydown-A', () => {
      const order: (ApproachId | null)[] = [null, ...APPROACH_IDS];
      reload({ approach: order[(order.indexOf(approach) + 1) % order.length] ?? null });
    });
    kb.on('keydown-L', () => {
      const looks = LOOKS[biome];
      reload({ look: looks[(looks.findIndex((l) => l.id === this.view.look.id) + 1) % looks.length]!.id });
    });
  }

  override update(time: number, delta: number): void {
    const speed = (this.keys.shift.isDown ? 900 : 260) * (delta / 1000);
    if (this.keys.up.isDown || this.keys.w.isDown) this.left += speed;
    if (this.keys.down.isDown || this.keys.s.isDown) this.left = Math.max(0, this.left - speed);

    const cam = this.cameras.main;
    const z = this.zoomOut;
    cam.setZoom(renderScale(RESOLUTION).scale / z);
    const width = RESOLUTION.width * z;
    const height = RESOLUTION.height * z;
    const fieldW = this.terrain.rows * TILE;
    this.terrain.ensure(this.left - TILE * 4, this.left + height + 40 * TILE);
    this.view.update(this.left, height, time / 1000);
    cam.setScroll(-(width - fieldW) / 2, Math.round((-this.left - height) * cam.zoom) / cam.zoom);
    const r = this.terrain.recipe;
    this.info
      .setScale(z)
      .setText(fontText(`${r.biome} ${r.approach ?? 'mix'} ${this.view.look.name}  col ${Math.floor(this.left / TILE)}\n[ ] seed  b biome  a approach  l look  z zoom`.toUpperCase()));
  }
}
