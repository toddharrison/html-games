/**
 * Game-wide tuning knobs in one place. Per-unit data stays in its own table (`CHASSIS`, `WEAPONS`,
 * `ENEMIES`, `MATERIALS`, `OBSTACLE_CLASSES`, `ADDONS`, `TRAILER_MODULES`, depot stock), and so do
 * a chassis' own speeds and steering. Type-only imports, so any module can import this without
 * cycles.
 */
import type { BiomeId } from './biomes';
import type { WaveSide } from './enemies';

// ── Movement ────────────────────────────────────────────────────────────────────────────────────

/** The Behemoth's drive, beyond what each chassis sets (SPEC §4.2). */
export const MOVEMENT = {
  /** Damaged or overloaded treads accelerate more weakly, but never below this share, so recovery never stalls. */
  accelFloor: 0.25,
  /**
   * Share of the room to the field edge the steering plans to stop in: the target shrinks as the
   * hull closes in and the eased acceleration lags it, so it plans short.
   */
  edgeMargin: 0.6,
  /** Traction never falls below this share, however much of the ground box is on ice (SPEC §4.6). */
  minGrip: 0.15,
};

/**
 * Mass against tread capacity (SPEC §5.3). Speeds, acceleration, and lateral speed scale with the
 * load ratio (installed mass ÷ capacity): gently up to capacity, steeply beyond it.
 */
export const MASS = {
  /** Speed gained per unit of spare capacity: an empty Behemoth is 15% faster than at its rating. */
  underload: 0.15,
  /** Speed lost per unit of overload: 10% over capacity = 20% slower. */
  overload: 2,
  /** Share of a trailer's mass (frame and modules) the treads feel: it rolls on its own. */
  towed: 0.5,
  /** However overloaded, it keeps at least this share of its rated speeds. */
  floor: 0.4,
};

/** Fording (SPEC §4.5): how water holds the Behemoth back. */
export const WADING = {
  /**
   * Share of the footprint in a water material at which its speed cap applies in full; below
   * that the cap blends in, so the hull slows as it noses in rather than all at once.
   */
  fullAt: 0.35,
  /** Deceleration (units/s²) while the hull is over its water speed cap. */
  drag: 45,
};

/** Glancing off immovable terrain (SPEC §4.2): the Behemoth slides along it but keeps moving. */
export const DEFLECT = {
  /**
   * Sideways shove while held against a rock face: this multiple of forward speed, but at least
   * `minSlideSpeed` (units/s), so even a slow Behemoth clears the face quickly.
   */
  slideSpeedScale: 1.4,
  minSlideSpeed: 50,
  /** Armor scraped off the contact side per second at cruise speed; overflow strains the treads. */
  scrapePerSec: 4,
  /** Seconds between spark events while scraping. */
  sparkInterval: 0.1,
};

/** Ramming and crushing (SPEC §4.2). Per-obstacle damage and speed dips are in `OBSTACLE_CLASSES`. */
export const RAM = {
  /** Ram gear never quite makes collisions free: its rating is capped here. */
  max: 0.9,
  /** Share of an obstacle's speed dip that full ram gear cancels. */
  speedDipCut: 0.6,
  /** An enemy is crushed once the hull overlaps this share of its radius. */
  crushRadius: 0.6,
  /**
   * Units too big to crush (`EnemyDef.ramDamage`): full ram gear adds this share again to the
   * damage a ram deals; a rammed unit is shoved aside at `shove` units/s and can't be rammed
   * again for `again` seconds (it's still sliding off the prow).
   */
  gearDamage: 1,
  shove: 120,
  again: 0.8,
};

// ── Damage ──────────────────────────────────────────────────────────────────────────────────────

/** How components lose performance as they're damaged (SPEC §5.1, §5.4). `i` = integrity fraction. */
export const DEGRADE = {
  /**
   * Speed scale = floor + (1 − floor) × i^exponent while a tread set works: worn treads slow the
   * Behemoth to `treadSpeedFloor` of its speeds (min, cruise, top), and only losing every set
   * (Immobilized) stops it.
   */
  treadSpeedFloor: 0.5,
  treadSpeedExponent: 0.75,
  /** Reactor and generator output = floor + (1 − floor) × i, while they're working: 30% integrity still makes 51%. */
  powerFloor: 0.3,
  /** Auto-weapon reach and reveal radius = floor + (1 − floor) × sensor integrity. */
  sensorFloor: 0.35,
  /** Turret ring and mount traverse = floor + (1 − floor) × i, until destroyed (stuck). */
  traverseFloor: 0.35,
  /** Reload time × (1 + this × damage): up to 2× slower near destruction. */
  reloadPenalty: 1,
};

/** The reactor's end (SPEC §5.1). Blast radius and damage are per chassis (`reactor`). */
export const DETONATION = {
  /** Seconds the self-destruct key must be held. Provisional (SPEC §16 Q9). */
  selfDestructHold: 1.5,
  /**
   * Rounds left in the magazine add to the blast radius (SPEC §5.1): units per point of their
   * combined damage (a full missile rack, 24 × 26, adds about 12).
   */
  radiusPerMunition: 0.02,
  /** Beyond the blast radius, a fringe this share of it wide still takes falling-off damage. */
  fringe: 0.4,
};

/**
 * Magazine cook-off (SPEC §5.1): when the magazine is destroyed with rounds in it, they go off
 * inside the hull. The blast is this share of the rounds' combined damage (a full missile rack,
 * 24 × 26, makes about 190). `inside` of it goes to the parts next to the magazine
 * (`ChassisDef.magazine.neighbors`), the rest to every armor zone from the inside, evenly.
 */
export const MAGAZINE = {
  perDamage: 0.3,
  inside: 0.6,
};

// ── Weapons ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Ripple fire (SPEC §5.2): two or more L guns on one trigger fire in turn, the next ready gun at
 * most this often (seconds), instead of all at once.
 */
export const RIPPLE_GAP = 0.25;

/**
 * Fire control (SPEC §5.1, §5.2): the core component that runs everything firing on Auto.
 */
export const FIRE_CONTROL = {
  /** Extra spread multiplier at zero integrity while it still works: auto spread × (1 + this × damage). */
  damaged: 1,
  /** Spread multiplier for built-in autos under local control, once it's destroyed. Tune in playtest. */
  local: 2.5,
  /** Toggle group (key) for weapons with no group of their own that the player put on Auto. */
  group: 4 as const,
};

/** Pools (`PoolSpec`) apply their damage in ticks, not every step. */
/** Swarm missiles (SPEC §6 swarm pod). Provisional. */
export const SWARM = {
  /** A missile whose target dies turns onto the nearest unit in view within this (world units). */
  retarget: 250,
};

/**
 * Fire (SPEC §6 "Fire", `sim/fire.ts`): burning units, burning terrain (each material's `burns`),
 * burning fuel on ground that doesn't burn itself, and what starts fires. Provisional.
 */
export const FIRE = {
  /** Seconds between burn ticks, for units and tiles alike. */
  tick: 0.25,
  /** How finely a flame is traced for cover, mines, and what it sets alight. */
  traceStep: 4,
  /** A burning tile scorches every unit standing in it this much a second, and sets it alight. */
  tileDps: 4,
  /** What a burning tile (or a burning unit's touch) sets a unit burning with. */
  burn: { dps: 4, duration: 2 },
  /** Burning terrain's damage by target class: troops burn, armor shrugs most of it off. */
  vs: { infantry: 1.6, light: 0.8, heavy: 0.3 },
  /** Most tiles burning at once: past it, no new fires start (keeps a forest fire in bounds). */
  maxTiles: 160,
  /** Burning fuel lying on ground that doesn't burn itself: it scorches like any burning tile, then burns out. */
  fuel: {
    /** Seconds a flamethrower's fuel burns where it lands, and how far from the nozzle it starts landing. */
    flame: 2.5,
    from: 28,
    /** Seconds the ground burns after a fireball (thermobaric, incendiary shells, a fuel tank going up). */
    burst: 3.5,
    /** Seconds a vehicle's wreck burns. */
    wreck: 7,
    /** Odds a second that burning fuel catches each neighbor that burns. */
    spread: 0.25,
  },
  /** A burning unit sets alight what burns under it; `spread` is its odds a second of lighting each unit within `touch` of it. */
  unit: { spread: 0.5, touch: 3 },
  /**
   * Odds that a hit sets alight each tile that burns where it strikes, by the kind of round (a
   * weapon's own `ignites` overrides it). A burst rolls for every tile in its blast and a tile beyond.
   */
  ignites: { shell: 0.06, missile: 0.08, bullet: 0, beam: 0, rail: 0.25, arc: 0.2 },
  /** Odds a lightning strike sets alight the tile it lands on. */
  lightning: 1,
  /** A blast of fuel (a tank, a derrick: `explodes.fire`) throws fire over this share of its radius. */
  blastReach: 0.6,
  /** The Behemoth's last blast and a trailer going up throw fire over this share of theirs. */
  detonationReach: 0.55,
  /** Rain (a rainstorm's squall, at full strength): the spread multiplier, and odds a second that it puts a fire out. */
  rain: { spread: 0.2, out: 0.25 },
  /**
   * Smoke: a tile that burns itself (a wood, a house) and a burning wreck pour smoke once they've
   * burned `after` seconds, over every tile within `reach` tiles; it hangs `linger` seconds after
   * the fire is out. A unit in smoke is concealed like one in a wood, and its own fire scatters `spread`×.
   * A wreck smokes far less (`wreck`): over its own tile only, thinner, and gone sooner.
   */
  smoke: { after: 0.75, reach: 1, linger: 4, spread: 1.8, wreck: { reach: 0, linger: 1.5 } },
};

/** EMP (SPEC §6 EMP emitter). Provisional. */
export const EMP = {
  /** On Auto it fires once this many working vehicles are in reach (or a bomb truck, or a missile). */
  autoMin: 2,
  /** A vehicle with less stun than this left counts as working again (Auto can renew it). */
  renew: 0.5,
};

/**
 * Oil spills (`sim/spills.ts`): a slick soaks away after `life` s if nothing lights it; alight,
 * every tile of it burns for `burn` s.
 */
export const OIL = { life: 45, burn: 9 };

export const POOL = {
  /** Seconds between damage ticks. */
  tick: 0.25,
  /** The Behemoth's treads take a pool's `dps` × this while its ground box is over it. Tune in playtest. */
  treads: 1.5,
  /** A hitched trailer over a pool takes `dps` × this (armor first). */
  trailer: 1,
};

// ── Enemies ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Where units enter the field (`sim/spawner.ts`), for the defenders, the alert clock's waves, and
 * the last stand alike.
 */
export const SPAWNER = {
  /** How far beyond the visible frame units spawn, so threat arrows give a few seconds' warning. */
  spawnDistance: 110,
  /** `cover` spawns: how far ahead of the frame to look for forest or rubble. */
  coverBand: [20, 160] as const,
  /** `edge` spawns (field batteries): the share of the field's width at either side they dig in within. */
  edgeBand: 0.28,
  /** `hedge` spawns (hedge guns, SPEC §7.4): at least this far across the field from the Behemoth's line. */
  hedgeOffset: 50,
  /**
   * `burrow` spawns (trapdoor teams, SPEC §7.4): open sand this far across from the Behemoth's line
   * (beside the path, so it drives past them), a post's later holes within `cluster` of its first.
   */
  burrow: { offset: [45, 100] as const, cluster: 36 },
};

/** Trapdoor teams (SPEC §7.4; the lid's timings in `EnemyDef.trapdoor`). Provisional (M3). */
export const TRAPDOOR = {
  /**
   * The lid lifts once the hull is no more than this short of level with the hole: early enough
   * for a second lift before the hole drops out of the frame. Shots strike any arc (user's call),
   * about a third each front, flanks, and rear.
   */
  lead: 100,
  /**
   * They pull the lid down when they see fire coming (user's call): a player round that will pass
   * within `margin` of the hole, arriving between `react` (any sooner and it's too late) and `look`
   * seconds from now. Beams arrive at once and can't be seen coming.
   */
  duck: { react: 0.2, look: 0.8, margin: 3 },
};

/** Area fire (SPEC §7 artillery; per-weapon numbers in `WeaponDef.barrage`). Provisional (M3). */
export const BARRAGE = {
  /** Its shells hit the enemy's own units in the zone too, at this share of the damage. */
  friendlyFire: 0.5,
};

/**
 * Battle-mode objectives (SPEC §4.4; `sim/objective.ts`, per-mode numbers in content/modes.ts).
 * Provisional (M3).
 */
export const OBJECTIVE = {
  /** A target this far behind the frame's trailing edge is out of reach: lost. */
  lostBehind: 40,
  /** A convoy vehicle this far past the extraction line has escaped. */
  escapeBeyond: 16,
  /** How many rows either side of its place in the column a convoy vehicle may start, looking for open ground. */
  spawnSearch: 5,
};

/**
 * Armored trains (SPEC §4.4 Intercept, §7.3; `sim/train.ts`). A train runs the battle's rail line
 * at a share of the Behemoth's own cruise speed, so it's the same fight for any build.
 */
export const TRAIN = {
  /**
   * Its pace with every engine running, as a share of the Behemoth's present **top speed** (treads
   * and load, not terrain): faster than the hull cruises, so only a full surge gains on it. With
   * engines lost it drops toward `paceFloor` of that, which is still above the hull's cruise:
   * `pace × (paceFloor + (1 − paceFloor) × running ÷ total)`. No engines: it brakes to a stop.
   */
  pace: 0.75,
  paceFloor: 0.78,
  /** How fast it changes pace (units/s²), and brakes once nothing pulls it. */
  ease: 8,
  brake: 10,
  /** It starts at rest, pulling out of its station, its tail this far ahead of the Behemoth's nose. */
  startGap: 200,
  /** The gap between two coupled vehicles (world units). */
  coupling: 4,
  /**
   * Scuttling (SPEC §7.3): what's left stranded on the rails behind a wreck is abandoned by its
   * crew. `fuse` s later its charges fire one vehicle at a time from the tail forward, `ripple` s
   * apart, each a blast of `radius` and `damage`.
   */
  scuttle: { fuse: 3, ripple: 0.25, radius: 40, damage: 50 },
  /**
   * Wrecks and pileups (SPEC §7.3). A vehicle destroyed on the rails, or one that runs into a
   * break in the line or a wreck ahead of it, leaves the rails: it comes to rest up to `scatter`
   * units off the line, turned up to `turn` degrees. Each vehicle that piles in takes `brake`
   * units/s off what's behind it, and under `stop` units/s the rest pulls up short of the pile.
   * A vehicle lost to a pileup pays `salvage` of its worth (nothing if it went into a river).
   *
   * The pile is a wreck in earnest: each vehicle rides `crumple` of its own length up into the
   * one before it and is thrown to the other side from it (an accordion); it goes up as it lands
   * (`blast`, after a moment within `fuse`), its wreck burns for `burn` s, and with odds `cookOff.odds`
   * what it carried cooks off a few seconds later (a second blast that throws fire about).
   */
  derail: {
    brake: 6,
    stop: 10,
    scatter: [10, 34] as const,
    turn: 75,
    salvage: 0.5,
    crumple: 0.4,
    blast: { radius: 34, damage: 28, fuse: [0, 0.5] as const },
    cookOff: { odds: 0.6, radius: 30, damage: 22, fuse: [1, 5] as const },
    burn: 16,
  },
  /**
   * What a wreck leaks (SPEC §7.3). A vehicle that leaves the rails may leak plasma from its
   * power cells (`plasma`, its odds; an engine's reactor leaks oftener, `engine`) or else oil
   * (`oil`, the odds of that for what doesn't leak plasma). It leaks `spots` of it (a range), one
   * every `every` s (a range), each landing `reach` units from the wreck. A plasma spot is a pool
   * like the plasma thrower's (`pool`: it burns units, tiles, and treads). An oil spot is a
   * slick `slick` units in radius (a range) that does nothing until fire reaches it (`OIL`).
   */
  leak: {
    plasma: 0.25,
    engine: 0.6,
    oil: 0.45,
    spots: [2, 4] as const,
    every: [0.4, 1.4] as const,
    reach: [14, 44] as const,
    pool: { radius: 11, duration: 9, dps: 6, tileDps: 8 },
    slick: [9, 15] as const,
  },
  /**
   * Attack trains (SPEC §7.3): short trains with a pace of their own, `pace` of the Behemoth's
   * present top speed, so they come up from behind, pass, and run on ahead. One starts with its
   * nose `behind` units behind the frame, on a track that's clear for `clear` units back from the
   * frame's edge, and is gone once its tail is `leave` units ahead of the frame. When each comes
   * is the mode's (`ModeDef.train.raids`).
   */
  raid: { pace: 1.12, behind: 40, clear: 60, leave: 260 },
  /** Line tiles within this many columns of a vehicle take no damage: fire at the train never cuts the track. */
  shield: 1,
  /** Once the train is stopped, or has got away off the far end, the extraction line is pulled in to this far ahead of the Behemoth. */
  extractAhead: 600,
  /** Vehicles no longer part of the running train are dropped this far behind the frame. */
  dropBehind: 200,
  /** Where along the battle its line always crosses a river (shares of the way to the extraction line). */
  rivers: [0.35, 0.7] as const,
  /** Where along the battle its line crosses to the other side of the field, through a tunnel under the lane (the same shares). */
  crossovers: [0.2, 0.53] as const,
  /**
   * Collisions (SPEC-armored-train.md §T10). `strike`: a piece under way runs into the hull on the
   * track ahead of it. The struck armor takes `arc` (a trailer in tow takes the blow instead, and is
   * wrecked), the treads `treads`; the train's front vehicle takes `front`, and the train loses
   * `slow` of its speed (it eases back up at `ease`). The hull is shoved toward the line's wide side
   * at `shove` units/s until it's `clear` units clear of the train's path, and can't be struck again
   * for `again` s. An engine that strikes the hull goes up against it (`blast`, with fire; the hull's
   * share of it lands on the same armor the ram has just stripped, and `blast.treads` more goes to
   * the treads), a wreck where it stood, and what it pulled piles into that. `grind`: held this long (s) against
   * a wreck's face, the hull grinds through it (nothing stops it for good).
   */
  collide: { strike: { arc: 60, treads: 15, front: 90, slow: 0.3, shove: 80, clear: 8, again: 2, blast: { radius: 90, damage: 200, treads: 20 } }, grind: 2 },
  /**
   * An engine at the head of a piece under way plows through a wreck across its track that was no
   * part of its own train (another train's, thrown there): the wreck is swept off the rails, the
   * train loses `slow` of its speed (it eases back up), and the engine takes `damage` (never its last).
   * Its own train's wreck, and anything still standing on the rails, it piles into as before.
   */
  plow: { slow: 0.25, damage: 15 },
  /** A wreck comes to rest this far along the line from where it left the rails (a range, back to forward), slewed round by this share of `derail.turn` (a range). */
  wreckSlide: [-4, 6] as const,
  wreckSlew: [0.3, 1] as const,
  /** An attack train that finds something standing on its track behind the frame waits this long (s) and looks again. */
  raidRetry: 2,
};

/**
 * Encounters (SPEC §4.2, §7; `sim/encounter.ts`): a battle's enemies come from its node's threat
 * `T` (the sector map's strength) and its mix (doctrine × biome × approach). **Defenders are placed
 * by distance**: posts along the strip, each a group that drives in (or is found dug in) as the
 * frame reaches it. **Reinforcements arrive by time**: the alert clock sends escalating waves, so
 * the slower the Behemoth goes, the more of them reach it before the exit. Provisional numbers (M3).
 *
 * Sim bot reference (8 seeds, firing everything, T 7): the M1 spawner it replaces brought ~58 units
 * over ~220 s, whatever T was (its spawn interval, not its budget, was the limit).
 */
export const ENCOUNTER = {
  /** T of the opening battle (about the M1 spawner's density); the sector map adds to it as the run climbs. */
  baseThreat: 7,
  defenders: {
    /** Distance from the start to the first post, and the gap between posts (ranges). */
    first: [350, 550] as const,
    spacing: [550, 850] as const,
    /** No post this close before the extraction line. */
    clearOfExit: 250,
    /** Each post's threat is T × a roll in this range. */
    share: [0.45, 0.7] as const,
    /** A post's troops dig into cover up to this far beyond its line (falling back to open ground). */
    coverDepth: 140,
  },
  alert: {
    /** Seconds to the first wave; then the gap starts at `interval`, shrinking per wave to `minInterval`. */
    firstWave: 30,
    interval: 28,
    intervalShrink: 1.5,
    minInterval: 15,
    /** A wave's threat: T × `share` + `growth` per wave after the first. */
    share: 0.3,
    growth: 0.4,
    /** Waves hold back units while live threat is at T × this; what's held back arrives as room frees. */
    cap: 1.75,
    /** Seconds between a wave's units arriving, so a wave rolls in as a column rather than all at once. */
    trickle: 0.4,
    /**
     * Where wave vehicles come in from (weights): beyond the frame ahead or behind, or across a
     * field edge, level with somewhere on screen. Units that only fight from ahead (`spawn: 'ahead'`)
     * never come from behind; troops are dropped into cover ahead when there is some.
     */
    sides: { ahead: 3, behind: 2, left: 1.5, right: 1.5 } as Record<WaveSide, number>,
  },
};

/** How enemy units fire and move, across every unit type (per-unit numbers are in `ENEMIES`). */
export const ENEMY = {
  /** Seconds a newly spawned unit waits before its first shot (range). */
  firstCooldown: [1, 2.5] as const,
  /** Each reload is the weapon's `reload` × a roll in this range, so volleys drift apart. */
  reloadJitter: [0.85, 1.25] as const,
  /** Radians the turret may be off its target and still start lining up a shot. */
  aimTolerance: 0.12,
  /** Terrain never slows a unit below this share of its top speed, so it can always get out. */
  minTerrainSpeed: 0.3,
  /** How fast a vehicle's hull swings to a new heading (rad/s). Troops on foot turn at once. */
  hullTurnRate: 4,
  /**
   * A vehicle falling back from the Behemoth backs up, keeping its front armor toward it, as long
   * as it's slower than its `reverseSpeed` (SPEC §7 "Facing armor"). It starts once its course is
   * within `start` (radians) of straight away from the Behemoth and drives forward again past
   * `stop`, or once it's going `speedSlack` × its reverse speed (the gaps keep it from flip-flopping).
   */
  reverse: { start: (60 * Math.PI) / 180, stop: (95 * Math.PI) / 180, speedSlack: 1.25 },
};

/**
 * Steering shared by every enemy behavior (`sim/ai/steer.ts`). Each behavior's own settings are per
 * unit, in content/behaviors.ts.
 */
export const STEER = {
  /** Chasing a point that moves with the Behemoth: closing speed per unit of distance (1/s), on top of matching its velocity. */
  paceGain: 1.5,
  /** Walking to a fixed point: closing speed per unit of distance (1/s), and how close counts as there. */
  arriveGain: 2,
  arrived: 1.5,
  /** Units keep this much farther inside the frame's leading and trailing edges than the edge of the screen (radius + 4). */
  frameMargin: 8,
};

/**
 * Enemy smarts (`sim/ai/smarts.ts`; SPEC §15 "Enemy AI (M3)", phase 5). One global level (user's
 * call): `smarts` scales every one of them, 0 = the AI as it was before (circling skirmishers, random
 * sides), 1 = full.
 */
export const AI = {
  smarts: 1,
  /**
   * Skirmishers work toward the best bearing round the hull, rethought every `rethink` s over
   * `candidates` bearings. A bearing scores worse inside `gunCone` of where the main gun is laid (×
   * `gun`), better the more worn the armor arc it would hit (× `weakArc`), worse inside `spreadCone`
   * of another skirmisher (× `spread` each), and worse the farther round it is from where the unit is
   * now (× `stay` per half turn).
   */
  bearing: { rethink: 0.5, candidates: 16, gun: 1.2, gunCone: (70 * Math.PI) / 180, weakArc: 1, spread: 0.8, spreadCone: (45 * Math.PI) / 180, stay: 0.6 },
  /** Hold-ahead units drift to the side of their arc in front of the weaker front armor half, once it's `weaker` (share of max) worse. */
  front: { weaker: 0.05 },
  /** A unit under `share` of its HP holds its behavior's `fallBack` farther off, but within `reach` × its fire range. */
  hurt: { share: 0.4, reach: 0.9 },
  /**
   * Bomb trucks: while farther than `until` from the hull, with the main gun laid within `cone` of
   * them, they come in `offset` to the side it isn't covering.
   */
  charge: { until: 90, cone: (60 * Math.PI) / 180, offset: 50 },
};

/**
 * Navigation (`sim/ai/nav.ts`): how every moving unit routes to where its behavior wants it.
 * Straight when the way is clear; otherwise along a route planned over the tiles (A*), costed by
 * 1 / the ground's speed for the unit, plus hazards.
 */
export const NAV = {
  /** Seconds between rethinking the route (units are staggered over `stagger` slots so they don't all plan at once). */
  replan: 0.4,
  stagger: 8,
  /** Ground slower than this (share of top speed) on the straight line makes a unit plan a route, in case going round is quicker. */
  slow: 0.6,
  /**
   * A goal on ground the unit can't enter moves to the nearest open tile within `snap` tiles, scoring
   * each by its distance from the goal, plus `snapBias` × its distance from the unit, plus `snapAway` ×
   * how much nearer the hull it is than the goal.
   */
  snap: 4,
  snapBias: 0.5,
  snapAway: 3,
  /** A replan multiplies the cost of the tiles on the unit's current route by this, so it sticks to it (not for goals that move with the hull). */
  stick: 0.6,
  /** A waypoint counts as passed within this distance. */
  reached: 6,
  /** The planning window: this many columns beyond the unit and its goal, at most `maxCols` in all; at most `maxExpand` tiles searched. */
  pad: 6,
  maxCols: 48,
  maxExpand: 2500,
  /** Smoothing looks at most this many tiles ahead for a straight leg. */
  smoothReach: 16,
  /** Units this wide (radius) and up pay `edgeCost` on tiles beside anything impassable, so they keep to the middle of a gap. */
  wideAt: 7,
  edgeCost: 0.75,
  /**
   * The Behemoth's path: the hull's footprint and the ground it covers in the next `lead` s, `pad`
   * beyond a unit's radius, costs `cost` a tile to cross on the hull's line, falling to `edge` × that
   * at the zone's sides (units go round, not under the treads, and one caught in front gets out sideways).
   */
  hull: { lead: 0.75, pad: 6, cost: 25, edge: 0.2 },
  /**
   * A marked barrage zone (SPEC §7 artillery): `react` s after it's marked, units steer clear of it
   * (`pad` beyond their radius) and a goal inside it moves to its edge. Slow troops still get caught,
   * so luring a volley onto them works.
   */
  zone: { react: 0.8, pad: 6, cost: 30 },
  /** Explosive terrain still standing (fuel tanks, derricks): `cost` a tile within `share` × its blast radius. */
  blast: { share: 0.6, cost: 4 },
  /** Units push apart inside their radii plus `gap`: `gain` units/s per unit of overlap, at most `max` × their top speed. */
  sep: { gap: 2, gain: 8, max: 0.6 },
};

/** How long a hidden unit stays visible after giving itself away (SPEC §4.5). */
export const CONCEALMENT = {
  /** Seconds visible after its last shot. Lining up a shot (the telegraph) reveals it too. */
  afterFire: 2.5,
  /** Seconds visible after being hit. */
  afterHit: 1.5,
  /**
   * Minefields are swept out to this multiple of the reveal radius (SPEC §4.5): a mine shows up a
   * little before the hull is on it, even on Gen 1 sensors (user's call, Nov 2026: +15%).
   */
  mineSweep: 1.15,
};

/**
 * Conditions (SPEC §4.6; content/conditions.ts, `sim/conditions.ts`). Sight radii are world units
 * from the Behemoth's center, scaled by its sensors like auto-weapon reach (`autoReach`: damage
 * shrinks it, a higher grade stretches it). Provisional numbers (M3).
 */
export const CONDITION = {
  /** Chance a battle node (not the opening battle) has a condition; which one is weighted by biome. */
  chance: 0.3,
  night: {
    /** How far the Behemoth sees (the light tank's gun reaches 160, the heavy's 210). */
    sight: 140,
    /**
     * How far the enemy sees the Behemoth in the dark (to its nearest edge, roughly: less half its
     * length). Farther out, a unit can't open fire unless the Behemoth's muzzle flash marks it.
     */
    enemySight: 140,
    /** Seconds the Behemoth's own muzzle flash marks it for the enemy (point defense doesn't count). */
    flashMark: 2,
  },
  storm: {
    /** Seconds to the first squall, and between one squall's end and the next (ranges). */
    first: [12, 22] as const,
    gap: [16, 28] as const,
    /** Seconds a squall lasts at full strength, and to build up or die away either side of that. */
    length: [8, 12] as const,
    ramp: 2.5,
    /**
     * Sight at full strength, for both sides (the enemy can't open fire past it either); between
     * squalls it's unlimited (it eases in from `clearSight`).
     */
    sight: 110,
    clearSight: 500,
    /** Spread on both sides' fire at full strength (the wind). */
    spread: 1.6,
    /** Hovercraft speed at full strength. */
    hover: 0.55,
  },
  /**
   * Lightning in a thunderstorm's squalls (SPEC §4.6, `sim/lightning.ts`). A strike marks a spot,
   * then lands on the nearest unit within `reach` of it (the Behemoth included), or the ground, and
   * leaps on like a tesla bolt, whoever's units they are.
   */
  lightning: {
    /** Chance a storm battle in each biome is a thunderstorm instead (drawn on its own stream). */
    chance: { temperate: 0.4, arctic: 0, industrial: 0.4, desert: 0, wasteland: 0.25 } as Record<BiomeId, number>,
    /** Strikes come only while the squall is at least this strong. */
    squall: 0.5,
    /** Seconds between strikes (a range), and from the mark to the strike landing. */
    interval: [2, 4] as const,
    warn: 1,
    /**
     * Where a strike is aimed (weights): the Behemoth (the tallest metal on the field: a mild pull,
     * user's call), each enemy in the frame, or open ground in the frame.
     */
    pull: { behemoth: 2.5, enemy: 1, ground: 2 },
    /** A strike lands on a unit whose body is this close to the marked spot. */
    reach: 6,
    /** The bolt: damage to what it strikes, leaps (body to body), what it keeps each leap. */
    damage: 25,
    jumps: 3,
    jumpRange: 50,
    falloff: 0.75,
    /** Damage to the tile under a ground strike (enough to set off a fuel tank or derrick). */
    tileDamage: 60,
    /** Seconds every unit in the frame shows in the flash. */
    flash: 0.3,
  },
};

/**
 * The Immobilized last stand (SPEC §5.1): the defenders and the alert clock stop and reinforcements come in
 * escalating waves, from ahead and behind, until the reactor falls. Stands in for the alert
 * clock's "continuous" phase until M3.
 */
export const LAST_STAND = {
  /** Seconds from Immobilized to the first wave. */
  firstWave: 4,
  /** Seconds between waves: starts at `interval`, shrinking by `intervalShrink` per wave down to `minInterval`. */
  interval: 14,
  intervalShrink: 1,
  minInterval: 7,
  /** Threat spawned by the first wave, and how much more each later wave brings. */
  budget: 4,
  budgetGrowth: 2,
  /** Ceiling on live threat, so a long stand can't flood the sim. */
  maxThreat: 30,
  /**
   * Where wave units drive in from (weights): beyond the frame ahead or behind, or across either
   * edge of the field, level with somewhere on screen. Infantry use this only when there's no
   * cover to infiltrate.
   */
  sides: { ahead: 3, behind: 2, left: 2.5, right: 2.5 } as Record<WaveSide, number>,
  /** How far beyond a field edge flank arrivals start (world units). */
  flankDistance: 30,
  /** Infantry slip into concealing cover at least this far beyond the sensor reveal radius. */
  infiltrateMargin: 16,
  /** How often besiegers rethink their spot on the ring (s), and the chance they switch direction when they do. */
  replan: { every: [3, 7] as const, flip: 0.4 },
  /** Troops in the last stand look again for cover on the ring this often (s). */
  coverRecheck: 1,
  /** After a revive, units go back to their usual behavior and rethink within this many seconds. */
  release: [0.5, 2] as const,
  /**
   * Besiegers steer round the stranded hull: they keep `clearance` (plus their radius) off its corners,
   * and a path that would cross it goes via a waypoint `wayAngle` radians round the side they're on,
   * `wayOut` × that clearance from its center.
   */
  aroundHull: { clearance: 4, wayAngle: 0.8, wayOut: 1.15 },
};

// ── Terrain ─────────────────────────────────────────────────────────────────────────────────────

/** How troops pick their cover (SPEC §7: they hide in forests and buildings). */
export const COVER = {
  /**
   * How much a squad prefers better protection when choosing cover: score units (≈ world units of
   * extra walking) per point of `protection`. A building (0.6) beats an equally placed wood (0.3)
   * by 18.
   */
  preference: 60,
  /** A picked spot is jittered up to this far within its tile, so squads sharing a wood don't stack. */
  jitter: 4,
};

/**
 * Procedural terrain generation knobs shared by every biome (SPEC §4.5, §4.6). How much of each
 * feature a battle gets is per biome and approach (content/biomes.ts, content/approaches.ts).
 */
export const TERRAIN_GEN = {
  tileSize: 16,
  chunkCols: 16,
  /** Columns at the start of a battle kept clear so the player gets a moment to settle in. */
  clearStartCols: 18,
  forestBlobRadius: [1.5, 4] as const,
  townCols: [3, 7] as const,
  townRows: [2, 5] as const,
  /**
   * Settlement layouts (SPEC §4.6 "Settlements"): a town is cut into blocks by streets (a block is
   * `blockCols` × `blockRows` tiles, a street one tile), and each block is packed with structures
   * and open lots (content/structures.ts `SETTLEMENTS`). A town smaller than `townArea` tiles is a
   * village; the urban approach's are cities. `cars` is the share of street tiles with a parked car
   * (`avenueCars` on a city's avenue), `lotCars` of a car park's.
   */
  settlement: {
    townArea: 18,
    village: { blockCols: [2, 3] as const, blockRows: [2, 3] as const, cars: 0.03 },
    town: { blockCols: [2, 4] as const, blockRows: [2, 4] as const, cars: 0.07 },
    city: { blockCols: [3, 5] as const, blockRows: [3, 5] as const, cars: 0.1 },
    avenueCars: 0.04,
    lotCars: 0.5,
  },
  /** Share of rock features that are ridges rather than round outcrops. */
  ridgeChance: 0.45,
  outcropRadius: [0.9, 1.9] as const,
  /** Ridges run roughly along the direction of travel so most contacts are glancing. */
  ridgeLength: [4, 10] as const,
  ridgeRadius: [0.6, 1.1] as const,
  /** Max lateral drift of a ridge per tile of length. */
  ridgeSlope: 0.5,
  /**
   * The way forward (SPEC §4.2): a lane this many tiles wide that rock never covers. Its center
   * wanders between knots spaced `laneKnotCols` apart, within `laneAmplitude` rows of mid-field.
   */
  laneWidth: 5,
  /**
   * Gaps between rock (or rock and the field edge) narrower than this many tiles are filled in, so
   * outcrops never form notches a hull gets wedged in. Must stay below `laneWidth`.
   */
  rockMinGap: 4,
  /** Columns ahead whose rock is merged when checking for a gap (about a hull length). */
  rockLookahead: 3,
  laneKnotCols: 24,
  laneAmplitude: 5,
  /**
   * Rivers cross the whole field. Each chunk rolls its biome's `rivers` chance for one (on its own
   * random stream, so rivers leave the other features' layout unchanged), capped at `riverMaxChance`;
   * a chunk whose predecessor also rolled one gets none, so rivers never run together. None before
   * `riverFirstChunk`.
   */
  riverMaxChance: 0.85,
  riverFirstChunk: 2,
  /**
   * Half the bank-to-bank width (tiles) and the shallows along each bank. The channel's half-width
   * (half − bank) stays at least 1.3 so every row has two or more deep tiles in a row, and the
   * meander shifts the center less than a column per row, so the channel never breaks outside a
   * ford (tracked units would slip through).
   */
  riverHalfWidth: [2.3, 3.5] as const,
  riverBank: [0.8, 1] as const,
  /** Meander: a sine across the field (amplitude in tiles, frequency per row) plus a slant. */
  riverMeander: [0.5, 2] as const,
  riverMeanderFreq: [0.15, 0.3] as const,
  riverSlant: 0.2,
  /** Fords per river and their width (rows); shallow all the way across. */
  fordsPerRiver: [1, 2] as const,
  fordWidth: [3, 5] as const,
  /**
   * Tiles beyond each bank that stay free of rock (so dead-end filling never walls off a river), and
   * along a ford, of buildings too, so tracked units can drive into it.
   */
  riverMargin: 2,
  /** Rows a bridge spans (a road across the river), and the share that are light road bridges. */
  bridgeWidth: 3,
  lightBridgeShare: 0.5,
  /**
   * Fortified lines, tank-trap belts, and minefields never fall in the first chunks (the start
   * area plus a little), so the battle opens on open ground.
   */
  firstDefenseChunk: 2,
  craterField: { radius: [2, 4] as const, density: 0.45 },
  minefield: { radius: [1.5, 3.2] as const, density: 0.35 },
  /**
   * A wall across the whole field with gates (rows), bunkers a couple of tiles behind it, and a belt
   * of tank traps `trapsAhead` tiles in front of it.
   */
  fortLine: { gates: [2, 3] as const, gateWidth: [3, 4] as const, bunkers: [2, 4] as const, bunkerBehind: 2, trapsAhead: 3 },
  /** Belts of dragon's teeth: 2 columns deep in a checkerboard, across part of the field. */
  trapLine: { length: [8, 21] as const, gates: [1, 2] as const, gateWidth: 3 },
  hedgerow: { length: [5, 12] as const, gap: 0.1 },
  /** Crop fields (columns × rows); `hedged` of them are boxed in by hedgerows with a few gaps. */
  farm: { cols: [5, 10] as const, rows: [4, 8] as const, hedged: 0.6, gap: 0.15, yard: 0.7, silos: 0.6 },
  /** Frozen lakes: an ice sheet whose middle (`core` of its radius) is thin ice. */
  lake: { radius: [2.2, 4.5] as const, core: 0.55 },
  /** Drifts are blown out across the field (`stretch` times longer across than along). */
  snowdrift: { radius: [1, 2.5] as const, stretch: 1.8 },
  /** Factory halls (columns × rows) ringed by a road; `walled` of them inside a compound wall. */
  factory: { cols: [3, 6] as const, rows: [3, 5] as const, walled: 0.4 },
  /** Tank farms: a grid of fuel tanks (columns × rows of tanks, a road between each). */
  tankFarm: { cols: [2, 3] as const, rows: [2, 4] as const },
  /** Rail lines run along the direction of travel for a stretch of this many chunks, 1–2 tracks. */
  railStretch: 4,
  railTracks: [1, 2] as const,
  /**
   * An armored train's line (SPEC §4.4 Intercept): a hardened double track the whole length of the
   * battle, off to one side of the field (which side is the seed's). The train runs on the track
   * nearer the middle of the field; rows and gaps here are measured from that one.
   * - `twin`: rows from the train's track to the second track, on the narrow side, with gravel
   *   between them (so 2 is a three-row line, the width of its bridges).
   * - `meanRow`: its mean row, as a share of the field's width in from its side's edge.
   * - It wanders `wander` rows either side of that between knots `knotCols` apart, level for its
   *   first `levelCols` columns (the station), never within `edge` rows of a field edge.
   * - `riverFlat`: it runs level this many columns either side of a river's center (its bridge), and
   *   bends back to its own course no steeper than `riverSlope` rows a column.
   * - `crossover`: where the line changes sides of the field (`RailLineSpec.crossovers`), it runs
   *   straight across over `cols` columns, and the lane crosses it the other way. For the middle
   *   `under` of that (as a share of the way either side of the center) the line is underground:
   *   a tunnel with a portal `portal` columns deep over the line at each end, and whatever the
   *   battlefield has there on the ground between them, with the lane's road running over it.
   * - `rockClear`: rows either side of the line rock never covers (the tile each side of it is
   *   cleared of everything: the railbed). `laneGap`: the guaranteed lane's center stays at least
   *   this many rows from the train's track, on the wide side.
   * - `serviceRoad`: rows down the lane cleared of obstacles (deep water there is a ford), a road
   *   along their center: the train outruns a cruise, so the chase is at full speed the whole way,
   *   and scenery plowed at that speed would wear the treads out before the end.
   * - `smooth`: columns the train's path takes to cross from one row to the next.
   * - `fordWidth`: rows of the ford added on the wide side where a river has none there.
   * - `station`: a platform either side of the line from column `col`, `cols` long, with a station building
   *   `depth` rows deep behind it on the narrow side, a gap every `gap` columns.
   */
  railLine: {
    meanRow: 0.27,
    twin: 2,
    wander: 1.5,
    knotCols: 24,
    levelCols: 30,
    edge: 3,
    riverFlat: 8,
    riverSlope: 1 / 3,
    crossover: { cols: 18, under: 0.5, portal: 2 },
    rockClear: 2,
    laneGap: 7,
    serviceRoad: 5,
    smooth: 3,
    fordWidth: 4,
    station: { col: 4, cols: 24, depth: 2, gap: 6 },
  },
  /** Dune ridges: long across the field (rows), shallow along it (columns). */
  dune: { across: [5, 12] as const, along: [1.2, 2.2] as const },
  /** Oilfields: a square patch (tiles a side) of derricks on a 3-tile grid. */
  oilfield: { size: [5, 9] as const },
  wreckField: { radius: [2, 4] as const, density: 0.18 },
  /** Old blast sites: glass inside `core` of the radius, craters out to its edge. */
  blastSite: { radius: [2.5, 4.5] as const, core: 0.45 },
  /** Mountain-pass cliff depth wanders between knots this many columns apart. */
  cliffKnotCols: 6,
  /**
   * Country roads (cosmetic going, SPEC §4.6 "Settlements"): one winds along a stretch of `stretch`
   * chunks between knots `knotChunks` chunks apart, at most `swing` rows either side of mid-field;
   * where the stretch before or after has none, it comes in from (or leaves by) a side of the field.
   * `stretch` must be a multiple of `knotChunks`. Roads across the field reach from a side at least
   * `crossMin` rows in.
   */
  road: { stretch: 4, knotChunks: 2, swing: 5, crossMin: 6 },
};

/** Tonnage limits (SPEC §4.5 bridges, §4.6 thin ice): what an overloaded tile does under the Behemoth. */
export const BEARING = {
  /** Thin ice loses this many hit points a second per 100% overload (tons over the limit / limit). */
  crackRate: 60,
  /** Tread damage from the jolt when a bridge collapses under the hull. */
  collapseTreads: 4,
};

/** Explosive terrain (SPEC §4.6: fuel tanks, minefields) reaching the Behemoth. */
/** Skis (SPEC §7.4 ski troops; `UnitMobility` 'ski'; the weave is the behavior's, `WeaveDef`). Provisional (M3). */
export const SKI = {
  /** Off snow and ice, a skier's speed is its foot speed on that ground times this (about a squad's pace). */
  offSnow: 0.3,
};

/**
 * Evasive units (SPEC §7.4 ski troops, a behavior's `weave`): the Behemoth's fire control can't track
 * one that's weaving. Its automatic weapons hold fire until the unit has held a line for `settle`
 * seconds since its last jink, and then spread `autoSpread` times wider at it (beams too). Manual
 * fire is the player's own aim, and takes no penalty.
 */
export const EVASION = {
  settle: 0.55,
  autoSpread: 8,
};

/** Spider walkers (SPEC §7.4; `UnitMobility` 'walker', behavior `stalker`). Provisional (M3). */
export const WALKER = {
  /** Its pace over standing structures (buildings, walls, bunkers, factory halls, tanks): it clambers over. */
  climb: 0.4,
};

/** A bomb truck's bomb (SPEC §7.4; its size and damage in `EnemyDef.bomb`). Provisional (M3). */
export const BOMB = {
  /**
   * Within this far of the hull it's a contact (a truck's center is up to its radius off the hull
   * when it touches): the arc it touches takes `contact` of the damage (the ram plow first, on the
   * front) and the treads `treads`. Farther off, the hull takes a blast's usual share
   * (`TERRAIN_BLAST.hull`).
   */
  reach: 8,
  contact: 0.5,
  treads: 0.15,
  /** Within this far of the hull a charging truck's strobe quickens (the reactor fuse's last half second). */
  close: 50,
};

export const TERRAIN_BLAST = {
  /** Share of the damage at the blast's edge (full at the center). */
  edge: 0.5,
  /** Share the hull takes on the arc facing a blast beside it. */
  hull: 0.35,
  /** Share the treads take from a blast under the ground box (a mine, a tank plowed into). */
  under: 0.3,
};

// ── Trailer ─────────────────────────────────────────────────────────────────────────────────────

/** Jettison and the trailer's cook-off (SPEC §5.5). */
export const TRAILER_MINE = {
  /** Seconds the jettison key must be held. */
  jettisonHold: 0.5,
  /** A jettisoned trailer coasts to a stop (units/s²). */
  decel: 40,
  /** Seconds before an enemy nearby sets it off (so it doesn't go off against the hull). */
  armDelay: 1.5,
  /** An enemy this close (units, to its center) sets it off after `fuse` seconds. */
  trigger: 36,
  fuse: 0.3,
  /** It blows on its own this long after it's dropped. */
  life: 12,
  /** Share of the blast damage at its edge (full at the center). */
  edge: 0.5,
  /** Wrecked while hitched: share of the blast the Behemoth's rear takes. */
  hitched: 0.35,
};

// ── Camera ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Camera-follow frame (SPEC §4.2; field meanings in `FrameConfig`, sim/frame.ts). Anchors are
 * fractions of the frame from its trailing edge; rates are per second.
 */
export const CAMERA = {
  // Low in the frame: the vertical view is short, so leave as much room ahead as possible.
  anchor: 0.25,
  rearAnchor: 0.42,
  anchorShiftRate: 0.1,
  followRate: 0.9,
  maxAnchor: 0.55,
  centerRate: 1.2,
};

// ── Run and depot ───────────────────────────────────────────────────────────────────────────────

/**
 * A finished run's score (`sim/scores.ts`; user request, Nov 2026: a score list on the title).
 * Points per kill, per salvage earned, per battle won, per sector objective taken, and for a
 * Directive complete. `keep` runs are saved, `shown` listed on the title.
 */
export const SCORE = { kill: 10, salvage: 1, battle: 100, objective: 250, won: 1000, keep: 10, shown: 5 };

/** Run-level tuning (SPEC §3). What a battle pays and how hard it is come from its map node. */
export const RUN = {
  /**
   * Distance from the start to the extraction line (world units). About 2.3 minutes at a healthy
   * cruise; damaged treads, rivers, and rock make it longer (SPEC §4.4: battles run 2–4 minutes).
   */
  battleLength: 5000,
  /** Salvage for reaching the extraction line, on top of what the kills bring (a plain battle node). */
  extractionBonus: 25,
  /** Salvage a new run starts with. */
  startSalvage: 0,
};

/**
 * Directives (SPEC §3; per-Directive rules in content/directives.ts). Provisional (M3).
 */
export const DIRECTIVE = {
  /** Extra actions at the next depot (the next sector's forward depot) for taking a sector's objective. */
  sectorReward: 1,
  /** Decapitation: the command post's pad behind the fortress wall (columns behind the bunker row, and its size in tiles). */
  keep: { behind: 3, cols: 3, rows: 3 },
};

/**
 * The sector map (SPEC §3, §3.1; `sim/sectorMap.ts`). Each sector is a layered route up the screen:
 * an entry node (sector 1: a battle; later sectors: a forward depot), branching layers of battles and
 * depots, a depot layer, then the sector's objective battle. Provisional numbers (M3).
 */
export const SECTOR_MAP = {
  sectors: 3,
  /** Nodes on any route through a sector, entry and objective included (inclusive range). */
  layers: [6, 8] as const,
  /** Lanes the branching layers spread across. */
  columns: 4,
  /** Random walks up the lanes; their union is the sector's routes (each starts in its own lane). */
  walks: 3,
  /** Chance a free node is a depot (no two depots in a row; see `maxBattleRun`). */
  depotChance: 0.3,
  /** Most battles in a row on any route before a depot is forced. */
  maxBattleRun: 2,
  /** Sector 1's biome (the baseline, and `?seed=N` keeps naming a known battlefield); null = drawn. */
  firstBiome: 'temperate' as 'temperate' | null,
  /**
   * Battle threat (on top of `ENCOUNTER.baseThreat`) per layer climbed over the whole run: about 7
   * to 9 in sector 1 and 11 to 13 in sector 3 (strong +2, objectives +3). Threat sizes every post
   * and wave (sim bot, stock Class II firing everything: 8/8 extractions at 6, 7/8 at 9, 3/8 at 12),
   * so the run's refits have to keep pace.
   */
  threatPerLayer: 0.3,
  /** A strong-defense battle: chance, extra threat, extra salvage on extraction. */
  strong: { chance: 0.3, threat: 2, salvage: 40 },
  /** The sector's objective battle: extra threat and extraction salvage. */
  objective: { threat: 3, salvage: 100 },
  /** Chance a battle node holds a supply cache: +1 action at the next depot. */
  cacheChance: 0.2,
  /**
   * Intel fog (SPEC §3.1). Far (two or more steps ahead), each field is hidden with these odds; a
   * deep-fogged field stays hidden even one step away. Gen 2 sensors see through deep fog, Gen 3
   * through all of it.
   */
  fog: { far: { approach: 0.25, doctrine: 0.6, strength: 0.4, reward: 0.5 }, deep: 0.12 },
  /**
   * Events (SPEC §8.3): chance a battle node that isn't an entry or an objective is an event
   * instead (about 2.5 a run), and chance an event's kind is fogged two or more steps away. Events
   * don't repeat in a run until every kind has come up.
   */
  eventChance: 0.22,
  eventFog: 0.5,
};

/**
 * Depot tuning (SPEC §8.2; what's for sale is in content/depot.ts). Each repair, rearm, or install
 * costs salvage and one of the depot's actions; taking a part off takes no action and pays back
 * `resale` of its price. A repair restores the component fully, priced by the damage it fixes, and
 * all four armor zones are re-plated as one action. Treads and armor the salvage can't fully cover
 * are patched partway with what's left.
 *
 * Sim bot reference (M2): a battle won firing every trigger pays about 250–400 salvage and
 * typically leaves the treads at 10–65%, the front armor near zero, and the missile rack empty, so
 * patching up the usual damage costs about 260 and three actions. Raised from 3 to 5 (user's call,
 * Nov 2026): with 3, a depot was nearly all repairs and left no room to refit.
 */
export const DEPOT = {
  actions: 5,
  /** Weapons for sale per depot (inclusive range). */
  stock: [4, 5] as const,
  /** Add-ons for sale per depot (inclusive range), besides the weapons. */
  addonStock: [1, 2] as const,
  /** Trailer modules for sale per depot (inclusive range), when the Behemoth has a trailer or one is for sale. */
  moduleStock: [1, 2] as const,
  /** Higher-grade core components for sale per depot (inclusive range; SPEC §5.6). */
  gradeStock: [0, 2] as const,
  /** Levels a mod track goes up to. */
  maxModLevel: 3,
  /** Repair price: a flat fee, plus salvage per integrity point restored. */
  repairBase: 10,
  /**
   * `treads` covers add-on tread sets too; `plow` is the ram plow; `frame` is
   * the trailer's frame; trailer modules repair at the `hardpoint` rate; the trailer's armor
   * re-plates with the hull's (`armor`).
   */
  perHp: { treads: 1.5, sensors: 1, fireControl: 1, reactor: 2, magazine: 1, armor: 0.5, hardpoint: 1, plow: 0.5, panels: 1, frame: 0.75 },
  /** Extra charge for bringing a destroyed hardpoint back online. */
  reactivate: 20,
  /** Rearm price: a flat fee plus each weapon's `roundPrice` per round. */
  rearmBase: 10,
  /**
   * Share of a part's price paid back when it's taken off whole, scaled by the integrity it has
   * left (rounded down; a wreck is worth nothing).
   * A part an install displaces counts as taken off, so the install costs the difference.
   */
  resale: 0.65,
};

/**
 * Gamepad (SPEC §4.3): a standard-mapping controller drives the battle twin-stick style and works
 * the menus with the D-pad and face buttons. Stick values run -1..1; speeds are in internal
 * (unzoomed) pixels per second.
 */
export const PAD = {
  /** Stick travel ignored around center (radial), so a worn stick doesn't drift. */
  deadzone: 0.2,
  /** Left stick past this (after the deadzone) surges, brakes, or steers. */
  driveThreshold: 0.35,
  /** A trigger counts as pulled past this much travel. */
  triggerThreshold: 0.3,
  /** Reticle speed at full right-stick tilt. */
  aimSpeed: 340,
  /** Tilt is raised to this power before scaling the speed: small tilts give fine aim. */
  aimCurve: 2,
  /** The depot's pad cursor speed at full left-stick tilt. */
  cursorSpeed: 220,
  /** Menus: a held direction repeats after this many seconds, then every `repeatRate` seconds. */
  repeatDelay: 0.4,
  repeatRate: 0.14,
  /** Left stick past this moves the menu selection. */
  menuThreshold: 0.5,
};

/**
 * Stereo (SPEC §11.4): where the battle's sounds sit between the two speakers. Read live, so the
 * dev console's Tweaks change it as you listen (the echoes' sides are set when a battle starts).
 */
export const STEREO = {
  /** How far to one side a sound at full offset goes: 0 is everything in the middle (mono), 1 is hard left or right. */
  pan: 0.9,
  /** The sideways offset (units) that pans that far: about half the battlefield's width. */
  span: 150,
  /**
   * What "the middle" is: 1 pans by where a sound is on the screen (the middle of the battlefield
   * is the middle of the speakers, and the Behemoth's own guns move with it), 0 pans by where it
   * is from the Behemoth (its own guns always in the middle). Between blends the two.
   */
  screen: 1,
  /** How far a close blast's big layers spread across both ears: 0 keeps every sound a single point. */
  width: 1,
};
