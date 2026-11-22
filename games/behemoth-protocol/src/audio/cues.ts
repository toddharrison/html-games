import { ENEMIES } from '../content/enemies';
import type { ObstacleClass } from '../content/obstacles';
import { MATERIALS } from '../content/terrain';
import type { WeaponId } from '../content/weapons';
import { component, fraction, speedLimits, type BehemothState, type PlayerCommand } from '../sim/behemoth';
import type { SimEvent } from '../sim/events';
import { damageLevel, type DamageLevel } from '../render/statusFx';
import { viewX } from '../render/viewTransform';

/**
 * What the battle sounds like (SPEC §11.4), worked out from sim events and state. Pure and free
 * of Web Audio, so it can be unit tested; `synth.ts` turns cues into sound.
 */

/** One-shot sounds. Each has a recipe in `synth.ts`; `size` scales it (caliber, blast radius, hit weight). */
export type SoundId =
  | 'cannon'
  | 'autocannon'
  | 'rotary'
  | 'mortar'
  | 'missile'
  | 'rocket'
  | 'pulseLaser'
  | 'heavyLaser'
  | 'plasmaShot'
  | 'airburst'
  | 'explosion'
  | 'plasmaSplash'
  | 'splash'
  | 'impact'
  | 'pierce'
  | 'ricochet'
  | 'hullHit'
  | 'vehicleKill'
  | 'crush'
  | 'wood'
  | 'collapse'
  | 'ram'
  | 'clank'
  | 'droneLost'
  | 'revive'
  | 'componentBlown'
  | 'immobilized'
  | 'alarm'
  | 'missileWarning'
  | 'horn'
  | 'radio'
  | 'detonation';

/** Sustained sounds that keep going while their events keep coming, and fade once they stop. */
export type HoldId = 'beam' | 'scrape' | 'burn';

export interface Cue {
  sound: SoundId | HoldId;
  /** Scales the sound: roughly 0–1, more for the biggest blasts. */
  size: number;
  /** Where it happened (sim coordinates). Missing = on board the Behemoth (alarms, internal clanks). */
  x?: number;
  y?: number;
}

export const HOLDS: ReadonlySet<string> = new Set<HoldId>(['beam', 'scrape', 'burn']);

/** Every weapon's report. A Record, so a new weapon doesn't compile until it has one. */
export const WEAPON_SOUNDS: Record<WeaponId, { sound: SoundId | HoldId; size: number }> = {
  heavyCannon: { sound: 'cannon', size: 0.8 },
  siegeHowitzer: { sound: 'cannon', size: 1 },
  autocannon: { sound: 'autocannon', size: 0.6 },
  rotaryGun: { sound: 'rotary', size: 0.5 },
  flakCannon: { sound: 'autocannon', size: 0.9 },
  missileRack: { sound: 'missile', size: 0.6 },
  podMissiles: { sound: 'missile', size: 0.45 },
  bunkerBuster: { sound: 'missile', size: 1 },
  mortar: { sound: 'mortar', size: 0.7 },
  apGuns: { sound: 'rotary', size: 0.3 },
  pdLaser: { sound: 'pulseLaser', size: 0.2 },
  pdGuns: { sound: 'rotary', size: 0.25 },
  pulseLaser: { sound: 'pulseLaser', size: 0.45 },
  beamLaser: { sound: 'beam', size: 0.6 },
  heavyLaser: { sound: 'heavyLaser', size: 1 },
  plasmaThrower: { sound: 'plasmaShot', size: 0.7 },
  lightTankGun: { sound: 'cannon', size: 0.3 },
  heavyTankGun: { sound: 'cannon', size: 0.55 },
  infantryRockets: { sound: 'rocket', size: 0.4 },
  launcherMissiles: { sound: 'missile', size: 0.5 },
  emplacementGun: { sound: 'cannon', size: 0.75 },
  bunkerRockets: { sound: 'rocket', size: 0.5 },
  towerGuns: { sound: 'autocannon', size: 0.4 },
  hoverGun: { sound: 'autocannon', size: 0.3 },
};

const RAM_SIZE: Record<ObstacleClass, number> = { none: 0, soft: 0, trivial: 0, light: 0.3, medium: 0.6, heavy: 1, trap: 0.45, immovable: 0.8 };

/** Blast radius (units) that counts as size 1. */
const BLAST_UNIT = 30;

export interface CueContext {
  tileSize: number;
  /** Whether a point is in a river. */
  wet(x: number, y: number): boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The sounds one sim event makes. Stateless; component alarms are `AlarmWatch`'s job. */
export function cuesFor(ev: SimEvent, ctx: CueContext): Cue[] {
  switch (ev.type) {
    case 'fire': {
      const s = WEAPON_SOUNDS[ev.weapon];
      const out: Cue[] = [{ sound: s.sound, size: s.size, x: ev.x, y: ev.y }];
      // Incoming guided missiles: a lock tone in the cab.
      if (ev.owner === 'enemy' && s.sound === 'missile') out.push({ sound: 'missileWarning', size: 1 });
      return out;
    }
    case 'intercept': {
      const s = WEAPON_SOUNDS[ev.weapon];
      const out: Cue[] = [{ sound: s.sound, size: s.size, x: ev.x0, y: ev.y0 }];
      if (ev.hit) out.push({ sound: 'airburst', size: 0.4, x: ev.x, y: ev.y });
      return out;
    }
    case 'explosion': {
      const size = clamp(ev.radius / BLAST_UNIT, 0.15, 1.5);
      const sound = ctx.wet(ev.x, ev.y) ? 'splash' : ev.plasma ? 'plasmaSplash' : 'explosion';
      return [{ sound, size, x: ev.x, y: ev.y }];
    }
    case 'plasmaBurn':
      return [{ sound: 'burn', size: 1, x: ev.x, y: ev.y }];
    // A bullet on armor: off the front it's a dark clank (now and then a round sings off); a flank
    // or rear hit is the `facingHit`'s pierce, so it adds nothing of its own.
    case 'impact':
      if (ev.armor === 'front') return [{ sound: 'ricochet', size: 0.5, x: ev.x, y: ev.y }];
      if (ev.armor) return [];
      return [{ sound: 'impact', size: 0.4, x: ev.x, y: ev.y }];
    case 'facingHit':
      return [{ sound: 'pierce', size: ev.facing === 'rear' ? 1 : 0.5, x: ev.x, y: ev.y }];
    case 'behemothHit':
      return [{ sound: 'hullHit', size: clamp(ev.damage / 20, 0.15, 1.5), x: ev.x, y: ev.y }];
    case 'trailerHit':
      return [{ sound: 'hullHit', size: clamp(ev.damage / 25, 0.1, 1.2), x: ev.x, y: ev.y }];
    case 'trailerLost':
      return ev.how === 'jettisoned' ? [{ sound: 'clank', size: 1 }] : [];
    case 'trailerBlast':
      return [{ sound: 'vehicleKill', size: 1.3, x: ev.x, y: ev.y }];
    case 'droneLost':
      return [{ sound: 'droneLost', size: 0.3, x: ev.x, y: ev.y }];
    case 'revived':
      return [{ sound: 'revive', size: 1 }];
    case 'reloaded':
      return [{ sound: 'clank', size: 0.4 }];
    case 'enemyDestroyed': {
      const def = ENEMIES[ev.enemy];
      // Infantry make no fireball; whatever got them already made its noise.
      if (def.mobility === 'foot') return [];
      const out: Cue[] = [];
      if (ev.cause === 'crushed') out.push({ sound: 'crush', size: def.hp > 40 ? 1 : 0.7, x: ev.x, y: ev.y });
      out.push({ sound: 'vehicleKill', size: ev.cause === 'crushed' ? 0.45 : def.hp > 40 ? 0.85 : 0.65, x: ev.x, y: ev.y });
      if (ctx.wet(ev.x, ev.y)) out.push({ sound: 'splash', size: 0.6, x: ev.x, y: ev.y });
      return out;
    }
    case 'tileChanged': {
      const debris = MATERIALS[ev.mat].debris;
      const x = (ev.col + 0.5) * ctx.tileSize;
      const y = (ev.row + 0.5) * ctx.tileSize;
      if (debris === 'wood') return [{ sound: 'wood', size: ev.state === 'destroyed' ? 0.5 : 1, x, y }];
      if (debris && debris !== 'ice' && (ev.state === 'destroyed' || ev.state === 'flattened')) {
        return [{ sound: 'collapse', size: debris === 'rock' ? 0.7 : 1, x, y }];
      }
      if (debris === 'ice' && ev.state === 'destroyed') return [{ sound: 'splash', size: 0.4, x, y }];
      return [];
    }
    case 'bridgeCollapse':
      return [
        { sound: 'collapse', size: 1.4, x: ev.x, y: ev.y },
        { sound: 'splash', size: 1.2, x: ev.x, y: ev.y },
      ];
    case 'collision': {
      const size = RAM_SIZE[ev.obstacle];
      return size > 0 ? [{ sound: 'ram', size, x: ev.x, y: ev.y }] : [];
    }
    case 'scrape':
      return [{ sound: 'scrape', size: 1, x: ev.x, y: ev.y }];
    case 'componentDestroyed':
      return [{ sound: 'componentBlown', size: 1 }];
    // The magazine going up inside the hull: a blast and a string of rounds cooking off. Vented,
    // it's a roar out of the deck.
    case 'cookOff':
      return ev.vented
        ? [{ sound: 'explosion', size: 1 }, { sound: 'vehicleKill', size: 0.7 }]
        : [{ sound: 'vehicleKill', size: 1.4 }, { sound: 'explosion', size: 1.2 }];
    case 'immobilized':
      return [{ sound: 'immobilized', size: 1 }];
    case 'wave':
      return [{ sound: 'horn', size: 1 }];
    // The alert clock's reinforcements: the same siren, further off (it comes every 15-30 s).
    case 'alert':
      return [{ sound: 'horn', size: 0.6 }];
    case 'extracted':
      return [{ sound: 'radio', size: 1 }];
    case 'detonation':
      return [{ sound: 'detonation', size: 2, x: ev.x, y: ev.y }];
    default:
      return [];
  }
}

/**
 * Sounds an alarm (SPEC §11.4) the moment a component goes critical. Tracks each component's
 * damage level, so it sounds once per crossing, not on every hit after.
 */
export class AlarmWatch {
  private readonly levels = new Map<string, DamageLevel>();

  check(b: BehemothState, id: string): Cue | null {
    const integrity = component(b, id);
    if (!integrity) return null;
    const level = damageLevel(fraction(integrity));
    const prev = this.levels.get(id) ?? 'ok';
    this.levels.set(id, level);
    if (level !== 'critical' || prev === 'critical' || prev === 'destroyed') return null;
    return { sound: 'alarm', size: id === 'reactor' ? 1 : 0.6 };
  }
}

/** Hearing from the cab: full volume up close, falling off with distance, panned left/right. */
export const HEARING = {
  /** Within this distance a sound plays at full volume. */
  near: 40,
  /** Falloff: gain = ref / (ref + distance past `near`). */
  ref: 160,
  /** Sideways offset (view units) that pans fully. */
  panSpan: 220,
  maxPan: 0.85,
  /** Quieter than this isn't worth playing. */
  cutoff: 0.06,
};

export interface Placement {
  gain: number;
  /** -1 left to +1 right, on screen. */
  pan: number;
  distance: number;
}

/** Where a cue sits relative to the listener (the Behemoth). */
export function place(listener: { x: number; y: number }, cue: Pick<Cue, 'x' | 'y'>): Placement {
  if (cue.x === undefined || cue.y === undefined) return { gain: 1, pan: 0, distance: 0 };
  const distance = Math.hypot(cue.x - listener.x, cue.y - listener.y);
  const gain = distance <= HEARING.near ? 1 : HEARING.ref / (HEARING.ref + distance - HEARING.near);
  const side = viewX(cue.x, cue.y) - viewX(listener.x, listener.y);
  return { gain, pan: clamp(side / HEARING.panSpan, -1, 1) * HEARING.maxPan, distance };
}

/**
 * Minimum seconds between two starts of the same sound, so a rotary gun's stream or a chain of
 * blasts doesn't stack into mush (and doesn't swamp the audio thread).
 */
export const MIN_GAP: Record<SoundId, number> = {
  cannon: 0.04,
  autocannon: 0.04,
  rotary: 0.03,
  mortar: 0.05,
  missile: 0.06,
  rocket: 0.06,
  pulseLaser: 0.04,
  heavyLaser: 0.1,
  plasmaShot: 0.08,
  airburst: 0.05,
  explosion: 0.05,
  plasmaSplash: 0.08,
  splash: 0.08,
  impact: 0.04,
  pierce: 0.06,
  ricochet: 0.05,
  hullHit: 0.05,
  vehicleKill: 0.08,
  crush: 0.1,
  wood: 0.07,
  collapse: 0.15,
  ram: 0.15,
  clank: 0.1,
  droneLost: 0.1,
  revive: 1,
  componentBlown: 0.15,
  immobilized: 1,
  alarm: 1.2,
  missileWarning: 1.2,
  horn: 2,
  radio: 1,
  detonation: 1,
};

/**
 * Random pitch spread per sound, in semitones either way. Each play picks one factor that shifts
 * the whole sound (every oscillator, filter, and noise rate), so repeats never sound identical,
 * the way no two real shots or hits do. Cab alarms stay fixed so they're always recognizable.
 */
export const PITCH_SPREAD: Record<SoundId, number> = {
  cannon: 1,
  autocannon: 1.2,
  rotary: 1,
  mortar: 1.2,
  missile: 1.5,
  rocket: 1.5,
  pulseLaser: 1.5,
  heavyLaser: 0.8,
  plasmaShot: 1.2,
  airburst: 1.5,
  explosion: 1.2,
  plasmaSplash: 1.2,
  splash: 1.5,
  impact: 2,
  pierce: 1.5,
  ricochet: 2,
  hullHit: 1.8,
  vehicleKill: 1.2,
  crush: 1.5,
  wood: 2,
  collapse: 1.2,
  ram: 1.5,
  clank: 1.5,
  droneLost: 1.5,
  revive: 0.5,
  componentBlown: 1,
  immobilized: 0.5,
  alarm: 0,
  missileWarning: 0,
  horn: 0.4,
  radio: 0,
  detonation: 0.6,
};

/** Spread of a sound's random level change, as a fraction either way (about ±1.5 dB). */
export const LEVEL_SPREAD = 0.18;

/**
 * The pitch factor for one play of a sound, from a uniform random number in [0, 1). Uniform
 * in semitones, so up and down shifts are equally likely to the ear.
 */
export function pitchFactor(sound: SoundId, r: number): number {
  return 2 ** (((r * 2 - 1) * PITCH_SPREAD[sound]) / 12);
}

/** The level factor for one play, from a uniform random number in [0, 1). Fixed for alarms. */
export function levelFactor(sound: SoundId, r: number): number {
  return PITCH_SPREAD[sound] === 0 ? 1 : 1 + (r * 2 - 1) * LEVEL_SPREAD;
}

/** Rate-limits one-shots by `MIN_GAP`, preferring the loudest when a frame brings several. */
export class CueLimiter {
  private readonly last = new Map<SoundId, number>();

  /** The cues worth playing now, loudest first. */
  filter<T extends { cue: Cue; at: Placement }>(items: T[], now: number): T[] {
    const out: T[] = [];
    for (const item of [...items].sort((a, b) => b.at.gain * b.cue.size - a.at.gain * a.cue.size)) {
      const sound = item.cue.sound;
      if (HOLDS.has(sound)) {
        out.push(item);
        continue;
      }
      if (item.at.gain * Math.min(1, item.cue.size + 0.5) < HEARING.cutoff) continue;
      const id = sound as SoundId;
      const prev = this.last.get(id);
      if (prev !== undefined && now - prev < MIN_GAP[id]) continue;
      this.last.set(id, now);
      out.push(item);
    }
    return out;
  }
}

/** What the drive sounds like this frame. */
export interface EngineState {
  /** Ground speed as a fraction of the chassis's undamaged top speed. */
  speed: number;
  /** How hard the engine works: 0 coasting down, ~0.5 holding cruise, 1 flat out. */
  load: number;
  /** 0 healthy treads to 1 wrecked: they clatter unevenly. */
  treadWear: number;
  running: boolean;
}

export function engineState(b: BehemothState, cmd: Pick<PlayerCommand, 'throttle'>): EngineState {
  const top = b.chassis.speed.top;
  const limits = speedLimits(b);
  const running = !b.destroyed && !b.immobilized;
  // Below the speed the throttle asks for, the engine pulls hard; above it, it eases off.
  const target = cmd.throttle > 0 ? limits.top : cmd.throttle < 0 ? limits.min : limits.cruise;
  const behind = target > 0 ? clamp((target - b.vx) / target, -1, 1) : 0;
  const base = cmd.throttle > 0 ? 0.8 : cmd.throttle < 0 ? 0.2 : 0.45;
  return {
    speed: top > 0 ? clamp(b.vx / top, 0, 1.2) : 0,
    load: running ? clamp(base + behind * 0.6, 0, 1) : 0,
    treadWear: 1 - fraction(b.treads),
    running,
  };
}

/** What the reactor sounds like this frame. */
export interface ReactorState {
  /** 0 empty capacitor to 1 full. */
  charge: number;
  /** 0 healthy to 1 wrecked: the hum flutters. */
  damage: number;
  /** 0 stable, rising to 1 as the fuse burns down. */
  meltdown: number;
}

export function reactorState(b: BehemothState, fuseStart: number | null): ReactorState {
  const meltdown = b.reactorFuse !== null && fuseStart ? clamp(1 - b.reactorFuse / fuseStart, 0, 1) : 0;
  return {
    charge: b.power.max > 0 ? clamp(b.power.stored / b.power.max, 0, 1) : 0,
    damage: 1 - fraction(b.reactor),
    meltdown: b.reactorFuse !== null ? Math.max(meltdown, 0.05) : 0,
  };
}
