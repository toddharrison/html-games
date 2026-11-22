import type { HardpointSize } from './chassis';

/** Weapon definitions (SPEC §6). Projectile behavior comes from reusable projectile kinds. */

export type WeaponRole = 'main' | 'secondary' | 'missile' | 'auto';
export type WeaponCategory = 'ballistic' | 'munitions' | 'energy';

/** How a unit takes damage (SPEC §6 "best against"): rounds can be strong or weak per class. */
export type TargetClass = 'infantry' | 'light' | 'heavy';

/**
 * Part of a round's damage that skips the armor and strikes a component directly (SPEC §5.1):
 * infantry rockets go for the treads, enemy missiles for the hardpoints.
 */
export interface StrikeFocus {
  target: 'treads' | 'hardpoints';
  /** Fraction of the damage (0..1) that bypasses the armor; the rest hits the armor as usual. */
  bypass: number;
}

/** Fields every damaging shot shares, projectile or beam. */
interface HitBase {
  damage: number;
  /** Damage dealt to terrain tiles it hits. */
  tileDamage: number;
  /** Random aim error (radians, ±). */
  spread: number;
  /** Damage multiplier per target class (missing = 1). */
  vs?: Partial<Record<TargetClass, number>>;
  /** Hits on a Behemoth: damage aimed past the armor. */
  strike?: StrikeFocus;
  /**
   * Armor-piercing (0..1): the share of a vehicle's front armor it ignores (SPEC §7, §6.2). A
   * front multiplier of 0.75 with penetration 0.5 becomes 0.875. Bonuses (flank, rear) are unchanged.
   */
  penetration?: number;
}

/** Fields every projectile round shares. */
interface RoundBase extends HitBase {
  speed: number;
}

/**
 * A burning patch a burst leaves on the ground (plasma, SPEC §6): for a few seconds it keeps
 * damaging every unit and terrain tile inside it, and the Behemoth's treads (and its trailer) if
 * it drives over it.
 */
export interface PoolSpec {
  radius: number;
  /** Seconds it burns. */
  duration: number;
  /** Damage per second to each unit inside (scaled by the round's `vs`). */
  dps: number;
  /** Damage per second to terrain tiles inside. */
  tileDps: number;
}

/** Lobbed/direct shell that bursts at the aim point (or on the first thing it hits). */
export interface ShellSpec extends RoundBase {
  kind: 'shell';
  /** Splash radius for units and terrain; 0 = direct hit only. */
  blastRadius: number;
  /** Shells detonate at the aim point, clamped to this range band. */
  minRange: number;
  maxRange: number;
  /**
   * Indirect fire: arcs over units, trees, and buildings and bursts only at the aim point, so it
   * reaches targets behind cover (SPEC §13.1 "lobbed").
   */
  lobbed?: boolean;
  /** Leaves a burning pool where it bursts (plasma). */
  pool?: PoolSpec;
}

/** Small direct-fire round: hits the first unit or cover in its path, or fizzles at max range. */
export interface BulletSpec extends RoundBase {
  kind: 'bullet';
  range: number;
  /** Fires this many at once, each with its own spread: a cone of pellets (canister). Missing = 1. */
  pellets?: number;
}

/** Homing missile: steers toward its locked target (or the aim point) and bursts on contact. */
export interface MissileSpec extends RoundBase {
  kind: 'missile';
  /** Max steering rate (rad/s). */
  turnRate: number;
  blastRadius: number;
  range: number;
  /** How close to the cursor a unit must be to get locked. */
  lockRadius: number;
}

/** Point defense: instant intercept of an incoming projectile, with a hit chance per kind. */
export interface InterceptSpec {
  kind: 'intercept';
  range: number;
  chance: { shell: number; missile: number };
}

/**
 * Laser (SPEC §6): an instant beam along the mount's facing that strikes the first unit or cover in
 * its path, out to its range. Nothing flies, so there's nothing to lead and nothing to shoot down.
 */
export interface BeamSpec extends HitBase {
  kind: 'beam';
  range: number;
}

export type ProjectileSpec = ShellSpec | BulletSpec | MissileSpec;
export type ProjectileKind = ProjectileSpec['kind'];
/** Anything a weapon fires that does damage: a projectile, or a beam. */
export type RoundSpec = ProjectileSpec | BeamSpec;

export type WeaponId =
  | 'heavyCannon'
  | 'siegeHowitzer'
  | 'autocannon'
  | 'rotaryGun'
  | 'flakCannon'
  | 'missileRack'
  | 'podMissiles'
  | 'bunkerBuster'
  | 'mortar'
  | 'apGuns'
  | 'pdLaser'
  | 'pdGuns'
  | 'pulseLaser'
  | 'beamLaser'
  | 'heavyLaser'
  | 'plasmaThrower'
  | 'lightTankGun'
  | 'heavyTankGun'
  | 'infantryRockets'
  | 'launcherMissiles'
  | 'emplacementGun'
  | 'bunkerRockets'
  | 'towerGuns'
  | 'hoverGun';

/**
 * Main-gun shells (SPEC §6.2), chosen per gun at the depot. The first one a gun lists is its
 * default (its `projectile`).
 */
export type ShellType = 'he' | 'ap' | 'canister';

export const SHELL_TYPES: Record<ShellType, { name: string; short: string; blurb: string }> = {
  he: { name: 'High-explosive', short: 'HE', blurb: 'Bursts at the cursor; splash clears cover.' },
  ap: { name: 'Armor-piercing', short: 'AP', blurb: 'Fast and flat, no splash; cracks heavy armor.' },
  canister: { name: 'Canister', short: 'CAN', blurb: 'A short cone of pellets; shreds infantry.' },
};

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Short label for the HUD weapon strip (about 10 characters). */
  short: string;
  /** Player weapons: one line for the depot (about 50 characters). */
  blurb?: string;
  role: WeaponRole;
  category: WeaponCategory;
  /**
   * Player weapons: the hardpoint size it needs (SPEC §5.2). It fits only a slot of exactly that
   * size, so the turret always carries a main gun. Enemy weapons have none.
   */
  size?: HardpointSize;
  /** Player weapons: tons against the tread capacity (SPEC §5.3). Missing = 0. */
  mass?: number;
  /** Seconds between shots (between salvos, for salvo weapons). */
  reload: number;
  /** Barrel length from the mount pivot (where shots spawn). */
  muzzle: number;
  /** Mount traverse (deg/s) for weapons on their own mounts; turret weapons use the turret's. */
  traverseDegPerSec: number;
  projectile: ProjectileSpec | BeamSpec | InterceptSpec;
  /** Energy weapons: capacitor power per shot (SPEC §5.4). */
  power?: number;
  /** Munitions weapons: rounds carried (refilled only at depots). */
  ammo?: number;
  /** Fires several rounds per trigger. */
  salvo?: { count: number; interval: number };
  /** Auto weapons: the toggle group (keys 1–4) this weapon belongs to. */
  autoGroup?: 1 | 2 | 3 | 4;
  /**
   * Main guns that take a choice of shell (SPEC §6.2): what each one fires. The first listed is
   * the default and must be `projectile` itself. Missing = no choice.
   */
  shells?: Partial<Record<ShellType, ShellSpec | BulletSpec>>;
}

/** The shells a gun can take, default first; empty for guns with no choice. */
export function shellsOf(weapon: WeaponDef): ShellType[] {
  return Object.keys(weapon.shells ?? {}) as ShellType[];
}

const loaded = new Map<string, WeaponDef>();

/**
 * The gun loaded with a shell: the same weapon firing that shell's projectile. Cached, so each
 * gun and shell pair is one object. The default shell (or a shell it can't take) is the weapon itself.
 */
export function withShell(weapon: WeaponDef, shell: ShellType | null): WeaponDef {
  const spec = shell === null ? undefined : weapon.shells?.[shell];
  if (!spec || spec === weapon.projectile) return weapon;
  const key = `${weapon.id}:${shell}`;
  let w = loaded.get(key);
  if (!w) {
    w = { ...weapon, projectile: spec };
    loaded.set(key, w);
  }
  return w;
}

/** What fires a hardpoint (SPEC §5.2): one of the three triggers, or Auto (picks its own targets). */
export type Binding = 'lmb' | 'rmb' | 'space' | 'auto';
export const BINDINGS: readonly Binding[] = ['lmb', 'rmb', 'space', 'auto'];

/** A weapon's binding out of the box: main guns LMB, secondaries RMB, missiles Space, the rest Auto. */
export function defaultBinding(weapon: WeaponDef): Binding {
  return weapon.role === 'main' ? 'lmb' : weapon.role === 'secondary' ? 'rmb' : weapon.role === 'missile' ? 'space' : 'auto';
}

/** The heavy cannon's shells (SPEC §6.2). Numbers are provisional. */
const CANNON_HE: ShellSpec = {
  kind: 'shell',
  speed: 380,
  damage: 40,
  blastRadius: 18,
  tileDamage: 70,
  minRange: 30,
  maxRange: 320,
  spread: 0.01,
  // Overkill on a direct hit against infantry; the splash does the work there.
  vs: { infantry: 0.6 },
};
const CANNON_AP: BulletSpec = {
  kind: 'bullet',
  // Flies flat until it hits something: no burst at the cursor, no splash.
  speed: 720,
  damage: 55,
  tileDamage: 20,
  range: 420,
  spread: 0.004,
  vs: { infantry: 0.4, heavy: 1.5 },
  penetration: 0.5,
};
const CANNON_CANISTER: BulletSpec = {
  kind: 'bullet',
  speed: 420,
  damage: 6,
  tileDamage: 5,
  range: 120,
  spread: 0.2,
  pellets: 10,
  vs: { infantry: 2, light: 0.6, heavy: 0.15 },
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  heavyCannon: {
    id: 'heavyCannon',
    size: 'L',
    mass: 110,
    name: 'Heavy cannon',
    short: 'Cannon',
    blurb: 'Slow, heavy shells: high-explosive, AP, or canister.',
    role: 'main',
    category: 'ballistic',
    reload: 1.5,
    muzzle: 28,
    traverseDegPerSec: 0,
    projectile: CANNON_HE,
    shells: { he: CANNON_HE, ap: CANNON_AP, canister: CANNON_CANISTER },
  },
  autocannon: {
    id: 'autocannon',
    size: 'M',
    mass: 40,
    name: 'Autocannon',
    short: 'Autocannon',
    blurb: 'A steady stream of rounds; good on light vehicles.',
    role: 'secondary',
    category: 'ballistic',
    reload: 0.2,
    muzzle: 8,
    traverseDegPerSec: 220,
    projectile: { kind: 'bullet', speed: 360, damage: 6, tileDamage: 4, range: 230, spread: 0.035, vs: { infantry: 0.7, heavy: 0.4 } },
  },
  missileRack: {
    id: 'missileRack',
    size: 'M',
    mass: 55,
    name: 'Missile rack',
    short: 'Missiles',
    blurb: 'Lock-on salvos of four; hits anything hard.',
    role: 'missile',
    category: 'munitions',
    reload: 5,
    muzzle: 2,
    traverseDegPerSec: 0,
    ammo: 24,
    salvo: { count: 4, interval: 0.12 },
    projectile: {
      kind: 'missile',
      speed: 170,
      turnRate: 4.5,
      damage: 26,
      blastRadius: 14,
      tileDamage: 40,
      range: 440,
      spread: 0.5,
      lockRadius: 40,
    },
  },
  // Built into the trailer's missile pod (content/trailer.ts), not sold on its own. Its mass is the module's.
  podMissiles: {
    id: 'podMissiles',
    name: 'Pod missiles',
    short: 'Pod msl',
    role: 'missile',
    category: 'munitions',
    reload: 5,
    muzzle: 2,
    traverseDegPerSec: 0,
    ammo: 12,
    salvo: { count: 3, interval: 0.14 },
    projectile: {
      kind: 'missile',
      speed: 170,
      turnRate: 4.5,
      damage: 26,
      blastRadius: 14,
      tileDamage: 40,
      range: 440,
      spread: 0.6,
      lockRadius: 40,
    },
  },
  siegeHowitzer: {
    id: 'siegeHowitzer',
    size: 'L',
    mass: 150,
    name: 'Siege howitzer',
    short: 'Howitzer',
    blurb: 'Lobbed over cover; levels everything at the cursor.',
    role: 'main',
    category: 'munitions',
    reload: 3.8,
    muzzle: 24,
    traverseDegPerSec: 0,
    ammo: 16,
    projectile: {
      kind: 'shell',
      // Slow and lobbed: it sails over cover and levels whatever is around the aim point.
      speed: 210,
      damage: 55,
      blastRadius: 34,
      tileDamage: 150,
      minRange: 70,
      maxRange: 380,
      spread: 0.02,
      lobbed: true,
      vs: { infantry: 0.8 },
    },
  },
  rotaryGun: {
    id: 'rotaryGun',
    size: 'M',
    mass: 45,
    name: 'Rotary gun',
    short: 'Rotary',
    blurb: 'A hail of bullets; shreds infantry, short reach.',
    role: 'secondary',
    category: 'ballistic',
    reload: 0.07,
    muzzle: 9,
    traverseDegPerSec: 260,
    projectile: { kind: 'bullet', speed: 380, damage: 2.4, tileDamage: 2, range: 170, spread: 0.06, vs: { infantry: 1.6, heavy: 0.2 } },
  },
  flakCannon: {
    id: 'flakCannon',
    size: 'M',
    mass: 50,
    name: 'Flak cannon',
    short: 'Flak',
    blurb: 'Airburst shells at the cursor; scatters infantry.',
    role: 'secondary',
    category: 'ballistic',
    reload: 0.55,
    muzzle: 8,
    traverseDegPerSec: 200,
    projectile: {
      kind: 'shell',
      // Airburst at the cursor: a spray of fragments that shreds troops and soft vehicles.
      speed: 320,
      damage: 7,
      blastRadius: 14,
      tileDamage: 6,
      minRange: 25,
      maxRange: 220,
      spread: 0.03,
      vs: { infantry: 1.5, heavy: 0.3 },
    },
  },
  bunkerBuster: {
    id: 'bunkerBuster',
    size: 'M',
    mass: 70,
    name: 'Bunker-buster missiles',
    short: 'Busters',
    blurb: 'Slow heavy pairs; crack heavy armor and buildings.',
    role: 'missile',
    category: 'munitions',
    reload: 7,
    muzzle: 2,
    traverseDegPerSec: 0,
    ammo: 10,
    salvo: { count: 2, interval: 0.3 },
    projectile: {
      kind: 'missile',
      speed: 125,
      turnRate: 2.5,
      damage: 60,
      blastRadius: 10,
      tileDamage: 180,
      range: 440,
      spread: 0.25,
      lockRadius: 40,
      vs: { heavy: 1.4, infantry: 0.5 },
    },
  },
  mortar: {
    id: 'mortar',
    size: 'M',
    mass: 60,
    name: 'Mortar',
    short: 'Mortar',
    blurb: 'Lobs shells onto units behind cover.',
    role: 'auto',
    category: 'munitions',
    reload: 2.2,
    muzzle: 6,
    traverseDegPerSec: 120,
    autoGroup: 3,
    ammo: 30,
    projectile: {
      kind: 'shell',
      // Lobbed: drops on units the direct-fire guns can't see past cover.
      speed: 170,
      damage: 14,
      blastRadius: 16,
      tileDamage: 30,
      minRange: 60,
      maxRange: 260,
      spread: 0.03,
      lobbed: true,
      vs: { infantry: 1.3, heavy: 0.5 },
    },
  },
  apGuns: {
    id: 'apGuns',
    size: 'S',
    mass: 12,
    name: 'Anti-personnel guns',
    short: 'AP guns',
    blurb: 'Short-range bullets that cut down infantry.',
    role: 'auto',
    category: 'ballistic',
    reload: 0.14,
    muzzle: 4,
    traverseDegPerSec: 300,
    autoGroup: 1,
    projectile: {
      kind: 'bullet',
      speed: 300,
      damage: 2,
      tileDamage: 1,
      range: 75,
      spread: 0.09,
      vs: { infantry: 2.5, light: 0.5, heavy: 0.1 },
    },
  },
  pdLaser: {
    id: 'pdLaser',
    size: 'S',
    mass: 16,
    name: 'Point-defense laser',
    short: 'PD laser',
    blurb: 'Zaps incoming missiles and shells; uses power.',
    role: 'auto',
    category: 'energy',
    reload: 0.3,
    muzzle: 2,
    traverseDegPerSec: 720,
    autoGroup: 2,
    power: 4,
    projectile: { kind: 'intercept', range: 85, chance: { shell: 0.4, missile: 0.85 } },
  },
  pdGuns: {
    id: 'pdGuns',
    size: 'S',
    mass: 14,
    name: 'Point-defense guns',
    short: 'PD guns',
    blurb: 'Shoots down missiles; no power, less reliable.',
    role: 'auto',
    category: 'ballistic',
    reload: 0.2,
    muzzle: 4,
    traverseDegPerSec: 540,
    autoGroup: 2,
    // No power cost, but less reliable than the laser (SPEC §6).
    projectile: { kind: 'intercept', range: 70, chance: { shell: 0.25, missile: 0.6 } },
  },
  // Lasers (SPEC §6): one per hardpoint size. Instant, precise, no ammo; every shot costs power.
  pulseLaser: {
    id: 'pulseLaser',
    size: 'S',
    mass: 14,
    name: 'Pulse laser',
    short: 'Pulse lsr',
    blurb: 'Auto laser; picks off infantry. Uses power.',
    role: 'auto',
    category: 'energy',
    reload: 0.4,
    muzzle: 4,
    traverseDegPerSec: 360,
    autoGroup: 1,
    power: 1.5,
    projectile: { kind: 'beam', damage: 4, tileDamage: 2, range: 110, spread: 0.01, vs: { infantry: 1.4, heavy: 0.3 } },
  },
  beamLaser: {
    id: 'beamLaser',
    size: 'M',
    mass: 45,
    name: 'Beam laser',
    short: 'Beam lsr',
    blurb: 'A precise beam on anything; drains power fast.',
    role: 'secondary',
    category: 'energy',
    // Pulses fast enough to read as one continuous beam: 16 power/s against the reactor's 10.
    reload: 0.1,
    muzzle: 9,
    traverseDegPerSec: 240,
    power: 1.6,
    projectile: { kind: 'beam', damage: 2.4, tileDamage: 1.5, range: 260, spread: 0.004 },
  },
  heavyLaser: {
    id: 'heavyLaser',
    size: 'L',
    mass: 120,
    name: 'Heavy laser',
    short: 'Hvy laser',
    blurb: 'Instant long-range strikes; no splash, big power.',
    role: 'main',
    category: 'energy',
    reload: 1.3,
    muzzle: 28,
    traverseDegPerSec: 0,
    power: 15,
    projectile: { kind: 'beam', damage: 42, tileDamage: 45, range: 420, spread: 0.002, vs: { infantry: 0.6, heavy: 1.15 } },
  },
  plasmaThrower: {
    id: 'plasmaThrower',
    size: 'M',
    mass: 55,
    name: 'Plasma thrower',
    short: 'Plasma',
    blurb: 'Globs that burn on the ground. Never drive over it.',
    role: 'secondary',
    category: 'energy',
    reload: 0.9,
    muzzle: 9,
    traverseDegPerSec: 180,
    power: 9,
    projectile: {
      kind: 'shell',
      // A slow glob that splashes at the cursor and leaves a pool burning for a few seconds.
      speed: 200,
      damage: 10,
      blastRadius: 14,
      tileDamage: 30,
      minRange: 40,
      maxRange: 170,
      spread: 0.03,
      pool: { radius: 13, duration: 3, dps: 8, tileDps: 20 },
    },
  },
  lightTankGun: {
    id: 'lightTankGun',
    name: 'Light tank gun',
    short: 'Tank gun',
    role: 'auto',
    category: 'ballistic',
    reload: 2.4,
    muzzle: 8,
    traverseDegPerSec: 180,
    projectile: {
      kind: 'shell',
      speed: 200,
      damage: 5,
      blastRadius: 0,
      tileDamage: 6,
      minRange: 0,
      maxRange: 220,
      spread: 0.07,
    },
  },
  heavyTankGun: {
    id: 'heavyTankGun',
    name: 'Heavy tank gun',
    short: 'Heavy gun',
    role: 'auto',
    category: 'ballistic',
    reload: 3.6,
    muzzle: 13,
    traverseDegPerSec: 70,
    projectile: {
      kind: 'shell',
      speed: 230,
      damage: 12,
      blastRadius: 0,
      tileDamage: 20,
      minRange: 0,
      maxRange: 240,
      spread: 0.035,
    },
  },
  infantryRockets: {
    id: 'infantryRockets',
    name: 'Anti-tank rockets',
    short: 'Rockets',
    role: 'auto',
    category: 'munitions',
    reload: 3.4,
    muzzle: 3,
    traverseDegPerSec: 360,
    projectile: {
      kind: 'shell',
      speed: 150,
      damage: 5,
      blastRadius: 0,
      tileDamage: 4,
      minRange: 0,
      maxRange: 130,
      spread: 0.06,
      // Aimed low at the running gear: ignores the armor (SPEC §5.1).
      strike: { target: 'treads', bypass: 1 },
    },
  },
  launcherMissiles: {
    id: 'launcherMissiles',
    name: 'Missile launcher',
    short: 'Launcher',
    role: 'auto',
    category: 'munitions',
    reload: 6.5,
    muzzle: 5,
    traverseDegPerSec: 90,
    salvo: { count: 3, interval: 0.28 },
    projectile: {
      kind: 'missile',
      // Slow, so point defense gets a few shots at each one.
      speed: 105,
      turnRate: 2.2,
      damage: 9,
      blastRadius: 0,
      tileDamage: 15,
      range: 340,
      spread: 0.35,
      lockRadius: 0,
      // Top-attack warheads seek the weapon mounts.
      strike: { target: 'hardpoints', bypass: 0.5 },
    },
  },
  emplacementGun: {
    id: 'emplacementGun',
    name: 'Fortress gun',
    short: 'Fort gun',
    role: 'auto',
    category: 'ballistic',
    // A heavy-tank gun on a fixed mount: slower to load, harder hitting, longer reach.
    reload: 4.2,
    muzzle: 14,
    traverseDegPerSec: 40,
    projectile: {
      kind: 'shell',
      speed: 250,
      damage: 18,
      blastRadius: 0,
      tileDamage: 30,
      minRange: 0,
      maxRange: 280,
      spread: 0.03,
    },
  },
  bunkerRockets: {
    id: 'bunkerRockets',
    name: 'Bunker rockets',
    short: 'Bunker AT',
    role: 'auto',
    category: 'munitions',
    reload: 5.5,
    muzzle: 6,
    traverseDegPerSec: 120,
    salvo: { count: 2, interval: 0.22 },
    projectile: {
      kind: 'shell',
      speed: 170,
      damage: 4,
      blastRadius: 0,
      tileDamage: 6,
      minRange: 0,
      maxRange: 200,
      spread: 0.07,
      // Like the infantry's rockets: aimed low at the running gear.
      strike: { target: 'treads', bypass: 1 },
    },
  },
  towerGuns: {
    id: 'towerGuns',
    name: 'Tower autocannon',
    short: 'Tower guns',
    role: 'auto',
    category: 'ballistic',
    reload: 3,
    muzzle: 8,
    traverseDegPerSec: 90,
    // Bursts from up high: plunging fire into the weapon mounts.
    salvo: { count: 4, interval: 0.12 },
    projectile: {
      kind: 'shell',
      speed: 260,
      damage: 3,
      blastRadius: 0,
      tileDamage: 4,
      minRange: 0,
      maxRange: 250,
      spread: 0.06,
      strike: { target: 'hardpoints', bypass: 0.3 },
    },
  },
  hoverGun: {
    id: 'hoverGun',
    name: 'Hovercraft gun',
    short: 'Hover gun',
    role: 'auto',
    category: 'ballistic',
    reload: 1.8,
    muzzle: 6,
    traverseDegPerSec: 220,
    salvo: { count: 2, interval: 0.15 },
    projectile: {
      kind: 'shell',
      speed: 220,
      damage: 3,
      blastRadius: 0,
      tileDamage: 4,
      minRange: 0,
      maxRange: 170,
      spread: 0.08,
    },
  },
};
