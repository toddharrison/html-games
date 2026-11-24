import Phaser from 'phaser';
import type { BiomeId } from '../content/biomes';
import { Rng } from '../sim/rng';
import { HALL_STYLES, ROAD_STYLES, STRUCTURES, structuresOf, TREE_IDS } from '../content/structures';
import { lookPalette, type Look, type Pal } from './looks';
import { canvasTexture, type Painter } from './painter';
import { PAL } from './palette';
import { damageTile, drawCar, drawFootbridge, drawHall, drawRoad, drawStructure, drawTree, drawWall } from './structureArt';
import { CLUMP, CLUMP_FRAMES, CRATER_MASKS, frameName, TILE, TILE_FRAMES, type ClumpFrame, type TileFrame } from './tileFrames';

/**
 * Procedural placeholder terrain (SPEC §11.1): a tile sheet and a raised-overlay sheet per biome and
 * look (SPEC §4.6), drawn from the same recipes in the biome's palette with the look's colors on
 * top. Real art replaces these textures later under the same keys and frame names.
 */

export { CLUMP, TILE, tileFrame, tileOverlay } from './tileFrames';

/**
 * The tile and overlay sheets for a biome in a look (render/looks.ts), drawn the first time a battle
 * needs them. Returns their texture keys.
 */
export function lookSheets(scene: Phaser.Scene, biome: BiomeId, look: Look): { tiles: string; clumps: string } {
  const tiles = `tiles_${biome}_${look.id}`;
  const clumps = `clumps_${biome}_${look.id}`;
  if (scene.textures.exists(tiles) && scene.textures.exists(clumps)) return { tiles, clumps };
  const pal = lookPalette(biome, look);
  packSheet(scene, tiles, tilePieces(biome, pal));
  packSheet(scene, clumps, clumpPieces(biome, pal));
  return { tiles, clumps };
}

/** An image on a sheet and the frames cut from it (offsets inside the image). */
interface Piece {
  w: number;
  h: number;
  draw: (p: Painter) => void;
  frames: [name: string, x: number, y: number, w: number, h: number][];
}

const single = (name: string, size: number, draw: (p: Painter) => void): Piece => ({ w: size, h: size, draw, frames: [[name, 0, 0, size, size]] });

/** Shelf-packs pieces (tallest first) onto one canvas texture and adds their frames. */
function packSheet(scene: Phaser.Scene, key: string, pieces: Piece[], width = 512): void {
  const order = [...pieces].sort((a, b) => b.h - a.h);
  const at = new Map<Piece, [number, number]>();
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const pc of order) {
    if (x + pc.w > width) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    at.set(pc, [x, y]);
    x += pc.w;
    shelf = Math.max(shelf, pc.h);
  }
  const tex = canvasTexture(scene, key, width, y + shelf, (p) => {
    for (const pc of order) {
      [p.ox, p.oy] = at.get(pc)!;
      pc.draw(p);
    }
    p.ox = p.oy = 0;
  });
  for (const pc of order) {
    const [px, py] = at.get(pc)!;
    for (const [name, fx, fy, fw, fh] of pc.frames) tex.add(name, 0, px + fx, py + fy, fw, fh);
  }
}

/** Every tile frame a biome's battles can use. */
function tilePieces(biome: BiomeId, pal: Pal): Piece[] {
  const out: Piece[] = TILE_FRAMES.map((name, i) => single(name, TILE, (p) => drawTile(p, name, new Rng(1000 + i * 77), pal)));
  ROAD_STYLES.forEach((style, si) => {
    for (let links = 0; links < 16; links++) {
      for (let v = 0; v < 2; v++) out.push(single(frameName.road(style, links, v), TILE, (p) => drawRoad(p, style, links, v, new Rng(5000 + si * 101 + links * 7 + v), pal)));
    }
  });
  for (let links = 0; links < 16; links++) {
    for (const d of [false, true]) out.push(single(frameName.wall(links, d), TILE, (p) => drawWall(p, links, d, new Rng(6000 + links), pal)));
  }
  for (const s of [false, true]) {
    for (const d of [false, true]) out.push(single(frameName.footbridge(s, d), TILE, (p) => drawFootbridge(p, s, d, new Rng(6500 + (s ? 1 : 0)), pal)));
  }
  for (const mask of CRATER_MASKS) {
    for (let v = 0; v < 4; v++) out.push(single(frameName.crater(mask, v), TILE, (p) => crater(p, mask, new Rng(6600 + mask * 5 + v), pal)));
  }
  for (const light of [false, true]) {
    for (let edges = 0; edges < 4; edges++) {
      for (const d of [false, true]) out.push(single(frameName.bridge(light, edges, d), TILE, (p) => deck(p, new Rng(6900 + (light ? 1 : 0)), pal, light, d, edges)));
    }
  }
  // Structures, drawn whole and cut into tiles (screen x is the row, y counts down from the front).
  structuresOf(biome).forEach((id, ii) => {
    const def = STRUCTURES[id];
    const w = def.rows * TILE;
    const h = def.cols * TILE;
    for (let style = 0; style < def.styles; style++) {
      for (const d of [false, true]) {
        const seed = 7000 + ii * 131 + style * 17;
        const frames: Piece['frames'] = [];
        for (let dc = 0; dc < def.cols; dc++) {
          for (let dr = 0; dr < def.rows; dr++) frames.push([frameName.structure(id, style, dc, dr, d), dr * TILE, (def.cols - 1 - dc) * TILE, TILE, TILE]);
        }
        out.push({
          w,
          h,
          frames,
          draw: (p) => {
            drawStructure(p, id, style, w, h, new Rng(seed), pal, biome);
            if (!d) return;
            const rng = new Rng(seed + 1);
            for (let ty = 0; ty < h; ty += TILE) for (let tx = 0; tx < w; tx += TILE) damageTile(p, rng, pal, tx, ty);
          },
        });
      }
    }
  });
  for (let style = 0; style < HALL_STYLES; style++) {
    for (const d of [false, true]) {
      const frames: Piece['frames'] = [];
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) frames.push([frameName.hall(style, x, y, d), x * TILE, y * TILE, TILE, TILE]);
      out.push({
        w: 3 * TILE,
        h: 3 * TILE,
        frames,
        draw: (p) => {
          drawHall(p, style, new Rng(8000 + style), pal);
          if (!d) return;
          const rng = new Rng(8100 + style);
          for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) damageTile(p, rng, pal, x * TILE, y * TILE);
        },
      });
    }
  }
  return out;
}

/** Every overlay frame: the old clumps, tree species, and cars. */
function clumpPieces(biome: BiomeId, pal: Pal): Piece[] {
  const out: Piece[] = CLUMP_FRAMES.map((name, i) => single(name, CLUMP, (p) => drawClump(p, name, new Rng(3000 + i * 31), pal, biome)));
  TREE_IDS.forEach((species, si) => {
    for (let v = 0; v < 2; v++) out.push(single(frameName.tree(species, v), CLUMP, (p) => drawTree(p, species, v, new Rng(3500 + si * 13 + v), pal, biome)));
  });
  for (const o of ['v', 'h'] as const) {
    for (let v = 0; v < 4; v++) {
      for (let state = 0; state < 4; state++) out.push(single(frameName.car(o === 'v', v, state), CLUMP, (p) => drawCar(p, o === 'v', v, state, new Rng(3900 + v * 5 + state), pal)));
    }
  }
  return out;
}

function drawClump(p: Painter, name: ClumpFrame, rng: Rng, pal: Pal, biome: BiomeId): void {
  const c = CLUMP / 2;
  if (name.startsWith('boulder')) {
    boulder(p, rng, c, pal, biome);
    return;
  }
  if (name.startsWith('tank')) {
    fuelTank(p, rng, c, name === 'tank_damaged');
    return;
  }
  if (name.startsWith('derrick')) {
    derrick(p, rng, c, name === 'derrick_damaged');
    return;
  }
  const hedge = name.startsWith('hedge');
  const spots: [number, number, number][] =
    name === 'clump_damaged'
      ? [
          [c - 3, c - 2, 4],
          [c + 4, c + 3, 3.5],
        ]
      : hedge
        ? // A dense, low bank: smaller bushes packed edge to edge.
          [
            [c - 5, c - 3, 3.5],
            [c, c - 4, 3.5],
            [c + 5, c - 3, 3.5],
            [c - 5, c + 3, 3.5],
            [c, c + 2, 4],
            [c + 5, c + 3, 3.5],
          ]
        : [
            [c - 4, c - 4, 5],
            [c + 4, c - 3, 5],
            [c - 3, c + 4, 5],
            [c + 4, c + 4, 4.5],
            [c, c, 5.5],
          ];
  // Shadows first (offset down-right), then canopies, so clumps read as raised.
  for (const [x, y, r] of spots) p.disc(x + 1.5, y + 1.5, r, 'rgba(10,20,8,0.45)');
  for (const [x, y, r] of spots) {
    const jx = rng.range(-1, 1);
    const jy = rng.range(-1, 1);
    const base = hedge ? pal.canopyLight : pal.canopy;
    const light = hedge ? pal.canopyHi : pal.canopyLight;
    p.disc(x + jx, y + jy, r, base, light, pal.canopyShadow);
    p.px(Math.round(x + jx - r / 2), Math.round(y + jy - r / 2), pal.canopyHi);
  }
  if (name === 'clump_damaged') p.speckle(rng, 4, 4, 14, 14, 6, pal.ash);
  // Snow lies on the arctic's trees.
  if (biome === 'arctic' && name !== 'clump_damaged') p.speckle(rng, 3, 3, 16, 12, 10, pal.grassLight);
}

/** A craggy lump of rock: overlapping slabs with a drop shadow, lit from the upper left. */
function boulder(p: Painter, rng: Rng, c: number, pal: Pal, biome: BiomeId): void {
  const slabs: [number, number, number][] = [
    [c - 3, c - 3, 7],
    [c + 3, c - 3, 6.5],
    [c - 3, c + 3, 6.5],
    [c + 3, c + 3, 6.5],
    [c, c, 7.5],
  ];
  for (const [x, y, r] of slabs) p.disc(x + 2, y + 2, r, 'rgba(12,12,10,0.5)');
  for (const [x, y, r] of slabs) {
    const jx = rng.range(-1, 1);
    const jy = rng.range(-1, 1);
    p.disc(x + jx, y + jy, r, pal.stone, pal.stoneHi, pal.stoneDark);
  }
  // Cracks and lichen (snow caps in the arctic).
  for (let i = 0; i < 3; i++) {
    const x = rng.int(c - 6, c + 3);
    const y = rng.int(c - 6, c + 5);
    p.rect(x, y, rng.int(2, 4), 1, pal.stoneDark);
    p.px(x, y + 1, pal.stoneDark);
  }
  p.speckle(rng, c - 6, c - 6, 12, 12, 5, pal.stoneHi);
  if (biome === 'arctic') p.speckle(rng, c - 7, c - 7, 10, 8, 14, pal.grassLight);
  else p.speckle(rng, c - 5, c - 5, 10, 10, 3, pal.grassDark);
}

/** A storage tank seen from above: a round lid with a rim, lit from the upper left, on a shadow. */
function fuelTank(p: Painter, rng: Rng, c: number, holed: boolean): void {
  p.disc(c + 1.5, c + 1.5, 8.5, 'rgba(10,10,8,0.5)');
  p.disc(c, c, 8.5, PAL.tankShade, PAL.tankWhite, PAL.steelDark);
  p.disc(c, c, 6, PAL.tankWhite, PAL.tankHi);
  // Hazard band and the vent hatch.
  p.rect(c - 6, c - 1, 12, 2, PAL.rust);
  p.disc(c - 2, c - 3, 1.5, PAL.tankShade);
  if (holed) {
    p.disc(c + 3, c + 2, 2.5, PAL.hole);
    p.speckle(rng, c - 5, c - 5, 10, 10, 8, PAL.ash);
    p.px(c + 4, c + 1, PAL.ember);
  }
}

/**
 * An oil derrick from above: a lattice tower (a square with X bracing) leaning a long shadow, and
 * the pumpjack's walking beam beside it.
 */
function derrick(p: Painter, rng: Rng, c: number, bent: boolean): void {
  // Shadow, then the tower's legs and bracing.
  p.rect(c - 4, c - 2, 13, 12, 'rgba(10,10,8,0.4)');
  const s = 7;
  p.rect(c - s, c - s, 2 * s, 1, PAL.girderHi);
  p.rect(c - s, c - s, 1, 2 * s, PAL.girderHi);
  p.rect(c - s, c + s - 1, 2 * s, 1, PAL.girder);
  p.rect(c + s - 1, c - s, 1, 2 * s, PAL.girder);
  for (let i = -s + 1; i < s - 1; i++) {
    p.px(c + i, c + i, PAL.girderHi);
    p.px(c + i, c - i - 1, PAL.girder);
  }
  // Crown block, and the pumpjack's beam and head off to one side.
  p.rect(c - 1, c - 1, 2, 2, PAL.steelDark);
  p.rect(c + s, c + 1, 3, 2, PAL.rust);
  p.rect(c + s + 2, c, 2, 4, PAL.rustHi);
  if (bent) {
    p.speckle(rng, c - 6, c - 6, 12, 12, 10, PAL.ash);
    p.rect(c - s, c - 2, 4, 1, PAL.hole);
    p.px(c + 2, c + 3, PAL.ember);
  }
}

/** A burnt-out vehicle from above: hull, a turret ring with no turret, scorch around it. */
function wreck(p: Painter, rng: Rng, pal: Pal, kind: 0 | 1, damaged: boolean): void {
  // A scorch ring around it, so it stands out on ash or sand.
  p.disc(8, 8, 8, pal.ash, undefined, pal.hole);
  p.speckle(rng, 0, 0, TILE, TILE, 10, pal.ash);
  // Hull at a skew-free angle (art is screen-relative), with a drop shadow.
  const [x, y, w, h] = kind === 0 ? [2, 3, 11, 9] : [3, 2, 9, 11];
  p.rect(x + 1, y + 1, w, h, 'rgba(10,10,8,0.5)');
  p.rect(x, y, w, h, PAL.wreck);
  p.rect(x, y, w, 1, PAL.wreckHi);
  p.rect(x, y, 1, h, PAL.wreckHi);
  p.rect(x + w - 1, y, 1, h, PAL.wreckDark);
  // Track runs along two sides.
  if (kind === 0) {
    p.rect(x, y, w, 2, PAL.wreckDark);
    p.rect(x, y + h - 2, w, 2, PAL.wreckDark);
  } else {
    p.rect(x, y, 2, h, PAL.wreckDark);
    p.rect(x + w - 2, y, 2, h, PAL.wreckDark);
  }
  p.disc(x + w / 2, y + h / 2, 2.5, PAL.wreckDark, undefined, pal.hole);
  p.speckle(rng, x, y, w, h, 6, PAL.rust);
  if (damaged) {
    p.rect(rng.int(x, x + w - 4), rng.int(y, y + h - 3), 4, 3, pal.hole);
    p.speckle(rng, x, y, w, h, 6, pal.hole);
  }
}

function roof(p: Painter, rng: Rng, pal: Pal, kind: 0 | 1): void {
  const base = kind === 0 ? pal.roofA : pal.roofB;
  const hi = kind === 0 ? pal.roofAHi : pal.roofBHi;
  const dark = kind === 0 ? pal.roofADark : pal.roofBDark;
  p.rect(0, 0, TILE, TILE, pal.pavement);
  // Drop shadow to the lower right.
  p.rect(2, 14, 14, 2, pal.outline);
  p.rect(14, 2, 2, 14, pal.outline);
  p.rect(1, 1, 13, 13, pal.outline);
  p.rect(2, 2, 11, 5, base);
  p.rect(2, 8, 11, 5, dark);
  if (kind === 0) {
    // Pitched roof: lit ridge, tile courses.
    p.rect(2, 7, 11, 1, hi);
    for (let x = 3; x < 13; x += 3) p.px(x, 4, dark);
    p.rect(rng.int(3, 9), 3, 2, 2, pal.wall); // chimney
  } else {
    // Flat concrete roof: parapet highlight, AC unit, hatch.
    p.rect(2, 2, 11, 1, hi);
    p.rect(2, 7, 11, 1, base);
    p.rect(rng.int(3, 8), rng.int(3, 4), 3, 2, hi);
    p.rect(rng.int(4, 9), rng.int(9, 10), 2, 2, pal.hole);
  }
}

/** Rubble and dirt (wrecked buildings, walls, bunkers). */
function rubble(p: Painter, rng: Rng, pal: Pal): void {
  p.rect(0, 0, TILE, TILE, pal.dirtDark);
  p.speckle(rng, 0, 0, TILE, TILE, 10, pal.dirt);
  for (let i = 0; i < 14; i++) {
    const s = rng.int(1, 2);
    p.rect(rng.int(1, 13), rng.int(1, 13), s, s, rng.pick([pal.rubble, pal.rubbleDark, pal.roofADark, pal.wall]));
  }
}

/** How far in from an open side a crater's corner is rounded (px). Alone, that makes it nearly round. */
const CRATER_ROUND = 7.5;

/**
 * How deep into a crater a point of its tile is: the distance (px) to the nearest ground round it,
 * from which neighbors are craters too (`craterMask`). Negative outside a rounded corner; infinite
 * where every neighbor is crater. Open corners are rounded: a tile on the stepped edge of a big
 * crater (open on two sides, joined on the other two) is cut in a quarter circle across the whole
 * tile, so the steps run together into one curving rim; and the notch where two arms of a crater
 * meet round a corner of ground is rounded too.
 */
function craterDepth(x: number, y: number, mask: number): number {
  const up = mask & 1 ? Infinity : y;
  const right = mask & 2 ? Infinity : TILE - x;
  const down = mask & 4 ? Infinity : TILE - y;
  const left = mask & 8 ? Infinity : x;
  let d = Infinity;
  for (const [dy, across] of [
    [up, down],
    [down, up],
  ] as const) {
    for (const [dx, along] of [
      [left, right],
      [right, left],
    ] as const) {
      // Joined on both far sides: this is a step in a big crater's edge, rounded right across the tile.
      const R = across === Infinity && along === Infinity ? TILE : CRATER_ROUND;
      d = Math.min(d, dx < R && dy < R ? R - Math.hypot(R - dx, R - dy) : Math.min(dx, dy));
    }
  }
  // Ground at a corner between two arms of the crater: the rim bends round it.
  if ((mask & 3) === 3 && !(mask & 16)) d = Math.min(d, Math.hypot(TILE - x, y));
  if ((mask & 6) === 6 && !(mask & 32)) d = Math.min(d, Math.hypot(TILE - x, TILE - y));
  if ((mask & 12) === 12 && !(mask & 64)) d = Math.min(d, Math.hypot(x, TILE - y));
  if ((mask & 9) === 9 && !(mask & 128)) d = Math.min(d, Math.hypot(x, y));
  return d;
}

/**
 * A crater tile (SPEC §4.5): a lip of thrown-out earth, a wall, and a dark churned floor, by how far
 * each pixel is from the ground round the crater it's part of, so a patch of crater tiles draws as
 * one big hole with a single rim, and a tile alone as a round shell hole. Lit from the upper left:
 * the near wall is in shadow and the far wall catches the light, and the lip the other way round.
 */
function crater(p: Painter, mask: number, rng: Rng, pal: Pal): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = craterDepth(x + 0.5, y + 0.5, mask);
      const roll = rng.next();
      if (d < 0) {
        // Outside a rounded corner: the ground, with dirt thrown out over it.
        if (d > -2.5 && roll < 0.3) p.px(x, y, pal.dirt);
        continue;
      }
      // The far side of the hole from the light: the ground behind this pixel is down and to the right.
      const far = craterDepth(x - 0.5, y - 0.5, mask) > craterDepth(x + 1.5, y + 1.5, mask);
      let color: string;
      if (d < 2) color = far ? (roll < 0.2 ? pal.hole : pal.dirtDark) : roll < 0.18 ? pal.rubble : pal.dirt;
      else if (d < 4) color = far ? (roll < 0.15 ? pal.rubble : pal.dirt) : pal.hole;
      else if (d < 6 && far) color = pal.dirtDark;
      else color = roll < 0.05 ? pal.ash : (x + y) & 1 ? pal.hole : pal.dirtDark;
      p.px(x, y, color);
    }
  }
  // The floor of a big crater: a few clods and scorched hollows, so it isn't a flat sheet.
  for (let i = rng.int(0, 2); i > 0; i--) {
    const x = rng.int(0, 12);
    const y = rng.int(0, 13);
    if (craterDepth(x + 1, y + 1, mask) > 7) p.rect(x, y, rng.int(2, 4), rng.int(1, 2), rng.chance(0.5) ? pal.dirtDark : pal.hole);
  }
}

/**
 * Bridge deck: planks or plates across the span (screen-horizontal). `edges` (1 left, 2 right) are
 * the sides where the span ends over the water: a girder with its flange and rivets on a girder
 * bridge, a kerb and a handrail on its posts on a light one, and the shadow each throws on the deck.
 */
function deck(p: Painter, rng: Rng, pal: Pal, light: boolean, damaged: boolean, edges: number): void {
  const base = light ? PAL.plank : PAL.deck;
  const seam = light ? PAL.plankDark : PAL.girder;
  p.rect(0, 0, TILE, TILE, base);
  for (let y = 1; y < TILE; y += light ? 3 : 4) p.rect(0, y, TILE, 1, seam);
  if (!light) {
    p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.girderHi);
    p.rect(0, 0, TILE, 1, PAL.girderHi);
  }
  if (damaged) {
    p.rect(rng.int(2, 7), rng.int(2, 7), 5, 4, pal.waterDeep);
    p.speckle(rng, 0, 0, TILE, TILE, 10, pal.hole);
    p.rect(rng.int(8, 12), rng.int(9, 12), 3, 2, pal.waterDeep);
  }
  for (const [bit, side] of [
    [1, 0],
    [2, 1],
  ] as const) {
    if (!(edges & bit)) continue;
    // Columns counted in from the edge: `at(0)` is the outermost.
    const at = (i: number) => (side === 0 ? i : TILE - 1 - i);
    if (light) {
      p.rect(at(0), 0, 1, TILE, PAL.outline);
      p.rect(at(1), 0, 1, TILE, PAL.plankDark);
      p.rect(at(2), 0, 1, TILE, pal.trunk);
      // Posts under the rail, and the rail's shadow on the planks (it falls to the right).
      for (let y = 2; y < TILE; y += 4) p.rect(at(1), y, 1, 2, PAL.outline);
      if (side === 0) p.rect(at(3), 0, 1, TILE, PAL.plankDark);
    } else {
      p.rect(at(0), 0, 1, TILE, PAL.outline);
      p.rect(at(1), 0, 1, TILE, PAL.girderHi);
      p.rect(at(2), 0, 2, TILE, PAL.girder);
      if (side === 1) p.rect(at(3), 0, 1, TILE, PAL.girder);
      p.rect(at(4), 0, 1, TILE, PAL.outline);
      // Stiffeners across the girder and a rivet between each pair; its shadow on the deck.
      for (let y = 1; y < TILE; y += 4) {
        p.rect(Math.min(at(1), at(3)), y, 3, 1, PAL.steelDark);
        p.px(at(2), y + 2, PAL.girderHi);
      }
      if (side === 0) p.rect(at(5), 0, 1, TILE, PAL.girder);
    }
  }
}

function drawTile(p: Painter, name: TileFrame, rng: Rng, pal: Pal): void {
  switch (name) {
    case 'clear':
      break;
    case 'road0':
    case 'road1':
      p.rect(0, 0, TILE, TILE, pal.pavement);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.rubbleDark);
      p.speckle(rng, 0, 0, TILE, TILE, 4, pal.rubble);
      if (name === 'road1') {
        p.rect(rng.int(3, 9), rng.int(3, 9), 3, 3, pal.rubbleDark); // manhole / patch
        p.rect(rng.int(1, 8), rng.int(10, 13), 5, 1, pal.hole); // crack
      }
      break;
    case 'forest_floor':
      p.rect(0, 0, TILE, TILE, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 30, pal.canopyShadow);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.trunk);
      break;
    case 'forest_floor_burnt':
      p.rect(0, 0, TILE, TILE, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 24, pal.ash);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.canopyShadow);
      p.rect(9, 3, 4, 1, pal.trunk);
      p.rect(3, 12, 1, 3, pal.trunk);
      break;
    case 'forest_destroyed':
      p.rect(0, 0, TILE, TILE, pal.ash);
      p.speckle(rng, 0, 0, TILE, TILE, 20, pal.ashLight);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.dirtDark);
      for (const [x, y] of [[4, 4], [11, 6], [6, 11]] as const) {
        p.rect(x, y, 2, 2, pal.hole);
        p.px(x + 2, y + 1, pal.trunk);
      }
      p.px(rng.int(2, 13), rng.int(2, 13), pal.ember);
      p.px(rng.int(2, 13), rng.int(2, 13), pal.ember);
      break;
    case 'forest_flattened':
      p.speckle(rng, 0, 0, TILE, TILE, 16, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.canopy);
      for (let i = 0; i < 3; i++) {
        const x = rng.int(1, 10);
        const y = rng.int(2, 13);
        p.rect(x, y, rng.int(3, 5), 1, pal.trunk);
      }
      break;
    case 'building_intact0':
    case 'building_intact1':
      roof(p, rng, pal, name.endsWith('0') ? 0 : 1);
      break;
    case 'building_damaged0':
    case 'building_damaged1': {
      roof(p, rng, pal, name.endsWith('0') ? 0 : 1);
      // Blown-out corner and shell holes.
      p.rect(9, 1, 6, 5, pal.rubbleDark);
      p.speckle(rng, 9, 1, 6, 5, 6, pal.rubble);
      p.rect(4, 9, 3, 2, pal.hole);
      p.px(5, 8, pal.hole);
      p.speckle(rng, 2, 2, 11, 11, 8, pal.hole);
      break;
    }
    case 'building_destroyed':
      rubble(p, rng, pal);
      // Broken wall stub.
      p.rect(1, 1, 6, 1, pal.wall);
      p.rect(1, 1, 1, 5, pal.wall);
      break;
    case 'rock_base':
      p.rect(0, 0, TILE, TILE, pal.gravel);
      p.speckle(rng, 0, 0, TILE, TILE, 20, pal.stoneDark);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.dirtDark);
      break;
    case 'rock_rubble':
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.gravel);
      for (let i = 0; i < 9; i++) {
        const x = rng.int(1, 12);
        const y = rng.int(1, 12);
        const s = rng.int(2, 3);
        p.rect(x, y, s, s, pal.stone);
        p.px(x, y, pal.stoneHi);
        p.px(x + s - 1, y + s - 1, pal.stoneDark);
      }
      break;
    case 'water0':
    case 'water1':
      // Deep channel: dark, with short ripple streaks running across the current (screen-horizontal).
      p.rect(0, 0, TILE, TILE, pal.water);
      p.speckle(rng, 0, 0, TILE, TILE, 14, pal.waterDeep);
      for (let i = 0; i < 3; i++) {
        const x = rng.int(0, 11);
        const y = (rng.int(1, 4) * 4 + (name === 'water1' ? 2 : 0)) % TILE;
        p.rect(x, y, rng.int(3, 5), 1, pal.waterLight);
      }
      break;
    case 'shallows0':
    case 'shallows1':
      // Shallows: lighter, silty, with pebbles showing through and a few glints.
      p.rect(0, 0, TILE, TILE, pal.shallow);
      p.speckle(rng, 0, 0, TILE, TILE, 12, pal.silt);
      p.speckle(rng, 0, 0, TILE, TILE, 4, pal.stoneDark);
      for (let i = 0; i < 2; i++) {
        const x = rng.int(1, 12);
        const y = (rng.int(0, 3) * 4 + 1 + (name === 'shallows1' ? 2 : 0)) % TILE;
        p.rect(x, y, 3, 1, pal.shallowLight);
      }
      if (name === 'shallows1') p.px(rng.int(2, 13), rng.int(2, 13), pal.foam);
      break;
    case 'building_flattened':
      p.rect(0, 0, TILE, TILE, pal.dirt);
      p.speckle(rng, 0, 0, TILE, TILE, 16, pal.rubbleDark);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.rubble);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.dirtDark);
      break;

    // ── Common features ─────────────────────────────────────────────────────────────────────
    case 'tankTrap_intact':
    case 'tankTrap_damaged': {
      // Three concrete pyramids, lit from the upper left, with shadows down-right, on open ground.
      const teeth: [number, number][] = name === 'tankTrap_intact' ? [[4, 4], [11, 6], [6, 11]] : [[4, 4], [10, 10]];
      for (const [x, y] of teeth) {
        p.rect(x - 1, y + 1, 6, 5, 'rgba(10,10,8,0.45)');
        p.rect(x - 2, y - 2, 5, 5, PAL.concrete);
        p.rect(x - 2, y - 2, 5, 1, PAL.concreteHi);
        p.rect(x - 2, y - 2, 1, 5, PAL.concreteHi);
        p.px(x, y, PAL.concreteHi);
        p.rect(x + 2, y - 1, 1, 4, PAL.concreteDark);
        p.rect(x - 1, y + 2, 4, 1, PAL.concreteDark);
      }
      if (name === 'tankTrap_damaged') p.speckle(rng, 6, 2, 8, 8, 7, PAL.concreteDark);
      break;
    }
    case 'tankTrap_down':
      for (let i = 0; i < 7; i++) p.rect(rng.int(1, 13), rng.int(1, 13), rng.int(1, 2), rng.int(1, 2), rng.pick([PAL.concrete, PAL.concreteDark]));
      break;
    case 'wall_intact':
    case 'wall_damaged':
      // A thick concrete wall: blocks along the tile with a lit top edge and a shadow below.
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.rect(0, 3, TILE, 10, PAL.concrete);
      p.rect(0, 3, TILE, 2, PAL.concreteHi);
      p.rect(0, 13, TILE, 2, 'rgba(10,10,8,0.5)');
      for (let x = 3; x < TILE; x += 5) p.rect(x, 5, 1, 8, PAL.concreteDark);
      if (name === 'wall_damaged') {
        p.rect(rng.int(2, 9), 3, 5, 4, pal.rubbleDark);
        p.speckle(rng, 0, 3, TILE, 10, 10, PAL.concreteDark);
        p.rect(rng.int(1, 12), rng.int(7, 10), 2, 2, pal.hole);
      }
      break;
    case 'bunker_intact':
    case 'bunker_damaged':
      // A domed pillbox with a dark firing slit facing forward (screen-up).
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.disc(9, 9, 7, 'rgba(10,10,8,0.5)');
      p.disc(8, 8, 7, PAL.concrete, PAL.concreteHi, PAL.concreteDark);
      p.disc(8, 8, 4, PAL.concreteDark, PAL.concrete);
      p.rect(4, 2, 8, 2, pal.hole);
      if (name === 'bunker_damaged') {
        p.speckle(rng, 3, 3, 10, 10, 10, pal.hole);
        p.rect(10, 9, 3, 3, pal.rubbleDark);
      }
      break;
    case 'mine':
      // A swept mine: the mine's lid showing through the ground and a warning tick beside it.
      p.disc(8, 8, 3.5, PAL.mineBody, PAL.mineHi);
      p.px(8, 8, PAL.mineHi);
      p.rect(2, 2, 2, 1, pal.warn);
      p.rect(2, 2, 1, 2, pal.warn);
      p.rect(12, 12, 2, 1, pal.warn);
      p.rect(13, 11, 1, 2, pal.warn);
      break;

    // ── Temperate ───────────────────────────────────────────────────────────────────────────
    case 'hedge_floor':
      p.rect(0, 0, TILE, TILE, pal.grassDark);
      p.speckle(rng, 0, 0, TILE, TILE, 24, pal.canopyShadow);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.dirt);
      break;
    case 'farm0':
    case 'farm1': {
      // Plowed rows of crops (screen-horizontal furrows), wheat or greens.
      const crop = name === 'farm0' ? PAL.cropA : PAL.cropB;
      p.rect(0, 0, TILE, TILE, pal.dirt);
      for (let y = 0; y < TILE; y += 4) {
        p.rect(0, y, TILE, 2, crop);
        p.speckle(rng, 0, y, TILE, 2, 4, PAL.cropDark);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 4, pal.dirtDark);
      break;
    }
    case 'farm_flattened':
      p.rect(0, 0, TILE, TILE, pal.dirt);
      p.speckle(rng, 0, 0, TILE, TILE, 18, PAL.cropDark);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.dirtDark);
      break;

    // ── Arctic ──────────────────────────────────────────────────────────────────────────────
    case 'ice0':
    case 'ice1':
      // Solid ice: pale blue with long glints and a few frozen-in bubbles.
      p.rect(0, 0, TILE, TILE, PAL.ice);
      p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.iceDark);
      p.rect(rng.int(0, 6), rng.int(2, 6), rng.int(5, 9), 1, PAL.iceHi);
      if (name === 'ice1') p.rect(rng.int(4, 9), rng.int(9, 13), rng.int(4, 6), 1, PAL.iceHi);
      break;
    case 'thinIce_intact':
    case 'thinIce_damaged':
      // Thin ice: darker (the water shows through), webbed with cracks once it's stressed.
      p.rect(0, 0, TILE, TILE, PAL.thinIce);
      p.speckle(rng, 0, 0, TILE, TILE, 14, PAL.iceDark);
      p.rect(rng.int(1, 8), rng.int(2, 12), rng.int(4, 6), 1, PAL.iceHi);
      if (name === 'thinIce_damaged') {
        let x = rng.int(2, 6);
        let y = rng.int(2, 6);
        for (let i = 0; i < 10; i++) {
          p.px(x, y, PAL.iceCrack);
          x = Math.min(15, x + rng.int(0, 1));
          y = Math.min(15, y + rng.int(0, 2));
        }
        p.rect(rng.int(3, 11), rng.int(3, 11), 2, 2, pal.waterDeep);
      }
      break;
    case 'drift0':
    case 'drift1':
      // A snowdrift: wind-blown ridges across the field (screen-horizontal), each a bright crest
      // with blue shade on its lee, on snow that runs to the tile edges so drifts merge.
      p.rect(0, 0, TILE, TILE, PAL.snow);
      p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.snowShade);
      for (const y of name === 'drift0' ? [3, 10] : [6, 13]) {
        const x0 = rng.int(0, 3);
        p.rect(x0, y, TILE - x0 - rng.int(0, 3), 1, PAL.snowHi);
        p.rect(x0 + 1, y + 1, TILE - x0 - 3, 2, PAL.snowShade);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 6, PAL.snowHi);
      break;

    // ── Industrial ──────────────────────────────────────────────────────────────────────────
    case 'factory_intact0':
    case 'factory_intact1':
    case 'factory_damaged':
      // Factory hall roof: sawtooth skylight rows (screen-horizontal), corrugated, grimy.
      p.rect(0, 0, TILE, TILE, PAL.rust);
      for (let y = 0; y < TILE; y += 4) {
        p.rect(0, y, TILE, 1, PAL.rustHi);
        p.rect(0, y + 2, TILE, 1, name === 'factory_intact1' ? PAL.steelDark : PAL.girder);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 10, PAL.concreteDark);
      if (name === 'factory_damaged') {
        p.rect(rng.int(1, 8), rng.int(1, 8), 6, 5, pal.hole);
        p.rect(rng.int(1, 8), rng.int(1, 8), 6, 1, PAL.girderHi);
        p.speckle(rng, 0, 0, TILE, TILE, 8, pal.hole);
      }
      break;
    case 'factory_destroyed':
      rubble(p, rng, pal);
      // Twisted roof girders.
      p.rect(1, 4, 12, 1, PAL.girderHi);
      p.rect(4, 2, 1, 11, PAL.girder);
      p.rect(9, 7, 6, 1, PAL.rust);
      break;
    case 'tank_pad':
      p.rect(0, 0, TILE, TILE, PAL.concreteDark);
      p.speckle(rng, 0, 0, TILE, TILE, 12, PAL.concrete);
      p.speckle(rng, 0, 0, TILE, TILE, 6, pal.hole);
      break;
    // ── Desert ──────────────────────────────────────────────────────────────────────────────
    case 'dune0':
    case 'dune1':
      // Sand ridges blown across the field (screen-horizontal): a lit crest, a shaded lee.
      p.rect(0, 0, TILE, TILE, pal.grass);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.grassDark);
      for (const y of name === 'dune0' ? [2, 9] : [5, 12]) {
        const x0 = rng.int(0, 2);
        p.rect(x0, y, TILE - x0 - rng.int(0, 2), 1, pal.grassLight);
        p.rect(x0, y + 1, TILE - x0 - 1, 3, pal.grassDark);
      }
      p.speckle(rng, 0, 0, TILE, TILE, 5, pal.grassLight);
      break;
    case 'wadi0':
    case 'wadi1':
      // A dry bed: darker packed sand, pebbles, a few cracks where water last stood.
      p.rect(0, 0, TILE, TILE, pal.dirt);
      p.speckle(rng, 0, 0, TILE, TILE, 14, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 8, pal.stone);
      p.speckle(rng, 0, 0, TILE, TILE, 3, pal.stoneHi);
      if (name === 'wadi1') {
        p.rect(rng.int(1, 8), rng.int(2, 6), 5, 1, pal.dirtDark);
        p.rect(rng.int(3, 10), rng.int(9, 13), 4, 1, pal.dirtDark);
      }
      break;
    case 'derrick_pad':
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 12, pal.dirt);
      // An oil stain around the wellhead.
      p.disc(8, 9, 4, pal.hole);
      p.speckle(rng, 3, 4, 10, 10, 6, pal.ash);
      break;

    // ── Blasted wasteland ───────────────────────────────────────────────────────────────────
    case 'wreck_intact0':
    case 'wreck_intact1':
      wreck(p, rng, pal, name === 'wreck_intact0' ? 0 : 1, false);
      break;
    case 'wreck_damaged':
      wreck(p, rng, pal, 0, true);
      break;
    case 'wreck_destroyed':
      // Cut apart: scrap plates and a track run in the dirt.
      p.rect(0, 0, TILE, TILE, pal.dirtDark);
      p.speckle(rng, 0, 0, TILE, TILE, 10, pal.ash);
      for (let i = 0; i < 6; i++) p.rect(rng.int(1, 12), rng.int(1, 12), rng.int(2, 3), rng.int(1, 2), rng.pick([PAL.wreck, PAL.wreckHi, PAL.rust]));
      p.rect(2, 12, 10, 2, PAL.wreckDark);
      break;
    case 'glass0':
    case 'glass1':
      // Fused glass: near-black green with long, sharp glints.
      p.rect(0, 0, TILE, TILE, PAL.glass);
      p.speckle(rng, 0, 0, TILE, TILE, 12, PAL.glassDark);
      p.rect(rng.int(0, 6), rng.int(1, 6), rng.int(4, 8), 1, PAL.glassHi);
      if (name === 'glass1') p.px(rng.int(2, 13), rng.int(8, 13), PAL.glassHi);
      p.speckle(rng, 0, 0, TILE, TILE, 3, pal.ash);
      break;

    case 'rail':
    case 'rail_torn': {
      // Two rails running with the travel (screen-vertical) on wooden sleepers over ballast.
      p.rect(0, 0, TILE, TILE, pal.gravel);
      p.speckle(rng, 0, 0, TILE, TILE, 14, pal.stoneDark);
      for (let y = 1; y < TILE; y += 4) p.rect(2, y, 12, 2, PAL.sleeper);
      if (name === 'rail') {
        p.rect(4, 0, 1, TILE, PAL.railSteel);
        p.rect(11, 0, 1, TILE, PAL.railSteel);
      } else {
        // Torn up: bent rail ends and scattered sleepers.
        p.rect(4, 0, 1, 6, PAL.railSteel);
        p.rect(5, 6, 1, 3, PAL.railSteel);
        p.rect(11, 9, 1, 7, PAL.railSteel);
        p.rect(10, 6, 1, 3, PAL.railSteel);
        p.speckle(rng, 0, 0, TILE, TILE, 8, pal.dirtDark);
      }
      break;
    }
  }
}
