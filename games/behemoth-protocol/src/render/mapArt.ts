import Phaser from 'phaser';
import type { ApproachId } from '../content/approaches';
import { BIOME_IDS, type BiomeId } from '../content/biomes';
import { Rng, hashSeed } from '../sim/rng';
import { canvasTexture, Painter } from './painter';
import { PAL } from './palette';
import { biomePalette, type Pal } from './tileArt';

/**
 * Procedural placeholder art for the sector map (SPEC §10): a large terrain icon per node (what the
 * ground there looks like: its approach, or the biome's own mix, a depot, or fog), drawn in each
 * biome's tile palette so the map matches the battles, and a field-map background per sector:
 * paper, contour lines, woods, water, a grid, and small map symbols. Real art replaces the icon
 * sheets later under the same keys and frame names.
 */

/** Icon frame size (the art sits inside a 1-pixel outline margin). */
export const MAP_ICON = 26;

export type MapIcon = ApproachId | 'mix' | 'depot' | 'fog' | 'event';
const ICONS: readonly MapIcon[] = ['plain', 'forest', 'urban', 'river', 'pass', 'mix', 'depot', 'fog', 'event'];

/** Texture key of a biome's icon sheet (frames named by `MapIcon`). */
export const mapIconSheet = (biome: BiomeId) => `mapicons_${biome}`;

/** Ink: icon outlines, map symbols, grid. */
const INK = '#1d1a16';

export function makeMapIcons(scene: Phaser.Scene): void {
  for (const biome of BIOME_IDS) {
    const pal = biomePalette(biome);
    const tex = canvasTexture(scene, mapIconSheet(biome), MAP_ICON * ICONS.length, MAP_ICON, (p) => {
      ICONS.forEach((icon, i) => {
        p.ox = i * MAP_ICON;
        drawIcon(p, icon, biome, pal, new Rng(5000 + i * 13));
        outline(p.ctx, i * MAP_ICON, MAP_ICON, INK);
      });
    });
    ICONS.forEach((icon, i) => tex.add(icon, 0, i * MAP_ICON, 0, MAP_ICON, MAP_ICON));
  }
}

// ── Drawing helpers (frame-local coordinates) ───────────────────────────────────────────────────

function ellipse(p: Painter, cx: number, cy: number, rx: number, ry: number, color: (dx: number, dy: number) => string | null): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const c = color(dx, dy);
      if (c) p.px(x, y, c);
    }
  }
}

/** A triangle (apex at `top`, base row at `base`), each pixel colored by its place across the row (-1 … 1). */
function peak(p: Painter, cx: number, top: number, base: number, half: number, color: (u: number, row: number) => string): void {
  for (let y = top; y <= base; y++) {
    const w = ((y - top + 1) / (base - top + 1)) * half;
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) p.px(x, y, color(w > 0 ? (x - cx) / w : 0, y - top));
  }
}

function line(p: Painter, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) p.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), color);
}

/** The patch of ground every icon stands on. */
const GX = 13;
const GY = 18;

function ground(p: Painter, base: string, light: string, dark: string): void {
  ellipse(p, GX, GY, 11.5, 5.5, (dx, dy) => (dy < -0.55 && dx < 0.4 ? light : dy > 0.5 || dx > 0.75 ? dark : base));
}

function grassGround(p: Painter, pal: Pal): void {
  ground(p, pal.grass, pal.grassLight, pal.grassDark);
}

function broadleaf(p: Painter, pal: Pal, x: number, y: number, r = 3.6): void {
  p.rect(x, y, 1, 3, pal.trunk);
  p.disc(x + 0.5, y - r + 0.8, r, pal.canopy, pal.canopyLight, pal.canopyShadow);
  p.px(Math.round(x - r / 2), Math.round(y - r - 0.5), pal.canopyHi);
}

function pine(p: Painter, pal: Pal, x: number, y: number, h = 9, snow = false): void {
  p.rect(x, y - 1, 1, 2, pal.trunk);
  const top = y - h;
  peak(p, x, top, y - 2, Math.max(2, h / 3), (u, row) => {
    if (snow && (row % 3 === 0 || row < 2) && u < 0.3) return pal.canopyHi;
    return u > 0.25 ? pal.canopyShadow : u < -0.5 ? pal.canopyLight : pal.canopy;
  });
}

function deadTree(p: Painter, pal: Pal, x: number, y: number, h = 8): void {
  line(p, x, y, x, y - h, pal.trunk);
  line(p, x, y - h + 3, x - 3, y - h + 0, pal.trunk);
  line(p, x, y - h + 4, x + 3, y - h + 2, pal.trunk);
  p.px(x - 3, y - h, pal.canopyHi);
  p.px(x + 3, y - h + 2, pal.canopyHi);
}

function palm(p: Painter, pal: Pal, x: number, y: number, h = 9): void {
  for (let i = 0; i <= h; i++) p.px(x + Math.round(Math.sin(i / 4) * 1.2), y - i, i % 2 ? pal.trunk : pal.dirtDark);
  const tx = x + Math.round(Math.sin(h / 4) * 1.2);
  const ty = y - h;
  line(p, tx, ty, tx - 4, ty + 2, pal.canopy);
  line(p, tx, ty, tx + 4, ty + 2, pal.canopy);
  line(p, tx, ty, tx - 3, ty - 2, pal.canopyLight);
  line(p, tx, ty, tx + 3, ty - 2, pal.canopyLight);
  p.px(tx, ty - 1, pal.canopyHi);
}

/** The biome's tree, at a place on the icon. */
function tree(p: Painter, pal: Pal, biome: BiomeId, x: number, y: number, size: number, rng: Rng): void {
  switch (biome) {
    case 'arctic':
      return pine(p, pal, x, y, 7 + size * 2, true);
    case 'desert':
      return palm(p, pal, x, y, 7 + size * 2);
    case 'wasteland':
      return deadTree(p, pal, x, y, 6 + size * 2);
    default:
      return rng.chance(0.3) ? pine(p, pal, x, y, 7 + size * 2) : broadleaf(p, pal, x, y, 2.8 + size * 0.6);
  }
}

/** A block seen from the front and above: a roof band over a wall with windows. */
function building(p: Painter, pal: Pal, x: number, y: number, w: number, h: number, roof: 'A' | 'B', ruined = false, rng?: Rng): void {
  const [r, rHi, rDark] = roof === 'A' ? [pal.roofA, pal.roofAHi, pal.roofADark] : [pal.roofB, pal.roofBHi, pal.roofBDark];
  p.rect(x, y, w, 3, r);
  p.rect(x, y, w, 1, rHi);
  p.rect(x + w - 1, y, 1, 3, rDark);
  p.rect(x, y + 3, w, h - 3, pal.wall);
  p.rect(x + w - 1, y + 3, 1, h - 3, pal.concreteDark);
  for (let wy = y + 4; wy < y + h - 1; wy += 2) for (let wx = x + 1; wx < x + w - 1; wx += 2) p.px(wx, wy, pal.hole);
  if (ruined && rng) {
    // Bites out of the roofline.
    for (let i = 0; i < w; i++) if (rng.chance(0.45)) p.clear(x + i, y, 1, rng.int(1, 3));
  }
}

function smoke(p: Painter, x: number, y: number): void {
  p.disc(x, y, 1.6, PAL.concreteHi, PAL.white, PAL.concrete);
  p.disc(x + 2, y - 2, 2, PAL.concreteHi, PAL.white, PAL.concrete);
}

// ── The icons ───────────────────────────────────────────────────────────────────────────────────

function drawIcon(p: Painter, icon: MapIcon, biome: BiomeId, pal: Pal, rng: Rng): void {
  switch (icon) {
    case 'plain':
      return plainIcon(p, pal, biome, rng);
    case 'forest':
      return forestIcon(p, pal, biome, rng);
    case 'urban':
      return urbanIcon(p, pal, biome, rng);
    case 'river':
      return riverIcon(p, pal, biome, rng);
    case 'pass':
      return passIcon(p, pal, biome);
    case 'mix':
      return mixIcon(p, pal, biome, rng);
    case 'depot':
      return depotIcon(p);
    case 'fog':
      return fogIcon(p);
    case 'event':
      return eventIcon(p, pal);
  }
}

/** Open ground: a low rise behind wide fields (temperate) or furrowed snow, cinders, sand, or ash, a track across it, and the biome's touch. */
function plainIcon(p: Painter, pal: Pal, biome: BiomeId, rng: Rng): void {
  // A low rise along the horizon gives the flat ground some depth.
  ellipse(p, 15, 15, 9, 4, (dx, dy) => (dy > 0 ? null : dx > 0.35 ? pal.grassDark : dx < -0.4 ? pal.grassLight : pal.grass));
  ellipse(p, GX, GY + 1, 12, 5.5, (dx, dy) => {
    const band = Math.floor((dx * 12 + dy * 9 + 40) / 2.5) % 2 === 0;
    if (biome === 'temperate' && dx < 0.2) return band ? pal.cropA : pal.cropB;
    if (dy < -0.6 && dx < 0.3) return pal.grassLight;
    if (dy > 0.55) return pal.grassDark;
    return band && Math.abs(dy) < 0.7 ? pal.grassLight : pal.grass;
  });
  for (let x = 3; x <= 23; x++) p.px(x, Math.round(GY + 1 + Math.sin(x / 3.5) * 1.2), pal.dirtDark);
  const stone = (x: number, y: number) => {
    p.rect(x, y, 2, 2, pal.stone);
    p.px(x, y, pal.stoneHi);
    p.px(x + 1, y + 1, pal.stoneDark);
  };
  switch (biome) {
    case 'temperate':
      tree(p, pal, biome, 19, 17, 1, rng);
      tree(p, pal, biome, 6, 16, 0, rng);
      return;
    case 'arctic':
      // Drifts and a lone pine.
      ellipse(p, 7, 17, 4, 2, (_dx, dy) => (dy < 0 ? PAL.snowHi : PAL.snowShade));
      tree(p, pal, biome, 19, 17, 1, rng);
      stone(12, 20);
      return;
    case 'industrial': {
      // A rail line and a power pylon.
      for (let x = 2; x <= 24; x++) {
        const y = Math.round(GY + 2 - (x - 13) * 0.2);
        if (x % 2 === 0) p.px(x, y, PAL.sleeper);
        p.px(x, y - 1, PAL.railSteel);
        p.px(x, y + 1, PAL.railSteel);
      }
      line(p, 18, 5, 15, 17, PAL.girderHi);
      line(p, 18, 5, 21, 17, PAL.girder);
      p.rect(14, 8, 9, 1, PAL.girderHi);
      line(p, 16, 12, 20, 12, PAL.girder);
      line(p, 2, 9, 14, 8, PAL.outline);
      return;
    }
    case 'desert':
      // Sand ripples, rocks, a palm.
      for (const [x, y] of [[5, 16], [8, 21], [15, 22]] as const) {
        p.rect(x, y, 3, 1, pal.grassDark);
        p.px(x + 1, y - 1, pal.grassLight);
      }
      stone(11, 17);
      stone(5, 19);
      palm(p, pal, 19, 18, 10);
      return;
    case 'wasteland':
      // Shell craters and a dead tree.
      crater(p, pal, 8, 18, 3.5);
      crater(p, pal, 16, 21, 2.5);
      deadTree(p, pal, 19, 18, 9);
      return;
  }
}

/** A shell crater: dark pit, a lit rim. */
function crater(p: Painter, pal: Pal, cx: number, cy: number, r: number): void {
  ellipse(p, cx, cy, r + 1, (r + 1) * 0.6, (dx, dy) => (dx + dy < -0.3 ? pal.grassLight : pal.dirt));
  ellipse(p, cx, cy, r, r * 0.55, (dx, dy) => (dy < -0.2 || dx < -0.5 ? PAL.hole : PAL.ash));
}

/** Thick woods: the biome's trees, back to front. */
function forestIcon(p: Painter, pal: Pal, biome: BiomeId, rng: Rng): void {
  grassGround(p, pal);
  const spots: [number, number, number][] = [
    [9, 13, 2],
    [17, 12, 2],
    [13, 15, 2],
    [5, 18, 1],
    [21, 18, 1],
    [10, 21, 1],
    [16, 21, 2],
  ];
  for (const [x, y, s] of spots) tree(p, pal, biome, x, y, s, rng);
}

/** A town or district: blocks around a street. */
function urbanIcon(p: Painter, pal: Pal, biome: BiomeId, rng: Rng): void {
  ground(p, pal.pavement, pal.concrete, pal.concreteDark);
  const ruined = biome === 'wasteland';
  building(p, pal, 10, 3, 7, 13, 'B', ruined, rng);
  building(p, pal, 3, 9, 7, 9, 'A', ruined, rng);
  building(p, pal, 17, 8, 6, 10, 'A', ruined, rng);
  building(p, pal, 8, 15, 6, 6, 'A', ruined, rng);
  building(p, pal, 15, 16, 6, 5, 'B', ruined, rng);
  if (ruined) p.speckle(rng, 4, 18, 18, 4, 8, pal.rubble);
}

/** A river with a bridge over it (an iced one in the arctic). */
function riverIcon(p: Painter, pal: Pal, biome: BiomeId, rng: Rng): void {
  const frozen = biome === 'arctic';
  const [deep, mid, hi] = frozen ? [PAL.iceDark, PAL.ice, PAL.iceHi] : [pal.waterDeep, pal.water, pal.waterLight];
  ellipse(p, GX, GY, 12, 6, (dx, dy) => {
    // The channel runs corner to corner; distance across it picks the color.
    const d = dy * 6 + dx * 2.6 + Math.sin(dx * 5) * 0.6;
    if (Math.abs(d) < 1.4) return Math.abs(d) < 0.5 ? hi : mid;
    if (Math.abs(d) < 2.4) return frozen ? deep : pal.shallow;
    if (dy < -0.6 && dx < 0.4) return pal.grassLight;
    return dy > 0.5 ? pal.grassDark : pal.grass;
  });
  // The bridge: a deck across the channel, with rails.
  p.rect(11, 11, 5, 13, PAL.plank);
  p.rect(11, 11, 1, 13, PAL.girder);
  p.rect(15, 11, 1, 13, PAL.girder);
  for (let y = 12; y < 24; y += 2) p.rect(12, y, 3, 1, PAL.plankDark);
  tree(p, pal, biome, 5, 15, 0, rng);
  tree(p, pal, biome, 21, 20, 1, rng);
}

/** Peaks either side of a pass, a road winding between them. */
function passIcon(p: Painter, pal: Pal, biome: BiomeId): void {
  grassGround(p, pal);
  const snow = biome !== 'desert' && biome !== 'wasteland';
  const rock = (u: number, row: number) => {
    if (snow && row < 3 + (u < 0 ? 1 : 0)) return u > 0.3 ? PAL.snowShade : PAL.snowHi;
    if (u > 0.2) return pal.stoneDark;
    return u < -0.55 ? pal.stoneHi : pal.stone;
  };
  peak(p, 13, 2, 17, 9, rock);
  peak(p, 6, 8, 20, 6, rock);
  peak(p, 20, 7, 20, 6, rock);
  for (let y = 18; y <= 23; y++) p.px(13 + Math.round(Math.sin(y * 1.3) * 1.5), y, pal.dirt);
}

/** The biome's own mix: its signature ground. */
function mixIcon(p: Painter, pal: Pal, biome: BiomeId, rng: Rng): void {
  switch (biome) {
    case 'temperate': {
      // Farmland: a farmhouse with a pitched roof, a tree, a field.
      ellipse(p, GX, GY, 11.5, 5.5, (dx, dy) => (dx < -0.1 && dy > -0.3 ? (Math.floor((dx * 10 + 30) / 2) % 2 ? pal.cropA : pal.cropB) : dy > 0.5 ? pal.grassDark : pal.grass));
      p.rect(11, 12, 9, 6, pal.wall);
      p.rect(19, 12, 1, 6, pal.concreteDark);
      peak(p, 15, 6, 11, 6, (u) => (u > 0.2 ? pal.roofADark : u < -0.5 ? pal.roofAHi : pal.roofA));
      p.rect(14, 14, 2, 4, pal.hole);
      p.px(12, 13, pal.hole);
      p.px(18, 13, pal.hole);
      broadleaf(p, pal, 6, 15, 3.8);
      return;
    }
    case 'arctic': {
      // Snowfields: a drifted hill and pines.
      grassGround(p, pal);
      ellipse(p, 11, 15, 8, 5, (dx, dy) => (dx + dy > 0.6 ? PAL.snowShade : dx + dy < -0.6 ? PAL.snowHi : PAL.snow));
      pine(p, pal, 17, 20, 11, true);
      pine(p, pal, 21, 19, 8, true);
      pine(p, pal, 6, 21, 7, true);
      return;
    }
    case 'industrial': {
      // A factory with a sawtooth roof and smoking stacks, a tank beside it.
      ground(p, pal.pavement, pal.concrete, pal.concreteDark);
      p.rect(4, 12, 14, 8, pal.wall);
      p.rect(17, 12, 1, 8, pal.concreteDark);
      for (let i = 0; i < 4; i++) peak(p, 5 + i * 3.5, 9, 11, 1.8, (u) => (u > 0 ? pal.roofBDark : pal.roofBHi));
      for (let x = 5; x < 17; x += 3) p.rect(x, 15, 2, 2, pal.hole);
      p.rect(19, 5, 2, 12, PAL.rust);
      p.rect(19, 5, 1, 12, PAL.rustHi);
      p.rect(9, 7, 2, 5, PAL.rust);
      smoke(p, 20, 3);
      smoke(p, 9, 5);
      p.disc(21, 19, 2.6, PAL.tankWhite, PAL.tankHi, PAL.tankShade);
      return;
    }
    case 'desert': {
      // Dunes with a dark crest and a shaded lee, and an oil derrick behind them.
      ellipse(p, GX, GY, 12, 6, (_dx, dy) => (dy > 0.5 ? pal.grassDark : pal.grass));
      line(p, 17, 3, 13, 16, PAL.girderHi);
      line(p, 17, 3, 21, 16, PAL.girder);
      line(p, 14, 10, 20, 10, PAL.girder);
      line(p, 14, 13, 21, 13, PAL.girder);
      p.rect(16, 2, 3, 1, PAL.girderHi);
      // A dune: a long lit windward slope up to a sharp crest, then a steep shaded slip face.
      const dune = (x0: number, crest: number, x1: number, base: number, height: number) => {
        for (let x = x0; x <= x1; x++) {
          const h = Math.round(x <= crest ? (height * (x - x0 + 1)) / (crest - x0 + 1) : (height * (x1 - x + 1)) / (x1 - crest + 1));
          for (let y = base - h; y <= base; y++) {
            const top = y === base - h;
            p.px(x, y, x <= crest ? (top ? pal.grassLight : y > base - 2 ? pal.grass : pal.grassLight) : top ? pal.dirtDark : pal.dirt);
          }
        }
      };
      dune(2, 12, 16, 21, 9);
      dune(12, 20, 24, 23, 6);
      return;
    }
    case 'wasteland': {
      // An old battlefield: a big crater, a broken wall, a burnt-out tank.
      grassGround(p, pal);
      crater(p, pal, 8, 17, 4.5);
      p.rect(14, 6, 3, 11, PAL.concrete);
      p.rect(14, 6, 1, 11, PAL.concreteHi);
      p.rect(17, 10, 3, 7, PAL.concrete);
      p.rect(19, 10, 1, 7, PAL.concreteDark);
      p.rect(20, 13, 2, 4, PAL.concreteDark);
      p.clear(15, 6, 2, 2);
      p.clear(18, 10, 2, 1);
      p.speckle(rng, 13, 17, 10, 2, 7, pal.rubble);
      // The wreck: hull, turret, a barrel drooping to the ground.
      p.rect(5, 20, 9, 3, PAL.wreck);
      p.rect(5, 20, 9, 1, PAL.wreckHi);
      p.rect(5, 22, 9, 1, PAL.wreckDark);
      p.rect(7, 18, 4, 2, PAL.wreckHi);
      line(p, 11, 18, 15, 20, PAL.wreckDark);
      p.px(9, 17, PAL.ember);
      return;
    }
  }
}

/** A depot: a workshop with a big hazard-striped door (the player's cyan light over it) and a crane, on concrete. */
function depotIcon(p: Painter): void {
  ground(p, PAL.concrete, PAL.concreteHi, PAL.concreteDark);
  // An arched roof over a front wall.
  // Ribs every few pixels across the arch.
  ellipse(p, 11, 11, 8, 6, (dx, dy) => {
    if (dy > 0) return null;
    if (Math.round(dx * 8 + 11) % 4 === 1 && dx > -0.8 && dx < 0.8) return PAL.steel;
    return dx < -0.5 ? PAL.steelHi : dx > 0.45 ? PAL.steelDark : PAL.steelMid;
  });
  p.rect(3, 11, 16, 9, PAL.steel);
  p.rect(3, 11, 16, 1, PAL.steelHi);
  p.rect(18, 11, 1, 9, PAL.steelDark);
  p.rect(6, 13, 10, 7, PAL.outline);
  for (let x = 6; x < 16; x++) p.px(x, 13, Math.floor(x / 2) % 2 ? PAL.amber : PAL.outline);
  p.rect(9, 9, 4, 1, PAL.glow);
  p.px(10, 8, PAL.glowHot);
  p.px(11, 8, PAL.glowHot);
  // The crane: a mast, a jib reaching over the roof, a hook.
  p.rect(21, 3, 1, 17, PAL.girderHi);
  p.rect(22, 3, 1, 17, PAL.girder);
  for (let y = 5; y < 19; y += 3) p.px(21, y, PAL.girder);
  p.rect(15, 2, 9, 1, PAL.girderHi);
  line(p, 22, 3, 24, 5, PAL.girder);
  p.rect(16, 3, 1, 3, PAL.outline);
  p.rect(15, 6, 3, 1, PAL.amber);
}

/** An event (SPEC §8.3): the biome's ground, tire tracks, and an amber hazard diamond on a post with a "!". */
function eventIcon(p: Painter, pal: Pal): void {
  ground(p, pal.grass, pal.grassLight, pal.grassDark);
  for (let x = 4; x <= 22; x++) {
    p.px(x, Math.round(GY + 2 + Math.sin(x / 3) * 1), pal.dirtDark);
    p.px(x, Math.round(GY - 1 + Math.sin(x / 3) * 1), pal.dirtDark);
  }
  p.rect(12, 13, 2, 8, PAL.steelDark);
  p.px(12, 13, PAL.steelHi);
  // The diamond: rows widening to the middle, then narrowing.
  const cx = 12.5;
  for (let dy = -6; dy <= 6; dy++) {
    const half = 6 - Math.abs(dy);
    for (let dx = -half; dx <= half; dx++) {
      const edge = Math.abs(dx) === half;
      p.px(Math.round(cx + dx - 0.5), 8 + dy, edge ? PAL.amberHot : dy < 0 && dx < 0 ? PAL.amberHot : PAL.amber);
    }
  }
  p.rect(12, 4, 2, 5, INK);
  p.rect(12, 10, 2, 2, INK);
}

/** Unknown ground: a cloud with a question mark. */
function fogIcon(p: Painter): void {
  const puff = (x: number, y: number, r: number) => p.disc(x, y, r, '#b9c0c6', '#dfe4e8', '#8d969e');
  puff(8, 15, 5);
  puff(17, 15, 5.5);
  puff(12.5, 11, 6);
  puff(12.5, 17, 5);
  const q = ['01110', '10001', '00001', '00110', '00100', '00000', '00100'];
  q.forEach((row, y) => [...row].forEach((b, x) => b === '1' && p.px(11 + x - 1, 9 + y, INK)));
}

/** A one-pixel outline around everything drawn in the frame (transparent pixels next to art). */
function outline(ctx: CanvasRenderingContext2D, ox: number, size: number, color: string): void {
  const img = ctx.getImageData(ox, 0, size, size);
  const d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && d[(y * size + x) * 4 + 3]! > 0;
  const edge: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.push(x, y);
    }
  }
  ctx.fillStyle = color;
  for (let i = 0; i < edge.length; i += 2) ctx.fillRect(ox + edge[i]!, edge[i + 1]!, 1, 1);
}

// ── The background ──────────────────────────────────────────────────────────────────────────────

/** A field map's colors and ground per biome (muted, so the icons and routes read on top). */
interface MapLook {
  paper: string;
  wood: string;
  woodEdge: string;
  water: string;
  waterEdge: string;
  contour: string;
  /** Every fourth contour. */
  contourBold: string;
  /** Elevation below this is water (lakes); 0 = none. */
  lakes: number;
  /** Vegetation above this is woods; 1 = none. */
  woods: number;
  /** A river crosses the sheet ('dry': a dry wash, dotted). */
  river: 'wet' | 'dry' | null;
  /** Settlements (clusters of blocks) on the sheet. */
  towns: number;
  /** The map symbol scattered over open ground. */
  scatter: 'tufts' | 'pines' | 'dunes' | 'craters' | 'blocks';
}

const LOOK: Record<BiomeId, MapLook> = {
  temperate: { paper: '#a8a383', wood: '#8f9d6d', woodEdge: '#6f7f50', water: '#7b9ba6', waterEdge: '#4b6f7e', contour: '#968463', contourBold: '#76634a', lakes: 0.3, woods: 0.56, river: 'wet', towns: 3, scatter: 'tufts' },
  arctic: { paper: '#b9c2c4', wood: '#94a69f', woodEdge: '#6f857e', water: '#8ea8b5', waterEdge: '#5e7d8e', contour: '#93a1aa', contourBold: '#6e7d87', lakes: 0.29, woods: 0.62, river: 'wet', towns: 1, scatter: 'pines' },
  industrial: { paper: '#9e9a8f', wood: '#8a8c72', woodEdge: '#6b6d55', water: '#7f918b', waterEdge: '#56685f', contour: '#7f7262', contourBold: '#62574a', lakes: 0.28, woods: 0.66, river: 'wet', towns: 6, scatter: 'blocks' },
  desert: { paper: '#c3ab7f', wood: '#ada06f', woodEdge: '#8c8152', water: '#8ea39d', waterEdge: '#61776f', contour: '#9e7f57', contourBold: '#7d613f', lakes: 0, woods: 0.78, river: 'dry', towns: 1, scatter: 'dunes' },
  wasteland: { paper: '#938a7b', wood: '#827b68', woodEdge: '#655f4f', water: '#7a8459', waterEdge: '#565e3b', contour: '#76695a', contourBold: '#5b4f43', lakes: 0.26, woods: 0.7, river: 'wet', towns: 2, scatter: 'craters' },
};

export interface MapBackground {
  w: number;
  h: number;
  biome: BiomeId;
  seed: number;
  /** Spots to keep free of symbols (the nodes), in the sheet's own coordinates. */
  clear: readonly { x: number; y: number; r: number }[];
  /** Route lines to keep free of symbols. */
  routes: readonly [number, number, number, number][];
  /** Grid spacing; lines fall on multiples of it. */
  grid: number;
}

/** Draws a sector's map sheet into a canvas texture under `key` (replacing any old one). */
export function makeMapBackground(scene: Phaser.Scene, key: string, m: MapBackground): void {
  const { w, h } = m;
  const look = LOOK[m.biome];
  const rng = new Rng(hashSeed(m.seed, 0x3a9));
  const elev = fbm(m.seed, w, h, [
    [44, 0.55],
    [22, 0.3],
    [11, 0.15],
  ]);
  const veg = fbm(hashSeed(m.seed, 7), w, h, [
    [30, 0.65],
    [13, 0.35],
  ]);
  const at = (x: number, y: number) => y * w + x;
  const level = (i: number) => Math.floor(elev[i]! * 11);
  const isWater = (i: number) => elev[i]! < look.lakes;
  const isWood = (i: number) => !isWater(i) && veg[i]! > look.woods;

  // The river: a meandering band across the sheet (cells marked 1 = water, 2 = bank).
  const river = new Uint8Array(w * h);
  if (look.river) {
    const y0 = rng.range(h * 0.3, h * 0.7);
    const amp = rng.range(10, 22);
    const period = rng.range(28, 46);
    const phase = rng.range(0, Math.PI * 2);
    const tilt = rng.range(-0.2, 0.2);
    for (let x = 0; x < w; x++) {
      const cy = y0 + tilt * (x - w / 2) + Math.sin(x / period + phase) * amp + Math.sin(x / 9 + phase * 2) * 2;
      for (let dy = -3; dy <= 3; dy++) {
        const y = Math.round(cy + dy);
        if (y < 0 || y >= h) continue;
        const v = Math.abs(dy) <= 1 ? 1 : 2;
        if (look.river === 'dry' && (x % 4 > 1 || v === 1)) continue;
        if (river[at(x, y)] !== 1) river[at(x, y)] = v;
      }
    }
  }

  canvasTexture(scene, key, w, h, (p) => {
    const img = p.ctx.createImageData(w, h);
    const d = img.data;
    const C = {
      paper: rgb(look.paper),
      wood: rgb(look.wood),
      woodEdge: rgb(look.woodEdge),
      water: rgb(look.water),
      waterEdge: rgb(look.waterEdge),
      contour: rgb(look.contour),
      contourBold: rgb(look.contourBold),
      ink: rgb(INK),
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = at(x, y);
        const right = x + 1 < w ? i + 1 : i;
        const down = y + 1 < h ? i + w : i;
        const left = x > 0 ? i - 1 : i;
        const up = y > 0 ? i - w : i;
        let c = C.paper;
        const r = river[i]!;
        if (isWater(i) || r === 1) {
          const shore = !isWater(right) || !isWater(down) || !isWater(left) || !isWater(up);
          c = r === 1 || !shore ? C.water : C.waterEdge;
          if (look.river === 'dry' && r === 1) c = C.contourBold;
        } else if (r === 2) {
          c = look.river === 'dry' ? C.contour : C.waterEdge;
        } else {
          if (isWood(i)) c = !isWood(right) || !isWood(down) || !isWood(left) || !isWood(up) ? C.woodEdge : C.wood;
          const l = level(i);
          if (l !== level(right) || l !== level(down)) c = Math.min(l, level(right), level(down)) % 4 === 3 ? C.contourBold : C.contour;
        }
        // Grid lines, faint.
        let k = 1;
        let mix = 0;
        if (x % m.grid === 0 || y % m.grid === 0) mix = 0.28;
        // Paper grain, and the sheet darkening toward its edges.
        const g = hashSeed(m.seed, x, y) / 4294967296;
        k *= g < 0.07 ? 0.94 : g > 0.95 ? 1.04 : 1;
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (edge < 14) k *= 0.8 + (0.2 * edge) / 14;
        const o = i * 4;
        d[o] = clamp((c[0] * (1 - mix) + C.ink[0] * mix) * k);
        d[o + 1] = clamp((c[1] * (1 - mix) + C.ink[1] * mix) * k);
        d[o + 2] = clamp((c[2] * (1 - mix) + C.ink[2] * mix) * k);
        d[o + 3] = 255;
      }
    }
    p.ctx.putImageData(img, 0, 0);

    // Map symbols: trees in the woods, hill marks up high, the biome's scatter on open ground,
    // a few settlements. Kept off the nodes and the routes.
    const free = (x: number, y: number, pad: number) => {
      if (x < 4 || y < 4 || x >= w - 4 || y >= h - 4) return false;
      if (m.clear.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + pad)) return false;
      if (m.routes.some(([x1, y1, x2, y2]) => segDist(x, y, x1, y1, x2, y2) < 4 + pad)) return false;
      const i = at(x, y);
      return !isWater(i) && river[i] === 0;
    };
    const sym = new Painter(p.ctx);
    for (let y = 6; y < h - 6; y += 7) {
      for (let x = 6 + ((y / 7) % 2) * 3; x < w - 6; x += 7) {
        const jx = x + rng.int(-2, 2);
        const jy = y + rng.int(-2, 2);
        if (!free(jx, jy, 3)) continue;
        const i = at(jx, jy);
        if (isWood(i)) {
          if (rng.chance(0.75)) woodSymbol(sym, jx, jy, look, m.biome);
        } else if (elev[i]! > 0.68 && rng.chance(0.5)) {
          hillSymbol(sym, jx, jy, look);
        } else if (rng.chance(scatterChance[look.scatter])) {
          scatterSymbol(sym, jx, jy, look, rng);
        }
      }
    }
    for (let t = 0, tries = 0; t < look.towns && tries < 60; tries++) {
      const x = rng.int(10, w - 10);
      const y = rng.int(10, h - 10);
      if (!free(x, y, 8)) continue;
      town(sym, x, y, rng);
      t++;
    }
    compass(sym, w - 16, 16);
  });
}

const scatterChance: Record<MapLook['scatter'], number> = { tufts: 0.12, pines: 0.14, dunes: 0.3, craters: 0.16, blocks: 0.05 };

function woodSymbol(p: Painter, x: number, y: number, look: MapLook, biome: BiomeId): void {
  if (biome === 'arctic') {
    p.px(x, y - 2, look.woodEdge);
    p.rect(x - 1, y - 1, 3, 1, look.woodEdge);
    p.rect(x - 1, y, 3, 1, look.woodEdge);
    p.px(x, y + 1, INK);
    return;
  }
  // The field-map tree: a small round crown on a stalk.
  p.rect(x - 1, y - 2, 3, 2, look.woodEdge);
  p.px(x, y - 3, look.woodEdge);
  p.px(x, y, INK);
}

function hillSymbol(p: Painter, x: number, y: number, look: MapLook): void {
  // Hachures: a caret, lit on its left.
  p.px(x, y - 2, look.contourBold);
  p.px(x - 1, y - 1, look.contour);
  p.px(x + 1, y - 1, look.contourBold);
  p.px(x - 2, y, look.contour);
  p.px(x + 2, y, look.contourBold);
}

function scatterSymbol(p: Painter, x: number, y: number, look: MapLook, rng: Rng): void {
  switch (look.scatter) {
    case 'tufts':
      // Marsh or meadow tufts.
      p.px(x - 1, y, look.woodEdge);
      p.px(x, y - 1, look.woodEdge);
      p.px(x + 1, y, look.woodEdge);
      return;
    case 'pines':
      p.px(x, y - 1, look.woodEdge);
      p.rect(x - 1, y, 3, 1, look.woodEdge);
      return;
    case 'dunes':
      // A crescent ridge.
      p.rect(x - 2, y, 1, 1, look.contour);
      p.rect(x - 1, y - 1, 3, 1, look.contourBold);
      p.rect(x + 2, y, 1, 1, look.contour);
      return;
    case 'craters':
      p.px(x - 1, y - 1, look.contour);
      p.px(x, y - 1, look.contour);
      p.px(x - 1, y, look.contour);
      p.px(x + 1, y, look.contourBold);
      p.px(x, y + 1, look.contourBold);
      p.px(x + 1, y + 1, look.contourBold);
      if (rng.chance(0.3)) p.px(x, y, INK);
      return;
    case 'blocks':
      p.rect(x, y, 2, 2, INK);
      return;
  }
}

/** A settlement: a cluster of small black blocks along a street. */
function town(p: Painter, x: number, y: number, rng: Rng): void {
  const n = rng.int(5, 9);
  const horizontal = rng.chance(0.5);
  for (let i = 0; i < n; i++) {
    const along = rng.int(-6, 6);
    const side = rng.sign() * rng.int(2, 4);
    const bx = horizontal ? x + along : x + side;
    const by = horizontal ? y + side : y + along;
    p.rect(bx, by, rng.int(2, 3), 2, INK);
  }
}

/** A north arrow (the 'N' is text, laid on by the scene). */
function compass(p: Painter, x: number, y: number): void {
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    p.px(Math.round(x + Math.cos(t) * 6), Math.round(y + Math.sin(t) * 6), INK);
  }
  peak(p, x, y - 8, y, 2, (u) => (u < 0 ? INK : '#5a5246'));
  peak(p, x, y, y + 4, 1.5, () => '#5a5246');
}

// ── Noise ───────────────────────────────────────────────────────────────────────────────────────

/** Value noise, summed over octaves of `[cell size, weight]`, sampled per pixel (0 … 1). */
function fbm(seed: number, w: number, h: number, octaves: [number, number][]): Float32Array {
  const out = new Float32Array(w * h);
  octaves.forEach(([cell, weight], o) => {
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const lattice = new Float32Array(gw * gh);
    for (let i = 0; i < lattice.length; i++) lattice[i] = hashSeed(seed, o, i) / 4294967296;
    for (let y = 0; y < h; y++) {
      const fy = y / cell;
      const iy = Math.floor(fy);
      const ty = smooth(fy - iy);
      for (let x = 0; x < w; x++) {
        const fx = x / cell;
        const ix = Math.floor(fx);
        const tx = smooth(fx - ix);
        const a = lattice[iy * gw + ix]!;
        const b = lattice[iy * gw + ix + 1]!;
        const c = lattice[(iy + 1) * gw + ix]!;
        const e = lattice[(iy + 1) * gw + ix + 1]!;
        const i = y * w + x;
        out[i] = out[i]! + weight * (a + (b - a) * tx + (c - a + (a - b - c + e) * tx) * ty);
      }
    }
  });
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = dx * dx + dy * dy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
