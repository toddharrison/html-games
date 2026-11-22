/**
 * Game-wide tuning knobs in one place. Per-unit data stays in its own table (`CHASSIS`, `WEAPONS`,
 * `ENEMIES`, `MATERIALS`, `OBSTACLE_CLASSES`, `ADDONS`, `TRAILER_MODULES`, depot stock), and so do
 * a chassis' own speeds and steering. Type-only imports, so any module can import this without
 * cycles.
 */
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
};

// ── Damage ──────────────────────────────────────────────────────────────────────────────────────

/** How components lose performance as they're damaged (SPEC §5.1, §5.4). `i` = integrity fraction. */
export const DEGRADE = {
  /** Speed scale = i^this: reaches zero at zero integrity, with no cliff before it. */
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

/** How long a hidden unit stays visible after giving itself away (SPEC §4.5). */
export const CONCEALMENT = {
  /** Seconds visible after its last shot. Lining up a shot (the telegraph) reveals it too. */
  afterFire: 2.5,
  /** Seconds visible after being hit. */
  afterHit: 1.5,
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
  townFill: 0.75,
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
  farm: { cols: [5, 10] as const, rows: [4, 8] as const, hedged: 0.6, gap: 0.15 },
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
  /** Dune ridges: long across the field (rows), shallow along it (columns). */
  dune: { across: [5, 12] as const, along: [1.2, 2.2] as const },
  /** Oilfields: a square patch (tiles a side) of derricks on a 3-tile grid. */
  oilfield: { size: [5, 9] as const },
  wreckField: { radius: [2, 4] as const, density: 0.18 },
  /** Old blast sites: glass inside `core` of the radius, craters out to its edge. */
  blastSite: { radius: [2.5, 4.5] as const, core: 0.45 },
  /** Mountain-pass cliff depth wanders between knots this many columns apart. */
  cliffKnotCols: 6,
};

/** Tonnage limits (SPEC §4.5 bridges, §4.6 thin ice): what an overloaded tile does under the Behemoth. */
export const BEARING = {
  /** Thin ice loses this many hit points a second per 100% overload (tons over the limit / limit). */
  crackRate: 60,
  /** Tread damage from the jolt when a bridge collapses under the hull. */
  collapseTreads: 4,
};

/** Explosive terrain (SPEC §4.6: fuel tanks, minefields) reaching the Behemoth. */
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
 * patching up the usual damage costs about 260 and all three actions.
 */
export const DEPOT = {
  actions: 3,
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
