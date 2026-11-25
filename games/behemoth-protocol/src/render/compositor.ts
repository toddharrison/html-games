import Phaser from 'phaser';
import { ARMOR_ARCS, type ArmorArc } from '../content/chassis';
import type { WeaponId } from '../content/weapons';
import { addonOf, fraction, mountPosition, mountWorldAngle, treadIntegrity, type BehemothState, type HardpointState } from '../sim/behemoth';
import type { Arc } from '../sim/events';
import type { Pose } from './interp';
import { BH, MOUNT_ART, TURRET_ART, TURRET_BARREL } from './placeholder';
import { armorStage, BarrelHeat, heatColor, HEAT_VISIBLE } from './statusFx';
import { viewAngle, viewX, viewY } from './viewTransform';

type Part = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

/** An armor arc's plate: the sprites that shake and flash together when that arc is hit. */
interface Plate {
  parts: Part[];
  /** Each part's rest position in the hull. */
  rest: { x: number; y: number }[];
  /** Dents and scorch marks, one frame per wear stage (none on the plow, which shows its stub). */
  wear: Phaser.GameObjects.Image | null;
  /** The wear overlay's rest position across the hull (it sits at 0 along it). */
  y: number;
  /** Shakes along the hull (front, rear) or across it (the flank tread pods). */
  axis: 'x' | 'y';
  shake: number;
  flash: number;
}

interface Mount {
  index: number;
  img: Phaser.GameObjects.Image;
  /** Heat glow over the barrel; null for weapons that don't heat. */
  heat: Phaser.GameObjects.Image | null;
  weapon: WeaponId;
  /** On a turret ring (coax): drawn in the ring's rig, which turns it. */
  onRing: boolean;
}

/** A main gun's barrel out of a turret, and its heat glow. */
interface Barrel {
  /** The hardpoint slot it's the gun of. */
  slot: string;
  img: Phaser.GameObjects.Image;
  heat: Phaser.GameObjects.Image;
  /** Barrel texture (its stub is `<key>_stub`). */
  key: string;
  /** Where its root sits along the rig at rest (recoil pulls it back from here). */
  x: number;
  recoil: number;
}

/**
 * A turret ring's sprites: the turret and a barrel per main gun on it (the ring's own slot, and a
 * twin turret's second gun).
 */
interface Ring {
  rig: Phaser.GameObjects.Container;
  turret: Phaser.GameObjects.Image;
  barrels: Barrel[];
  /** Turret texture (its stub is `<key>_stub`). */
  key: string;
}

const SHAKE_SECONDS = 0.12;
const FLASH_SECONDS = 0.06;

function whiteOut(img: Part, on: boolean): void {
  if (on) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
  else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
}

/** Swap a texture only when it changes (setTexture also resets the frame and size). */
function retexture(img: Phaser.GameObjects.Image, key: string): void {
  if (img.texture.key !== key) img.setTexture(key);
}

/** Show a heat glow overlay for a heat level (0..1). */
function showHeat(img: Phaser.GameObjects.Image, heat: number): void {
  img.setVisible(heat > HEAT_VISIBLE);
  if (heat > HEAT_VISIBLE) img.setTint(heatColor(heat)).setAlpha(Math.min(0.9, 0.3 + heat));
}

/**
 * Assembles the Behemoth from independent component sprites (SPEC §11.2): tread pods, hull,
 * front and rear armor plates, reactor glow, weapon mounts, turret, and barrel, plus the add-ons
 * (outboard pods, ram plow, sponson housings), built for what's bolted on at the start of the battle
 * (add-ons only change at depots). Each part shows
 * its own state (SPEC §11.3): a hit arc's plate shakes and flashes, armor wears with dents and
 * scorch marks, barrels glow with heat, and destroyed weapons are charred stubs.
 */
export class BehemothView {
  readonly root: Phaser.GameObjects.Container;
  /** Every tread pod sprite (inner pair, then any outboard pair), for the link animation. */
  private readonly treads: Phaser.GameObjects.Sprite[];
  /** Where the back of each pod sits in the hull. */
  private readonly treadRest: { x: number; y: number }[];
  /** The ram plow, if fitted. */
  private readonly plow: Phaser.GameObjects.Image | null;
  /** Blowout panels, if fitted: plates that blow off when the magazine cooks off. */
  private readonly panels: Phaser.GameObjects.Image[];
  private readonly hull: Phaser.GameObjects.Image;
  private readonly plates: Record<ArmorArc, Plate>;
  /** The plow shakes and flashes when it rams something (fire never touches it). */
  private readonly plowPlate: Plate | null;
  private readonly glow: Phaser.GameObjects.Image;
  /** One per turret ring, in `b.turrets` order. */
  private readonly rings: Ring[];
  /** Own-mount weapons (not on a turret), by hardpoint index. */
  private readonly mounts: Mount[] = [];
  private readonly heat = new BarrelHeat();

  private treadDist = 0;
  private lastX: number;
  private lastY: number;
  /** Hits from above shake and flash the whole hull. */
  private hullFlash = 0;
  private hullShake = 0;
  /** What was last drawn: the interpolated pose, ring angles, and own-mount angles (for `drawnMuzzle`). */
  private drawn: { at: Pose; rings: readonly number[]; mounts: readonly number[] } | null = null;

  constructor(scene: Phaser.Scene, b: BehemothState) {
    // The bottom tread is the top one mirrored, so both show their links on the outer edge.
    const inner = [-1, 1].map((side) => scene.add.sprite(0, side * BH.treadOffset, 'bh_tread', 0).setFlipY(side > 0));
    const outerAt = b.chassis.addonMounts.outerTreads?.anchors[0]?.y;
    const outer =
      addonOf(b, 'outerTreads') && outerAt !== undefined
        ? [-1, 1].map((side) => scene.add.sprite(0, side * Math.abs(outerAt), 'bh_tread_outer', 0).setFlipY(side > 0))
        : [];
    this.treads = [...inner, ...outer];
    this.treadRest = this.treads.map((t) => ({ x: -t.width / 2 + 2, y: t.y }));
    const sideWear = inner.map((t) => scene.add.image(0, t.y, 'bh_wear_side', 0).setFlipY(t.flipY).setVisible(false));
    this.hull = scene.add.image(0, 0, 'bh_hull');
    const plate = (key: 'frontLeft' | 'frontRight' | 'rear') => scene.add.image(0, 0, `bh_plate_${key}`);
    const wear = (key: 'frontLeft' | 'frontRight' | 'rear') => scene.add.image(0, 0, `bh_wear_${key}`, 0).setVisible(false);
    const [rearPlate, rearWear] = [plate('rear'), wear('rear')];
    const [leftPlate, leftWear, rightPlate, rightWear] = [plate('frontLeft'), wear('frontLeft'), plate('frontRight'), wear('frontRight')];
    this.plow = addonOf(b, 'ramPlow') ? scene.add.image(BH.plow.x, 0, 'bh_plow') : null;
    const panelsAt = addonOf(b, 'blowoutPanels') ? (b.chassis.addonMounts.blowoutPanels?.anchors ?? []) : [];
    this.panels = panelsAt.map((p) => scene.add.image(p.x, p.y, 'bh_panel'));
    // Parts sit at their own offset across the hull; the plate shakes them all together.
    const plateOf = (parts: Part[], wear: Phaser.GameObjects.Image | null, axis: 'x' | 'y'): Plate => ({
      parts,
      rest: parts.map((p) => ({ x: p.x, y: p.y })),
      wear,
      y: wear?.y ?? 0,
      axis,
      shake: 0,
      flash: 0,
    });
    const flank = (i: 0 | 1) => plateOf([inner[i]!, ...(outer[i] ? [outer[i]] : [])], sideWear[i]!, 'y');
    this.plates = {
      frontLeft: plateOf([leftPlate], leftWear, 'x'),
      frontRight: plateOf([rightPlate], rightWear, 'x'),
      rear: plateOf([rearPlate], rearWear, 'x'),
      left: flank(0),
      right: flank(1),
    };
    this.plowPlate = this.plow ? plateOf([this.plow], null, 'x') : null;
    this.glow = scene.add.image(-BH.hull.w / 2 + 9.5, 0, 'bh_glow').setBlendMode(Phaser.BlendModes.ADD);
    this.rings = b.turrets.map((t) => {
      // Every L slot on the ring holds a main gun, drawn as a barrel out of the turret from where
      // the slot sits (a twin turret's two lie either side of the centerline).
      const guns = b.hardpoints.filter((h) => h.slot.ring === t.def.id && h.slot.size === 'L');
      const barrels: Barrel[] = guns.flatMap((h) => {
        if (!h.weapon) return [];
        const key = TURRET_BARREL[h.weapon.id]?.key ?? 'bh_barrel';
        const x = BH.barrelRoot + h.slot.mount.x - t.def.pivot.x;
        const y = h.slot.mount.y - t.def.pivot.y;
        const img = scene.add.image(x, y, key).setOrigin(0, 0.5);
        const heat = scene.add.image(x, y, `${key}_heat`).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        return [{ slot: h.slot.id, img, heat, key, x, recoil: 0 }];
      });
      const turretKey = guns.length > 1 ? 'bh_turret_twin' : (TURRET_ART[t.def.id] ?? 'bh_turret');
      const turret = scene.add.image(0, 0, turretKey);
      const rig = scene.add.container(t.def.pivot.x, t.def.pivot.y, [...barrels.flatMap((g) => [g.img, g.heat]), turret]);
      return { rig, turret, barrels, key: turretKey };
    });
    // Sponson housings sit under whatever their slot carries (or nothing). Turret rings need none.
    const housings = b.hardpoints
      .filter((h) => h.slot.ring === undefined && b.chassis.addonMounts[h.slot.id as keyof typeof b.chassis.addonMounts]?.hardpoint?.id === h.slot.id)
      .map((h) => scene.add.image(h.slot.mount.x, h.slot.mount.y, 'bh_sponson'));
    b.hardpoints.forEach((h, index) => {
      // A turret's main guns are its barrels; pods are drawn with the trailer.
      if (!h.weapon || h.slot.position === 'trailer' || (h.slot.ring !== undefined && h.slot.size === 'L')) return;
      // Other ring slots (coax) sit on the turret, placed relative to its pivot.
      const ringIndex = b.turrets.findIndex((t) => t.def.id === h.slot.ring);
      const pivot = ringIndex >= 0 ? b.turrets[ringIndex]!.def.pivot : { x: 0, y: 0 };
      const art = MOUNT_ART[h.weapon.id];
      const key = `wpn_${h.weapon.id}`;
      const at = (k: string) => scene.add.image(h.slot.mount.x - pivot.x, h.slot.mount.y - pivot.y, k).setOrigin(art?.pivotX ?? 0.5, 0.5);
      const img = at(key);
      const heat = scene.textures.exists(`${key}_heat`) ? at(`${key}_heat`).setBlendMode(Phaser.BlendModes.ADD).setVisible(false) : null;
      if (ringIndex >= 0) this.rings[ringIndex]!.rig.add(heat ? [img, heat] : [img]);
      this.mounts.push({ index, img, heat, weapon: h.weapon.id, onRing: ringIndex >= 0 });
    });
    this.root = scene.add.container(viewX(b.x, b.y), viewY(b.x), [
      ...outer,
      inner[0]!,
      sideWear[0]!,
      inner[1]!,
      sideWear[1]!,
      this.hull,
      rearPlate,
      rearWear,
      leftPlate,
      leftWear,
      rightPlate,
      rightWear,
      ...(this.plow ? [this.plow] : []),
      ...this.panels,
      this.glow,
      ...housings,
      ...this.mounts.filter((m) => !m.onRing).flatMap((m) => (m.heat ? [m.img, m.heat] : [m.img])),
      // Main ring first: the dorsal ring is raised to fire over it, so it draws on top.
      ...this.rings.map((r) => r.rig),
    ]);
    this.lastX = b.x;
    this.lastY = b.y;
  }

  /** A player weapon fired from `slot`: a turret's main gun recoils, and the barrel heats up. */
  onFire(slot: string, weapon: WeaponId): void {
    for (const r of this.rings) for (const g of r.barrels) if (g.slot === slot) g.recoil = 1;
    this.heat.onFire(slot, weapon);
  }

  /** A hit on an arc shakes and flashes that plate; a hit from above, the whole hull. */
  onHit(arc: Arc): void {
    if (arc === 'top') {
      this.hullFlash = FLASH_SECONDS;
      this.hullShake = SHAKE_SECONDS;
      return;
    }
    this.plates[arc].shake = SHAKE_SECONDS;
    this.plates[arc].flash = FLASH_SECONDS;
  }

  /** Rammed something solid: the plow, if fitted, takes the jolt. */
  onRam(): void {
    if (!this.plowPlate) return;
    this.plowPlate.shake = SHAKE_SECONDS;
    this.plowPlate.flash = FLASH_SECONDS;
  }

  /**
   * @param at interpolated pose to draw at.
   * @param rings interpolated angle of each turret ring relative to the hull, in `b.turrets` order.
   * @param mounts interpolated angle of each own-mount weapon relative to the hull, in `b.hardpoints` order.
   */
  update(b: BehemothState, at: Pose, rings: readonly number[], mounts: readonly number[], dt: number, time: number): void {
    this.root.setVisible(!b.destroyed);
    this.drawn = { at, rings, mounts };
    if (b.destroyed) return;
    this.root.setPosition(viewX(at.x, at.y), viewY(at.x));
    this.root.rotation = viewAngle(at.heading);
    this.heat.step(dt);

    // Destroyed weapons are charred stubs; working ones glow with heat under sustained fire.
    // A ring with no gun on it shows a whole turret and no barrel; the turret chars once every
    // gun it carries is wrecked.
    for (const [i, r] of this.rings.entries()) {
      r.rig.rotation = rings[i] ?? 0;
      let wrecked = r.barrels.length > 0;
      for (const g of r.barrels) {
        const dead = (b.hardpoints.find((hp) => hp.slot.id === g.slot)?.integrity.hp ?? 0) <= 0;
        wrecked &&= dead;
        retexture(g.img, dead ? `${g.key}_stub` : g.key);
        showHeat(g.heat, dead ? 0 : this.heat.get(g.slot));
        // Barrel recoil: snaps back, eases forward.
        g.recoil = Math.max(0, g.recoil - dt / 0.4);
        g.img.x = g.x - 5 * g.recoil * g.recoil;
        g.heat.x = g.img.x;
      }
      retexture(r.turret, wrecked ? `${r.key}_stub` : r.key);
    }
    if (this.plow) retexture(this.plow, (addonOf(b, 'ramPlow')?.integrity?.hp ?? 0) > 0 ? 'bh_plow' : 'bh_plow_stub');
    const panelsOn = (addonOf(b, 'blowoutPanels')?.integrity?.hp ?? 0) > 0;
    for (const p of this.panels) retexture(p, panelsOn ? 'bh_panel' : 'bh_panel_open');
    for (const m of this.mounts) {
      const h = b.hardpoints[m.index]!;
      const dead = h.integrity.hp <= 0;
      // A ring mount turns with its rig.
      const angle = m.onRing ? 0 : (mounts[m.index] ?? h.angle);
      m.img.rotation = angle;
      retexture(m.img, dead ? `wpn_${m.weapon}_stub` : `wpn_${m.weapon}`);
      if (m.heat) {
        m.heat.rotation = angle;
        showHeat(m.heat, dead ? 0 : this.heat.get(h.slot.id));
      }
    }

    // Tread links advance with ground distance, so their animation speed matches ground speed.
    this.treadDist += Math.hypot(at.x - this.lastX, at.y - this.lastY);
    this.lastX = at.x;
    this.lastY = at.y;
    const frame = Math.floor(this.treadDist) % BH.tread.frames;
    for (const t of this.treads) t.setFrame(frame);
    const judder = treadIntegrity(b) < 0.35 && b.vx > 1 && Math.random() < 0.25 ? 1 : 0;

    // Reactor critical: the hull strobes white-hot, faster as the fuse burns down.
    const fuse = b.reactorFuse;
    const strobe = fuse !== null && Math.floor(time * (fuse < 0.5 ? 20 : 8)) % 2 === 0;
    this.hullFlash = Math.max(0, this.hullFlash - dt);
    this.hullShake = Math.max(0, this.hullShake - dt);
    if (fuse !== null) this.hullShake = Math.max(this.hullShake, 0.05);
    const jolt = () => (Math.random() < 0.5 ? -1 : 1);
    const hullX = this.hullShake > 0 ? jolt() : 0;
    const allWhite = this.hullFlash > 0 || strobe;
    whiteOut(this.hull, allWhite);
    this.hull.x = hullX;

    // Each armor arc: its plate shakes 1 px and flashes white when hit, and wears as it's worn down.
    const plates: [Plate, number][] = ARMOR_ARCS.map((arc) => [this.plates[arc], fraction(b.armor[arc])]);
    if (this.plowPlate) plates.push([this.plowPlate, 1]);
    for (const [p, integrity] of plates) {
      p.shake = Math.max(0, p.shake - dt);
      p.flash = Math.max(0, p.flash - dt);
      let dx = hullX;
      let dy = 0;
      if (p.shake > 0) p.axis === 'x' ? (dx += jolt()) : (dy += jolt());
      if (p.axis === 'y') dy += (p.y < 0 ? -1 : 1) * judder;
      const stage = armorStage(integrity);
      p.wear?.setVisible(stage > 0).setPosition(dx, p.y + dy);
      if (stage > 0) p.wear?.setFrame(stage - 1);
      for (const [i, part] of p.parts.entries()) {
        part.setPosition(p.rest[i]!.x + dx, p.rest[i]!.y + dy);
        whiteOut(part, allWhite || p.flash > 0);
      }
      if (p.wear) whiteOut(p.wear, allWhite || p.flash > 0);
    }

    // Reactor glow pulses with the capacitor's charge; flickers when the reactor is badly hurt or
    // the capacitor runs dry; blazes when it's going.
    const charge = b.power.max > 0 ? b.power.stored / b.power.max : 0;
    const sputter = (fraction(b.reactor) < 0.3 || charge < 0.1) && Math.random() < 0.15;
    if (fuse !== null) this.glow.setScale(1.5 + Math.random()).setAlpha(1);
    else this.glow.setScale(1).setAlpha(sputter ? 0.2 : 0.35 + 0.35 * charge + 0.15 * Math.sin(time * 2.5));
  }

  /**
   * Sim position and angle of the muzzle of the turret gun in `slot` (for muzzle flash placement),
   * at the tip of the drawn barrel; null if `slot` isn't a turret slot.
   */
  muzzle(b: BehemothState, slot: string): { x: number; y: number; angle: number } | null {
    const h = b.hardpoints.find((hp) => hp.slot.id === slot);
    const ring = h && b.turrets.find((t) => t.def.id === h.slot.ring);
    if (!h || !ring) return null;
    const p = mountPosition(b, h);
    const angle = b.heading + ring.angle;
    const len = BH.barrelRoot + (h.weapon ? (TURRET_BARREL[h.weapon.id]?.w ?? BH.barrel.w) : BH.barrel.w);
    return { x: p.x + Math.cos(angle) * len, y: p.y + Math.sin(angle) * len, angle };
  }

  /**
   * Sim position and angle of the muzzle of the weapon in `slot` as it was last drawn (the
   * interpolated hull, rings, and mounts), so a beam drawn from it stays fixed to the barrel between
   * sim steps. A turret gun's muzzle is the tip of its drawn barrel; any other, its weapon's `muzzle`.
   */
  drawnMuzzle(b: BehemothState, slot: string): { x: number; y: number; angle: number } | null {
    const i = b.hardpoints.findIndex((hp) => hp.slot.id === slot);
    const h = b.hardpoints[i];
    if (!h?.weapon || !this.drawn) return null;
    const { at, rings, mounts } = this.drawn;
    const posed: BehemothState = { ...b, x: at.x, y: at.y, heading: at.heading, turrets: b.turrets.map((t, j) => ({ ...t, angle: rings[j] ?? t.angle })) };
    const ph: HardpointState = { ...h, angle: mounts[i] ?? h.angle };
    const p = mountPosition(posed, ph);
    const angle = mountWorldAngle(posed, ph);
    const barrel = h.slot.ring !== undefined ? TURRET_BARREL[h.weapon.id] : undefined;
    const len = barrel ? BH.barrelRoot + barrel.w : h.weapon.muzzle;
    return { x: p.x + Math.cos(angle) * len, y: p.y + Math.sin(angle) * len, angle };
  }

  /** Rear of each tread pod in sim space, for track marks and dust. */
  treadRears(b: BehemothState): { x: number; y: number }[] {
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    return this.treadRest.map(({ x: lx, y: ly }) => ({ x: b.x + lx * c - ly * s, y: b.y + lx * s + ly * c }));
  }
}

/** Ring buffer of tread-mark decals stamped behind the treads as the Behemoth moves. */
export class TrackMarks {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private next = 0;
  private sinceLast = 0;
  private lastX: number | null = null;
  private lastY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly capacity: number,
    private readonly spacing = 3,
  ) {}

  /** @param wet whether a point is in water, where the treads leave no marks. */
  update(view: BehemothView, b: BehemothState, wet: (x: number, y: number) => boolean): void {
    if (this.lastX !== null) this.sinceLast += Math.hypot(b.x - this.lastX, b.y - this.lastY);
    this.lastX = b.x;
    this.lastY = b.y;
    while (this.sinceLast >= this.spacing) {
      this.sinceLast -= this.spacing;
      for (const p of view.treadRears(b)) if (!wet(p.x, p.y)) this.stamp(p.x, p.y, b.heading);
    }
  }

  private stamp(x: number, y: number, rotation: number): void {
    let img = this.pool[this.next];
    if (!img) {
      img = this.scene.add.image(x, y, 'trackmark').setDepth(1);
      this.pool[this.next] = img;
    }
    img.setPosition(viewX(x, y), viewY(x)).setRotation(viewAngle(rotation));
    this.next = (this.next + 1) % this.capacity;
  }
}
