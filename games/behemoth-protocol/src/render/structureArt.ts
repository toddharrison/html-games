import type { BiomeId } from '../content/biomes';
import type { RoadStyle, StructureId, TreeId } from '../content/structures';
import type { Rng } from '../sim/rng';
import type { Pal } from './looks';
import type { Painter } from './painter';

/**
 * Placeholder art for settlements (SPEC §4.6 "Settlements"): every structure drawn whole, seen from
 * above and lit from the upper left, then cut into its tiles by render/tileArt.ts; factory hall
 * roofs as nine-slices; roads and walls for each way they can join; footbridges, tree species,
 * and parked cars. Each structure keeps a margin on its lower right for its own shadow, so
 * neighbors read apart. Colors come from the battle's palette (biome and look).
 */

const SHADOW = 'rgba(8,10,8,0.42)';
type Ramp = readonly [base: string, hi: string, dark: string];

const roofA = (pal: Pal): Ramp => [pal.roofA, pal.roofAHi, pal.roofADark];
const roofB = (pal: Pal): Ramp => [pal.roofB, pal.roofBHi, pal.roofBDark];
const roofC = (pal: Pal): Ramp => [pal.roofC, pal.roofCHi, pal.roofCDark];
const concrete = (pal: Pal): Ramp => [pal.concrete, pal.concreteHi, pal.concreteDark];
const marble = (pal: Pal): Ramp => [pal.marble, pal.marbleHi, pal.marbleDark];

/** A raised box: shadow down-right, lit top and left edges, dark bottom and right ones. */
function slab(p: Painter, x: number, y: number, w: number, h: number, [base, hi, dark]: Ramp, shadow = 2): void {
  if (shadow) p.rect(x + shadow, y + shadow, w, h, SHADOW);
  p.rect(x, y, w, h, dark);
  p.rect(x, y, w - 1, h - 1, hi);
  p.rect(x + 1, y + 1, w - 2, h - 2, base);
}

/** A flat roof behind a parapet: the slab with the roof surface sunk a pixel inside its rim. */
function flatRoof(p: Painter, x: number, y: number, w: number, h: number, ramp: Ramp, shadow = 2): void {
  slab(p, x, y, w, h, ramp, shadow);
  p.rect(x + 2, y + 2, w - 4, 1, ramp[2]);
  p.rect(x + 2, y + 2, 1, h - 4, ramp[2]);
}

/**
 * A pitched roof, per pixel: a gable (ridge along the longer side) or a hip (sloped ends too). Slopes
 * facing up and left catch the light.
 */
function pitched(p: Painter, x: number, y: number, w: number, h: number, [base, hi, dark]: Ramp, hip: boolean, shadow = 2): void {
  if (shadow) p.rect(x + shadow, y + shadow, w, h, SHADOW);
  const across = w >= h; // ridge runs across the screen
  const ridge = Math.floor(((across ? h : w) - 1) / 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dy = across ? Math.min(j, h - 1 - j) : Math.min(i, w - 1 - i);
      const dx = across ? Math.min(i, w - 1 - i) : Math.min(j, h - 1 - j);
      const first = across ? j < h / 2 : i < w / 2;
      const endFirst = across ? i < w / 2 : j < h / 2;
      let c: string;
      if (hip && dx < dy) c = endFirst ? hi : dark;
      else c = first ? base : dark;
      // Ridge line, and tile courses on the lit side.
      if (dy === ridge && !(hip && dx < dy)) c = hi;
      else if (c === base && (across ? i : j) % 3 === 1 && (across ? j : i) % 2 === 0) c = dark;
      p.px(x + i, y + j, c);
    }
  }
}

function dome(p: Painter, cx: number, cy: number, r: number, [base, hi, dark]: Ramp): void {
  p.disc(cx + 2, cy + 2, r, SHADOW);
  p.disc(cx, cy, r, base, hi, dark);
  // Ribs, and a lantern on top.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (let t = r * 0.35; t < r - 1; t += 1) p.px(Math.round(cx + Math.cos(a) * t - 0.5), Math.round(cy + Math.sin(a) * t - 0.5), dark);
  }
  p.disc(cx - r * 0.3, cy - r * 0.3, Math.max(1, r * 0.25), hi);
  p.disc(cx, cy, Math.max(1.2, r * 0.18), dark, hi);
}

function ac(p: Painter, pal: Pal, x: number, y: number): void {
  p.rect(x + 1, y + 1, 3, 2, SHADOW);
  p.rect(x, y, 3, 2, pal.concreteHi);
  p.px(x + 1, y, pal.steelDark);
}

function vent(p: Painter, pal: Pal, x: number, y: number): void {
  p.rect(x, y, 2, 2, pal.steelDark);
  p.px(x, y, pal.steelMid);
}

function tankTop(p: Painter, pal: Pal, cx: number, cy: number, r: number): void {
  p.disc(cx + 1, cy + 1, r, SHADOW);
  p.disc(cx, cy, r, pal.steelMid, pal.steelHi, pal.steelDark);
}

function helipad(p: Painter, pal: Pal, cx: number, cy: number, r: number): void {
  p.disc(cx, cy, r, pal.paint);
  p.disc(cx, cy, r - 1, pal.asphalt);
  p.rect(cx - 2, cy - 2, 1, 5, pal.paint);
  p.rect(cx + 1, cy - 2, 1, 5, pal.paint);
  p.rect(cx - 1, cy, 2, 1, pal.paint);
}

function chimney(p: Painter, pal: Pal, x: number, y: number): void {
  p.rect(x + 1, y + 1, 2, 2, SHADOW);
  p.rect(x, y, 2, 2, pal.wall);
  p.px(x, y, pal.hole);
}

/** Paving round city buildings: their plot, lighter than the street. */
function apron(p: Painter, rng: Rng, pal: Pal, w: number, h: number): void {
  p.rect(0, 0, w, h, pal.rubble);
  p.speckle(rng, 0, 0, w, h, (w * h) / 24, pal.rubbleDark);
}

/** Window glass with mullions: a glass-walled tower's roof edge and setbacks seen from above. */
function glassBlock(p: Painter, pal: Pal, x: number, y: number, w: number, h: number, shadow = 3): void {
  p.rect(x + shadow, y + shadow, w, h, SHADOW);
  p.rect(x, y, w, h, pal.paneDark);
  p.rect(x + 1, y + 1, w - 2, h - 2, pal.pane);
  for (let i = x + 3; i < x + w - 1; i += 4) p.rect(i, y + 1, 1, h - 2, pal.paneDark);
  for (let j = y + 3; j < y + h - 1; j += 4) p.rect(x + 1, j, w - 2, 1, pal.paneDark);
  // Sky reflected in a band across the upper left.
  for (let k = 0; k < Math.min(w, h) - 2; k += 1) {
    const px = x + 1 + k;
    const py = y + Math.max(1, Math.floor(h * 0.45) - k);
    if (py > y && py < y + h - 1 && px < x + w - 1) p.px(px, py, pal.paneHi);
  }
}

/** The structures (drawn whole: `w` = rows × 16 px across, `h` = cols × 16 px tall). */
export function drawStructure(p: Painter, id: StructureId, style: number, w: number, h: number, rng: Rng, pal: Pal, biome: BiomeId): void {
  const snow = biome === 'arctic';
  switch (id) {
    case 'house': {
      if (style === 0) {
        pitched(p, 1, 2, 13, 11, roofA(pal), false);
        chimney(p, pal, rng.int(3, 9), 3);
      } else if (style === 1) {
        pitched(p, 2, 1, 11, 13, roofB(pal), false);
        chimney(p, pal, 3, rng.int(3, 9));
      } else if (style === 2) {
        pitched(p, 2, 2, 12, 11, roofA(pal), true);
        p.rect(7, 13, 2, 3, pal.rubble); // path to the street
      } else {
        // An L: a main wing and a side wing.
        pitched(p, 1, 1, 13, 7, roofB(pal), false);
        pitched(p, 1, 7, 6, 7, roofB(pal), false, 2);
        chimney(p, pal, 10, 2);
      }
      if (snow) p.speckle(rng, 2, 2, 11, 5, 10, pal.snowHi);
      return;
    }
    case 'flat': {
      apron(p, rng, pal, w, h);
      const ramp = style === 1 ? roofA(pal) : roofB(pal);
      flatRoof(p, 1, 1, 13, 13, ramp);
      if (style === 0) {
        ac(p, pal, 4, 4);
        ac(p, pal, 8, 8);
      } else if (style === 1) {
        tankTop(p, pal, 9, 6, 2.5);
        vent(p, pal, 4, 9);
      } else {
        p.rect(4, 4, 7, 2, pal.pane);
        p.rect(4, 4, 7, 1, pal.paneHi);
        slab(p, 4, 8, 4, 3, roofB(pal), 1);
      }
      return;
    }
    case 'terrace': {
      // A row of narrow houses under one ridge, each its own shade, chimneys on the party walls.
      const ramp = style === 0 ? roofA(pal) : roofB(pal);
      p.rect(2, 3, 30, 11, SHADOW);
      const n = 4;
      for (let k = 0; k < n; k++) {
        const x = Math.round(1 + k * 7.5);
        pitched(p, x, 2, 8, 11, k % 2 ? ramp : [shadeOf(ramp[0], -10), ramp[1], ramp[2]], false, 0);
        if (k > 0) chimney(p, pal, x - 1, 3);
      }
      // Back yards: a fence line.
      for (let x = 2; x < 30; x += 2) p.px(x, 14, pal.trunk);
      if (snow) p.speckle(rng, 2, 2, 28, 5, 18, pal.snowHi);
      return;
    }
    case 'block': {
      apron(p, rng, pal, w, h);
      if (style === 2) {
        // A courtyard block: a U round a yard with a tree.
        const ramp = roofA(pal);
        flatRoof(p, 1, 1, 28, 9, ramp);
        flatRoof(p, 1, 9, 9, 20, ramp);
        flatRoof(p, 20, 9, 9, 20, ramp);
        p.rect(10, 10, 10, 18, pal.lawn);
        p.disc(15, 18, 3.5, pal.canopy, pal.canopyLight, pal.canopyShadow);
        ac(p, pal, 4, 4);
        ac(p, pal, 22, 3);
        return;
      }
      const ramp = style === 0 ? roofB(pal) : roofA(pal);
      flatRoof(p, 1, 1, 28, 28, ramp, 3);
      slab(p, 5, 5, 7, 6, concrete(pal), 2); // stair and lift housing
      p.rect(7, 7, 3, 2, pal.hole);
      ac(p, pal, 17, 5);
      ac(p, pal, 22, 5);
      ac(p, pal, 17, 9);
      vent(p, pal, 7, 20);
      vent(p, pal, 22, 21);
      tankTop(p, pal, 19, 20, 3);
      if (snow) p.speckle(rng, 3, 3, 24, 24, 40, pal.snowHi);
      return;
    }
    case 'midrise': {
      apron(p, rng, pal, w, h);
      const ramp = style === 0 ? concrete(pal) : roofA(pal);
      flatRoof(p, 2, 2, 42, 42, ramp, 4);
      // A setback penthouse, the machine room, and a rooftop garden or AC rows.
      slab(p, 8, 8, 20, 16, ramp, 3);
      slab(p, 12, 11, 8, 6, concrete(pal), 2);
      p.rect(14, 13, 3, 2, pal.hole);
      if (style === 1) {
        p.rect(30, 8, 10, 30, pal.lawn);
        for (let k = 0; k < 4; k++) p.disc(35, 12 + k * 7, 2.5, pal.canopy, pal.canopyLight, pal.canopyShadow);
        tankTop(p, pal, 14, 34, 4);
      } else {
        for (let k = 0; k < 4; k++) ac(p, pal, 31 + (k % 2) * 5, 9 + Math.floor(k / 2) * 5);
        for (let k = 0; k < 3; k++) vent(p, pal, 10 + k * 6, 32);
        tankTop(p, pal, 34, 32, 4);
      }
      if (snow) p.speckle(rng, 4, 4, 38, 38, 80, pal.snowHi);
      return;
    }
    case 'tower': {
      // A plaza round the foot of the tower.
      apron(p, rng, pal, w, h);
      for (let k = 2; k < w; k += 8) p.rect(k, 0, 1, h, pal.rubbleDark);
      for (let k = 2; k < h; k += 8) p.rect(0, k, w, 1, pal.rubbleDark);
      if (style === 0) {
        // Glass curtain walls, a concrete crown with the helipad.
        glassBlock(p, pal, 3, 3, 54, 54, 5);
        slab(p, 16, 16, 28, 28, concrete(pal), 3);
        helipad(p, pal, 30, 30, 9);
        vent(p, pal, 18, 18);
        vent(p, pal, 40, 41);
      } else if (style === 1) {
        // A stepped tower: three setbacks and a spire.
        flatRoof(p, 3, 3, 54, 54, concrete(pal), 5);
        flatRoof(p, 11, 11, 38, 38, concrete(pal), 3);
        flatRoof(p, 19, 19, 22, 22, roofB(pal), 3);
        dome(p, 30, 30, 5, roofB(pal));
        for (const [x, y] of [[6, 6], [50, 6], [6, 50], [50, 50]] as const) ac(p, pal, x, y);
        for (let k = 0; k < 4; k++) vent(p, pal, 14 + k * 9, 44);
      } else {
        // Twin glass slabs joined by a core, with roof gardens.
        glassBlock(p, pal, 3, 3, 30, 54, 5);
        glassBlock(p, pal, 28, 14, 30, 42, 4);
        slab(p, 22, 20, 14, 16, concrete(pal), 2);
        p.rect(24, 23, 4, 3, pal.hole);
        ac(p, pal, 29, 29);
        p.rect(8, 8, 10, 8, pal.lawn);
        p.disc(13, 12, 2.5, pal.canopy, pal.canopyLight, pal.canopyShadow);
      }
      if (snow) p.speckle(rng, 4, 4, 50, 50, 120, pal.snowHi);
      return;
    }
    case 'capitol': {
      // A seat of government on its lawn: a cross of wings in pale stone round a great dome, a
      // portico and steps facing the way forward (up), formal paths.
      p.rect(0, 0, w, h, pal.lawn);
      p.speckle(rng, 0, 0, w, h, 140, pal.lawnHi);
      p.speckle(rng, 0, 0, w, h, 80, pal.lawnDark);
      p.rect(29, 0, 6, 64, pal.rubble);
      p.rect(0, 50, 64, 4, pal.rubble);
      p.disc(10, 52, 3, pal.rubble);
      p.disc(54, 52, 3, pal.rubble);
      flatRoof(p, 4, 20, 56, 22, marble(pal), 3);
      flatRoof(p, 20, 8, 24, 44, marble(pal), 3);
      // The portico's columns and steps.
      p.rect(22, 4, 20, 4, pal.marbleDark);
      p.rect(22, 3, 20, 1, pal.marbleHi);
      for (let x = 23; x < 42; x += 3) p.rect(x, 5, 1, 3, pal.marbleHi);
      for (const [x, y] of [[8, 24], [52, 24], [8, 34], [52, 34]] as const) p.rect(x, y, 3, 3, pal.marbleDark);
      dome(p, 32, 31, 10, [pal.dome, pal.domeHi, pal.domeDark]);
      return;
    }
    case 'church': {
      // A nave under a steep roof, transepts, and a square tower at the front with its spire.
      pitched(p, 2, 10, 11, 21, roofB(pal), false);
      pitched(p, 0, 19, 16, 6, roofB(pal), false, 1);
      slab(p, 3, 1, 9, 9, [pal.wall, pal.rubble, pal.rubbleDark], 2);
      pitched(p, 4, 2, 7, 7, roofB(pal), true, 0);
      p.px(7, 5, pal.hole);
      if (snow) p.speckle(rng, 2, 10, 6, 20, 14, pal.snowHi);
      return;
    }
    case 'farmhouse': {
      if (style === 0) {
        pitched(p, 1, 1, 13, 7, roofA(pal), false);
        pitched(p, 8, 1, 6, 13, roofA(pal), false, 2);
        p.rect(2, 9, 5, 3, pal.plank); // porch
        p.rect(2, 9, 5, 1, pal.plankDark);
        chimney(p, pal, 3, 2);
      } else {
        pitched(p, 2, 2, 12, 11, roofB(pal), true);
        chimney(p, pal, 9, 4);
        p.rect(1, 14, 4, 1, pal.trunk);
      }
      return;
    }
    case 'barn': {
      // A big barn: a gambrel roof (two pitches each side of the ridge) in painted sheet metal, or
      // old timber, with a lean-to along one side.
      const ramp: Ramp = style === 0 ? roofC(pal) : [pal.plank, shadeOf(pal.plank, 22), pal.plankDark];
      p.rect(3, 3, 28, 11, SHADOW);
      const rows: string[] = [ramp[1], ramp[0], ramp[0], ramp[0], ramp[1], ramp[2], ramp[2], ramp[2], ramp[2], ramp[2]];
      for (let j = 0; j < rows.length; j++) p.rect(1, 2 + j, 29, 1, rows[j]!);
      p.rect(1, 6, 29, 1, ramp[1]); // ridge
      for (let x = 2; x < 30; x += 3) p.rect(x, 2, 1, 10, shadeOf(rows[0]!, -14));
      p.rect(1, 2, 29, 1, ramp[1]);
      // Lean-to.
      p.rect(4, 12, 14, 3, ramp[2]);
      p.rect(4, 12, 14, 1, ramp[0]);
      return;
    }
    case 'silo': {
      p.disc(8.5, 8.5, 6.2, SHADOW);
      p.disc(7, 7, 6, pal.steelMid, pal.steelHi, pal.steelDark);
      p.disc(7, 7, 3.5, pal.steelHi, pal.steelGlint);
      p.disc(7, 7, 1, pal.steelDark);
      p.disc(13.5, 13, 2.2, pal.steelDark, pal.steelMid);
      return;
    }
    case 'warehouse': {
      apron(p, rng, pal, w, h);
      const ramp: Ramp = style === 0 ? roofB(pal) : [pal.rust, pal.rustHi, shadeOf(pal.rust, -16)];
      slab(p, 1, 2, 44, 24, ramp, 3);
      // Corrugated sheet running down the slopes, a ridge vent, skylights.
      for (let x = 2; x < 44; x += 2) p.rect(x, 3, 1, 22, ramp[2]);
      p.rect(1, 13, 44, 2, ramp[1]);
      for (let x = 6; x < 42; x += 10) p.rect(x, 6, 4, 3, pal.pane);
      // Loading docks on the near side.
      for (let x = 5; x < 42; x += 9) p.rect(x, 26, 5, 3, pal.hole);
      return;
    }
    case 'smokestack': {
      apron(p, rng, pal, w, h);
      slab(p, 2, 2, 11, 11, concrete(pal), 2);
      p.disc(8.5, 8.5, 4.5, SHADOW);
      p.disc(7, 7, 4.5, pal.wall, pal.rubble, pal.rubbleDark);
      p.disc(7, 7, 2.6, pal.hole);
      p.speckle(rng, 2, 2, 11, 11, 10, pal.ash);
      return;
    }
    case 'coolingTower': {
      apron(p, rng, pal, w, h);
      // A hyperbolic shell from above: a lit rim round a dark, steaming throat.
      p.disc(26, 26, 21, SHADOW);
      p.disc(23, 23, 21, pal.concrete, pal.concreteHi, pal.concreteDark);
      p.disc(23, 23, 17, pal.concreteDark, pal.concrete);
      p.disc(23.5, 23.5, 15, pal.hole);
      p.speckle(rng, 12, 12, 23, 23, 60, pal.ashLight);
      p.speckle(rng, 14, 14, 18, 18, 30, pal.concreteHi);
      return;
    }
    case 'cabin': {
      // A log cabin under a heavy snow load (the arctic's palette makes the snow).
      const roof: Ramp = [pal.grassLight, pal.snowHi, pal.grassDark];
      if (style === 0) {
        pitched(p, 2, 2, 12, 11, roof, false);
        p.rect(2, 12, 12, 1, pal.trunk);
        chimney(p, pal, 10, 4);
      } else {
        pitched(p, 3, 3, 10, 9, roof, true);
        p.rect(4, 12, 8, 2, pal.plank);
        p.rect(4, 13, 8, 1, pal.plankDark);
      }
      return;
    }
    case 'quonset': {
      // A half-cylinder hut, long along the field: ribs across it, lit on the left.
      const [base, hi, dark] = style === 0 ? [pal.steelMid, pal.steelHi, pal.steelDark] : roofC(pal);
      p.rect(4, 3, 11, 29, SHADOW);
      const shades = [dark, hi, hi, base, base, base, base, dark, dark, dark, dark];
      for (let i = 0; i < shades.length; i++) p.rect(2 + i, 1, 1, 29, shades[i]!);
      for (let y = 3; y < 30; y += 3) p.rect(2, y, 11, 1, dark);
      p.rect(5, 29, 5, 2, pal.hole); // door
      if (snow) p.speckle(rng, 3, 2, 6, 27, 30, pal.snowHi);
      return;
    }
    case 'radome': {
      apron(p, rng, pal, w, h);
      slab(p, 2, 2, 26, 26, concrete(pal), 2);
      p.disc(17, 17, 12, SHADOW);
      p.disc(15, 15, 12, '#dfe5e8', '#f6f8f9', '#a8b4bb');
      // Geodesic panels.
      for (let k = 0; k < 40; k++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(2, 10);
        p.px(Math.round(15 + Math.cos(a) * r), Math.round(15 + Math.sin(a) * r), '#c2ccd2');
      }
      p.rect(26, 4, 1, 6, pal.steelHi);
      p.rect(25, 4, 3, 1, pal.steelHi);
      return;
    }
    case 'adobe': {
      // Flat earth roofs behind thick parapets, flush with the lane.
      const ramp = roofA(pal);
      flatRoof(p, 1, 1, 14, 13, ramp);
      if (style === 0) {
        p.rect(3, 9, 5, 3, ramp[2]); // stair well
        p.rect(3, 9, 5, 1, ramp[1]);
      } else if (style === 1) {
        p.disc(10, 5, 2, ramp[2], ramp[1]); // water jar
        p.rect(3, 4, 3, 3, pal.plank); // a mat
      } else {
        slab(p, 1, 1, 8, 7, [ramp[1], shadeOf(ramp[1], 14), ramp[0]], 2); // a room on the roof
        p.rect(4, 4, 2, 2, pal.hole);
      }
      return;
    }
    case 'courtyard': {
      const ramp = roofA(pal);
      flatRoof(p, 1, 1, 28, 28, ramp, 3);
      // The courtyard: tiled, with a well or a palm.
      p.rect(9, 9, 12, 12, ramp[2]);
      p.rect(10, 10, 10, 10, pal.rubble);
      for (let k = 10; k < 20; k += 3) p.rect(k, 10, 1, 10, pal.rubbleDark);
      if (style === 0) {
        p.disc(15, 15, 2.5, pal.wall, pal.rubble, pal.hole);
        p.disc(15, 15, 1.2, pal.waterDeep);
      } else palm(p, pal, 15, 15, 6);
      p.rect(23, 4, 3, 3, ramp[2]);
      return;
    }
    case 'domed': {
      // A domed hall: a square block with corner turrets round a big dome.
      apron(p, rng, pal, w, h);
      flatRoof(p, 2, 2, 26, 26, roofB(pal), 2);
      for (const [x, y] of [[2, 2], [23, 2], [2, 23], [23, 23]] as const) slab(p, x, y, 5, 5, roofA(pal), 1);
      dome(p, 15, 15, 9, [pal.marble, pal.marbleHi, pal.marbleDark]);
      return;
    }
    case 'waterTower': {
      // A tank on legs: the legs' shadows run off down-right.
      for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]] as const) p.rect(x + 2, y + 2, 1, 3, SHADOW);
      p.disc(10, 10, 5.5, SHADOW);
      p.disc(7.5, 7.5, 5.5, pal.steelMid, pal.steelHi, pal.steelDark);
      p.disc(7.5, 7.5, 2, pal.steelDark, pal.steelMid);
      return;
    }
  }
}

/** Factory hall roofs as a nine-slice (48 × 48, three tiles a side): sawtooth, barrel vaults, flat. */
export function drawHall(p: Painter, style: number, rng: Rng, pal: Pal): void {
  const S = 48;
  if (style === 0) {
    // Sawtooth: glazed north lights in rows across the roof.
    p.rect(0, 0, S, S, pal.rust);
    for (let y = 0; y < S; y += 4) {
      p.rect(0, y, S, 1, pal.rustHi);
      p.rect(0, y + 2, S, 1, pal.girder);
    }
  } else if (style === 1) {
    // Barrel vaults, one a tile wide, running down the hall.
    const shades = [pal.steelDark, pal.steelMid, pal.steelHi, pal.steelHi, pal.steelMid, pal.steelMid, pal.steelMid, pal.steelMid, pal.steel, pal.steel, pal.steel, pal.steel, pal.steel, pal.steelDark, pal.steelDark, pal.steelDark];
    for (let x = 0; x < S; x++) p.rect(x, 0, 1, S, shades[x % 16]!);
    for (let y = 0; y < S; y += 4) p.rect(0, y, S, 1, pal.steelDark);
  } else {
    // Flat roof: concrete panels, skylights, vents.
    p.rect(0, 0, S, S, pal.concrete);
    for (let k = 0; k < S; k += 8) {
      p.rect(k, 0, 1, S, pal.concreteDark);
      p.rect(0, k, S, 1, pal.concreteDark);
    }
    for (let y = 4; y < S; y += 16) for (let x = 4; x < S; x += 16) p.rect(x, y, 6, 3, pal.pane);
    for (let y = 12; y < S; y += 16) for (let x = 12; x < S; x += 16) vent(p, pal, x, y);
  }
  p.speckle(rng, 0, 0, S, S, 60, pal.concreteDark);
  // The parapet round the outside: lit top and left, dark bottom and right, and the shadow below.
  p.rect(0, 0, S, 1, pal.concreteHi);
  p.rect(0, 0, 1, S, pal.concreteHi);
  p.rect(0, S - 2, S, 2, SHADOW);
  p.rect(S - 2, 0, 2, S, SHADOW);
  p.rect(0, S - 3, S - 2, 1, pal.concreteDark);
  p.rect(S - 3, 0, 1, S - 2, pal.concreteDark);
}

/** Blown-in roof, scorch, and debris over one tile of a damaged structure (at x, y). */
export function damageTile(p: Painter, rng: Rng, pal: Pal, x: number, y: number): void {
  const hx = x + rng.int(2, 9);
  const hy = y + rng.int(2, 9);
  p.rect(hx, hy, rng.int(3, 5), rng.int(3, 4), pal.hole);
  p.rect(hx - 1, hy - 1, 2, 2, pal.rubbleDark);
  p.speckle(rng, x + 1, y + 1, 14, 14, 10, pal.hole);
  p.speckle(rng, x + 1, y + 1, 14, 14, 8, pal.ash);
  p.speckle(rng, x + 1, y + 1, 14, 14, 4, pal.rubble);
}

const bits = (n: number) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1);

/** Which way each `LINK` bit points on screen: ahead is up, the field's right is screen right. */
const UP = 1;
const RIGHT = 2;
const DOWN = 4;
const LEFT = 8;

/**
 * A road tile for one set of links. Country roads (`track`, `paved`) are a band down the middle
 * that turns toward each neighbor it joins, with the ground showing either side; town surfaces fill
 * the tile and put a curb along each side that doesn't join.
 */
export function drawRoad(p: Painter, style: RoadStyle, links: number, v: number, rng: Rng, pal: Pal): void {
  const T = 16;
  if (style === 'track' || style === 'paved') {
    const paved = style === 'paved';
    const bw = paved ? 10 : 8;
    const a = (T - bw) / 2;
    const fill = paved ? pal.asphalt : shadeOf(pal.dirt, 14);
    const edge = paved ? pal.paintDim : pal.dirtDark;
    const parts: [number, number, number, number][] = [[a, a, bw, bw]];
    if (links & UP) parts.push([a, 0, bw, a]);
    if (links & DOWN) parts.push([a, a + bw, bw, a]);
    if (links & LEFT) parts.push([0, a, a, bw]);
    if (links & RIGHT) parts.push([a + bw, a, a, bw]);
    // A junction (or one lane of a two-tile road) fills out to the sides it joins, corners and all,
    // so a wide road doesn't come apart into two lanes.
    if (bits(links) >= 3) {
      const x0 = links & LEFT ? 0 : a;
      const y0 = links & UP ? 0 : a;
      parts.push([x0, y0, (links & RIGHT ? T : a + bw) - x0, (links & DOWN ? T : a + bw) - y0]);
    }
    for (const [x, y, w, h] of parts) p.rect(x, y, w, h, fill);
    // Shoulders: an edge line (paint, or dry dirt) along the sides that face the open ground.
    if (!(links & LEFT)) p.rect(a, links & UP ? 0 : a, 1, (links & DOWN ? T : a + bw) - (links & UP ? 0 : a), edge);
    if (!(links & RIGHT)) p.rect(a + bw - 1, links & UP ? 0 : a, 1, (links & DOWN ? T : a + bw) - (links & UP ? 0 : a), edge);
    if (!(links & UP)) p.rect(links & LEFT ? 0 : a, a, (links & RIGHT ? T : a + bw) - (links & LEFT ? 0 : a), 1, edge);
    if (!(links & DOWN)) p.rect(links & LEFT ? 0 : a, a + bw - 1, (links & RIGHT ? T : a + bw) - (links & LEFT ? 0 : a), 1, edge);
    if (paved) {
      p.speckle(rng, a, a, bw, bw, 4, pal.asphaltHi);
      // Center dashes on a straight run.
      if (links === (UP | DOWN)) for (let y = 1; y < T; y += 8) p.rect(7, y, 1, 4, pal.paint);
      if (links === (LEFT | RIGHT)) for (let x = 1; x < T; x += 8) p.rect(x, 7, 4, 1, pal.paint);
    } else {
      // Wheel ruts and a grassy crown.
      p.speckle(rng, a, a, bw, bw, 6, pal.dirtDark);
      if (links === (UP | DOWN)) {
        p.rect(a + 2, 0, 1, T, pal.dirtDark);
        p.rect(a + bw - 3, 0, 1, T, pal.dirtDark);
        p.speckle(rng, 7, 0, 2, T, 4, pal.grassDark);
      } else if (links === (LEFT | RIGHT)) {
        p.rect(0, a + 2, T, 1, pal.dirtDark);
        p.rect(0, a + bw - 3, T, 1, pal.dirtDark);
        p.speckle(rng, 0, 7, T, 2, 4, pal.grassDark);
      }
    }
    return;
  }

  // Town surfaces fill the tile.
  const base = style === 'plaza' ? pal.rubble : pal.asphalt;
  p.rect(0, 0, T, T, base);
  if (style === 'plaza') {
    for (let k = 0; k < T; k += 4) {
      p.rect(k, 0, 1, T, pal.rubbleDark);
      p.rect(0, k, T, 1, pal.rubbleDark);
    }
    p.speckle(rng, 0, 0, T, T, 6, pal.concreteHi);
    if (v === 1) {
      // A planter with a shrub in it.
      slab(p, 5, 5, 6, 6, [pal.concrete, pal.concreteHi, pal.concreteDark], 1);
      p.disc(8, 8, 2.4, pal.canopy, pal.canopyLight, pal.canopyShadow);
    }
    return;
  }
  p.speckle(rng, 0, 0, T, T, 10, pal.asphaltHi);
  p.speckle(rng, 0, 0, T, T, 4, pal.hole);
  if (style === 'lot') {
    // Parking bays: stall lines off an aisle down the middle.
    for (let x = 1; x < T; x += 5) {
      p.rect(x, 0, 1, 5, pal.paintDim);
      p.rect(x, T - 5, 1, 5, pal.paintDim);
    }
  } else if (style === 'avenue') {
    p.rect(0, 0, 1, T, pal.asphaltHi);
    for (let y = 2; y < T; y += 8) p.rect(8, y, 1, 4, pal.paint);
  } else {
    if (links === (UP | DOWN)) for (let y = 2; y < T; y += 8) p.rect(7, y, 1, 3, pal.paintDim);
    if (links === (LEFT | RIGHT)) for (let x = 2; x < T; x += 8) p.rect(x, 7, 3, 1, pal.paintDim);
    if (v === 1) {
      p.disc(rng.int(5, 10) + 0.5, rng.int(5, 10) + 0.5, 1.6, pal.steelDark, pal.steelMid); // manhole
      p.rect(rng.int(1, 8), rng.int(1, 4), 5, 1, pal.hole); // crack
    }
  }
  // Pavements and curbs along the sides that don't join another road.
  const side = pal.rubble;
  const curb = pal.concreteHi;
  if (!(links & UP)) {
    p.rect(0, 0, T, 3, side);
    p.rect(0, 3, T, 1, curb);
  }
  if (!(links & DOWN)) {
    p.rect(0, T - 3, T, 3, side);
    p.rect(0, T - 4, T, 1, curb);
  }
  if (!(links & LEFT)) {
    p.rect(0, 0, 3, T, side);
    p.rect(3, 0, 1, T, curb);
  }
  if (!(links & RIGHT)) {
    p.rect(T - 3, 0, 3, T, side);
    p.rect(T - 4, 0, 1, T, curb);
  }
}

/** A fortification wall for one set of links: a thick concrete run toward each wall it joins. */
export function drawWall(p: Painter, links: number, damaged: boolean, rng: Rng, pal: Pal): void {
  const a = 4;
  const bw = 8;
  const parts: [number, number, number, number][] = [[a, a, bw, bw]];
  if (links & UP) parts.push([a, 0, bw, a]);
  if (links & DOWN) parts.push([a, a + bw, bw, a]);
  if (links & LEFT) parts.push([0, a, a, bw]);
  if (links & RIGHT) parts.push([a + bw, a, a, bw]);
  for (const [x, y, w, h] of parts) p.rect(x + 2, y + 2, w, h, SHADOW);
  for (const [x, y, w, h] of parts) p.rect(x, y, w, h, pal.concreteDark);
  for (const [x, y, w, h] of parts) p.rect(x, y, w - (x + w === a + bw || x + w === 16 ? 1 : 0), h - (y + h === a + bw || y + h === 16 ? 1 : 0), pal.concrete);
  // The lit top of the wall, and expansion joints.
  if (links & (LEFT | RIGHT)) p.rect(links & LEFT ? 0 : a, a, (links & RIGHT ? 16 : a + bw) - (links & LEFT ? 0 : a), 2, pal.concreteHi);
  if (links & (UP | DOWN)) p.rect(a, links & UP ? 0 : a, 2, (links & DOWN ? 16 : a + bw) - (links & UP ? 0 : a), pal.concreteHi);
  if (!(links & (LEFT | RIGHT | UP | DOWN))) p.rect(a, a, bw - 1, 2, pal.concreteHi);
  if (links & (LEFT | RIGHT)) for (let x = 3; x < 16; x += 5) p.rect(x, a + 2, 1, bw - 3, pal.concreteDark);
  if (links & (UP | DOWN)) for (let y = 3; y < 16; y += 5) p.rect(a + 2, y, bw - 3, 1, pal.concreteDark);
  if (damaged) {
    p.rect(rng.int(3, 8), rng.int(3, 8), 4, 4, pal.rubbleDark);
    p.speckle(rng, 2, 2, 12, 12, 12, pal.concreteDark);
    p.rect(rng.int(4, 10), rng.int(4, 10), 2, 2, pal.hole);
  }
}

/** A footbridge over water or shallows: planks and handrails running across the river (with travel). */
export function drawFootbridge(p: Painter, overShallows: boolean, damaged: boolean, rng: Rng, pal: Pal): void {
  const T = 16;
  if (overShallows) {
    p.rect(0, 0, T, T, pal.shallow);
    p.speckle(rng, 0, 0, T, T, 12, pal.silt);
  } else {
    p.rect(0, 0, T, T, pal.water);
    p.speckle(rng, 0, 0, T, T, 14, pal.waterDeep);
    p.rect(rng.int(0, 3), rng.int(2, 6), 3, 1, pal.waterLight);
  }
  // Its shadow on the water, then the deck.
  p.rect(12, 0, 2, T, overShallows ? pal.silt : pal.waterDeep);
  p.rect(5, 0, 6, T, pal.plank);
  for (let y = 1; y < T; y += 2) p.rect(5, y, 6, 1, pal.plankDark);
  p.rect(4, 0, 1, T, pal.trunk);
  p.rect(11, 0, 1, T, pal.trunk);
  if (damaged) {
    p.rect(6, rng.int(3, 9), 4, 3, overShallows ? pal.shallow : pal.waterDeep);
    p.speckle(rng, 4, 0, 8, T, 6, pal.hole);
  }
}

// ── Overlays (22 px, centered on the tile) ───────────────────────────────────────────────────

/** A palm from above: fronds radiating from the crown. */
function palm(p: Painter, pal: Pal, cx: number, cy: number, r: number): void {
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    for (let t = 1; t < r; t += 0.7) {
      const x = cx + Math.cos(a) * t;
      const y = cy + Math.sin(a) * t + (t * t) / (r * 3);
      p.px(Math.round(x + 1.5), Math.round(y + 1.5), SHADOW);
    }
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    for (let t = 1; t < r; t += 0.7) {
      const x = cx + Math.cos(a) * t;
      const y = cy + Math.sin(a) * t + (t * t) / (r * 3);
      p.px(Math.round(x), Math.round(y), t < r * 0.5 ? pal.canopyLight : pal.canopy);
    }
  }
  p.disc(cx, cy, 1.3, pal.trunk);
}

/** A tree species' overlay (two variants each). */
export function drawTree(p: Painter, species: TreeId, v: number, rng: Rng, pal: Pal, biome: BiomeId): void {
  const c = 11;
  switch (species) {
    case 'broadleaf': {
      const spots: [number, number, number][] = [
        [c - 4, c - 4, 5],
        [c + 4, c - 3, 5],
        [c - 3, c + 4, 5],
        [c + 4, c + 4, 4.5],
        [c, c, 5.5],
      ];
      if (v === 1) spots.pop();
      for (const [x, y, r] of spots) p.disc(x + 1.5, y + 1.5, r, 'rgba(10,20,8,0.45)');
      for (const [x, y, r] of spots) {
        const jx = rng.range(-1, 1);
        const jy = rng.range(-1, 1);
        p.disc(x + jx, y + jy, r, pal.canopy, pal.canopyLight, pal.canopyShadow);
        p.px(Math.round(x + jx - r / 2), Math.round(y + jy - r / 2), pal.canopyHi);
      }
      break;
    }
    case 'conifer': {
      // Pines: dark, spiky crowns with a lit tip, each on its own shadow.
      const crowns: [number, number, number][] =
        v === 0
          ? [
              [c - 4, c - 3, 4.5],
              [c + 4, c - 2, 4],
              [c - 1, c + 4, 4.5],
              [c + 5, c + 5, 3.5],
            ]
          : [
              [c - 3, c - 4, 4],
              [c + 3, c + 1, 5],
              [c - 4, c + 4, 3.5],
            ];
      for (const [x, y, r] of crowns) p.disc(x + 2, y + 2, r + 0.5, 'rgba(8,16,8,0.5)');
      for (const [x, y, r] of crowns) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          p.px(Math.round(x + Math.cos(a) * (r + 0.6)), Math.round(y + Math.sin(a) * (r + 0.6)), pal.pineDark);
        }
        p.disc(x, y, r, pal.pine, pal.pineHi, pal.pineDark);
        p.disc(x - 0.5, y - 0.5, r * 0.45, pal.pineHi);
        p.px(Math.round(x - 1), Math.round(y - 1), pal.canopyHi);
      }
      break;
    }
    case 'birch': {
      // Light, airy crowns with pale trunks showing between them.
      const spots: [number, number, number][] =
        v === 0
          ? [
              [c - 4, c - 3, 3.5],
              [c + 3, c - 4, 3],
              [c + 4, c + 3, 3.5],
              [c - 3, c + 4, 3],
            ]
          : [
              [c - 2, c - 4, 3.5],
              [c + 4, c, 3.5],
              [c - 4, c + 3, 3.5],
            ];
      for (const [x, y] of spots) p.rect(Math.round(x + 1), Math.round(y + 2), 1, 3, pal.bark);
      for (const [x, y, r] of spots) p.disc(x + 1.5, y + 1.5, r, 'rgba(10,20,8,0.35)');
      for (const [x, y, r] of spots) {
        p.disc(x, y, r, pal.birch, pal.birchHi, pal.canopy);
        p.px(Math.round(x - 1), Math.round(y - 1), pal.birchHi);
      }
      break;
    }
    case 'palm':
      if (v === 0) palm(p, pal, c, c, 8);
      else {
        palm(p, pal, c - 3, c - 2, 6.5);
        palm(p, pal, c + 4, c + 4, 5.5);
      }
      break;
    case 'scrub': {
      const n = v === 0 ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const x = c + rng.range(-6, 6);
        const y = c + rng.range(-6, 6);
        const r = rng.range(1.6, 2.6);
        p.disc(x + 1, y + 1, r, 'rgba(10,10,6,0.35)');
        p.disc(x, y, r, pal.scrub, pal.scrubHi);
      }
      break;
    }
    case 'dead': {
      // Bare snags: twigs branching from a trunk.
      const trees: [number, number][] = v === 0 ? [[c, c]] : [
        [c - 4, c - 3],
        [c + 4, c + 4],
      ];
      for (const [x, y] of trees) {
        for (let k = 0; k < 6; k++) {
          const a = rng.range(0, Math.PI * 2);
          const len = rng.range(3, 7);
          for (let t = 0; t < len; t += 0.8) {
            const px = x + Math.cos(a) * t;
            const py = y + Math.sin(a) * t;
            p.px(Math.round(px + 1), Math.round(py + 1), 'rgba(10,10,8,0.35)');
            p.px(Math.round(px), Math.round(py), t < 3 ? pal.trunk : pal.canopyHi);
          }
        }
        p.disc(x, y, 1.4, pal.trunk);
      }
      break;
    }
  }
  if (biome === 'arctic' && species !== 'palm' && species !== 'scrub') p.speckle(rng, 3, 3, 16, 12, 10, pal.grassLight);
}

const CAR_COLORS = (pal: Pal) => [pal.carA, pal.carB, pal.carC, pal.carD];

/**
 * Parked cars on a tile (22 px overlay): one or two, side by side, nose up (`vertical`) or across;
 * `state` 0 intact, 1 dented and smoking, 2 burnt out, 3 crushed flat.
 */
export function drawCar(p: Painter, vertical: boolean, v: number, state: number, rng: Rng, pal: Pal): void {
  const cars = v === 3 && state === 0 ? 2 : 1;
  const colors = CAR_COLORS(pal);
  for (let k = 0; k < cars; k++) {
    // Local frame: length 9 along, width 5 across.
    const off = cars === 2 ? (k === 0 ? -3.5 : 3.5) : 0;
    const L = state === 3 ? 10 : 9;
    const W = state === 3 ? 6 : 5;
    const cx = 11 + (vertical ? off : 0);
    const cy = 11 + (vertical ? 0 : off);
    const x = Math.round(cx - (vertical ? W : L) / 2);
    const y = Math.round(cy - (vertical ? L : W) / 2);
    const w = vertical ? W : L;
    const h = vertical ? L : W;
    const body = state === 2 ? pal.wreck : state === 3 ? pal.wreckDark : colors[(v + k) % colors.length]!;
    if (state !== 3) p.rect(x + 1, y + 1, w, h, SHADOW);
    p.rect(x, y, w, h, body);
    if (state === 3) {
      p.speckle(rng, x, y, w, h, 10, pal.wreck);
      p.speckle(rng, x, y, w, h, 4, pal.steelHi);
      continue;
    }
    // Cabin: windscreen toward the front (up or right), a lit roof, the rear window.
    const glass = state === 2 ? pal.hole : pal.carGlass;
    if (vertical) {
      p.rect(x + 1, y + 2, w - 2, 1, glass);
      p.rect(x + 1, y + 3, w - 2, 3, state === 2 ? pal.ash : shadeOf(body, 18));
      p.rect(x + 1, y + 6, w - 2, 1, glass);
      p.rect(x, y, w, 1, state === 2 ? pal.ash : pal.carHi);
    } else {
      p.rect(x + w - 3, y + 1, 1, h - 2, glass);
      p.rect(x + 3, y + 1, w - 6, h - 2, state === 2 ? pal.ash : shadeOf(body, 18));
      p.rect(x + 2, y + 1, 1, h - 2, glass);
      p.rect(x, y, w, 1, state === 2 ? pal.ash : pal.carHi);
    }
    if (state === 1) {
      p.speckle(rng, x, y, w, h, 4, pal.hole);
      p.px(x + 1, y + 1, pal.ember);
    }
    if (state === 2) p.speckle(rng, x - 1, y - 1, w + 2, h + 2, 8, pal.ash);
  }
}

/** A hex color lightened (positive) or darkened by `amount` per channel. */
export function shadeOf(color: string, amount: number): string {
  const n = parseInt(color.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + amount));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
