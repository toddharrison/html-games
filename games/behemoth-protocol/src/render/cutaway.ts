import type Phaser from 'phaser';
import { ADDONS, type AddonId } from '../content/addons';
import type { ArmorArc, ChassisId, CoreComponent } from '../content/chassis';
import { TRAILER_MODULES, type ModuleDef } from '../content/trailer';
import { WEAPONS, type WeaponDef } from '../content/weapons';
import { bayIndex } from '../sim/behemoth';
import { addonDef, fittedChassis, trailerDef } from '../sim/depot';
import { CORE_COMPONENTS } from '../sim/upgrades';
import type { BehemothSnapshot } from '../sim/run';
import { hex, PAL } from './palette';
import { damageLevel } from './statusFx';

/**
 * The side-on cutaway of the Behemoth for the depot (SPEC §4.1, §8.2): a big profile, front to
 * the right, with every component drawn where it sits and colored by integrity. Placeholder
 * shapes drawn with Graphics; the real art pass replaces them. Returns the clickable regions.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A clickable part: a core component, 'armor', a hardpoint slot id, an add-on id, or a trailer bay id. */
export interface CutawayPart {
  id: string;
  box: Box;
  /** Short tag the scene prints by the part (e.g. which flank). */
  label?: string;
}

interface Layout {
  /** Drawing size. */
  w: number;
  h: number;
  hull: [number, number][];
  treads: Box;
  wheels: number[];
  reactor: Box;
  sensors: Box;
  fireControl: Box;
  /** The ammo magazine, deep in the hull, and the blowout panels in the deck that vent it. */
  magazine: Box;
  panels: Box;
  /**
   * Plates that show each armor zone. The near side is the left: the right and front-right zones
   * are on the far side (a strip under the skirt, and one rising at the nose beyond the belt).
   */
  armor: Record<ArmorArc, [number, number, number, number][]>;
  /**
   * Each hardpoint's mount box (add-on mounts' too), with an optional tag (left and right look
   * alike). A ring the chassis doesn't have built in stands on a pillar down to `deck`.
   */
  slots: Record<string, Box & { label?: string; deck?: number }>;
  /** Outboard treads: a second belt in front of the first, covering its lower part. */
  outerTreads: Box;
  outerWheels: number[];
  /**
   * Ram plow: a blade standing ahead of the nose from over the prow down to the ground (its
   * outline), the push arms that carry it (each a line from the hull to the blade), and its
   * clickable box.
   */
  plow: { blade: [number, number][]; arms: [number, number, number, number][]; box: Box };
  /** How far a dorsal ring is raised when a twin turret's second gun sits over the main one. */
  twinLift: number;
  /**
   * The trailer, behind the hull (to the left, at negative x): where its bed, belt, and the bays
   * on the bed sit (`trailerLayout` lays them out for however many bays it has, stacking a bigger
   * trailer's on a rack), and how far behind the origin a trailer reaches.
   */
  trailer: { bedY: number; bedH: number; treadY: number; treadH: number; bayY: number; bayH: number; hitchX: number; barY: number; rear: number };
}

/**
 * A trailer of `n` bays laid out behind the hull: its bed, belt and wheels, a box per bay (front
 * first), the rack that carries an upper tier, and the tow bar. Two bays sit on the bed; a bigger
 * trailer stacks the rest above them on a rack, in a grid two bays long (user's call, Nov 2026:
 * four in a row made each too slim to read). They fill a column at a time, the front one first and
 * the bed before the rack: three bays are the front pair and one behind, four are a 2×2. So every
 * trailer is the same length in profile, and a bigger one stands taller.
 */
function trailerLayout(
  T: Layout['trailer'],
  n: number,
): { bed: Box; treads: Box; wheels: number[]; bays: Box[]; rack: Box[]; bar: [number, number, number, number] } {
  const front = -2;
  const bayW = 20;
  const gap = 3;
  const cols = Math.min(2, n);
  const rows = Math.ceil(n / cols);
  const bedW = cols * bayW + (cols - 1) * gap + 5;
  const bed = { x: front - bedW, y: T.bedY, w: bedW, h: T.bedH };
  const treads = { x: bed.x - 2, y: T.treadY, w: bedW + 4, h: T.treadH };
  // Road wheels evenly along the belt, about 14 apart.
  const count = Math.max(2, Math.round((treads.w - 24) / 14) + 1);
  const wheels = Array.from({ length: count }, (_, i) => Math.round(treads.x + 12 + (i * (treads.w - 24)) / (count - 1)));
  const bays = Array.from({ length: n }, (_, i) => ({
    x: front - 3 - bayW - Math.floor(i / rows) * (bayW + gap),
    y: T.bayY - (i % rows) * (T.bayH + gap),
    w: bayW,
    h: T.bayH,
  }));
  // Under each bay above the bed: a shelf in the gap, on a post either side down to the bed.
  const rack = bays
    .filter((b) => b.y < T.bayY)
    .flatMap((b) => [
      { x: b.x - 1, y: b.y + b.h + 1, w: b.w + 2, h: 2 },
      { x: b.x - 1, y: b.y + b.h + 1, w: 1, h: T.bedY - (b.y + b.h + 1) },
      { x: b.x + b.w, y: b.y + b.h + 1, w: 1, h: T.bedY - (b.y + b.h + 1) },
    ]);
  return { bed, treads, wheels, bays, rack, bar: [front, T.barY, T.hitchX, T.barY] };
}

/** Cutaway geometry per chassis (local game pixels). */
const LAYOUTS: Record<ChassisId, Layout> = {
  class2: {
    w: 300,
    h: 166,
    hull: [
      [20, 126],
      [20, 86],
      [40, 70],
      [196, 70],
      [272, 112],
      [272, 126],
    ],
    treads: { x: 18, y: 128, w: 256, h: 30 },
    wheels: [44, 80, 116, 152, 188, 224, 252],
    reactor: { x: 30, y: 90, w: 32, h: 28 },
    sensors: { x: 202, y: 76, w: 16, h: 8 },
    // Amidships, ahead of the turret's base, between the flank mounts and the prow.
    fireControl: { x: 178, y: 84, w: 18, h: 10 },
    // Aft of center, low between the reactor and the left flank mount (under a left sponson).
    magazine: { x: 66, y: 96, w: 22, h: 22 },
    // In the deck between the spine rack and the turret.
    panels: { x: 94, y: 65, w: 16, h: 5 },
    armor: {
      frontLeft: [[196, 70, 272, 112], [272, 112, 272, 126]],
      frontRight: [[276, 128, 276, 160]],
      rear: [[20, 86, 20, 126], [20, 86, 40, 70]],
      left: [[24, 124, 268, 124]],
      right: [[24, 160, 270, 160]],
    },
    slots: {
      turret: { x: 112, y: 48, w: 62, h: 22 },
      prow: { x: 232, y: 98, w: 22, h: 12 },
      flankL: { x: 92, y: 98, w: 22, h: 12, label: 'L' },
      flankR: { x: 146, y: 98, w: 22, h: 12, label: 'R' },
      spine: { x: 48, y: 54, w: 44, h: 16 },
      pd: { x: 182, y: 60, w: 14, h: 10 },
      sponsonL: { x: 72, y: 80, w: 20, h: 12, label: 'LS' },
      sponsonR: { x: 144, y: 80, w: 20, h: 12, label: 'RS' },
      // Raised over the spine rack, so its barrel clears the main turret.
      dorsalRing: { x: 50, y: 30, w: 44, h: 18, deck: 54 },
      // On the turret's near cheek, its barrel under the main gun's.
      coax: { x: 148, y: 60, w: 16, h: 8 },
      // A twin turret's second gun: its housing on the turret's roof, its barrel over the first's.
      twinTurret: { x: 118, y: 38, w: 50, h: 10 },
    },
    outerTreads: { x: 34, y: 138, w: 224, h: 26 },
    outerWheels: [58, 98, 138, 178, 218, 240],
    // A dozer blade ahead of the nose, curved like a C: a lip over the prow, a hollow face, and a
    // toe leaning into the ground, on a pair of push arms from the hull and the tread frame.
    plow: {
      blade: [
        [287, 90],
        [291, 92],
        [286, 106],
        [285, 124],
        [287, 142],
        [292, 154],
        [292, 158],
        [284, 158],
        [280, 142],
        [279, 122],
        [281, 104],
      ],
      arms: [
        [262, 118, 282, 112],
        [266, 136, 283, 146],
      ],
      box: { x: 278, y: 89, w: 16, h: 70 },
    },
    twinLift: 10,
    trailer: { bedY: 110, bedH: 16, treadY: 128, treadH: 22, bayY: 88, bayH: 21, hitchX: 20, barY: 120, rear: 54 },
  },
};

/** How far the cutaway reaches behind its origin (for the standard trailer), so the scene can leave room. */
export function cutawayRear(chassis: ChassisId): number {
  return LAYOUTS[chassis].trailer.rear;
}

export function integrityColor(frac: number): string {
  const level = damageLevel(frac);
  if (level === 'ok') return PAL.good;
  if (level === 'amber') return PAL.warn;
  if (level === 'destroyed') return PAL.hudDim;
  return PAL.bad;
}

/**
 * Draws the cutaway at (ox, oy). `highlight` outlines one part (hover/selection); `fits` marks
 * slots that can take the weapon being considered.
 */
export function drawCutaway(
  g: Phaser.GameObjects.Graphics,
  s: BehemothSnapshot,
  ox: number,
  oy: number,
  opts: { selected?: string | null; hover?: string | null; fits?: ReadonlySet<string> } = {},
): CutawayPart[] {
  const L = LAYOUTS[s.chassis];
  // Integrity maxima include the upgrades (SPEC §5.6).
  const c = fittedChassis(s);
  const parts: CutawayPart[] = [];
  const rect = (b: Box, color: string, alpha = 1) => g.fillStyle(hex(color), alpha).fillRect(ox + b.x, oy + b.y, b.w, b.h);
  const frame = (b: Box, color: string, t = 1) => {
    g.lineStyle(t, hex(color), 1).strokeRect(ox + b.x - 0.5 * t, oy + b.y - 0.5 * t, b.w + t, b.h + t);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, color: string, t: number) =>
    g.lineStyle(t, hex(color), 1).lineBetween(ox + x0, oy + y0, ox + x1, oy + y1);

  // Treads: the belt, road wheels, and the tread integrity color along the links.
  const belt = (box: Box, wheels: number[], frac: number) => {
    rect(box, PAL.tread);
    g.lineStyle(2, hex(integrityColor(frac)), 1).strokeRoundedRect(ox + box.x, oy + box.y, box.w, box.h, 12);
    const r = Math.min(9, box.h / 2 - 4);
    for (const x of wheels) {
      g.fillStyle(hex(PAL.treadLink)).fillCircle(ox + x, oy + box.y + box.h / 2, r);
      g.fillStyle(hex(PAL.steelDark)).fillCircle(ox + x, oy + box.y + box.h / 2, r / 2);
    }
  };
  belt(L.treads, L.wheels, s.treads / c.treadHp);
  const has = (id: AddonId) => s.addons.find((a) => a.id === id);

  // The trailer behind: tow bar, belt, the bed (its outline is the frame's integrity, the rear
  // plate the trailer's armor), and its modules on top.
  const tdef = trailerDef(s);
  const trailer = tdef && has(tdef.id);
  if (trailer && s.trailer && tdef) {
    const T = trailerLayout(L.trailer, tdef.bays.length);
    const [bx0, by0, bx1, by1] = T.bar;
    line(bx0, by0, bx1, by1, PAL.steelDark, 3);
    line(bx0, by0 - 1, bx1, by1 - 1, PAL.steelMid, 1);
    const tf = (trailer.hp ?? 0) / tdef.hp;
    belt(T.treads, T.wheels, tf);
    rect(T.bed, tf > 0 ? PAL.steel : PAL.ash);
    rect({ x: T.bed.x, y: T.bed.y, w: T.bed.w, h: 2 }, PAL.steelHi);
    frame(T.bed, integrityColor(tf), 1);
    line(T.bed.x, T.bed.y - 2, T.bed.x, T.bed.y + T.bed.h, integrityColor(s.trailer.armor / tdef.armor), 3);
    for (const r of T.rack) rect(r, PAL.steelMid);
    s.trailer.bays.forEach((bay, i) => {
      const box = T.bays[i];
      if (!box) return;
      const id = `bay${i}`;
      if (bay) {
        const def = TRAILER_MODULES[bay.module];
        const hp = bay.hp ?? s.hardpoints.find((h) => h.slot === id)?.hp ?? 0;
        drawModule(g, def, ox + box.x, oy + box.y, box.w, box.h, hp <= 0);
        frame(box, integrityColor(hp / def.hp), 1);
      } else {
        drawEmpty(g, ox + box.x, oy + box.y, box.w, box.h);
      }
      if (opts.fits?.has(id)) frame({ x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 }, PAL.amber, 1);
      parts.push({ id, box });
    });
    parts.push({ id: tdef.id, box: { x: T.treads.x, y: T.bed.y, w: T.treads.w, h: T.treads.y + T.treads.h - T.bed.y } });
  }
  // An add-on's own part: its integrity over its maximum as fitted (a tread set's upgrades included).
  const plateFrac = (id: AddonId) => {
    const a = has(id);
    const def = addonDef(s, id);
    return a && a.hp !== null && def.kind !== 'mount' ? a.hp / def.hp : 0;
  };

  // Hull body, cut away to show the reactor, sensors, and fire control.
  // Phaser only reads x and y from these points.
  const hull = L.hull.map(([x, y]) => ({ x: ox + x, y: oy + y })) as Phaser.Math.Vector2[];
  g.fillStyle(hex(PAL.steel)).fillPoints(hull, true);
  g.fillStyle(hex(PAL.steelMid)).fillRect(ox + 40, oy + 72, 156, 6);
  g.lineStyle(1, hex(PAL.outline), 1).strokePoints(hull, true);
  // The outboard belt, in front of the inner one (the far-side armor strip still shows over it).
  if (has('outerTreads')) belt(L.outerTreads, L.outerWheels, plateFrac('outerTreads'));

  // Armor plates, colored by each zone's integrity. Zones share one repair, so they're one part.
  for (const arc of ['right', 'frontRight', 'left', 'rear', 'frontLeft'] as const) {
    const color = integrityColor(s.armor[arc] / c.armor[arc]);
    const far = arc === 'right' || arc === 'frontRight';
    for (const [x0, y0, x1, y1] of L.armor[arc]) line(x0, y0, x1, y1, color, far ? 2 : 3);
  }

  // The ram plow: a blade standing ahead of the nose on its push arms, its face lit and riveted,
  // outlined by its integrity. Add-ons go first in the list, so they're picked over the parts they
  // cover.
  if (has('ramPlow')) {
    const f = plateFrac('ramPlow');
    for (const [x0, y0, x1, y1] of L.plow.arms) {
      line(x0, y0, x1, y1, PAL.outline, 5);
      line(x0, y0, x1, y1, f > 0 ? PAL.steelMid : PAL.ash, 3);
    }
    const pts = L.plow.blade.map(([x, y]) => ({ x: ox + x, y: oy + y })) as Phaser.Math.Vector2[];
    g.fillStyle(hex(f > 0 ? PAL.steelHi : PAL.ash)).fillPoints(pts, true);
    g.lineStyle(2, hex(integrityColor(f)), 1).strokePoints(pts, true);
    if (f > 0) {
      // A row of rivets down the blade's spine, halfway between its back and its face.
      const half = L.plow.blade.length >> 1;
      for (let i = 1; i < half - 1; i++) {
        const [fx, fy] = L.plow.blade[i]!;
        const [bx, by] = L.plow.blade[L.plow.blade.length - i]!;
        rect({ x: Math.round((fx + bx) / 2) - 1, y: Math.round((fy + by) / 2) - 1, w: 2, h: 2 }, PAL.steelDark);
      }
    }
    parts.push({ id: 'ramPlow', box: L.plow.box });
  }
  if (has('outerTreads')) parts.push({ id: 'outerTreads', box: L.outerTreads });
  parts.push({ id: 'treads', box: L.treads });

  const ri = s.reactor / c.reactor.hp;
  rect(L.reactor, PAL.steelDark);
  rect({ x: L.reactor.x + 4, y: L.reactor.y + 4, w: L.reactor.w - 8, h: L.reactor.h - 8 }, ri > 0 ? PAL.glowDim : PAL.hudLine);
  rect({ x: L.reactor.x + 10, y: L.reactor.y + 9, w: L.reactor.w - 20, h: L.reactor.h - 18 }, ri > 0 ? PAL.glow : PAL.hudLine);
  frame(L.reactor, integrityColor(ri), 2);
  parts.push({ id: 'reactor', box: L.reactor });

  const si = s.sensors / c.sensorsHp;
  rect(L.sensors, PAL.steelDark);
  rect({ x: L.sensors.x + 3, y: L.sensors.y + 2, w: 4, h: 4 }, si > 0 ? PAL.glow : PAL.hudLine);
  rect({ x: L.sensors.x + 9, y: L.sensors.y + 2, w: 4, h: 4 }, si > 0 ? PAL.glow : PAL.hudLine);
  frame(L.sensors, integrityColor(si), 2);
  parts.push({ id: 'sensors', box: L.sensors });

  // Fire control: a computer stack with a lit display.
  const fi = s.fireControl / c.fireControl.hp;
  rect(L.fireControl, PAL.steelDark);
  rect({ x: L.fireControl.x + 3, y: L.fireControl.y + 2, w: L.fireControl.w - 6, h: 3 }, fi > 0 ? PAL.glowDim : PAL.hudLine);
  rect({ x: L.fireControl.x + 4, y: L.fireControl.y + 3, w: 2, h: 1 }, fi > 0 ? PAL.glow : PAL.hudLine);
  rect({ x: L.fireControl.x + 3, y: L.fireControl.y + 6, w: L.fireControl.w - 6, h: 1 }, PAL.steelMid);
  frame(L.fireControl, integrityColor(fi), 2);
  parts.push({ id: 'fireControl', box: L.fireControl });

  // Magazine: racks of rounds with their tips showing, dark once it's empty or wrecked.
  const mi = s.magazine / c.magazine.hp;
  const loaded = s.hardpoints.some((h) => h.ammo !== null && h.ammo > 0 && bayIndex(h.slot) === null);
  rect(L.magazine, PAL.steelDark);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = L.magazine.x + 3 + col * 4;
      const y = L.magazine.y + 3 + row * 6;
      rect({ x, y, w: 3, h: 5 }, mi > 0 && loaded ? PAL.steelMid : PAL.hudLine);
      if (mi > 0 && loaded) rect({ x, y, w: 3, h: 1 }, PAL.amber);
    }
  }
  frame(L.magazine, integrityColor(mi), 2);
  parts.push({ id: 'magazine', box: L.magazine });
  // Blowout panels: hinged plates in the deck; blown off, an open hatch.
  if (has('blowoutPanels')) {
    const f = plateFrac('blowoutPanels');
    rect(L.panels, f > 0 ? PAL.steelMid : PAL.outline);
    if (f > 0) rect({ x: L.panels.x + L.panels.w / 2 - 1, y: L.panels.y, w: 1, h: L.panels.h }, PAL.steelDark);
    frame(L.panels, integrityColor(f), 1);
    parts.unshift({ id: 'blowoutPanels', box: L.panels });
  }

  // Core components above Gen 1 carry a pip per grade over it in the top-right corner, and the one
  // a grade for sale would replace is marked like a slot a weapon fits.
  for (const p of parts) {
    if (!(CORE_COMPONENTS as string[]).includes(p.id)) continue;
    const gen = s.grades[p.id as CoreComponent] ?? 1;
    for (let i = 1; i < gen; i++) rect({ x: p.box.x + p.box.w - 3 * i - 1, y: p.box.y + 1, w: 2, h: 2 }, PAL.glow);
    if (opts.fits?.has(p.id)) frame({ x: p.box.x - 2, y: p.box.y - 2, w: p.box.w + 4, h: p.box.h + 4 }, PAL.amber, 1);
  }

  // Hardpoints: mount, weapon, and a frame colored by integrity (dashed when empty). Add-on mounts
  // are picked first: the coax sits on the turret.
  const builtIn: CutawayPart[] = [];
  const twin = has('twinTurret') !== undefined;
  for (const h of s.hardpoints) {
    const at = L.slots[h.slot];
    if (!at) continue;
    // With a second gun on the main turret's roof, a dorsal ring stands taller to fire over it.
    const box = twin && h.slot === 'dorsalRing' ? { ...at, y: at.y - L.twinLift } : at;
    const slot = c.hardpoints.find((sl) => sl.id === h.slot) ?? c.addonMounts[h.slot as AddonId]?.hardpoint;
    if (!slot) continue;
    const weapon = h.weapon ? WEAPONS[h.weapon] : null;
    // A raised ring's pillar down to the deck.
    if (box.deck !== undefined) {
      rect({ x: box.x + 8, y: box.y + box.h, w: box.w - 16, h: box.deck - box.y - box.h }, PAL.steelMid);
      rect({ x: box.x + 8, y: box.y + box.h, w: 1, h: box.deck - box.y - box.h }, PAL.steelHi);
    }
    // A sponson's housing: an armored bracket behind its weapon.
    if (slot.id in ADDONS && !slot.ring) {
      rect({ x: box.x - 3, y: box.y + 3, w: box.w + 6, h: box.h - 3 }, PAL.steelMid);
      rect({ x: box.x - 3, y: box.y + 3, w: box.w + 6, h: 1 }, PAL.steelHi);
    }
    if (weapon) drawWeapon(g, weapon, ox + box.x, oy + box.y, box.w, box.h, h.hp <= 0);
    else drawEmpty(g, ox + box.x, oy + box.y, box.w, box.h);
    if (weapon) frame(box, integrityColor(h.hp / slot.hp), 1);
    if (opts.fits?.has(h.slot)) frame({ x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 }, PAL.amber, 1);
    const part = box.label ? { id: h.slot, box, label: box.label } : { id: h.slot, box };
    (slot.id in ADDONS ? parts : builtIn).push(part);
  }
  parts.push(...builtIn);

  // The hull itself stands for the armor: bare hull is the armor's clickable region, and it's
  // outlined whole when picked.
  for (const [id, color] of [
    [opts.hover, PAL.hudText],
    [opts.selected, PAL.white],
  ] as const) {
    if (id === 'armor') {
      g.lineStyle(1, hex(color), 1).strokePoints(
        L.hull.map(([x, y]) => ({ x: ox + x + (x < 100 ? -4 : 4), y: oy + y + (y < 100 ? -4 : 3) })) as Phaser.Math.Vector2[],
        true,
      );
      continue;
    }
    const p = parts.find((q) => q.id === id);
    if (p) frame({ x: p.box.x - 3, y: p.box.y - 3, w: p.box.w + 6, h: p.box.h + 6 }, color, 1);
  }
  return parts;
}

/** Whether a local point is on the hull (for picking the armor). */
export function onHull(chassis: ChassisId, x: number, y: number): boolean {
  const poly = LAYOUTS[chassis].hull;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Side-view placeholder for a weapon in a w×h mount box (front to the right). */
function drawWeapon(g: Phaser.GameObjects.Graphics, weapon: WeaponDef, x: number, y: number, w: number, h: number, dead: boolean): void {
  const body = dead ? PAL.ash : PAL.steelMid;
  const dark = dead ? PAL.hudBg : PAL.steelDark;
  const fill = (rx: number, ry: number, rw: number, rh: number, color: string) => g.fillStyle(hex(color)).fillRect(rx, ry, rw, rh);
  const spec = weapon.projectile;
  if (weapon.role === 'missile') {
    // A box of tubes with warheads showing at the front.
    fill(x, y, w, h, dark);
    const tubes = weapon.salvo && weapon.salvo.count >= 4 ? 3 : 2;
    const th = Math.floor((h - 2) / tubes);
    for (let i = 0; i < tubes; i++) {
      fill(x + 1, y + 1 + i * th, w - 4, th - 1, body);
      if (!dead) fill(x + w - 3, y + 1 + i * th, 2, th - 1, PAL.amber);
    }
    return;
  }
  if (spec.kind === 'intercept') {
    // A small dome with an emitter or twin barrels.
    g.fillStyle(hex(body)).fillCircle(x + w / 2, y + h, Math.min(w, h * 2) / 2);
    if (!dead) fill(x + w / 2 + 2, y + h - 4, 4, 2, weapon.category === 'energy' ? PAL.glow : PAL.steelHi);
    return;
  }
  if (spec.kind === 'pulse') {
    // A coil dish on a squat base, its core glowing.
    fill(x + 2, y + h - 4, w - 4, 4, body);
    g.fillStyle(hex(body)).fillCircle(x + w / 2, y + h - 6, Math.min(w, h * 2) / 2.5);
    if (!dead) g.fillStyle(hex(PAL.glow)).fillCircle(x + w / 2, y + h - 6, 2);
    return;
  }
  // Guns: a housing and a barrel. Main guns are long; lobbed guns point up and forward.
  const lobbed = spec.kind === 'shell' && spec.lobbed === true;
  fill(x, y + 2, w, h - 2, body);
  fill(x, y + 2, w, 2, dead ? PAL.ash : PAL.steelHi);
  if (dead) {
    fill(x + w, y + h / 2 - 1, 4, 3, PAL.ash);
    return;
  }
  const len = weapon.role === 'main' ? (lobbed ? 46 : 84) : weapon.role === 'auto' ? 10 : 18;
  const thick = weapon.role === 'main' ? (lobbed ? 7 : weapon.id === 'titanCannon' ? 6 : 4) : weapon.id === 'rotaryGun' ? 4 : 3;
  if (lobbed && weapon.role !== 'main') {
    // Mortar: a stubby tube angled up.
    g.lineStyle(thick + 1, hex(PAL.steelHi), 1).lineBetween(x + w / 2, y + 4, x + w - 1, y - 6);
    return;
  }
  fill(x + w, y + Math.floor(h / 2) - Math.floor(thick / 2), len, thick, PAL.steelHi);
  fill(x + w + len - 4, y + Math.floor(h / 2) - Math.floor(thick / 2) - 1, 4, thick + 2, PAL.steelMid);
  if (weapon.id === 'flakCannon') fill(x + w, y + Math.floor(h / 2) + 2, len - 2, 2, PAL.steelMid);
  // Energy weapons: a glowing lens (lasers) or a violet chamber (plasma).
  if (spec.kind === 'beam' || spec.kind === 'rail' || spec.kind === 'arc') fill(x + w + len - 2, y + Math.floor(h / 2) - Math.floor(thick / 2), 2, thick, PAL.glow);
  // Railguns and coilguns: coil clamps along the barrel. Arc weapons: amber insulator rings.
  if (spec.kind === 'rail' || spec.kind === 'arc') {
    for (let cx = x + w + 6; cx < x + w + len - 6; cx += 12) fill(cx, y + Math.floor(h / 2) - Math.floor(thick / 2) - 1, 2, thick + 2, spec.kind === 'rail' ? PAL.steelMid : PAL.amber);
  }
  // Thermobaric: a hazard band at the muzzle. A ballistic missile: its red nose in the tube.
  if (spec.kind === 'shell' && spec.incendiary) fill(x + w + len - 4, y + Math.floor(h / 2) - Math.floor(thick / 2) - 1, 2, thick + 2, PAL.amber);
  if (spec.kind === 'shell' && spec.vertical) fill(x + w + len - 3, y + Math.floor(h / 2) - Math.floor(thick / 2), 3, thick, PAL.enemy);
  if (spec.kind === 'shell' && spec.pool) fill(x + 2, y + 4, w - 4, h - 5, PAL.plasma);
  // Flamethrower: a rust-red fuel tank in the housing, a pilot light at the nozzle.
  if (spec.kind === 'flame') {
    fill(x + 2, y + 4, w - 4, h - 5, PAL.rust);
    fill(x + w + len - 2, y + Math.floor(h / 2) - Math.floor(thick / 2), 2, thick, PAL.ember);
  }
}

/** Side-view placeholder for a trailer module in its bay (front to the right). */
function drawModule(g: Phaser.GameObjects.Graphics, def: ModuleDef, x: number, y: number, w: number, h: number, dead: boolean): void {
  const fill = (rx: number, ry: number, rw: number, rh: number, color: string) => g.fillStyle(hex(color)).fillRect(rx, ry, rw, rh);
  const body = dead ? PAL.ash : PAL.steelMid;
  fill(x, y, w, h, dead ? PAL.hudBg : PAL.steelDark);
  fill(x + 1, y + 1, w - 2, h - 2, body);
  fill(x + 1, y + 1, w - 2, 1, dead ? PAL.ash : PAL.steelHi);
  if (dead) return;
  switch (def.kind) {
    case 'pod':
      // Tubes with warheads showing at the front.
      for (let ty = y + 3; ty < y + h - 3; ty += 5) {
        fill(x + 2, ty, w - 5, 3, PAL.steelDark);
        fill(x + w - 3, ty, 2, 3, PAL.amber);
      }
      break;
    case 'bunker':
      // A crate with hazard stripes.
      for (let sx = 0; sx < w - 2; sx += 4) fill(x + 1 + sx, y + 3, 2, 2, PAL.amber);
      fill(x + 3, y + 7, w - 6, h - 10, PAL.steel);
      fill(x + Math.floor(w / 2), y + 7, 1, h - 10, PAL.steelDark);
      break;
    case 'generator':
      // A glowing core between cooling fins.
      for (let fx = x + 2; fx < x + w - 2; fx += 3) fill(fx, y + 2, 1, h - 4, PAL.steelDark);
      g.fillStyle(hex(PAL.glowDim)).fillCircle(x + w / 2, y + h / 2, 5);
      g.fillStyle(hex(PAL.glow)).fillCircle(x + w / 2, y + h / 2, 2.5);
      break;
    case 'drones':
      // A launch deck with two drones parked under an open hatch.
      fill(x + 2, y + 2, w - 4, 2, PAL.steelDark);
      for (const dx of [0.3, 0.7]) {
        const cx = Math.round(x + w * dx);
        fill(cx - 3, y + 5, 7, 1, PAL.steelDark);
        fill(cx - 1, y + 6, 3, 2, PAL.steel);
        fill(cx, y + 6, 1, 1, PAL.glow);
      }
      fill(x + 2, y + h - 4, w - 4, 2, PAL.steelDark);
      break;
  }
}

function drawEmpty(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(hex(PAL.steelDark), 1).fillRect(x, y, w, h);
  g.fillStyle(hex(PAL.hudDim));
  for (let i = 0; i < w; i += 4) {
    g.fillRect(x + i, y, 2, 1);
    g.fillRect(x + i, y + h - 1, 2, 1);
  }
  for (let j = 0; j < h; j += 4) {
    g.fillRect(x, y + j, 1, 2);
    g.fillRect(x + w - 1, y + j, 1, 2);
  }
}

export function cutawaySize(chassis: ChassisId): { w: number; h: number } {
  const L = LAYOUTS[chassis];
  return { w: L.w, h: L.h };
}
