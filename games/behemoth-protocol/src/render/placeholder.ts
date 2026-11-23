import Phaser from 'phaser';
import type { EnemyId } from '../content/enemies';
import { Rng } from '../sim/rng';
import { canvasTexture, type Painter } from './painter';
import { PAL } from './palette';
import { ARMOR_STAGES } from './statusFx';
import { makeMapIcons } from './mapArt';

export { CLUMP, TILE } from './tileArt';

/**
 * Procedural placeholder pixel art (SPEC §11.1), generated once at boot. Real art replaces these
 * textures later under the same keys and frame names, with no code changes. Terrain tiles are in
 * tileArt.ts.
 */

/** Behemoth part geometry (texture sizes), shared with the compositor. */
export const BH = {
  tread: { w: 64, h: 11, frames: 4 },
  /** Outboard tread pods (add-on): a little shorter and narrower than the built-in ones. */
  outerTread: { w: 58, h: 8 },
  /** Ram plow (add-on): a chevron blade over the nose; `x` is its center, forward of hull center. */
  plow: { w: 14, h: 42, x: 27 },
  /** Sponson housing (add-on), under its weapon. */
  sponson: { w: 12, h: 8 },
  /** Blowout panels (add-on): one hinged deck plate either side of the spine, over the magazine. */
  panel: { w: 7, h: 5 },
  hull: { w: 56, h: 26 },
  turret: { w: 22, h: 18 },
  /** The dorsal ring's turret (add-on): the same shape, smaller. */
  turretDorsal: { w: 18, h: 14 },
  barrel: { w: 26, h: 6 },
  /** Lateral offset of each tread's center from the hull centerline. */
  treadOffset: 14.5,
  /** Barrel root, forward of the turret pivot. */
  barrelRoot: 3,
  /** Chevron facet seams across the hull (texture x at the spine). The outer two bound the plates. */
  seams: [18, 28, 38] as const,
  /** Length of barrel left on a destroyed turret, and where its heat glow starts. */
  barrelStub: 13,
  barrelHeatFrom: 6,
};

/**
 * Trailer part geometry (texture sizes), shared with its view. The body's length runs along the
 * tow (+x forward, like the hull); the tread pods sit either side of it.
 */
export const TR = {
  body: { w: 30, h: 18 },
  tread: { w: 32, h: 5 },
  /** Lateral offset of each tread pod's center from the trailer's centerline. */
  treadOffset: 10.5,
  /** Tow bar, from the trailer's front to the hitch. */
  bar: { w: 9, h: 3 },
  /** A module in its bay, seen from above. */
  module: { w: 11, h: 12 },
};

/** Repair drone texture size (square, per frame). */
export const DRONE = { size: 9 };

export function generatePlaceholderArt(scene: Phaser.Scene): void {
  makeMapIcons(scene);
  makeBehemoth(scene);
  makeTrailer(scene);
  makeMounts(scene);
  makeStatusArt(scene);
  makeLightTank(scene);
  makeHeavyTank(scene);
  makeSiegeTank(scene);
  makeMissileLauncher(scene);
  makeInfantry(scene);
  makeWeaponsTeam(scene);
  makeSkiTroops(scene);
  makeObjectiveUnits(scene);
  makeFx(scene);
}

// ---------------------------------------------------------------------------------------------
// The Behemoth: independent component sprites (SPEC §11.2), all drawn facing +x.

/**
 * An armored tread pod sheet (`frames` frames of w×h). Drawn for the top (−y) side: the outer rows
 * show the moving links, the inner rows are a skirt plate. The bottom pod uses the same frames
 * flipped vertically.
 */
function makeTreadSheet(scene: Phaser.Scene, key: string, w: number, h: number, frames: number): void {
  const treadTex = canvasTexture(scene, key, w, h * frames, (p) => {
    for (let f = 0; f < frames; f++) {
      p.oy = f * h;
      p.rect(0, 0, w, h, PAL.outline);
      p.rect(1, 1, w - 2, h - 2, PAL.tread);
      const link = (x: number, y0: number, y1: number) => {
        const phase = (((x - f) % 4) + 4) % 4;
        if (phase === 0) p.rect(x, y0, 1, y1 - y0, PAL.treadLinkHi);
        else if (phase === 1) p.rect(x, y0, 1, y1 - y0, PAL.treadLink);
      };
      for (let x = 1; x < w - 1; x++) link(x, 1, 4);
      // Skirt plate with panel seams, lit along its outer edge.
      p.rect(5, 4, w - 10, h - 5, PAL.steel);
      p.rect(5, 4, w - 10, 1, PAL.steelHi);
      p.rect(5, h - 2, w - 10, 1, PAL.steelDark);
      for (let x = 16; x < w - 8; x += 12) {
        p.rect(x, 5, 1, h - 7, PAL.steelDark);
        p.px(x + 1, 5, PAL.steelHi);
      }
      // Links wrap visibly around the sprocket and idler at each end.
      for (let x = 1; x < 5; x++) link(x, 4, h - 1);
      for (let x = w - 5; x < w - 1; x++) link(x, 4, h - 1);
      for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const) p.clear(x, y, 1, 1);
    }
  });
  for (let f = 0; f < frames; f++) treadTex.add(f, 0, 0, f * h, w, h);
}

function makeBehemoth(scene: Phaser.Scene): void {
  const { tread, outerTread, hull, turret, barrel } = BH;
  makeTreadSheet(scene, 'bh_tread', tread.w, tread.h, tread.frames);
  makeTreadSheet(scene, 'bh_tread_outer', outerTread.w, outerTread.h, tread.frames);

  // Ram plow (add-on): a thick chevron blade over the nose, lit on its leading edge, with a
  // seam and rivets along it.
  canvasTexture(scene, 'bh_plow', BH.plow.w, BH.plow.h, (p) => {
    const { w, h } = BH.plow;
    const cy = h / 2;
    const front = (y: number) => w - 0.5 - Math.abs(y + 0.5 - cy) * 0.45;
    const inside = (x: number, y: number) => x + 0.5 <= front(y) && x + 0.5 >= front(y) - 6;
    shape(p, w, h, inside, PAL.outline, (_x, y) => (y < cy ? PAL.steelMid : PAL.steel));
    for (let y = 1; y < h - 1; y++) {
      const fx = Math.floor(front(y)) - 1;
      if (inside(fx, y)) p.px(fx, y, y < cy ? PAL.steelGlint : PAL.steelHi);
      const seam = Math.floor(front(y) - 3.5);
      if (inside(seam, y)) p.px(seam, y, y % 6 === 2 ? PAL.steelHi : PAL.steelDark);
    }
  });

  // Blowout panel (add-on): a riveted deck plate with a hinge line; blown off, an open, scorched hatch.
  canvasTexture(scene, 'bh_panel', BH.panel.w, BH.panel.h, (p) => {
    const { w, h } = BH.panel;
    p.rect(0, 0, w, h, PAL.outline);
    p.rect(1, 1, w - 2, h - 2, PAL.steelMid);
    p.rect(1, 1, w - 2, 1, PAL.steelHi);
    p.rect(1, h - 2, w - 2, 1, PAL.steelDark);
    p.px(1, 2, PAL.steelGlint);
    p.px(w - 2, 2, PAL.steelGlint);
  });
  canvasTexture(scene, 'bh_panel_open', BH.panel.w, BH.panel.h, (p) => {
    const { w, h } = BH.panel;
    p.rect(0, 0, w, h, PAL.outline);
    p.rect(1, 1, w - 2, h - 2, PAL.ash);
    p.px(2, 2, PAL.ember);
    p.px(w - 3, 2, PAL.ember);
  });

  // Sponson housing (add-on): an armored box hung off the tread pod, under its weapon.
  canvasTexture(scene, 'bh_sponson', BH.sponson.w, BH.sponson.h, (p) => {
    const { w, h } = BH.sponson;
    p.rect(0, 0, w, h, PAL.outline);
    p.rect(1, 1, w - 2, h - 2, PAL.steel);
    p.rect(1, 1, w - 2, 1, PAL.steelHi);
    p.rect(1, h - 2, w - 2, 1, PAL.steelDark);
    p.rect(w - 3, 2, 1, h - 4, PAL.steelDark);
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const) p.clear(x, y, 1, 1);
  });

  // Hull: a wedge prow and faceted chevron plating around a central spine, with a reactor core
  // at the rear and thin glowing power conduits.
  canvasTexture(scene, 'bh_hull', hull.w, hull.h, (p) => {
    const w = hull.w;
    const h = hull.h;
    const cy = h / 2;
    const halfW = (x: number) => (x < 3 ? cy - (3 - x) * 1.5 : x > 40 ? cy - (x - 40) * 0.55 : cy);
    shape(p, w, h, (x, y) => Math.abs(y + 0.5 - cy) <= halfW(x + 0.5), PAL.outline, (_x, y) => (y < cy ? PAL.steelMid : PAL.steel));
    const inside = (x: number, y: number) => Math.abs(y + 0.5 - cy) <= halfW(x + 0.5) - 1;

    // Spine ridge.
    for (let x = 14; x < w - 3; x++) {
      if (inside(x, cy - 1)) p.px(x, cy - 1, PAL.steelHi);
      if (inside(x, cy)) p.px(x, cy, PAL.steelMid);
    }
    // Chevron facet seams pointing forward; each seam is lit on its leading edge.
    for (const x0 of BH.seams) {
      for (let y = 1; y < h - 1; y++) {
        const x = Math.round(x0 - Math.abs(y + 0.5 - cy) * 0.7);
        if (!inside(x, y) || Math.abs(y + 0.5 - cy) < 1.5) continue;
        p.px(x, y, PAL.steelDark);
        if (inside(x + 1, y)) p.px(x + 1, y, PAL.steelHi);
      }
    }
    // Prow edge highlight.
    for (let x = 41; x < w - 1; x++) {
      const top = Math.ceil(cy - halfW(x + 0.5));
      if (inside(x, top + 1)) p.px(x, top + 1, PAL.steelGlint);
    }
    // Reactor core housing (the glow is a separate pulsing sprite) with heat-sink fins.
    p.disc(9, cy, 5.5, PAL.outline);
    p.disc(9, cy, 4.5, PAL.steelDark);
    for (let x = 3; x < 16; x += 2) {
      p.rect(x, 2, 1, 3, PAL.steelDark);
      p.rect(x, h - 5, 1, 3, PAL.steelDark);
    }
    // Power conduits running forward from the reactor.
    for (let x = 16; x < 44; x++) {
      if (x % 6 === 5) continue;
      p.px(x, 6, PAL.glowDim);
      p.px(x, h - 7, PAL.glowDim);
    }
    // Sensor pods on the prow shoulders (future auto-weapon mounts).
    for (const y of [5, h - 6]) {
      p.disc(46, y + 0.5, 2, PAL.outline);
      p.disc(46, y + 0.5, 1.3, PAL.steelDark);
      p.px(47, y, PAL.glow);
    }
  });

  canvasTexture(scene, 'bh_glow', 9, 9, (p) => {
    p.disc(4.5, 4.5, 4.5, PAL.glowDim);
    p.disc(4.5, 4.5, 3.2, PAL.glow);
    p.disc(4.5, 4.5, 1.6, PAL.glowHot);
  });

  // Turrets: low, angular, with a glowing sensor slit at the front. The dorsal ring's is smaller.
  const drawTurret = (key: string, w: number, h: number) =>
    canvasTexture(scene, key, w, h, (p) => {
      const cy = h / 2;
      const nose = w - 9;
      const halfW = (x: number) => (x < 4 ? cy - 4 + x : x > nose ? cy - (x - nose) * 0.75 : cy);
      shape(p, w, h, (x, y) => Math.abs(y + 0.5 - cy) <= halfW(x + 0.5), PAL.outline, (_x, y) => (y < cy - 1 ? PAL.steelHi : y < cy + 1 ? PAL.steelMid : PAL.steel));
      // Facet line across the back and a recessed hatch.
      for (let y = 3; y < h - 3; y++) p.px(6, y, PAL.steelDark);
      p.rect(8, 4, 3, 2, PAL.steelDark);
      // Sensor slit.
      p.rect(w - 5, cy - 3, 1, 2, PAL.glow);
      p.rect(w - 5, cy + 1, 1, 2, PAL.glow);
    });
  drawTurret('bh_turret', turret.w, turret.h);
  drawTurret('bh_turret_dorsal', BH.turretDorsal.w, BH.turretDorsal.h);

  // Heavy laser: a slim focusing tube with cooling fins and a glowing lens at the tip.
  canvasTexture(scene, 'bh_barrel_laser', 28, 6, (p) => {
    p.rect(0, 1, 26, 4, PAL.outline);
    p.rect(0, 2, 25, 2, PAL.steelMid);
    p.rect(0, 2, 25, 1, PAL.steelHi);
    for (const x of [5, 9, 13]) {
      p.rect(x, 0, 2, 6, PAL.outline);
      p.rect(x, 1, 1, 4, PAL.steelDark);
    }
    p.rect(24, 0, 4, 6, PAL.outline);
    p.rect(25, 1, 2, 4, PAL.steelDark);
    p.rect(26, 2, 2, 2, PAL.glow);
    p.px(27, 2, PAL.glowHot);
  });
  // Siege howitzer: a short, fat tube with a big slotted muzzle brake.
  canvasTexture(scene, 'bh_barrel_howitzer', 22, 8, (p) => {
    p.rect(0, 1, 17, 6, PAL.outline);
    p.rect(0, 2, 16, 4, PAL.steel);
    p.rect(0, 2, 16, 1, PAL.steelHi);
    p.rect(6, 1, 2, 6, PAL.steelDark);
    p.rect(16, 0, 6, 8, PAL.outline);
    p.rect(17, 1, 4, 6, PAL.steelMid);
    p.rect(18, 1, 1, 6, PAL.outline);
    p.px(20, 3, PAL.steelDark);
    p.px(20, 4, PAL.steelDark);
  });
  // Long barrel with coil rings and a slim muzzle.
  canvasTexture(scene, 'bh_barrel', barrel.w, barrel.h, (p) => {
    const w = barrel.w;
    p.rect(0, 1, w - 2, 4, PAL.outline);
    p.rect(0, 2, w - 3, 2, PAL.steelMid);
    p.rect(0, 2, w - 3, 1, PAL.steelHi);
    for (let x = 8; x < w - 6; x += 5) {
      p.rect(x, 0, 2, 6, PAL.outline);
      p.rect(x, 1, 1, 4, PAL.steelHi);
    }
    p.rect(w - 4, 0, 4, 6, PAL.outline);
    p.rect(w - 3, 1, 2, 4, PAL.steelDark);
    p.px(w - 2, 2, PAL.glowDim);
    p.px(w - 2, 3, PAL.glowDim);
  });
}

/**
 * Weapon mount sprites, keyed `wpn_<weaponId>`, drawn facing +x. `pivotX` is the mount pivot
 * (fraction of the width) the sprite rotates around.
 */
export const MOUNT_ART: Record<string, MountArt> = {
  autocannon: { w: 12, h: 6, pivotX: 2.5 / 12, stubKeep: 8, heatFrom: 6 },
  apGuns: { w: 9, h: 5, pivotX: 2 / 9, stubKeep: 5, heatFrom: 4 },
  missileRack: { w: 9, h: 16, pivotX: 0.5, stubHoles: 0.12 },
  pdLaser: { w: 6, h: 6, pivotX: 0.5 },
  rotaryGun: { w: 13, h: 7, pivotX: 2.5 / 13, stubKeep: 7, heatFrom: 7 },
  flakCannon: { w: 12, h: 7, pivotX: 2.5 / 12, stubKeep: 7, heatFrom: 7 },
  mortar: { w: 10, h: 8, pivotX: 0.4, stubHoles: 0.15 },
  bunkerBuster: { w: 11, h: 14, pivotX: 0.5, stubHoles: 0.12 },
  pdGuns: { w: 7, h: 5, pivotX: 0.4 },
  pulseLaser: { w: 8, h: 5, pivotX: 2.5 / 8 },
  beamLaser: { w: 14, h: 6, pivotX: 2.5 / 14, stubKeep: 8, heatFrom: 8 },
  plasmaThrower: { w: 13, h: 8, pivotX: 3.5 / 13, stubKeep: 8, heatFrom: 8 },
};

/** Turret texture per ring id (each has a `_stub` variant); rings not listed use the main one. */
export const TURRET_ART: Partial<Record<string, string>> = { main: 'bh_turret', dorsal: 'bh_turret_dorsal' };

/**
 * Turret barrels, keyed by the main gun on the turret (each has `_stub` and `_heat` variants).
 * The turret only takes L weapons, which are all main guns.
 */
export const TURRET_BARREL: Partial<Record<string, { key: string; w: number; h: number; stub: number; heatFrom: number }>> = {
  heavyCannon: { key: 'bh_barrel', w: BH.barrel.w, h: BH.barrel.h, stub: BH.barrelStub, heatFrom: BH.barrelHeatFrom },
  siegeHowitzer: { key: 'bh_barrel_howitzer', w: 22, h: 8, stub: 10, heatFrom: 8 },
  heavyLaser: { key: 'bh_barrel_laser', w: 28, h: 6, stub: 12, heatFrom: 12 },
};

interface MountArt {
  w: number;
  h: number;
  pivotX: number;
  /** A destroyed mount (`wpn_<id>_stub`) breaks off past this x; missing = charred whole. */
  stubKeep?: number;
  /** Share of a destroyed mount's pixels blown away. */
  stubHoles?: number;
  /** Barrel glows with heat (`wpn_<id>_heat`) from this x on; missing = doesn't glow. */
  heatFrom?: number;
}

/** Corners knocked off a w×h texture, for a rounded, chunky silhouette. */
function roundCorners(p: Painter, w: number, h: number): void {
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const) p.clear(x, y, 1, 1);
}

function makeTrailer(scene: Phaser.Scene): void {
  makeTreadSheet(scene, 'tr_tread', TR.tread.w, TR.tread.h, BH.tread.frames);

  // Body: a flat armored bed lit like the hull (upper half brighter), with a coupling at the
  // front and rib seams between the bays.
  canvasTexture(scene, 'tr_body', TR.body.w, TR.body.h, (p) => {
    const { w, h } = TR.body;
    const cy = h / 2;
    p.rect(0, 0, w, h, PAL.outline);
    p.rect(1, 1, w - 2, cy - 1, PAL.steelMid);
    p.rect(1, cy, w - 2, h - cy - 1, PAL.steel);
    p.rect(1, 1, w - 2, 1, PAL.steelHi);
    p.rect(1, h - 2, w - 2, 1, PAL.steelDark);
    // Front coupling plate and the rear bumper.
    p.rect(w - 3, 3, 2, h - 6, PAL.steelDark);
    p.rect(w - 3, 3, 1, h - 6, PAL.steelHi);
    p.rect(1, 2, 2, h - 4, PAL.steelDark);
    for (const x of [8, 15, 22]) {
      p.rect(x, 2, 1, h - 4, PAL.steelDark);
      p.px(x + 1, 2, PAL.steelHi);
    }
    roundCorners(p, w, h);
  });

  // Tow bar: an A-frame from the front of the bed to the hitch.
  canvasTexture(scene, 'tr_bar', TR.bar.w, TR.bar.h, (p) => {
    const { w, h } = TR.bar;
    p.rect(0, 0, w, h, PAL.outline);
    p.rect(0, 1, w - 1, 1, PAL.steelHi);
    p.rect(w - 2, 0, 2, h, PAL.steelDark);
  });

  const { w: mw, h: mh } = TR.module;
  const housing = (p: Painter) => {
    p.rect(0, 0, mw, mh, PAL.outline);
    p.rect(1, 1, mw - 2, mh - 2, PAL.steel);
    p.rect(1, 1, mw - 2, 1, PAL.steelHi);
    p.rect(1, mh - 2, mw - 2, 1, PAL.steelDark);
  };
  // An empty bay: a dark recess with deck plating.
  canvasTexture(scene, 'tr_empty', mw, mh, (p) => {
    p.rect(0, 0, mw, mh, PAL.outline);
    p.rect(1, 1, mw - 2, mh - 2, PAL.steelDark);
    for (let y = 2; y < mh - 2; y += 3) p.rect(2, y, mw - 4, 1, PAL.outline);
  });
  // Missile pod: a box of tubes, warheads facing forward.
  canvasTexture(scene, 'tr_missilePod', mw, mh, (p) => {
    housing(p);
    for (let y = 2; y < mh - 2; y += 3) {
      p.rect(2, y, mw - 4, 2, PAL.steelDark);
      p.px(mw - 3, y, PAL.amber);
      p.px(mw - 3, y + 1, PAL.ember);
    }
    roundCorners(p, mw, mh);
  });
  // Ammo bunker: a squat armored crate with hazard striping and a loading hatch.
  canvasTexture(scene, 'tr_ammoBunker', mw, mh, (p) => {
    housing(p);
    for (let x = 1; x < mw - 1; x++) {
      const c = (x + 0) % 4 < 2 ? PAL.amber : PAL.steelDark;
      p.px(x, 2, c);
      p.px(x, mh - 3, c);
    }
    p.rect(3, 4, mw - 6, mh - 8, PAL.steelMid);
    p.rect(3, 4, mw - 6, 1, PAL.steelHi);
    p.rect(Math.floor(mw / 2), 4, 1, mh - 8, PAL.steelDark);
    roundCorners(p, mw, mh);
  });
  // Auxiliary generator: a glowing core between cooling fins.
  canvasTexture(scene, 'tr_auxGenerator', mw, mh, (p) => {
    housing(p);
    for (let x = 2; x < mw - 2; x += 2) {
      p.rect(x, 2, 1, 2, PAL.steelDark);
      p.rect(x, mh - 4, 1, 2, PAL.steelDark);
    }
    p.disc(mw / 2, mh / 2, 2.6, PAL.glowDim);
    p.disc(mw / 2, mh / 2, 1.4, PAL.glow);
    roundCorners(p, mw, mh);
  });
  // Drone bay: a launch deck with landing marks under a hatch, a drone parked on each pad.
  canvasTexture(scene, 'tr_droneBay', mw, mh, (p) => {
    housing(p);
    p.rect(2, 2, mw - 4, mh - 4, PAL.steelDark);
    for (const cy of [3, mh - 6]) {
      p.rect(3, cy + 1, mw - 6, 1, PAL.steelMid);
      p.rect(Math.floor(mw / 2) - 1, cy, 3, 3, PAL.steel);
      p.px(Math.floor(mw / 2), cy + 1, PAL.glow);
    }
    roundCorners(p, mw, mh);
  });
  // A repair drone (2 frames: rotors spinning), and its shadow on whatever is below it.
  const ds = DRONE.size;
  const drone = canvasTexture(scene, 'drone', ds * 2, ds, (p) => {
    const c = (ds - 1) / 2;
    const diag = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
    for (let f = 0; f < 2; f++) {
      p.ox = f * ds;
      // Pixels first, then a dark outline round them, so it reads over the hull as well as the ground.
      const px = new Map<string, string>();
      const put = (x: number, y: number, col: string) => px.set(`${x},${y}`, col);
      for (let i = 1; i < c - 1; i++) for (const [sx, sy] of diag) put(c + sx * i, c + sy * i, PAL.steelMid);
      // Rotor blurs at the tips, swept one way then the other.
      for (const [sx, sy] of diag) {
        const rx = c + sx * (c - 1);
        const ry = c + sy * (c - 1);
        const sweep = f === 0 ? [[-1, 0], [0, 0], [1, 0]] : [[0, -1], [0, 0], [0, 1]];
        for (const [dx, dy] of sweep) put(rx + dx!, ry + dy!, dx === 0 && dy === 0 ? PAL.steelHi : PAL.glowDim);
      }
      for (let y = c - 1; y <= c + 1; y++) for (let x = c - 1; x <= c + 1; x++) put(x, y, PAL.steelHi);
      put(c, c, PAL.glow);
      for (const key of px.keys()) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = `${x + dx},${y + dy}`;
          if (!px.has(n) && x + dx >= 0 && y + dy >= 0 && x + dx < ds && y + dy < ds) p.px(x + dx, y + dy, PAL.outline);
        }
      }
      for (const [key, col] of px) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        p.px(x, y, col);
      }
    }
  });
  for (let f = 0; f < 2; f++) drone.add(f, 0, f * ds, 0, ds, ds);
  canvasTexture(scene, 'drone_shadow', 5, 5, (p) => p.disc(2.5, 2.5, 2.2, PAL.outline));
  // A jettisoned trailer's warning light.
  canvasTexture(scene, 'tr_light', 2, 2, (p) => p.rect(0, 0, 2, 2, PAL.bad));
}

function makeMounts(scene: Phaser.Scene): void {
  // Autocannon: a squat armored mount with one thick barrel.
  canvasTexture(scene, 'wpn_autocannon', 12, 6, (p) => {
    p.rect(5, 1, 7, 4, PAL.outline);
    p.rect(5, 2, 6, 2, PAL.steelMid);
    p.rect(5, 2, 6, 1, PAL.steelHi);
    p.rect(0, 0, 6, 6, PAL.outline);
    p.rect(1, 1, 4, 4, PAL.steel);
    p.rect(1, 1, 4, 1, PAL.steelHi);
    p.px(4, 3, PAL.glow);
  });
  // AP guns: a small ball mount with twin thin barrels.
  canvasTexture(scene, 'wpn_apGuns', 9, 5, (p) => {
    p.rect(3, 0, 6, 2, PAL.outline);
    p.rect(3, 3, 6, 2, PAL.outline);
    p.rect(3, 0, 5, 1, PAL.steelHi);
    p.rect(3, 4, 5, 1, PAL.steelMid);
    p.rect(0, 0, 4, 5, PAL.outline);
    p.rect(1, 1, 2, 3, PAL.steelMid);
    p.px(1, 1, PAL.steelHi);
  });
  // Missile rack: two armored pods of tubes either side of the spine, warheads showing.
  canvasTexture(scene, 'wpn_missileRack', 9, 16, (p) => {
    for (const y0 of [0, 10]) {
      p.rect(0, y0, 9, 6, PAL.outline);
      p.rect(1, y0 + 1, 7, 4, PAL.steelDark);
      for (const y of [y0 + 1, y0 + 3]) {
        p.rect(1, y, 6, 2, PAL.steel);
        p.rect(6, y, 2, 2, PAL.amber);
        p.px(7, y, PAL.amberHot);
      }
    }
    p.rect(3, 6, 3, 4, PAL.steelDark);
  });
  // Rotary gun: a boxy mount with a cluster of three barrels and a band clamp.
  canvasTexture(scene, 'wpn_rotaryGun', 13, 7, (p) => {
    p.rect(5, 1, 8, 5, PAL.outline);
    for (const y of [2, 3, 4]) p.rect(5, y, 7, 1, y === 3 ? PAL.steelMid : PAL.steelHi);
    p.rect(9, 1, 1, 5, PAL.steelDark);
    p.rect(0, 0, 6, 7, PAL.outline);
    p.rect(1, 1, 4, 5, PAL.steel);
    p.rect(1, 1, 4, 1, PAL.steelHi);
    p.px(3, 3, PAL.glow);
  });
  // Flak cannon: twin short barrels with flash cones on a round mount.
  canvasTexture(scene, 'wpn_flakCannon', 12, 7, (p) => {
    for (const y of [0, 4]) {
      p.rect(4, y, 8, 3, PAL.outline);
      p.rect(4, y + 1, 7, 1, PAL.steelHi);
      p.rect(10, y, 2, 3, PAL.steelMid);
    }
    p.disc(3, 3.5, 3.2, PAL.outline);
    p.disc(3, 3.5, 2.3, PAL.steel);
    p.px(2, 2, PAL.steelHi);
  });
  // Mortar: a fat, short tube on a ring base, seen from above.
  canvasTexture(scene, 'wpn_mortar', 10, 8, (p) => {
    p.disc(4, 4, 3.8, PAL.outline);
    p.disc(4, 4, 2.9, PAL.steelDark);
    p.rect(4, 2, 6, 4, PAL.outline);
    p.rect(4, 3, 5, 2, PAL.steelMid);
    p.rect(8, 2, 2, 4, PAL.steelHi);
    p.px(9, 3, PAL.outline);
    p.px(9, 4, PAL.outline);
  });
  // Bunker-buster rack: two heavy single tubes either side of the mount, big warheads.
  canvasTexture(scene, 'wpn_bunkerBuster', 11, 14, (p) => {
    for (const y0 of [0, 9]) {
      p.rect(0, y0, 11, 5, PAL.outline);
      p.rect(1, y0 + 1, 7, 3, PAL.steel);
      p.rect(1, y0 + 1, 7, 1, PAL.steelHi);
      p.rect(8, y0 + 1, 2, 3, PAL.amber);
      p.px(9, y0 + 2, PAL.amberHot);
    }
    p.rect(3, 5, 5, 4, PAL.steelDark);
  });
  // Point-defense guns: a tiny twin gatling on a ball.
  canvasTexture(scene, 'wpn_pdGuns', 7, 5, (p) => {
    p.rect(3, 0, 4, 2, PAL.outline);
    p.rect(3, 3, 4, 2, PAL.outline);
    p.rect(3, 0, 3, 1, PAL.steelHi);
    p.rect(3, 4, 3, 1, PAL.steelMid);
    p.disc(2, 2.5, 2.4, PAL.outline);
    p.disc(2, 2.5, 1.5, PAL.steelMid);
  });
  // Pulse laser: a small ball turret with a short emitter and a glowing lens.
  canvasTexture(scene, 'wpn_pulseLaser', 8, 5, (p) => {
    p.rect(4, 1, 4, 3, PAL.outline);
    p.rect(4, 2, 3, 1, PAL.steelHi);
    p.px(7, 2, PAL.glow);
    p.disc(2.5, 2.5, 2.5, PAL.outline);
    p.disc(2.5, 2.5, 1.6, PAL.steelMid);
    p.px(2, 1, PAL.steelHi);
  });
  // Beam laser: an armored housing with a long, thin emitter and a lens at the tip.
  canvasTexture(scene, 'wpn_beamLaser', 14, 6, (p) => {
    p.rect(5, 2, 9, 2, PAL.outline);
    p.rect(5, 2, 8, 1, PAL.steelHi);
    p.rect(8, 1, 2, 4, PAL.outline);
    p.rect(12, 1, 2, 4, PAL.outline);
    p.px(13, 2, PAL.glow);
    p.px(13, 3, PAL.glowDim);
    p.rect(0, 0, 6, 6, PAL.outline);
    p.rect(1, 1, 4, 4, PAL.steel);
    p.rect(1, 1, 4, 1, PAL.steelHi);
    p.px(3, 3, PAL.glow);
  });
  // Plasma thrower: a bulbous containment chamber glowing violet, with a flared nozzle.
  canvasTexture(scene, 'wpn_plasmaThrower', 13, 8, (p) => {
    p.rect(7, 2, 4, 4, PAL.outline);
    p.rect(7, 3, 4, 2, PAL.steelMid);
    p.rect(10, 1, 3, 6, PAL.outline);
    p.rect(11, 2, 1, 4, PAL.plasmaDim);
    p.disc(4, 4, 4, PAL.outline);
    p.disc(4, 4, 3, PAL.steel);
    p.disc(4, 4, 1.8, PAL.plasma);
    p.px(4, 4, PAL.plasmaHot);
    p.px(2, 2, PAL.steelHi);
  });
  // Point-defense laser: a small dome with a glowing emitter.
  canvasTexture(scene, 'wpn_pdLaser', 6, 6, (p) => {
    p.disc(3, 3, 3, PAL.outline);
    p.disc(3, 3, 2.2, PAL.steelMid);
    p.px(2, 2, PAL.steelHi);
    p.rect(4, 2, 2, 2, PAL.glow);
    p.px(5, 2, PAL.glowHot);
  });
}

// ---------------------------------------------------------------------------------------------
// Status art (SPEC §11.3), derived from the Behemoth's part textures: charred stubs for destroyed
// weapons, heat masks for barrels, the front and rear armor plates, and their wear stages.

type Rgba = readonly [r: number, g: number, b: number, a: number];

function pixelsOf(scene: Phaser.Scene, key: string): ImageData {
  const tex = scene.textures.get(key);
  if (!(tex instanceof Phaser.Textures.CanvasTexture)) throw new Error(`${key} is not a canvas texture`);
  return tex.getContext().getImageData(0, 0, tex.width, tex.height);
}

/** A new texture made pixel by pixel from `src`'s opaque pixels; `map` returns null to drop one. */
function derive(scene: Phaser.Scene, src: string, dst: string, map: (x: number, y: number, c: Rgba) => string | null): void {
  const img = pixelsOf(scene, src);
  const d = img.data;
  canvasTexture(scene, dst, img.width, img.height, (p) => {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (d[i + 3] === 0) continue;
        const out = map(x, y, [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!]);
        if (out) p.px(x, y, out);
      }
    }
  });
}

const css = (c: Rgba) => `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;

/** Burnt metal, darkest to lightest. */
const CHAR = ['#0c0a09', '#1d1916', '#2b2521', '#3d342e'] as const;

function charred(c: Rgba): string {
  const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return CHAR[lum < 30 ? 0 : lum < 75 ? 1 : lum < 130 ? 2 : 3];
}

/**
 * `<src>_stub`: a burnt-out part, charred and broken off past `keep` (jagged, with embers at the
 * break), with a share of its pixels blown away.
 */
function makeStub(scene: Phaser.Scene, src: string, seed: number, keep = Infinity, holes = 0): void {
  const rng = new Rng(seed);
  derive(scene, src, `${src}_stub`, (x, _y, c) => {
    if (x >= keep) return null;
    const atBreak = x >= keep - 2;
    if ((atBreak && rng.chance(0.45)) || rng.chance(holes)) return null;
    if (atBreak && rng.chance(0.3)) return PAL.ember;
    return charred(c);
  });
}

/** `<src>_heat`: a white silhouette of the barrel from `fromX` on, brightest at the muzzle. */
function makeHeatMask(scene: Phaser.Scene, src: string, w: number, fromX: number): void {
  derive(scene, src, `${src}_heat`, (x) => {
    if (x < fromX) return null;
    const t = (x - fromX) / Math.max(1, w - 1 - fromX);
    return `rgba(255,255,255,${(0.35 + 0.65 * t).toFixed(2)})`;
  });
}

interface Mark {
  x: number;
  y: number;
  scorch: boolean;
  /** Which neighbors a scorch mark spreads to. */
  spread: number;
}

/**
 * `key`: a sheet of `ARMOR_STAGES` frames for a w×h part, each adding dents and scorch marks
 * inside `region` (frame 0 = lightly worn).
 */
function makeWear(scene: Phaser.Scene, key: string, w: number, h: number, region: (x: number, y: number) => boolean, perStage: number, seed: number): void {
  const rng = new Rng(seed);
  const cells: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (region(x, y)) cells.push([x, y]);
  const marks: Mark[] = Array.from({ length: perStage * ARMOR_STAGES }, () => {
    const [x, y] = rng.pick(cells);
    return { x, y, scorch: rng.chance(0.55), spread: rng.int(0, 15) };
  });
  const dot = (p: Painter, x: number, y: number, c: string) => {
    if (region(x, y)) p.px(x, y, c);
  };
  const tex = canvasTexture(scene, key, w, h * ARMOR_STAGES, (p) => {
    for (let f = 0; f < ARMOR_STAGES; f++) {
      p.oy = f * h;
      for (const m of marks.slice(0, (f + 1) * perStage)) {
        if (m.scorch) {
          // A blotch of soot: a dark core with a ragged lighter rim.
          dot(p, m.x, m.y, CHAR[1]);
          ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).forEach(([dx, dy], i) => {
            if (m.spread & (1 << i)) dot(p, m.x + dx, m.y + dy, CHAR[2]);
          });
        } else {
          // A dent: a dark pit with a lit lower rim.
          dot(p, m.x, m.y, PAL.outline);
          dot(p, m.x + 1, m.y + 1, PAL.steelHi);
        }
      }
    }
  });
  for (let f = 0; f < ARMOR_STAGES; f++) tex.add(f, 0, 0, f * h, w, h);
}

function makeStatusArt(scene: Phaser.Scene): void {
  // Destroyed weapons: charred stubs. Barrels glow with heat.
  makeStub(scene, 'bh_turret', 11);
  makeStub(scene, 'bh_turret_dorsal', 19);
  makeStub(scene, 'bh_plow', 50, Infinity, 0.2);
  // Trailer: wrecked modules, and the burnt-out bed left where it blew (a decal).
  makeStub(scene, 'tr_missilePod', 51, Infinity, 0.15);
  makeStub(scene, 'tr_ammoBunker', 52, Infinity, 0.25);
  makeStub(scene, 'tr_auxGenerator', 53, Infinity, 0.15);
  makeStub(scene, 'tr_droneBay', 55, Infinity, 0.15);
  makeStub(scene, 'tr_body', 54, Infinity, 0.3);
  Object.values(TURRET_BARREL).forEach((barrel, i) => {
    makeStub(scene, barrel!.key, 12 + i, barrel!.stub);
    makeHeatMask(scene, barrel!.key, barrel!.w, barrel!.heatFrom);
  });
  Object.entries(MOUNT_ART).forEach(([id, art], i) => {
    makeStub(scene, `wpn_${id}`, 20 + i, art.stubKeep, art.stubHoles);
    if (art.heatFrom !== undefined) makeHeatMask(scene, `wpn_${id}`, art.w, art.heatFrom);
  });

  // Front and rear armor plates: the hull ahead of its front seam and behind its rear seam, as
  // separate sprites so a hit on that arc can shake and flash just that plate. The front is split
  // at the centerline (texture rows above the middle are the left half).
  const { w, h } = BH.hull;
  const cy = h / 2;
  const seam = (x0: number, y: number) => Math.round(x0 - Math.abs(y + 0.5 - cy) * 0.7);
  const front = (x: number, y: number) => x > seam(BH.seams[2], y);
  const rear = (x: number, y: number) => x < seam(BH.seams[0], y);
  const leftHalf = (y: number) => y + 0.5 < cy;
  derive(scene, 'bh_hull', 'bh_plate_frontLeft', (x, y, c) => (front(x, y) && leftHalf(y) ? css(c) : null));
  derive(scene, 'bh_hull', 'bh_plate_frontRight', (x, y, c) => (front(x, y) && !leftHalf(y) ? css(c) : null));
  derive(scene, 'bh_hull', 'bh_plate_rear', (x, y, c) => (rear(x, y) ? css(c) : null));

  // Wear builds up on each plate's face (inside its outline), and on the tread skirts for the flanks.
  const hull = pixelsOf(scene, 'bh_hull');
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && hull.data[(y * w + x) * 4 + 3]! > 0;
  const face = (x: number, y: number) => opaque(x, y) && opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1);
  const frontFace = (x: number, y: number) => face(x, y) && x > seam(BH.seams[2], y) + 1;
  makeWear(scene, 'bh_wear_frontLeft', w, h, (x, y) => frontFace(x, y) && leftHalf(y), 3, 31);
  makeWear(scene, 'bh_wear_frontRight', w, h, (x, y) => frontFace(x, y) && !leftHalf(y), 3, 34);
  makeWear(scene, 'bh_wear_rear', w, h, (x, y) => face(x, y) && x < seam(BH.seams[0], y) - 1, 3, 32);
  // The skirt rows that show outside the hull (drawn for the left pod; the right one is flipped).
  const { tread } = BH;
  makeWear(scene, 'bh_wear_side', tread.w, tread.h, (x, y) => x >= 6 && x < tread.w - 6 && y >= 4 && y <= 6, 4, 33);
}

/**
 * Fill every pixel where `inside(x, y)` holds; pixels on the shape's edge get `outline`, the rest
 * get `fill(x, y)`.
 */
function shape(
  p: Painter,
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  outline: string,
  fill: (x: number, y: number) => string,
): void {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      p.px(x, y, edge ? outline : fill(x, y));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Light tank

/** Light tank geometry (texture sizes), shared with the unit views. */
export const LT = {
  body: { w: 16, h: 11 },
  turret: { w: 13, h: 6 },
  /** Turret pivot within the turret texture. */
  pivotX: 3.5,
};

function makeLightTank(scene: Phaser.Scene): void {
  const { w, h } = LT.body;
  const body = (p: Painter, dead: boolean) => {
    const main = dead ? PAL.ash : PAL.enemy;
    const hi = dead ? PAL.ashLight : PAL.enemyHi;
    const dark = dead ? PAL.hole : PAL.enemyDark;
    const tread = dead ? PAL.hole : PAL.enemyTread;
    // Tracks along both sides.
    p.rect(0, 0, w, 3, PAL.outline);
    p.rect(0, h - 3, w, 3, PAL.outline);
    p.rect(1, 1, w - 2, 1, tread);
    p.rect(1, h - 2, w - 2, 1, tread);
    for (let x = 1; x < w - 1; x += 2) {
      p.px(x, 1, dead ? PAL.ash : PAL.treadLink);
      p.px(x, h - 2, dead ? PAL.ash : PAL.treadLink);
    }
    // Hull with a sloped front plate.
    p.rect(1, 3, w - 2, h - 6, PAL.outline);
    p.rect(2, 3, w - 5, h - 6, main);
    p.rect(2, 3, w - 5, 1, hi);
    p.rect(2, h - 4, w - 5, 1, dark);
    p.rect(w - 3, 4, 2, h - 8, hi);
    p.rect(2, 4, 2, h - 8, dark); // engine deck
    if (dead) {
      p.px(6, 4, PAL.ember);
      p.px(10, 6, PAL.ember);
    }
  };
  canvasTexture(scene, 'lt_body', w, h, (p) => body(p, false));
  canvasTexture(scene, 'lt_wreck', w, h, (p) => body(p, true));
  canvasTexture(scene, 'lt_turret', LT.turret.w, LT.turret.h, (p) => {
    const tw = LT.turret.w;
    p.rect(6, 2, tw - 6, 2, PAL.outline);
    p.rect(6, 2, tw - 8, 1, PAL.enemyDark);
    p.rect(tw - 2, 1, 2, 4, PAL.outline); // muzzle
    p.disc(LT.pivotX, 3, 3.2, PAL.outline);
    p.disc(LT.pivotX, 3, 2.4, PAL.enemy, PAL.enemyHi, PAL.enemyDark);
  });
}

// ---------------------------------------------------------------------------------------------
// Siege tank (mini-boss): a superheavy hull on doubled tracks, a huge main turret on the center,
// and a small twin-gun turret on the rear deck.

export const SIEGE = {
  body: { w: 32, h: 24 },
  turret: { w: 32, h: 13 },
  pivotX: 10,
  aux: { w: 12, h: 7, pivotX: 4 },
};

function makeSiegeTank(scene: Phaser.Scene): void {
  const { w, h } = SIEGE.body;
  const body = (p: Painter, dead: boolean) => {
    const main = dead ? PAL.ash : PAL.enemy;
    const hi = dead ? PAL.ashLight : PAL.enemyHi;
    const dark = dead ? PAL.hole : PAL.enemyDark;
    const tread = dead ? PAL.hole : PAL.enemyTread;
    // Doubled tracks: two runs a side.
    for (const y0 of [0, h - 6]) {
      p.rect(0, y0, w, 6, PAL.outline);
      p.rect(1, y0 + 1, w - 2, 4, tread);
      for (let x = 1; x < w - 1; x += 2) {
        p.px(x, y0 + 1, dead ? PAL.ash : PAL.treadLink);
        p.px(x, y0 + 4, dead ? PAL.ash : PAL.treadLink);
      }
      p.rect(1, y0 + 3, w - 2, 1, PAL.outline);
    }
    // The hull: slab sides, a thick glacis toward the front (+x), the engine deck at the back.
    p.rect(1, 5, w - 2, h - 10, PAL.outline);
    p.rect(2, 6, w - 4, h - 12, main);
    p.rect(2, 6, w - 4, 1, hi);
    p.rect(2, h - 7, w - 4, 1, dark);
    p.rect(w - 6, 6, 4, h - 12, hi);
    p.rect(w - 6, 6, 1, h - 12, PAL.outline);
    p.rect(2, 7, 7, h - 14, dark); // engine deck
    for (let y = 8; y < h - 8; y += 2) p.rect(3, y, 5, 1, PAL.outline); // grilles
    if (dead) {
      for (const [x, y] of [[8, 9], [15, 13], [22, 10], [12, 15]] as const) p.px(x, y, PAL.ember);
    }
  };
  canvasTexture(scene, 'siege_body', w, h, (p) => body(p, false));
  canvasTexture(scene, 'siege_wreck', w, h, (p) => body(p, true));
  canvasTexture(scene, 'siege_turret', SIEGE.turret.w, SIEGE.turret.h, (p) => {
    const tw = SIEGE.turret.w;
    const th = SIEGE.turret.h;
    // A huge, thick barrel with a fume extractor and a muzzle brake.
    p.rect(15, 4, tw - 17, 5, PAL.outline);
    p.rect(15, 5, tw - 18, 3, PAL.enemy);
    p.rect(15, 5, tw - 18, 1, PAL.enemyHi);
    p.rect(21, 3, 4, 7, PAL.outline);
    p.rect(22, 4, 2, 5, PAL.enemyDark);
    p.rect(tw - 4, 2, 4, 9, PAL.outline);
    p.rect(tw - 3, 3, 2, 7, PAL.enemyDark);
    // Wide cast turret.
    p.rect(1, 0, 16, th, PAL.outline);
    p.rect(2, 1, 14, th - 2, PAL.enemy);
    p.rect(2, 1, 14, 1, PAL.enemyHi);
    p.rect(2, th - 2, 14, 1, PAL.enemyDark);
    p.rect(13, 1, 3, th - 2, PAL.enemyHi); // the mantlet
    p.disc(SIEGE.pivotX - 4, 4, 1.6, PAL.enemyDark); // hatches
    p.disc(SIEGE.pivotX - 4, th - 4, 1.6, PAL.enemyDark);
  });
  canvasTexture(scene, 'siege_aux', SIEGE.aux.w, SIEGE.aux.h, (p) => {
    const tw = SIEGE.aux.w;
    // Twin autocannon barrels on a small round turret.
    p.rect(5, 1, tw - 5, 2, PAL.outline);
    p.rect(5, 4, tw - 5, 2, PAL.outline);
    p.disc(SIEGE.aux.pivotX, 3.5, 3.4, PAL.outline);
    p.disc(SIEGE.aux.pivotX, 3.5, 2.6, PAL.enemy, PAL.enemyHi, PAL.enemyDark);
  });
}

// ---------------------------------------------------------------------------------------------
// Heavy tank: wide tracks, side skirts, big turret with a long gun

export const HT = {
  body: { w: 20, h: 14 },
  turret: { w: 20, h: 9 },
  pivotX: 6.5,
};

function makeHeavyTank(scene: Phaser.Scene): void {
  const { w, h } = HT.body;
  const body = (p: Painter, dead: boolean) => {
    const main = dead ? PAL.ash : PAL.enemy;
    const hi = dead ? PAL.ashLight : PAL.enemyHi;
    const dark = dead ? PAL.hole : PAL.enemyDark;
    const tread = dead ? PAL.hole : PAL.enemyTread;
    // Wide tracks.
    p.rect(0, 0, w, 4, PAL.outline);
    p.rect(0, h - 4, w, 4, PAL.outline);
    p.rect(1, 1, w - 2, 2, tread);
    p.rect(1, h - 3, w - 2, 2, tread);
    for (let x = 1; x < w - 1; x += 2) {
      p.px(x, 1, dead ? PAL.ash : PAL.treadLink);
      p.px(x, h - 2, dead ? PAL.ash : PAL.treadLink);
    }
    // Side skirts over the tracks.
    p.rect(3, 3, w - 6, 1, dark);
    p.rect(3, h - 4, w - 6, 1, dark);
    // Hull: long and slab-sided, thick sloped front plate.
    p.rect(1, 4, w - 2, h - 8, PAL.outline);
    p.rect(2, 4, w - 5, h - 8, main);
    p.rect(2, 4, w - 5, 1, hi);
    p.rect(2, h - 5, w - 5, 1, dark);
    p.rect(w - 4, 5, 3, h - 10, hi);
    p.rect(2, 5, 3, h - 10, dark); // engine deck
    p.px(3, 6, PAL.outline);
    p.px(3, 7, PAL.outline);
    if (dead) {
      p.px(8, 5, PAL.ember);
      p.px(13, 8, PAL.ember);
      p.px(5, 7, PAL.ember);
    }
  };
  canvasTexture(scene, 'ht_body', w, h, (p) => body(p, false));
  canvasTexture(scene, 'ht_wreck', w, h, (p) => body(p, true));
  canvasTexture(scene, 'ht_turret', HT.turret.w, HT.turret.h, (p) => {
    const tw = HT.turret.w;
    const cy = 4.5;
    // Long, thick barrel with a muzzle brake.
    p.rect(10, 3, tw - 12, 3, PAL.outline);
    p.rect(10, 4, tw - 13, 1, PAL.enemyDark);
    p.rect(tw - 3, 2, 3, 5, PAL.outline);
    p.px(tw - 2, 4, PAL.enemyDark);
    // Boxy cast turret.
    p.rect(1, 1, 10, 7, PAL.outline);
    p.rect(2, 2, 8, 5, PAL.enemy);
    p.rect(2, 2, 8, 1, PAL.enemyHi);
    p.rect(2, 6, 8, 1, PAL.enemyDark);
    p.disc(HT.pivotX - 2, cy, 1.4, PAL.enemyDark); // hatch
  });
}

// ---------------------------------------------------------------------------------------------
// Missile launcher: wheeled truck with a traversing launcher box

export const ML = {
  body: { w: 18, h: 10 },
  turret: { w: 11, h: 8 },
  pivotX: 4,
};

function makeMissileLauncher(scene: Phaser.Scene): void {
  const { w, h } = ML.body;
  const body = (p: Painter, dead: boolean) => {
    const main = dead ? PAL.ash : PAL.enemy;
    const hi = dead ? PAL.ashLight : PAL.enemyHi;
    const dark = dead ? PAL.hole : PAL.enemyDark;
    // Three wheels a side.
    for (const x of [2, 7, 13]) {
      p.rect(x, 0, 3, 2, PAL.outline);
      p.rect(x, h - 2, 3, 2, PAL.outline);
    }
    // Flatbed chassis.
    p.rect(0, 1, w - 4, h - 2, PAL.outline);
    p.rect(1, 2, w - 6, h - 4, dark);
    p.rect(1, 2, w - 6, 1, main);
    // Cab at the front.
    p.rect(w - 5, 1, 5, h - 2, PAL.outline);
    p.rect(w - 4, 2, 3, h - 4, main);
    p.rect(w - 4, 2, 3, 1, hi);
    p.rect(w - 2, 3, 1, h - 6, dead ? PAL.hole : PAL.steelGlint); // windscreen
    if (dead) {
      p.px(5, 4, PAL.ember);
      p.px(10, 5, PAL.ember);
    }
  };
  canvasTexture(scene, 'ml_body', w, h, (p) => body(p, false));
  canvasTexture(scene, 'ml_wreck', w, h, (p) => body(p, true));
  canvasTexture(scene, 'ml_turret', ML.turret.w, ML.turret.h, (p) => {
    const tw = ML.turret.w;
    const th = ML.turret.h;
    // A box of four tubes, open end forward.
    p.rect(0, 0, tw, th, PAL.outline);
    p.rect(1, 1, tw - 2, th - 2, PAL.enemy);
    p.rect(1, 1, tw - 2, 1, PAL.enemyHi);
    p.rect(1, th - 2, tw - 2, 1, PAL.enemyDark);
    for (const y of [1, 4]) {
      p.rect(tw - 3, y, 2, 2, PAL.hole);
      p.px(tw - 3, y, PAL.amberHot);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Infantry: a loose squad of soldiers; frames for 1–4 still standing

/** Soldier positions (top-left of each 4×4 figure) in the squad texture, facing +x, in the order they fall. */
const SQUAD = [
  [1, 9],
  [8, 1],
  [1, 2],
  [8, 9],
] as const;
export const INFANTRY = { size: 14, soldiers: SQUAD.length };

function makeInfantry(scene: Phaser.Scene): void {
  const n = INFANTRY.size;
  for (let count = 1; count <= SQUAD.length; count++) {
    canvasTexture(scene, `inf_${count}`, n, n, (p) => {
      for (const [x, y] of SQUAD.slice(SQUAD.length - count)) {
        // Rust-red soldier with a lit helmet, outlined so it reads against grass and canopy.
        p.rect(x, y, 4, 4, PAL.outline);
        p.rect(x + 1, y + 1, 2, 2, PAL.enemy);
        p.px(x + 1, y + 1, PAL.enemyHi);
        // Rocket tube over the shoulder, pointing forward.
        p.rect(x + 3, y, 2, 1, PAL.outline);
      }
    });
  }
}

/**
 * Ski troops (SPEC §7.4): three skiers in snow smocks, rust-red helmets and packs so they still read
 * as the enemy on the snow, each on a pair of long skis pointing along the course (+x), a rocket
 * tube over the shoulder. Frames for 1–3 still standing.
 */
const SKIERS = [
  [1, 1],
  [7, 5],
  [1, 9],
] as const;
export const SKI_TROOPS = { w: 15, h: 14, soldiers: SKIERS.length };

function makeSkiTroops(scene: Phaser.Scene): void {
  for (let count = 1; count <= SKIERS.length; count++) {
    canvasTexture(scene, `ski_${count}`, SKI_TROOPS.w, SKI_TROOPS.h, (p) => {
      for (const [x, y] of SKIERS.slice(SKIERS.length - count)) {
        // Skis: two long dark runners either side of the skier, tips past the body.
        p.rect(x, y, 7, 1, PAL.outline);
        p.rect(x, y + 3, 7, 1, PAL.outline);
        p.px(x + 6, y, PAL.steelMid);
        p.px(x + 6, y + 3, PAL.steelMid);
        // The skier: a pale smock with a dark outline, a red helmet, a red pack behind.
        p.rect(x + 1, y + 1, 4, 2, PAL.outline);
        p.rect(x + 2, y + 1, 2, 2, PAL.snow);
        p.px(x + 3, y + 1, PAL.enemy);
        p.px(x + 1, y + 2, PAL.enemyDark);
        // Rocket tube over the shoulder, pointing forward.
        p.px(x + 5, y + 1, PAL.outline);
      }
    });
  }
}

/**
 * Heavy weapons team (SPEC §7): a gunner and a loader behind a guided missile launcher on a tripod.
 * The long tube with its lit seeker lens, the sight box, and the splayed legs set it apart from a
 * rifle squad at a glance. Frames for 1–2 still standing (the gunner is the last to fall).
 */
const TEAM = [
  [1, 9],
  [1, 2],
] as const;
export const WEAPONS_TEAM = { w: 18, h: 14, soldiers: TEAM.length };

function makeWeaponsTeam(scene: Phaser.Scene): void {
  for (let count = 1; count <= TEAM.length; count++) {
    canvasTexture(scene, `hwt_${count}`, WEAPONS_TEAM.w, WEAPONS_TEAM.h, (p) => {
      // Tripod legs splayed under the launcher.
      for (const [x, y] of [[7, 9], [6, 10], [10, 9], [11, 10], [9, 9], [9, 10]] as const) p.px(x, y, PAL.outline);
      // The tube: long, pale, two-tone, pointing forward, the seeker lens lit at the muzzle end.
      p.rect(5, 4, 13, 4, PAL.outline);
      p.rect(6, 5, 11, 1, PAL.tankHi);
      p.rect(6, 6, 11, 1, PAL.tankShade);
      p.px(17, 5, PAL.amberHot);
      p.px(17, 6, PAL.amber);
      // The sight box on top, and the mount under the tube.
      p.rect(9, 2, 4, 3, PAL.outline);
      p.rect(10, 3, 2, 1, PAL.enemyHi);
      p.rect(8, 8, 3, 1, PAL.outline);
      for (const [x, y] of TEAM.slice(TEAM.length - count)) {
        p.rect(x, y, 4, 4, PAL.outline);
        p.rect(x + 1, y + 1, 2, 2, PAL.enemy);
        p.px(x + 1, y + 1, PAL.enemyHi);
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Fortress guns (Breach), the convoy (Chase), and hovercraft. Drawn facing +x like the rest.

export const EMP = { body: 22, turret: { w: 22, h: 9 }, pivotX: 7 };
export const TOWER = { body: 18, turret: { w: 15, h: 9 }, pivotX: 5 };
export const BUNKER = { body: 22, turret: { w: 11, h: 9 }, pivotX: 4 };
export const HAUL = { body: { w: 24, h: 14 } };
export const LAYER = { body: { w: 16, h: 11 } };
export const HOVER = { body: { w: 15, h: 11 }, turret: { w: 10, h: 5 }, pivotX: 3 };
export const POST = { body: 26 };
export const BATTERY = { body: 22, turret: { w: 20, h: 9 }, pivotX: 6 };
export const HEDGE_GUN = { body: { w: 14, h: 12 }, turret: { w: 17, h: 7 }, pivotX: 4 };
export const BOMB_TRUCK = { body: { w: 16, h: 10 } };
export const TRAPDOOR = { size: 14 };
/** `gait`: the body frames a stride cycles through, and the world units walked per frame. */
export const WALKER = { body: 20, turret: { w: 13, h: 7 }, pivotX: 4, gait: { frames: ['walker_step_a', 'walker_body', 'walker_step_b', 'walker_body'], stride: 6 } };

function makeObjectiveUnits(scene: Phaser.Scene): void {
  // Gun emplacement: a round concrete revetment with sandbags, a long gun on a heavy mount.
  const empBody = (p: Painter, dead: boolean) => {
    const n = EMP.body;
    const c = n / 2;
    p.disc(c, c, c, PAL.outline);
    p.disc(c, c, c - 1, dead ? PAL.ash : PAL.concrete, dead ? PAL.ashLight : PAL.concreteHi, dead ? PAL.hole : PAL.concreteDark);
    p.disc(c, c, c - 4, PAL.outline);
    p.disc(c, c, c - 5, dead ? PAL.hole : PAL.concreteDark);
    // Thicker berm on the face (+x).
    p.rect(n - 4, 4, 3, n - 8, dead ? PAL.ash : PAL.concreteHi);
    if (dead) {
      p.px(c - 2, c, PAL.ember);
      p.px(c + 3, c - 3, PAL.ember);
    }
  };
  canvasTexture(scene, 'emp_body', EMP.body, EMP.body, (p) => empBody(p, false));
  canvasTexture(scene, 'emp_wreck', EMP.body, EMP.body, (p) => empBody(p, true));
  canvasTexture(scene, 'emp_turret', EMP.turret.w, EMP.turret.h, (p) => {
    const tw = EMP.turret.w;
    p.rect(9, 3, tw - 10, 3, PAL.outline);
    p.rect(9, 4, tw - 11, 1, PAL.enemyDark);
    p.rect(tw - 3, 2, 3, 5, PAL.outline);
    p.rect(1, 1, 11, 7, PAL.outline);
    p.rect(2, 2, 9, 5, PAL.enemy);
    p.rect(2, 2, 9, 1, PAL.enemyHi);
    p.rect(2, 6, 9, 1, PAL.enemyDark);
  });

  // Weapon tower: a square steel-and-concrete tower, twin guns on a small turret up top.
  const towerBody = (p: Painter, dead: boolean) => {
    const n = TOWER.body;
    p.rect(0, 0, n, n, PAL.outline);
    p.rect(1, 1, n - 2, n - 2, dead ? PAL.ash : PAL.concreteDark);
    p.rect(3, 3, n - 6, n - 6, dead ? PAL.hole : PAL.concrete);
    p.rect(3, 3, n - 6, 1, dead ? PAL.ashLight : PAL.concreteHi);
    // Corner legs.
    for (const [x, y] of [[1, 1], [n - 3, 1], [1, n - 3], [n - 3, n - 3]] as const) p.rect(x, y, 2, 2, dead ? PAL.hole : PAL.enemyDark);
    if (dead) p.px(n / 2, n / 2, PAL.ember);
  };
  canvasTexture(scene, 'tower_body', TOWER.body, TOWER.body, (p) => towerBody(p, false));
  canvasTexture(scene, 'tower_wreck', TOWER.body, TOWER.body, (p) => towerBody(p, true));
  canvasTexture(scene, 'tower_turret', TOWER.turret.w, TOWER.turret.h, (p) => {
    const tw = TOWER.turret.w;
    for (const y of [2, 5]) p.rect(6, y, tw - 6, 2, PAL.outline);
    p.disc(TOWER.pivotX, 4.5, 4, PAL.outline);
    p.disc(TOWER.pivotX, 4.5, 3, PAL.enemy, PAL.enemyHi, PAL.enemyDark);
  });

  // Rocket bunker: a low, thick concrete pillbox, a launcher box in a slit.
  const bunkerBody = (p: Painter, dead: boolean) => {
    const n = BUNKER.body;
    p.rect(1, 2, n - 2, n - 4, PAL.outline);
    p.rect(2, 3, n - 4, n - 6, dead ? PAL.ash : PAL.concrete);
    p.rect(2, 3, n - 4, 1, dead ? PAL.ashLight : PAL.concreteHi);
    p.rect(2, n - 4, n - 4, 1, dead ? PAL.hole : PAL.concreteDark);
    p.rect(n - 4, 6, 2, n - 12, PAL.hole); // firing slit
    if (dead) {
      p.px(7, 8, PAL.ember);
      p.px(13, 12, PAL.ember);
    }
  };
  canvasTexture(scene, 'bunker_body', BUNKER.body, BUNKER.body, (p) => bunkerBody(p, false));
  canvasTexture(scene, 'bunker_wreck', BUNKER.body, BUNKER.body, (p) => bunkerBody(p, true));
  canvasTexture(scene, 'bunker_turret', BUNKER.turret.w, BUNKER.turret.h, (p) => {
    const tw = BUNKER.turret.w;
    const th = BUNKER.turret.h;
    p.rect(0, 1, tw, th - 2, PAL.outline);
    p.rect(1, 2, tw - 2, th - 4, PAL.enemy);
    p.rect(1, 2, tw - 2, 1, PAL.enemyHi);
    for (const y of [2, 5]) {
      p.rect(tw - 3, y, 2, 2, PAL.hole);
      p.px(tw - 3, y, PAL.amberHot);
    }
  });

  // Armored hauler: a long tracked carrier with a boxed cargo bed and a hazard-striped tail.
  const haulBody = (p: Painter, dead: boolean) => {
    const { w, h } = HAUL.body;
    const main = dead ? PAL.ash : PAL.enemy;
    const dark = dead ? PAL.hole : PAL.enemyDark;
    p.rect(0, 0, w, 3, PAL.outline);
    p.rect(0, h - 3, w, 3, PAL.outline);
    p.rect(1, 1, w - 2, 1, dead ? PAL.hole : PAL.enemyTread);
    p.rect(1, h - 2, w - 2, 1, dead ? PAL.hole : PAL.enemyTread);
    for (let x = 1; x < w - 1; x += 2) {
      p.px(x, 1, dead ? PAL.ash : PAL.treadLink);
      p.px(x, h - 2, dead ? PAL.ash : PAL.treadLink);
    }
    p.rect(1, 3, w - 2, h - 6, PAL.outline);
    p.rect(2, 3, w - 9, h - 6, dead ? PAL.ash : PAL.concreteDark); // cargo box
    p.rect(3, 4, w - 11, h - 8, dead ? PAL.hole : PAL.concrete);
    for (let x = 4; x < w - 9; x += 4) p.rect(x, 4, 1, h - 8, dead ? PAL.ash : PAL.concreteDark);
    p.rect(w - 7, 3, 6, h - 6, main); // armored cab
    p.rect(w - 7, 3, 6, 1, dead ? PAL.ashLight : PAL.enemyHi);
    p.rect(w - 2, 5, 1, h - 10, dead ? PAL.hole : PAL.steelGlint);
    for (let y = 3; y < h - 3; y += 2) p.px(1, y, dead ? PAL.ash : PAL.amber);
    p.rect(w - 8, 3, 1, h - 6, dark);
    if (dead) {
      p.px(8, 6, PAL.ember);
      p.px(14, 8, PAL.ember);
    }
  };
  canvasTexture(scene, 'haul_body', HAUL.body.w, HAUL.body.h, (p) => haulBody(p, false));
  canvasTexture(scene, 'haul_wreck', HAUL.body.w, HAUL.body.h, (p) => haulBody(p, true));

  // Mine layer: a small tracked vehicle with a dispenser chute at the tail.
  const layerBody = (p: Painter, dead: boolean) => {
    const { w, h } = LAYER.body;
    p.rect(0, 0, w, 3, PAL.outline);
    p.rect(0, h - 3, w, 3, PAL.outline);
    p.rect(1, 1, w - 2, 1, dead ? PAL.hole : PAL.enemyTread);
    p.rect(1, h - 2, w - 2, 1, dead ? PAL.hole : PAL.enemyTread);
    p.rect(1, 3, w - 2, h - 6, PAL.outline);
    p.rect(2, 3, w - 4, h - 6, dead ? PAL.ash : PAL.enemy);
    p.rect(2, 3, w - 4, 1, dead ? PAL.ashLight : PAL.enemyHi);
    // Drum of mines and the chute out the back.
    p.disc(6, h / 2, 2.5, dead ? PAL.hole : PAL.enemyDark);
    p.px(6, Math.floor(h / 2), dead ? PAL.ash : PAL.amber);
    p.rect(0, h / 2 - 1, 2, 2, PAL.outline);
    if (dead) p.px(10, 5, PAL.ember);
  };
  canvasTexture(scene, 'layer_body', LAYER.body.w, LAYER.body.h, (p) => layerBody(p, false));
  canvasTexture(scene, 'layer_wreck', LAYER.body.w, LAYER.body.h, (p) => layerBody(p, true));

  // Hovercraft: a rounded skirt, twin fans at the stern, a small gun turret.
  const hoverBody = (p: Painter, dead: boolean) => {
    const { w, h } = HOVER.body;
    p.rect(1, 0, w - 3, h, PAL.outline);
    p.rect(0, 1, w - 1, h - 2, PAL.outline);
    p.rect(1, 1, w - 3, h - 2, dead ? PAL.hole : PAL.enemyTread); // skirt
    p.rect(3, 2, w - 6, h - 4, dead ? PAL.ash : PAL.enemy);
    p.rect(3, 2, w - 6, 1, dead ? PAL.ashLight : PAL.enemyHi);
    p.rect(w - 4, 3, 2, h - 6, dead ? PAL.ash : PAL.enemyHi); // bow
    for (const y of [2, h - 5]) {
      p.rect(1, y, 3, 3, PAL.outline);
      p.px(2, y + 1, dead ? PAL.ash : PAL.steelMid); // fans
    }
    if (dead) p.px(7, 5, PAL.ember);
  };
  canvasTexture(scene, 'hover_body', HOVER.body.w, HOVER.body.h, (p) => hoverBody(p, false));
  canvasTexture(scene, 'hover_wreck', HOVER.body.w, HOVER.body.h, (p) => hoverBody(p, true));
  // Command post (Decapitation): a big concrete blockhouse, a radar dish and two radio masts on
  // the roof, a blast door at the back. No gun: it calls the guns in.
  const postBody = (p: Painter, dead: boolean) => {
    const n = POST.body;
    p.rect(1, 1, n - 2, n - 2, PAL.outline);
    p.rect(2, 2, n - 4, n - 4, dead ? PAL.ash : PAL.concreteDark);
    p.rect(4, 4, n - 8, n - 8, dead ? PAL.hole : PAL.concrete);
    p.rect(4, 4, n - 8, 1, dead ? PAL.ashLight : PAL.concreteHi);
    p.rect(1, n / 2 - 3, 3, 6, PAL.outline); // blast door, rear (−x)
    p.rect(2, n / 2 - 2, 1, 4, dead ? PAL.hole : PAL.enemyDark);
    if (dead) {
      p.px(9, 9, PAL.ember);
      p.px(16, 14, PAL.ember);
      p.px(12, 18, PAL.ember);
      return;
    }
    // Dish toward the approach (+x), masts with red warning lights.
    p.disc(16, 10, 4, PAL.outline);
    p.disc(16, 10, 3, PAL.steelMid, PAL.steelGlint, PAL.steelDark);
    p.px(17, 10, PAL.outline);
    for (const [x, y] of [[8, 8], [9, 18]] as const) {
      p.rect(x - 1, y - 1, 3, 3, PAL.outline);
      p.px(x, y, PAL.enemyHi);
    }
    p.rect(13, 17, 6, 3, PAL.outline); // vents
    p.rect(14, 18, 4, 1, PAL.enemyDark);
  };
  canvasTexture(scene, 'post_body', POST.body, POST.body, (p) => postBody(p, false));
  canvasTexture(scene, 'post_wreck', POST.body, POST.body, (p) => postBody(p, true));
  // Field battery: an earth berm around the gun pit, thick toward the approach (+x) and open at
  // the back, with ammunition stacked behind; one big howitzer stands for the battery's guns.
  const batteryBody = (p: Painter, dead: boolean) => {
    const n = BATTERY.body;
    const c = n / 2;
    p.disc(c, c, c, PAL.outline);
    p.disc(c, c, c - 1, dead ? PAL.ash : PAL.dirt, dead ? PAL.ashLight : PAL.rubble, dead ? PAL.hole : PAL.dirtDark);
    p.disc(c - 1, c, c - 5, PAL.outline);
    p.disc(c - 1, c, c - 6, dead ? PAL.hole : PAL.dirtDark);
    // The open back: a gap in the berm, crates either side of it.
    p.rect(0, c - 3, 5, 6, dead ? PAL.hole : PAL.dirtDark);
    if (dead) {
      p.px(c - 3, c + 1, PAL.ember);
      p.px(c + 2, c - 3, PAL.ember);
      return;
    }
    for (const y of [c - 6, c + 4] as const) {
      p.rect(2, y, 4, 3, PAL.outline);
      p.rect(3, y + 1, 2, 1, PAL.plank);
    }
    p.rect(n - 4, 5, 2, n - 10, PAL.rubble); // the berm's crest toward the approach
  };
  canvasTexture(scene, 'battery_body', BATTERY.body, BATTERY.body, (p) => batteryBody(p, false));
  canvasTexture(scene, 'battery_wreck', BATTERY.body, BATTERY.body, (p) => batteryBody(p, true));
  canvasTexture(scene, 'battery_turret', BATTERY.turret.w, BATTERY.turret.h, (p) => {
    const tw = BATTERY.turret.w;
    // Split trail behind the pivot, a gun shield, a thick barrel with a muzzle brake.
    p.rect(0, 1, 6, 2, PAL.outline);
    p.rect(0, 6, 6, 2, PAL.outline);
    p.rect(8, 3, tw - 10, 3, PAL.outline);
    p.rect(8, 4, tw - 11, 1, PAL.enemyDark);
    p.rect(tw - 3, 2, 3, 5, PAL.outline);
    p.rect(3, 1, 7, 7, PAL.outline);
    p.rect(4, 2, 5, 5, PAL.enemy);
    p.rect(4, 2, 5, 1, PAL.enemyHi);
    p.rect(4, 6, 5, 1, PAL.enemyDark);
  });
  // Hedge gun (SPEC §7.4): a towed anti-tank gun, its split trail spread behind (−x) under a
  // camouflage net of cut branches, the wheels at the axle. The shield and long barrel are the turret.
  const hedgeGunBody = (p: Painter, dead: boolean) => {
    const { w, h } = HEDGE_GUN.body;
    const c = h / 2;
    // The trail legs, splayed back from the axle.
    for (const [y0, dy] of [[c - 2, -1], [c + 1, 1]] as const) {
      for (let i = 0; i < 7; i++) p.rect(w - 6 - i, y0 + Math.round((dy * i) / 2), 2, 1, PAL.outline);
    }
    // The wheels, either side of the axle.
    for (const y of [0, h - 3]) {
      p.rect(w - 6, y, 4, 3, PAL.outline);
      p.rect(w - 5, y + 1, 2, 1, dead ? PAL.ash : PAL.tread);
    }
    if (dead) {
      p.px(4, c, PAL.ember);
      p.px(w - 4, c - 1, PAL.ember);
      return;
    }
    // Netting: leafy sprigs over the trail (it's drawn where the hedge hides it anyway).
    for (const [x, y, col] of [[1, c - 3, PAL.canopy], [2, c + 2, PAL.canopyLight], [4, c - 1, PAL.canopyHi], [5, c + 3, PAL.canopy], [6, c - 4, PAL.canopyLight], [3, c, PAL.canopyShadow]] as const) {
      p.rect(x, y, 2, 2, col);
    }
  };
  canvasTexture(scene, 'hedgegun_body', HEDGE_GUN.body.w, HEDGE_GUN.body.h, (p) => hedgeGunBody(p, false));
  canvasTexture(scene, 'hedgegun_wreck', HEDGE_GUN.body.w, HEDGE_GUN.body.h, (p) => hedgeGunBody(p, true));
  canvasTexture(scene, 'hedgegun_turret', HEDGE_GUN.turret.w, HEDGE_GUN.turret.h, (p) => {
    const { w: tw, h: th } = HEDGE_GUN.turret;
    // A long, thin barrel with a muzzle brake; a wide, thin shield across it at the pivot.
    p.rect(5, 2, tw - 6, 3, PAL.outline);
    p.rect(5, 3, tw - 7, 1, PAL.enemyDark);
    p.rect(tw - 3, 1, 3, 5, PAL.outline);
    p.rect(tw - 2, 2, 1, 3, PAL.enemy);
    p.rect(2, 0, 4, th, PAL.outline);
    p.rect(3, 1, 2, th - 2, PAL.enemy);
    p.rect(3, 1, 1, th - 2, PAL.enemyHi);
  });
  // Bomb truck (SPEC §7.4): a stubby cab at the front (+x), the bed behind it filled by a fat bomb
  // drum banded with hazard stripes, three axles.
  const bombTruckBody = (p: Painter, dead: boolean) => {
    const { w, h } = BOMB_TRUCK.body;
    for (const x of [2, 7, w - 4]) {
      p.rect(x, 0, 3, 2, PAL.outline);
      p.rect(x, h - 2, 3, 2, PAL.outline);
    }
    p.rect(0, 1, w, h - 2, PAL.outline);
    p.rect(1, 2, w - 6, h - 4, dead ? PAL.ash : PAL.enemyDark); // bed
    p.rect(w - 5, 2, 4, h - 4, dead ? PAL.ash : PAL.enemy); // cab
    p.rect(w - 5, 2, 4, 1, dead ? PAL.ashLight : PAL.enemyHi);
    p.rect(w - 2, 3, 1, h - 6, dead ? PAL.hole : PAL.steelGlint); // windshield
    if (dead) {
      p.rect(3, 3, 6, h - 6, PAL.hole);
      p.px(5, 4, PAL.ember);
      p.px(8, 6, PAL.ember);
      return;
    }
    // The bomb: a dark drum lying along the bed, two hazard bands, a fuse box on top.
    p.rect(2, 3, w - 8, h - 6, PAL.outline);
    p.rect(3, 3, w - 10, h - 6, PAL.steelDark);
    p.rect(3, 3, w - 10, 1, PAL.steel);
    for (const x of [4, 8]) {
      p.rect(x, 3, 1, h - 6, PAL.amber);
      p.px(x, 4 + ((x / 4) % 2), PAL.outline);
    }
    p.px(6, Math.floor(h / 2), PAL.enemyHi);
  };
  canvasTexture(scene, 'bombtruck_body', BOMB_TRUCK.body.w, BOMB_TRUCK.body.h, (p) => bombTruckBody(p, false));
  canvasTexture(scene, 'bombtruck_wreck', BOMB_TRUCK.body.w, BOMB_TRUCK.body.h, (p) => bombTruckBody(p, true));
  // Trapdoor team (SPEC §7.4): shut, a round sand-covered lid with a dark seam and a red pull ring
  // (drawn once the hole is found); open, the dark pit with the lid propped up behind (−x) and two
  // heads and a rocket tube pointing at the target (+x); a wreck is the caved-in pit.
  const tn = TRAPDOOR.size;
  const tc = tn / 2;
  canvasTexture(scene, 'trap_shut', tn, tn, (p) => {
    p.disc(tc, tc, 5, PAL.outline);
    p.disc(tc, tc, 4, PAL.sand, PAL.sandHi, PAL.sandDark);
    p.px(tc + 2, tc - 1, PAL.sandHi);
    p.px(tc - 2, tc + 2, PAL.sandDark);
    p.rect(tc - 1, tc, 2, 1, PAL.enemy);
  });
  canvasTexture(scene, 'trap_open', tn, tn, (p) => {
    p.rect(0, tc - 5, 3, 10, PAL.outline);
    p.rect(1, tc - 4, 1, 8, PAL.sand);
    p.disc(tc, tc, 5, PAL.outline);
    p.disc(tc, tc, 4, PAL.hole);
    for (const y of [tc - 3, tc + 1]) {
      p.rect(tc - 2, y, 3, 3, PAL.outline);
      p.px(tc - 1, y + 1, PAL.enemy);
    }
    p.rect(tc, tc - 1, 6, 2, PAL.outline);
    p.rect(tc + 1, tc - 1, 5, 1, PAL.tankShade);
  });
  canvasTexture(scene, 'trap_wreck', tn, tn, (p) => {
    p.disc(tc, tc, 5, PAL.sandDark);
    p.disc(tc, tc, 3, PAL.hole);
    p.px(tc + 1, tc, PAL.ember);
  });
  // Spider walker (SPEC §7.4): a round armored carapace on six jointed legs splayed out (three a
  // side, the feet dark), the twin-gun turret on top. A wreck is the carapace slumped on its legs.
  // `step` poses the legs for the walking cycle (`WALKER.gait`): two alternating tripods (front and
  // rear on one side with the middle on the other) swing forward (+x) or back by 2 px.
  const walkerBody = (p: Painter, dead: boolean, step: -1 | 0 | 1 = 0) => {
    const n = WALKER.body;
    const c = n / 2;
    const leg = dead ? PAL.ash : PAL.enemyDark;
    ([[-5, 1], [0, 0], [5, 1]] as const).forEach(([dx, reach], i) => {
      for (const side of [-1, 1]) {
        const tripod = (i + (side > 0 ? 1 : 0)) % 2 === 0 ? 1 : -1;
        const swing = step * tripod * 2;
        const root = c + dx;
        const knee = root + swing;
        const foot = knee + (dx < 0 ? -1 : dx > 0 ? 1 : 0);
        // Upper leg out from the body, swung along to the knee; the lower leg bent down to a foot.
        const kneeY = c + side * 6;
        const footY = c + side * (9 - reach);
        p.rect(root, Math.min(c + side * 3, kneeY), 1, Math.abs(kneeY - (c + side * 3)) + 1, PAL.outline);
        p.rect(Math.min(root, knee), kneeY, Math.abs(swing) + 1, 1, PAL.outline);
        p.rect(foot, Math.min(kneeY, footY), 1, Math.abs(footY - kneeY) + 1, leg);
        p.px(foot, footY, PAL.outline);
      }
    });
    p.disc(c, c, 5, PAL.outline);
    p.disc(c, c, 4, dead ? PAL.ash : PAL.enemy, dead ? PAL.ashLight : PAL.enemyHi, dead ? PAL.hole : PAL.enemyDark);
    if (dead) {
      p.px(c - 1, c, PAL.ember);
      p.px(c + 2, c + 1, PAL.ember);
    }
  };
  canvasTexture(scene, 'walker_body', WALKER.body, WALKER.body, (p) => walkerBody(p, false));
  canvasTexture(scene, 'walker_step_a', WALKER.body, WALKER.body, (p) => walkerBody(p, false, -1));
  canvasTexture(scene, 'walker_step_b', WALKER.body, WALKER.body, (p) => walkerBody(p, false, 1));
  canvasTexture(scene, 'walker_wreck', WALKER.body, WALKER.body, (p) => walkerBody(p, true));
  canvasTexture(scene, 'walker_turret', WALKER.turret.w, WALKER.turret.h, (p) => {
    const { w: tw, h: th } = WALKER.turret;
    // Two barrels side by side from a small domed mount.
    for (const y of [1, th - 3]) {
      p.rect(WALKER.pivotX, y, tw - WALKER.pivotX, 2, PAL.outline);
      p.rect(WALKER.pivotX + 1, y, tw - WALKER.pivotX - 2, 1, PAL.steelMid);
    }
    p.disc(WALKER.pivotX, th / 2, 3, PAL.outline);
    p.disc(WALKER.pivotX, th / 2, 2, PAL.enemy, PAL.enemyHi, PAL.enemyDark);
  });
  canvasTexture(scene, 'hover_turret', HOVER.turret.w, HOVER.turret.h, (p) => {
    const tw = HOVER.turret.w;
    p.rect(4, 2, tw - 4, 1, PAL.outline);
    p.disc(HOVER.pivotX, 2.5, 2.4, PAL.outline);
    p.disc(HOVER.pivotX, 2.5, 1.6, PAL.enemy, PAL.enemyHi, PAL.enemyDark);
  });
}

/** Texture keys and turret pivots per enemy unit, for the unit views. */
export interface EnemyArt {
  body: string;
  /** Null for units without a separate turret (infantry turn to face their target). */
  turret: { key: string; pivotX: number; w: number } | null;
  /** Ground decal left behind; null = none. */
  wreck: string | null;
  /** Extra turrets, in `EnemyDef.turrets` order (SPEC §7 siege tank). */
  extra?: { key: string; pivotX: number; w: number }[];
  /**
   * Troops on foot: one frame per soldier still standing (`<prefix>1` … `<prefix><soldiers>`).
   * `faceCourse`: drawn along the way they're moving (skis), not turned toward their target.
   */
  squad?: { prefix: string; soldiers: number; faceCourse?: boolean };
  /** A trapdoor team (SPEC §7.4): its texture with the lid shut, and open (turned to its target). */
  lid?: { shut: string; open: string };
  /** Legs (SPEC §7.4 spider walker): body frames stepped through as it moves, one per `stride` world units walked. */
  gait?: { frames: readonly string[]; stride: number };
}

export const ENEMY_ART: Record<EnemyId, EnemyArt> = {
  lightTank: { body: 'lt_body', turret: { key: 'lt_turret', pivotX: LT.pivotX, w: LT.turret.w }, wreck: 'lt_wreck' },
  heavyTank: { body: 'ht_body', turret: { key: 'ht_turret', pivotX: HT.pivotX, w: HT.turret.w }, wreck: 'ht_wreck' },
  missileLauncher: { body: 'ml_body', turret: { key: 'ml_turret', pivotX: ML.pivotX, w: ML.turret.w }, wreck: 'ml_wreck' },
  infantry: { body: `inf_${SQUAD.length}`, turret: null, wreck: null, squad: { prefix: 'inf_', soldiers: SQUAD.length } },
  weaponsTeam: { body: `hwt_${TEAM.length}`, turret: null, wreck: null, squad: { prefix: 'hwt_', soldiers: TEAM.length } },
  gunEmplacement: { body: 'emp_body', turret: { key: 'emp_turret', pivotX: EMP.pivotX, w: EMP.turret.w }, wreck: 'emp_wreck' },
  weaponTower: { body: 'tower_body', turret: { key: 'tower_turret', pivotX: TOWER.pivotX, w: TOWER.turret.w }, wreck: 'tower_wreck' },
  rocketBunker: { body: 'bunker_body', turret: { key: 'bunker_turret', pivotX: BUNKER.pivotX, w: BUNKER.turret.w }, wreck: 'bunker_wreck' },
  hauler: { body: 'haul_body', turret: null, wreck: 'haul_wreck' },
  mineLayer: { body: 'layer_body', turret: null, wreck: 'layer_wreck' },
  hovercraft: { body: 'hover_body', turret: { key: 'hover_turret', pivotX: HOVER.pivotX, w: HOVER.turret.w }, wreck: 'hover_wreck' },
  commandPost: { body: 'post_body', turret: null, wreck: 'post_wreck' },
  siegeTank: {
    body: 'siege_body',
    turret: { key: 'siege_turret', pivotX: SIEGE.pivotX, w: SIEGE.turret.w },
    wreck: 'siege_wreck',
    extra: [{ key: 'siege_aux', pivotX: SIEGE.aux.pivotX, w: SIEGE.aux.w }],
  },
  artillery: { body: 'battery_body', turret: { key: 'battery_turret', pivotX: BATTERY.pivotX, w: BATTERY.turret.w }, wreck: 'battery_wreck' },
  bombTruck: { body: 'bombtruck_body', turret: null, wreck: 'bombtruck_wreck' },
  spiderWalker: { body: 'walker_body', turret: { key: 'walker_turret', pivotX: WALKER.pivotX, w: WALKER.turret.w }, wreck: 'walker_wreck', gait: WALKER.gait },
  trapdoorTeam: { body: 'trap_shut', turret: null, wreck: 'trap_wreck', lid: { shut: 'trap_shut', open: 'trap_open' } },
  skiTroops: { body: `ski_${SKI_TROOPS.soldiers}`, turret: null, wreck: null, squad: { prefix: 'ski_', soldiers: SKI_TROOPS.soldiers, faceCourse: true } },
  hedgeGun: { body: 'hedgegun_body', turret: { key: 'hedgegun_turret', pivotX: HEDGE_GUN.pivotX, w: HEDGE_GUN.turret.w }, wreck: 'hedgegun_wreck' },
};

// ---------------------------------------------------------------------------------------------
// Effects, projectiles, UI bits

function makeFx(scene: Phaser.Scene): void {
  canvasTexture(scene, 'px', 1, 1, (p) => p.rect(0, 0, 1, 1, PAL.white));
  canvasTexture(scene, 'px2', 2, 2, (p) => p.rect(0, 0, 2, 2, PAL.white));
  canvasTexture(scene, 'px3', 3, 3, (p) => p.rect(0, 0, 3, 3, PAL.white));
  canvasTexture(scene, 'puff', 5, 5, (p) => {
    p.rect(1, 0, 3, 5, PAL.white);
    p.rect(0, 1, 5, 3, PAL.white);
  });
  canvasTexture(scene, 'shell', 5, 2, (p) => {
    p.rect(0, 0, 5, 2, PAL.shellPlayer);
    p.rect(3, 0, 2, 2, PAL.white);
  });
  canvasTexture(scene, 'eshell', 3, 3, (p) => {
    p.rect(1, 0, 1, 3, PAL.shellEnemy);
    p.rect(0, 1, 3, 1, PAL.shellEnemy);
    p.px(1, 1, PAL.amberHot);
  });
  // Plasma glob: a hot violet blob.
  canvasTexture(scene, 'plasma', 5, 5, (p) => {
    p.disc(2.5, 2.5, 2.5, PAL.plasma);
    p.disc(2.5, 2.5, 1.4, PAL.plasmaHot);
  });
  // Plasma pools: ragged violet puddles, two frames to flicker between (drawn 24 px across).
  for (let f = 0; f < 2; f++) {
    const rng = new Rng(70 + f);
    const edge = Array.from({ length: 16 }, () => rng.range(0.78, 1));
    canvasTexture(scene, `plasma_pool${f}`, 24, 24, (p) => {
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const dx = x + 0.5 - 12;
          const dy = y + 0.5 - 12;
          const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
          const r = Math.hypot(dx, dy) / (12 * edge[Math.floor(a * 16)]!);
          if (r > 1) continue;
          const speck = rng.chance(0.12);
          p.px(x, y, r < 0.4 ? (speck ? PAL.plasma : PAL.plasmaHot) : r < 0.75 ? (speck ? PAL.plasmaHot : PAL.plasma) : PAL.plasmaDim);
        }
      }
    });
  }
  canvasTexture(scene, 'bullet', 3, 1, (p) => {
    p.rect(0, 0, 3, 1, PAL.shellPlayer);
    p.px(2, 0, PAL.white);
  });
  canvasTexture(scene, 'missile', 6, 3, (p) => {
    p.rect(1, 0, 4, 3, PAL.outline);
    p.rect(1, 1, 4, 1, PAL.steelGlint);
    p.px(5, 1, PAL.amber);
    p.px(0, 1, PAL.amberHot);
  });
  canvasTexture(scene, 'emissile', 6, 3, (p) => {
    p.rect(1, 0, 4, 3, PAL.outline);
    p.rect(1, 1, 4, 1, PAL.enemyHi);
    p.px(0, 1, PAL.amberHot);
  });
  // Missile lock: corner brackets around the locked unit.
  canvasTexture(scene, 'lock', 15, 15, (p) => {
    for (const [x, y] of [[0, 0], [11, 0], [0, 11], [11, 11]] as const) {
      p.rect(x + (x ? 3 : 0), y, 1, 4, PAL.amber);
      p.rect(x, y + (y ? 3 : 0), 4, 1, PAL.amber);
    }
  });
  canvasTexture(scene, 'flash', 9, 9, (p) => {
    p.rect(4, 0, 1, 9, PAL.amber);
    p.rect(0, 4, 9, 1, PAL.amber);
    p.rect(2, 2, 5, 5, PAL.amber);
    p.rect(3, 3, 3, 3, PAL.amberHot);
    p.px(4, 4, PAL.white);
  });
  canvasTexture(scene, 'scorch', 18, 18, (p) => {
    const rng = new Rng(4242);
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 18; x++) {
        const d = Math.hypot(x - 8.5, y - 8.5) / 9;
        if (d < 1 && rng.next() > d * d) p.px(x, y, d < 0.5 ? 'rgba(18,16,12,0.6)' : 'rgba(24,20,14,0.4)');
      }
    }
  });
  canvasTexture(scene, 'trackmark', 2, 8, (p) => {
    p.rect(0, 0, 2, 8, 'rgba(30,26,16,0.28)');
  });
  // Aim telegraph glint at an enemy muzzle.
  canvasTexture(scene, 'glint', 7, 7, (p) => {
    p.rect(3, 0, 1, 7, PAL.shellEnemy);
    p.rect(0, 3, 7, 1, PAL.shellEnemy);
    p.rect(2, 2, 3, 3, PAL.amberHot);
    p.px(3, 3, PAL.white);
  });
  // Off-screen threat arrow, pointing up (flipped for threats behind).
  canvasTexture(scene, 'threat', 9, 6, (p) => {
    for (let row = 0; row < 5; row++) p.rect(4 - row, row, row * 2 + 1, 1, PAL.outline);
    p.rect(0, 5, 9, 1, PAL.outline);
    for (let row = 1; row < 5; row++) p.rect(5 - row, row, row * 2 - 1, 1, PAL.shellEnemy);
    p.px(4, 1, PAL.amberHot);
  });
  canvasTexture(scene, 'reticle', 11, 11, (p) => {
    const ticks = [
      [5, 0, 1, 3],
      [5, 8, 1, 3],
      [0, 5, 3, 1],
      [8, 5, 3, 1],
    ] as const;
    for (const [x, y, w, h] of ticks) p.rect(x - (w > 1 ? 0 : 1), y - (h > 1 ? 0 : 1), w + (w > 1 ? 0 : 2), h + (h > 1 ? 0 : 2), PAL.outline);
    for (const [x, y, w, h] of ticks) p.rect(x, y, w, h, PAL.white);
    p.px(5, 5, PAL.amber);
  });
}
