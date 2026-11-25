import type { AddonId } from '../content/addons';
import type { WeaponId } from '../content/weapons';
import { fraction, isCore, type BehemothState, type ComponentId, type Integrity } from '../sim/behemoth';
import type { Pose } from './interp';

/**
 * The machine shows its state (SPEC §11.3): damage levels per component, armor wear stages,
 * barrel heat, and the sparks/smoke/fire each damaged component gives off. Render-only and
 * Phaser-free, so it can be unit tested; the Phaser side lives in the compositor and effects.
 */

export type DamageLevel = 'ok' | 'amber' | 'red' | 'critical' | 'destroyed';

/** Integrity at or below which a component reaches each level. The HUD colors use the same. */
export const DAMAGE_LEVELS = { amber: 0.6, red: 0.3, critical: 0.15 } as const;

export function damageLevel(frac: number): DamageLevel {
  if (frac <= 0) return 'destroyed';
  if (frac <= DAMAGE_LEVELS.critical) return 'critical';
  if (frac <= DAMAGE_LEVELS.red) return 'red';
  if (frac <= DAMAGE_LEVELS.amber) return 'amber';
  return 'ok';
}

/** Dents and scorch marks on an armor plate build up in this many stages as it wears down. */
export const ARMOR_STAGES = 4;
const ARMOR_STAGE_BELOW = [0.8, 0.6, 0.4, 0.2];

/** 0 = clean plate, up to `ARMOR_STAGES` = battered. */
export function armorStage(frac: number): number {
  return ARMOR_STAGE_BELOW.filter((t) => frac < t).length;
}

// ---------------------------------------------------------------------------------------------
// Barrel heat (cosmetic only for now: SPEC §16 Q3)

/** Heat each shot adds (1 = glowing bright orange). Weapons not listed don't glow. */
export const HEAT_PER_SHOT: Partial<Record<WeaponId, number>> = {
  heavyCannon: 0.22,
  titanCannon: 0.3,
  siegeHowitzer: 0.3,
  autocannon: 0.045,
  rotaryGun: 0.012,
  flakCannon: 0.06,
  apGuns: 0.022,
  heavyLaser: 0.25,
  beamLaser: 0.008,
  plasmaThrower: 0.08,
  flamethrower: 0.012,
  railgun: 0.3,
  coilgun: 0.07,
  thermobaric: 0.06,
};
/** Heat lost per second. Sustained fire outpaces it; a few shots don't. */
export const HEAT_COOL_PER_SEC = 0.1;
/** Below this the barrel shows no glow. */
export const HEAT_VISIBLE = 0.08;

/** Heat per hardpoint slot, from the fire events it has made. */
export class BarrelHeat {
  private readonly heat = new Map<string, number>();

  onFire(slot: string, weapon: WeaponId): void {
    const add = HEAT_PER_SHOT[weapon];
    if (add) this.heat.set(slot, Math.min(1, this.get(slot) + add));
  }

  step(dt: number): void {
    for (const [slot, h] of this.heat) this.heat.set(slot, Math.max(0, h - HEAT_COOL_PER_SEC * dt));
  }

  get(slot: string): number {
    return this.heat.get(slot) ?? 0;
  }
}

const HEAT_RAMP: [number, number, number][] = [
  [0x50, 0x14, 0x0a],
  [0xa8, 0x30, 0x12],
  [0xe8, 0x70, 0x22],
];

/** Glow tint for a heat level: dull red when warm, bright orange when hot. */
export function heatColor(heat: number): number {
  const t = Math.min(1, Math.max(0, heat)) * (HEAT_RAMP.length - 1);
  const i = Math.min(HEAT_RAMP.length - 2, Math.floor(t));
  const a = HEAT_RAMP[i]!;
  const b = HEAT_RAMP[i + 1]!;
  const f = t - i;
  const ch = (k: number) => Math.round(a[k]! + (b[k]! - a[k]!) * f);
  return (ch(0) << 16) | (ch(1) << 8) | ch(2);
}

// ---------------------------------------------------------------------------------------------
// Component positions and damage emissions

export interface Point {
  x: number;
  y: number;
}

interface StatusComponent {
  id: ComponentId;
  integrity: Integrity;
  /** Hull-space points it emits from. */
  anchors: readonly Point[];
  /** Core components stay part of the hull when destroyed (and keep burning); weapons char. */
  core: boolean;
  /** Anchors are in trailer space, not hull space. */
  onTrailer?: boolean;
}

function statusComponents(b: BehemothState): StatusComponent[] {
  const out: StatusComponent[] = (['treads', 'sensors', 'fireControl', 'magazine', 'reactor'] as const).map((id) => ({
    id,
    integrity: b[id],
    anchors: b.chassis.anchors[id],
    core: true,
  }));
  for (const h of b.hardpoints) {
    if (h.weapon && h.slot.position !== 'trailer') out.push({ id: h.slot.id, integrity: h.integrity, anchors: [h.slot.mount], core: false });
  }
  // Add-ons with parts of their own. Wrecked tread pods stay on and burn like the built-in ones;
  // a wrecked ram plow is a charred blade that smolders.
  for (const a of b.addons) {
    const anchors = b.chassis.addonMounts[a.def.id]?.anchors;
    if (a.integrity && anchors && a.def.kind !== 'trailer') out.push({ id: a.def.id, integrity: a.integrity, anchors, core: a.def.kind === 'treads' });
  }
  // The trailer in tow: its frame along the bed, each module in its bay.
  const t = b.trailer;
  if (t?.status === 'hitched') {
    const half = t.def.length / 2 - 3;
    out.push({ id: 'trailer', integrity: t.frame, anchors: [{ x: -half, y: 0 }, { x: half, y: 0 }], core: true, onTrailer: true });
    t.bays.forEach((bay, i) => {
      if (bay) out.push({ id: `bay${i}`, integrity: bay.integrity, anchors: [t.def.bays[i]!], core: false, onTrailer: true });
    });
  }
  return out;
}

/**
 * Hull-space points of a component (core component, hardpoint slot id, or add-on id). Trailer
 * parts are placed by the trailer's own pose instead (`trailerPartAt`).
 */
export function componentAnchors(b: BehemothState, id: ComponentId): readonly Point[] {
  if (isCore(id)) return b.chassis.anchors[id];
  const h = b.hardpoints.find((hp) => hp.slot.id === id);
  if (h) return [h.slot.mount];
  return b.chassis.addonMounts[id as AddonId]?.anchors ?? [{ x: 0, y: 0 }];
}

/** Where a trailer part (its frame, or a bay) sits in sim coordinates; null for parts not on it. */
export function trailerPartAt(b: BehemothState, id: ComponentId): Point | null {
  const t = b.trailer;
  if (!t) return null;
  if (id === 'trailer') return { x: t.x, y: t.y };
  const m = /^bay(\d)$/.exec(id);
  const at = m ? t.def.bays[Number(m[1])] : undefined;
  if (!at) return null;
  const c = Math.cos(t.heading);
  const s = Math.sin(t.heading);
  return { x: t.x + at.x * c - at.y * s, y: t.y + at.x * s + at.y * c };
}

/** A hull-space point in sim coordinates, for a hull drawn at `at`. */
export function hullToSim(at: Pose, p: Point): Point {
  const c = Math.cos(at.heading);
  const s = Math.sin(at.heading);
  return { x: at.x + p.x * c - p.y * s, y: at.y + p.x * s + p.y * c };
}

/** What the component effects draw with (implemented by `Effects`). Sim coordinates. */
export interface StatusEmitter {
  sparks(x: number, y: number): void;
  smokePuff(x: number, y: number): void;
  heavySmoke(x: number, y: number): void;
  flame(x: number, y: number): void;
  ember(x: number, y: number): void;
}

type Emission = keyof StatusEmitter;
type Interval = readonly [min: number, max: number];
type Emissions = Record<DamageLevel, Partial<Record<Emission, Interval>>>;

const KINDS: readonly Emission[] = ['sparks', 'smokePuff', 'heavySmoke', 'flame', 'ember'];

/**
 * Seconds between emissions per damage level (SPEC §11.3): amber sparks and wisps of smoke, red
 * pours black smoke, critical burns with embers lifting off. A charred weapon stub smolders.
 */
export const EMISSIONS: Emissions = {
  ok: {},
  amber: { sparks: [0.35, 0.9], smokePuff: [0.35, 0.8] },
  red: { sparks: [0.22, 0.6], smokePuff: [0.07, 0.16], heavySmoke: [0.25, 0.5] },
  critical: { sparks: [0.12, 0.35], smokePuff: [0.05, 0.1], heavySmoke: [0.1, 0.2], flame: [0.025, 0.06], ember: [0.06, 0.16] },
  destroyed: { smokePuff: [0.2, 0.5], heavySmoke: [0.5, 1.1] },
};

/**
 * Damaged enemy vehicles (SPEC §11.3): the same escalation on a smaller scale, so a tank that's
 * been hit shows it. Troops don't use this (a squad thins out instead).
 */
export const UNIT_EMISSIONS: Emissions = {
  ok: {},
  amber: { sparks: [0.6, 1.5], smokePuff: [0.4, 0.9] },
  red: { sparks: [0.4, 1], smokePuff: [0.12, 0.25], heavySmoke: [0.5, 1] },
  critical: { sparks: [0.25, 0.6], smokePuff: [0.08, 0.16], heavySmoke: [0.2, 0.4], flame: [0.05, 0.12], ember: [0.15, 0.35] },
  destroyed: {},
};

/**
 * Runs emission timers per key: each kind fires at a random interval for the level it's at. A key
 * that newly starts a kind begins at a random point in its cycle, so parts don't pulse in step.
 */
class EmissionTimers {
  private readonly timers = new Map<string, number>();

  constructor(private readonly random: () => number) {}

  /** Calls `emit` for each emission due this frame. */
  run(key: string, rates: Partial<Record<Emission, Interval>>, dt: number, emit: (kind: Emission) => void): void {
    for (const kind of KINDS) {
      const k = `${key}:${kind}`;
      const interval = rates[kind];
      if (!interval) {
        this.timers.delete(k);
        continue;
      }
      let t = (this.timers.get(k) ?? this.between(interval) * this.random()) - dt;
      while (t <= 0) {
        emit(kind);
        t += this.between(interval);
      }
      this.timers.set(k, t);
    }
  }

  /** Forget keys not in `live` (units that are gone). */
  prune(live: Set<string>): void {
    for (const k of this.timers.keys()) if (!live.has(k.slice(0, k.lastIndexOf(':')))) this.timers.delete(k);
  }

  between([min, max]: Interval): number {
    return min + (max - min) * this.random();
  }
}

/** How far from its anchor (hull-space units, ±) an emission can land. */
const JITTER: Partial<Record<ComponentId, Point>> = { treads: { x: 8, y: 1.5 }, outerTreads: { x: 8, y: 1 }, ramPlow: { x: 1.5, y: 4 } };
const DEFAULT_JITTER: Point = { x: 1.5, y: 1.5 };

/** The level a component shows: destroyed core parts stay on the hull, burning. */
export function visualLevel(frac: number, core: boolean): DamageLevel {
  const level = damageLevel(frac);
  return level === 'destroyed' && core ? 'critical' : level;
}

/** Emits each damaged component's sparks, smoke, and fire from where it sits on the hull. */
export class ComponentFx {
  private readonly timers: EmissionTimers;

  constructor(private readonly random: () => number = Math.random) {
    this.timers = new EmissionTimers(random);
  }

  /** @param trailerAt the trailer's drawn pose, for its parts (they're skipped without one). */
  update(b: BehemothState, at: Pose, dt: number, out: StatusEmitter, trailerAt?: Pose): void {
    if (b.destroyed) return;
    for (const c of statusComponents(b)) {
      const frame = c.onTrailer ? trailerAt : at;
      if (!frame) continue;
      this.timers.run(c.id, EMISSIONS[visualLevel(fraction(c.integrity), c.core)], dt, (kind) => {
        const s = hullToSim(frame, this.pointOn(c));
        out[kind](s.x, s.y);
      });
    }
  }

  private pointOn(c: StatusComponent): Point {
    const a = c.anchors[Math.floor(this.random() * c.anchors.length)] ?? { x: 0, y: 0 };
    const j = JITTER[c.id] ?? DEFAULT_JITTER;
    return { x: a.x + (this.random() * 2 - 1) * j.x, y: a.y + (this.random() * 2 - 1) * j.y };
  }
}

/** An enemy vehicle as the damage effects see it: where it's drawn and the hp it has left. */
export interface UnitStatus {
  id: number;
  x: number;
  y: number;
  /** Hit points left, 0–1. */
  frac: number;
  /** Body radius, for scattering emissions over the hull. */
  radius: number;
}

/** Emits sparks, smoke, and fire off damaged enemy vehicles (`UNIT_EMISSIONS`). */
export class UnitFx {
  private readonly timers: EmissionTimers;

  constructor(private readonly random: () => number = Math.random) {
    this.timers = new EmissionTimers(random);
  }

  update(units: readonly UnitStatus[], dt: number, out: StatusEmitter): void {
    const live = new Set<string>();
    for (const u of units) {
      const key = String(u.id);
      live.add(key);
      this.timers.run(key, UNIT_EMISSIONS[damageLevel(u.frac)], dt, (kind) => {
        const r = u.radius * 0.6;
        out[kind](u.x + (this.random() * 2 - 1) * r, u.y + (this.random() * 2 - 1) * r);
      });
    }
    this.timers.prune(live);
  }
}
