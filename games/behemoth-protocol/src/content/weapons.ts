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
  /**
   * Odds (0..1) that it sets alight each tile that burns where it strikes (SPEC §6 "Fire"); a burst
   * rolls for every such tile in its blast. Missing: its kind's odds (`FIRE.ignites`).
   */
  ignites?: number;
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
  /**
   * Launched straight up (SPEC §6 ballistic missile): it heads for the aim point whatever way the
   * mount faces, from the mount itself, so it needs no barrel lined up.
   */
  vertical?: boolean;
  /** Each round of a salvo comes down somewhere within this of the aim point (SPEC §6 rocket artillery). */
  scatter?: number;
  /**
   * The burst is a fireball (SPEC §6 thermobaric, §6.2 incendiary shells): every unit in it is set
   * burning, whatever burns in it is set alight, and the ground in it burns for a few seconds.
   */
  incendiary?: BurnSpec;
  /** What it looks like in flight (render only): a rocket, a big missile, a canister; missing = a shell. */
  look?: 'rocket' | 'ballistic' | 'canister';
  /** Too big to shoot down (SPEC-armored-train.md §T7 railway gun): point defense lets it be. */
  unstoppable?: boolean;
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
  /**
   * Guided by its launcher's sight (SPEC §7 heavy weapons team): it needs a clear line to its
   * target to lock on and to launch, where an ordinary homing missile flies over cover.
   */
  sight?: boolean;
  /**
   * Swarm (SPEC §6 swarm pod): each missile of a salvo goes for a unit of its own, spread over
   * everything in view, nearest the lock first; with fewer units than missiles they're shared out
   * in turn. One whose target dies turns onto the nearest unit in view (`SWARM.retarget`).
   */
  swarm?: boolean;
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

/**
 * Burning (SPEC §6 flamethrower): a unit set alight takes `dps` (scaled by the round's `vs`) for
 * `duration` seconds, renewed by every fresh lick of flame.
 */
export interface BurnSpec {
  dps: number;
  duration: number;
}

/**
 * Flamethrower (SPEC §6): a short cone of burning fuel out of the nozzle, resolved at once like a
 * beam. It strikes every unit in the cone it has a clear line to (`damage` a shot), sets them
 * burning, and sets alight what burns in its path (forest, hedges, buildings: `FIRE`), stopping at
 * the first cover that blocks shots.
 */
export interface FlameSpec extends HitBase {
  kind: 'flame';
  range: number;
  /** Half-width of the cone (radians). */
  cone: number;
  burn: BurnSpec;
}

/**
 * EMP (SPEC §6): a pulse out from the emitter that knocks out every vehicle within `radius` for
 * `stun` seconds (dead in the water: no driving, no aiming, no firing) and fries enemy missiles in
 * flight. Troops on foot shrug it off. It does no damage.
 */
export interface PulseSpec {
  kind: 'pulse';
  radius: number;
  stun: number;
  /** Stun multiplier per target class (missing = 1): heavier machines come back sooner. */
  stunVs?: Partial<Record<TargetClass, number>>;
}

/**
 * Railgun (SPEC §6): a hypervelocity slug, resolved at once along the barrel out to its range. It
 * goes through every unit in its line, keeping `falloff` of its damage past each, and punches
 * through cover, keeping `wallLoss` past each tile that blocks shots (and leaving it damaged), until
 * it meets ground nothing breaks (rock) or has spent itself.
 */
export interface RailSpec extends HitBase {
  kind: 'rail';
  range: number;
  falloff: number;
  wallLoss: number;
}

/**
 * Arc projector (SPEC §6): a bolt along the barrel to the first unit or cover in its path, which
 * then leaps to the nearest unit not yet struck within `jumpRange` (with a clear line), up to `jumps`
 * times, keeping `falloff` of its damage each leap.
 */
export interface ArcSpec extends HitBase {
  kind: 'arc';
  range: number;
  jumps: number;
  jumpRange: number;
  falloff: number;
}

export type ProjectileSpec = ShellSpec | BulletSpec | MissileSpec;
export type ProjectileKind = ProjectileSpec['kind'];
/** Anything a weapon fires that does damage: a projectile, a beam, or a flame. */
export type RoundSpec = ProjectileSpec | BeamSpec | FlameSpec | RailSpec | ArcSpec;

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
  | 'swarmPod'
  | 'empEmitter'
  | 'flamethrower'
  | 'railgun'
  | 'ballisticMissile'
  | 'erectorMissile'
  | 'arcProjector'
  | 'coilgun'
  | 'teslaCoil'
  | 'rocketArtillery'
  | 'thermobaric'
  | 'lightTankGun'
  | 'heavyTankGun'
  | 'infantryRockets'
  | 'guidedMissile'
  | 'launcherMissiles'
  | 'emplacementGun'
  | 'bunkerRockets'
  | 'towerGuns'
  | 'hoverGun'
  | 'batteryShells'
  | 'siegeCannon'
  | 'hedgeGunShot'
  | 'trapdoorRocket'
  | 'walkerGuns'
  | 'siegeAutocannon'
  | 'trainMissiles'
  | 'trainAutocannon'
  | 'trainHowitzer'
  | 'trainRockets'
  | 'troopRockets'
  | 'railwayGunShell';

/**
 * Main-gun shells (SPEC §6.2), chosen per gun at the depot. The first one a gun lists is its
 * default (its `projectile`).
 */
export type ShellType = 'he' | 'ap' | 'canister' | 'incendiary';

export const SHELL_TYPES: Record<ShellType, { name: string; short: string; blurb: string }> = {
  he: { name: 'High-explosive', short: 'HE', blurb: 'Bursts at the cursor; splash clears cover.' },
  ap: { name: 'Armor-piercing', short: 'AP', blurb: 'Fast and flat, no splash; cracks heavy armor.' },
  canister: { name: 'Canister', short: 'CAN', blurb: 'A short cone of pellets; shreds infantry.' },
  incendiary: { name: 'Incendiary', short: 'INC', blurb: 'A fireball; sets all it catches alight.' },
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
  projectile: RoundSpec | InterceptSpec | PulseSpec;
  /** Energy weapons: capacitor power per shot (SPEC §5.4). */
  power?: number;
  /**
   * Munitions weapons: shots carried (refilled only at depots). A salvo weapon's whole salvo is one
   * shot, so a missile rack's 24 is 24 salvos of four (user's call, Nov 2026).
   */
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
  /**
   * Area fire (SPEC §7 artillery; a "area" targeting type, §13.1): the volley is laid on a target
   * zone instead of at the target. When the aim telegraph ends the zone is fixed where the Behemoth
   * will be if it holds its course, marked on the ground, and every round of the salvo comes down
   * somewhere inside it, each `flight` seconds after it's fired. Enemy weapons only, lobbed shells.
   * `spread`: how far from the zone's center a round may come down (default the zone's radius; 0
   * for one big shell aimed at the center, whose burst is the zone).
   */
  barrage?: { radius: number; flight: number; spread?: number };
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

const CANNON_INCENDIARY: ShellSpec = {
  kind: 'shell',
  // Flies like the high-explosive shell, with half its punch: the fire does the rest.
  speed: 380,
  damage: 20,
  blastRadius: 20,
  tileDamage: 12,
  minRange: 30,
  maxRange: 320,
  spread: 0.01,
  incendiary: { dps: 6, duration: 3 },
  vs: { infantry: 1.4, heavy: 0.4 },
};

/** The siege howitzer's shells (SPEC §6.2). Numbers are provisional. */
const HOWITZER_HE: ShellSpec = {
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
};
const HOWITZER_INCENDIARY: ShellSpec = {
  kind: 'shell',
  // A firestorm dropped over cover: little blast, and a whole block or stand of trees alight.
  speed: 210,
  damage: 24,
  blastRadius: 36,
  tileDamage: 15,
  minRange: 70,
  maxRange: 380,
  spread: 0.02,
  lobbed: true,
  incendiary: { dps: 6, duration: 4 },
  vs: { infantry: 1.4, heavy: 0.4 },
};

/**
 * The ballistic missile (SPEC §6): launched straight up, it comes down on the aim point a couple of
 * seconds later with a blast that craters the ground around it. Shared by the L launcher and the
 * trailer's missile erector.
 */
const BALLISTIC: ShellSpec = {
  kind: 'shell',
  speed: 170,
  damage: 110,
  blastRadius: 48,
  // Enough to crater all the open ground in the blast (`SCARS`, content/terrain.ts).
  tileDamage: 320,
  minRange: 110,
  maxRange: 440,
  spread: 0.01,
  lobbed: true,
  vertical: true,
  look: 'ballistic',
  ignites: 0.3,
  vs: { heavy: 1.2 },
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  heavyCannon: {
    id: 'heavyCannon',
    size: 'L',
    mass: 110,
    name: 'Heavy cannon',
    short: 'Cannon',
    blurb: 'Slow, heavy shells: HE, AP, canister, or incendiary.',
    role: 'main',
    category: 'ballistic',
    reload: 1.5,
    muzzle: 28,
    traverseDegPerSec: 0,
    projectile: CANNON_HE,
    shells: { he: CANNON_HE, ap: CANNON_AP, canister: CANNON_CANISTER, incendiary: CANNON_INCENDIARY },
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
    projectile: HOWITZER_HE,
    shells: { he: HOWITZER_HE, incendiary: HOWITZER_INCENDIARY },
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
    power: 4.4,
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
    power: 1.65,
    projectile: { kind: 'beam', damage: 4, tileDamage: 2, range: 110, spread: 0.01, ignites: 0.02, vs: { infantry: 1.4, heavy: 0.3 } },
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
    // Pulses fast enough to read as one continuous beam: 17.6 power/s against the reactor's 10.
    reload: 0.1,
    muzzle: 9,
    traverseDegPerSec: 240,
    power: 1.76,
    projectile: { kind: 'beam', damage: 2.4, tileDamage: 1.5, range: 260, spread: 0.004, ignites: 0.04 },
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
    power: 16.5,
    projectile: { kind: 'beam', damage: 42, tileDamage: 45, range: 420, spread: 0.002, ignites: 0.6, vs: { infantry: 0.6, heavy: 1.15 } },
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
  swarmPod: {
    id: 'swarmPod',
    size: 'M',
    mass: 50,
    name: 'Swarm missile pod',
    short: 'Swarm',
    blurb: 'Eight small missiles, each to its own target.',
    role: 'missile',
    category: 'munitions',
    reload: 6,
    muzzle: 2,
    traverseDegPerSec: 0,
    ammo: 12,
    // A quick ripple: the pod empties in about half a second, missiles fanning out to their targets.
    salvo: { count: 8, interval: 0.06 },
    projectile: {
      kind: 'missile',
      // Small, quick, and agile: light warheads that shred troops and soft vehicles, not tanks.
      speed: 200,
      turnRate: 6.5,
      damage: 9,
      blastRadius: 8,
      tileDamage: 10,
      range: 400,
      spread: 0.9,
      lockRadius: 40,
      swarm: true,
      vs: { infantry: 1.3, heavy: 0.45 },
    },
  },
  empEmitter: {
    id: 'empEmitter',
    size: 'M',
    mass: 40,
    name: 'EMP emitter',
    short: 'EMP',
    blurb: 'A pulse that stops vehicles dead for a few seconds.',
    // On Auto it waits for a crowd (`EMP.autoMin` vehicles in reach), a bomb truck, or a missile.
    role: 'auto',
    category: 'energy',
    reload: 9,
    muzzle: 0,
    traverseDegPerSec: 0,
    autoGroup: 4,
    // Half a stock capacitor: firing it leaves little for the lasers.
    power: 30,
    projectile: { kind: 'pulse', radius: 110, stun: 3.5, stunVs: { heavy: 0.6 } },
  },
  flamethrower: {
    id: 'flamethrower',
    size: 'M',
    mass: 45,
    name: 'Flamethrower',
    short: 'Flamer',
    blurb: 'Sets troops, trees, and buildings burning. Short reach.',
    role: 'auto',
    category: 'munitions',
    // A steady gout: ten licks a second, fuel counted per lick (250 is about 25 s of flame).
    reload: 0.1,
    muzzle: 11,
    traverseDegPerSec: 200,
    autoGroup: 1,
    ammo: 250,
    projectile: {
      kind: 'flame',
      damage: 1.6,
      tileDamage: 1,
      range: 90,
      cone: 0.2,
      spread: 0,
      burn: { dps: 5, duration: 3 },
      vs: { infantry: 1.6, light: 0.8, heavy: 0.3 },
    },
  },
  railgun: {
    id: 'railgun',
    size: 'L',
    mass: 125,
    name: 'Railgun',
    short: 'Railgun',
    blurb: 'A slug through every unit in a line; ignores armor.',
    role: 'main',
    category: 'energy',
    reload: 2.6,
    muzzle: 30,
    traverseDegPerSec: 0,
    power: 24,
    // Through the front armor as if it weren't there; best on heavy armor, wasted on troops.
    projectile: { kind: 'rail', damage: 70, tileDamage: 60, range: 440, spread: 0.002, falloff: 0.8, wallLoss: 0.55, penetration: 1, vs: { infantry: 0.5, heavy: 1.3 } },
  },
  ballisticMissile: {
    id: 'ballisticMissile',
    size: 'L',
    mass: 130,
    name: 'Ballistic missile launcher',
    short: 'Ballistic',
    blurb: 'One huge missile, arcing in: a crater and a blast.',
    role: 'main',
    category: 'munitions',
    reload: 6,
    muzzle: 4,
    traverseDegPerSec: 0,
    ammo: 6,
    projectile: BALLISTIC,
  },
  // Built into the trailer's missile erector (content/trailer.ts), not sold on its own. Its mass is the module's.
  erectorMissile: {
    id: 'erectorMissile',
    name: 'Erector missile',
    short: 'Erector',
    role: 'missile',
    category: 'munitions',
    reload: 8,
    muzzle: 4,
    traverseDegPerSec: 0,
    ammo: 2,
    projectile: BALLISTIC,
  },
  arcProjector: {
    id: 'arcProjector',
    size: 'L',
    mass: 115,
    name: 'Arc projector',
    short: 'Arc proj',
    blurb: 'Lightning that leaps from unit to unit. Big power.',
    role: 'main',
    category: 'energy',
    reload: 1.5,
    muzzle: 26,
    traverseDegPerSec: 0,
    power: 18,
    projectile: { kind: 'arc', damage: 28, tileDamage: 10, range: 240, spread: 0.01, jumps: 4, jumpRange: 70, falloff: 0.75, vs: { infantry: 1.3, heavy: 0.7 } },
  },
  // The railgun's smaller sibling: quicker, cheaper on power, through a unit or two rather than a column.
  coilgun: {
    id: 'coilgun',
    size: 'M',
    mass: 50,
    name: 'Coilgun',
    short: 'Coilgun',
    blurb: 'Fast flat slugs that go through a unit or two.',
    role: 'secondary',
    category: 'energy',
    reload: 0.8,
    muzzle: 11,
    traverseDegPerSec: 200,
    power: 6,
    projectile: { kind: 'rail', damage: 22, tileDamage: 15, range: 340, spread: 0.006, falloff: 0.6, wallLoss: 0.3, penetration: 0.6, vs: { infantry: 0.6, heavy: 1.1 } },
  },
  // The arc projector's small, automatic cousin: short leaps through troops close to the hull.
  teslaCoil: {
    id: 'teslaCoil',
    size: 'S',
    mass: 16,
    name: 'Tesla coil',
    short: 'Tesla',
    blurb: 'Auto lightning that leaps through nearby troops.',
    role: 'auto',
    category: 'energy',
    reload: 0.7,
    muzzle: 3,
    traverseDegPerSec: 360,
    autoGroup: 1,
    power: 3,
    projectile: { kind: 'arc', damage: 6, tileDamage: 2, range: 90, spread: 0.01, jumps: 2, jumpRange: 45, falloff: 0.7, vs: { infantry: 1.4, heavy: 0.3 } },
  },
  rocketArtillery: {
    id: 'rocketArtillery',
    size: 'M',
    mass: 55,
    name: 'Rocket artillery',
    short: 'Rkt arty',
    blurb: 'Twelve rockets carpet the ground around the cursor.',
    role: 'missile',
    category: 'munitions',
    reload: 8,
    muzzle: 4,
    traverseDegPerSec: 0,
    ammo: 10,
    // A ripple about a second long; a salvo is one shot of ammo.
    salvo: { count: 12, interval: 0.07 },
    projectile: {
      kind: 'shell',
      // Unguided, over cover, each landing somewhere in the zone: a carpet, not a precise strike.
      speed: 230,
      damage: 9,
      blastRadius: 12,
      tileDamage: 25,
      minRange: 80,
      maxRange: 360,
      spread: 0,
      lobbed: true,
      scatter: 32,
      look: 'rocket',
      vs: { infantry: 1.3, heavy: 0.4 },
    },
  },
  thermobaric: {
    id: 'thermobaric',
    size: 'M',
    mass: 50,
    name: 'Thermobaric launcher',
    short: 'Thermo',
    blurb: 'Lobbed canisters burst into fireballs that set all alight.',
    role: 'secondary',
    category: 'munitions',
    reload: 2.4,
    muzzle: 9,
    traverseDegPerSec: 160,
    ammo: 18,
    projectile: {
      kind: 'shell',
      speed: 190,
      damage: 18,
      blastRadius: 22,
      tileDamage: 40,
      minRange: 50,
      maxRange: 230,
      spread: 0.03,
      lobbed: true,
      incendiary: { dps: 6, duration: 3 },
      look: 'canister',
      vs: { infantry: 1.6, heavy: 0.5 },
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
  guidedMissile: {
    id: 'guidedMissile',
    name: 'Guided missile',
    short: 'Guided',
    role: 'auto',
    category: 'munitions',
    reload: 8,
    muzzle: 6,
    traverseDegPerSec: 120,
    projectile: {
      kind: 'missile',
      // One heavy warhead, flown in on the designator: point defense can still catch it.
      speed: 150,
      turnRate: 3.2,
      damage: 22,
      blastRadius: 0,
      tileDamage: 30,
      range: 320,
      spread: 0.03,
      lockRadius: 0,
      sight: true,
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
  trapdoorRocket: {
    id: 'trapdoorRocket',
    name: 'Anti-tank rocket',
    short: 'AT rocket',
    role: 'auto',
    category: 'munitions',
    // One rocket a lift of the lid (the lid's cycle paces it, not the reload).
    reload: 1,
    muzzle: 4,
    traverseDegPerSec: 360,
    projectile: {
      kind: 'shell',
      speed: 170,
      damage: 12,
      blastRadius: 0,
      tileDamage: 10,
      minRange: 0,
      maxRange: 210,
      spread: 0.04,
    },
  },
  hedgeGunShot: {
    id: 'hedgeGunShot',
    name: 'Anti-tank gun',
    short: 'AT gun',
    role: 'auto',
    category: 'ballistic',
    // A high-velocity round: flat and fast, one hard hit, then a long reload.
    reload: 4.5,
    muzzle: 9,
    traverseDegPerSec: 50,
    projectile: {
      kind: 'shell',
      speed: 400,
      damage: 16,
      blastRadius: 0,
      tileDamage: 20,
      minRange: 0,
      maxRange: 260,
      spread: 0.02,
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
  batteryShells: {
    id: 'batteryShells',
    name: 'Field battery',
    short: 'Battery',
    role: 'auto',
    category: 'munitions',
    // Between volleys: long enough to get clear and find the battery before the next one.
    reload: 7.5,
    muzzle: 12,
    traverseDegPerSec: 30,
    // Four guns in turn: the rounds land one after another across the zone.
    salvo: { count: 4, interval: 0.3 },
    barrage: { radius: 30, flight: 2.4 },
    projectile: {
      kind: 'shell',
      // Speed is set per round so each lands `barrage.flight` after it's fired.
      speed: 150,
      damage: 12,
      blastRadius: 14,
      tileDamage: 40,
      // It can't lay its guns on anything close: drive at the battery and the shells fall behind.
      minRange: 90,
      maxRange: 330,
      spread: 0,
      lobbed: true,
      // Plunging fire: some of it finds the deck mounts.
      strike: { target: 'hardpoints', bypass: 0.25 },
    },
  },
  siegeCannon: {
    id: 'siegeCannon',
    name: 'Siege cannon',
    short: 'Siege gun',
    role: 'auto',
    category: 'ballistic',
    // The biggest gun an enemy vehicle carries: slow to load, and every round a real hit.
    reload: 5,
    muzzle: 20,
    traverseDegPerSec: 35,
    projectile: {
      kind: 'shell',
      speed: 250,
      damage: 26,
      blastRadius: 8,
      tileDamage: 60,
      minRange: 0,
      maxRange: 280,
      spread: 0.025,
    },
  },
  trainMissiles: {
    id: 'trainMissiles',
    name: 'Missile car rack',
    short: 'Rack',
    role: 'auto',
    category: 'munitions',
    // The missile launcher's homing missiles, a pair at a time off an armored train (SPEC-armored-train.md §T6).
    reload: 6.5,
    muzzle: 6,
    traverseDegPerSec: 90,
    salvo: { count: 2, interval: 0.3 },
    projectile: {
      kind: 'missile',
      speed: 105,
      turnRate: 2.2,
      damage: 9,
      blastRadius: 0,
      tileDamage: 15,
      range: 340,
      spread: 0.35,
      lockRadius: 0,
      strike: { target: 'hardpoints', bypass: 0.5 },
    },
  },
  trainAutocannon: {
    id: 'trainAutocannon',
    name: 'Train autocannon',
    short: 'Autocannon',
    role: 'auto',
    category: 'ballistic',
    // An autocannon car's mount (SPEC-armored-train.md §T6): bursts of light shells, shorter in reach than the train's guns.
    reload: 2.6,
    muzzle: 8,
    traverseDegPerSec: 150,
    salvo: { count: 4, interval: 0.11 },
    projectile: {
      kind: 'shell',
      speed: 280,
      damage: 2.5,
      blastRadius: 0,
      tileDamage: 4,
      minRange: 0,
      maxRange: 230,
      spread: 0.06,
    },
  },
  trainHowitzer: {
    id: 'trainHowitzer',
    name: 'Train howitzer',
    short: 'Howitzer',
    role: 'auto',
    category: 'munitions',
    // A howitzer car's gun (SPEC-armored-train.md §T6): the field battery's area fire, two rounds
    // on a smaller zone, from a car in view.
    reload: 8,
    muzzle: 12,
    traverseDegPerSec: 40,
    salvo: { count: 2, interval: 0.4 },
    barrage: { radius: 26, flight: 2.6 },
    projectile: {
      kind: 'shell',
      // Speed is set per round so each lands `barrage.flight` after it's fired.
      speed: 150,
      damage: 14,
      blastRadius: 14,
      tileDamage: 40,
      // It can't lay its gun on anything close: hug the train and its shells fall beyond the hull.
      minRange: 90,
      maxRange: 330,
      spread: 0,
      lobbed: true,
      strike: { target: 'hardpoints', bypass: 0.25 },
    },
  },
  trainRockets: {
    id: 'trainRockets',
    name: 'Rocket car rack',
    short: 'Rockets',
    role: 'auto',
    category: 'munitions',
    // A rocket car's ripple (SPEC-armored-train.md §T6): six unguided rockets, wide of the mark as often as not.
    reload: 6,
    muzzle: 6,
    traverseDegPerSec: 70,
    salvo: { count: 6, interval: 0.14 },
    projectile: {
      kind: 'shell',
      speed: 190,
      damage: 4,
      blastRadius: 5,
      tileDamage: 12,
      minRange: 0,
      maxRange: 260,
      spread: 0.1,
    },
  },
  troopRockets: {
    id: 'troopRockets',
    name: 'Troop car rockets',
    short: 'Slits',
    role: 'auto',
    category: 'munitions',
    // Riflemen with anti-tank rockets at a troop car's firing slits (SPEC-armored-train.md §T6):
    // the infantry's rockets, two at a time, short range, at the running gear.
    reload: 3.4,
    muzzle: 6,
    traverseDegPerSec: 360,
    salvo: { count: 2, interval: 0.35 },
    projectile: {
      kind: 'shell',
      speed: 150,
      damage: 5,
      blastRadius: 0,
      tileDamage: 4,
      minRange: 0,
      maxRange: 125,
      spread: 0.06,
      strike: { target: 'treads', bypass: 1 },
    },
  },
  railwayGunShell: {
    id: 'railwayGunShell',
    name: 'Railway gun',
    short: 'Rail gun',
    role: 'auto',
    category: 'munitions',
    // One huge shell (SPEC-armored-train.md §T7), laid on where the Behemoth will be when it lands.
    // Slower than it might be: the hull is at full speed the whole fight, with only its steering to get clear.
    reload: 11,
    muzzle: 30,
    traverseDegPerSec: 30,
    barrage: { radius: 40, flight: 3.5, spread: 0 },
    projectile: {
      kind: 'shell',
      // Speed is set per round so it lands `barrage.flight` after it's fired.
      speed: 150,
      damage: 45,
      blastRadius: 40,
      // Enough to crater all the open ground in its burst (`SCARS` in content/terrain.ts, at the
      // burst's half-strength edge); as enemy fire, it never breaks the line.
      tileDamage: 200,
      // It can't lay its gun on what's close: by then the car is in view and the shelling is over.
      minRange: 300,
      maxRange: 1200,
      spread: 0,
      lobbed: true,
      strike: { target: 'hardpoints', bypass: 0.25 },
      unstoppable: true,
    },
  },
  walkerGuns: {
    id: 'walkerGuns',
    name: 'Walker cannons',
    short: 'Twin cannon',
    role: 'auto',
    category: 'ballistic',
    // Twin guns under the carapace: short bursts into the trailer or the rear plate.
    reload: 2.2,
    muzzle: 7,
    traverseDegPerSec: 160,
    salvo: { count: 4, interval: 0.1 },
    projectile: {
      kind: 'shell',
      speed: 280,
      damage: 3.5,
      blastRadius: 0,
      tileDamage: 4,
      minRange: 0,
      maxRange: 210,
      spread: 0.05,
    },
  },
  siegeAutocannon: {
    id: 'siegeAutocannon',
    name: 'Siege tank autocannon',
    short: 'Rear gun',
    role: 'auto',
    category: 'ballistic',
    reload: 2.6,
    muzzle: 8,
    traverseDegPerSec: 140,
    salvo: { count: 3, interval: 0.12 },
    projectile: {
      kind: 'shell',
      speed: 280,
      damage: 3,
      blastRadius: 0,
      tileDamage: 4,
      minRange: 0,
      maxRange: 220,
      spread: 0.05,
    },
  },
};
