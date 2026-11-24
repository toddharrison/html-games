import { DOCTRINES } from '../content/doctrines';
import { MODES } from '../content/modes';
import type { EnemyId } from '../content/enemies';
import { CAMERA, ENCOUNTER, RUN, SPAWNER, TERRAIN_GEN, TRAIN } from '../content/tuning';
import {
  hitched,
  mobile,
  stepMovement,
  stepSelfDestruct,
  stepTurrets,
  type BehemothState,
  type PlayerCommand,
} from './behemoth';
import { resolveBehemothCollisions } from './collision';
import { stepConcealment } from './concealment';
import { createCondition, stepCondition, type ConditionState } from './conditions';
import type { ConditionId } from '../content/conditions';
import { stepDrones } from './drones';
import { createEncounter, homeMix, stepEncounter, type EncounterState } from './encounter';
import { stepReactor } from './detonation';
import { stepEnemies } from './enemies';
import { stepLastStand, type LastStandState } from './lastStand';
import { createObjective, planFortress, startObjective, stepObjective, type ObjectiveSpec, type ObjectiveState } from './objective';
import type { Barrage, Drone, Enemy, Mine, OilSpill, Pool, Projectile, TileFire } from './entities';
import type { SimEvent } from './events';
import { centerFrame, createFrame, frameRight, stepFrame, type FrameState } from './frame';
import { SIM_DT } from './loop';
import { stepPools } from './pools';
import { stepSpills } from './spills';
import { stepFire } from './fire';
import { stepLightning } from './lightning';
import { stepProjectiles } from './projectiles';
import { Rng, hashSeed } from './rng';
import { newRun, restoreBehemoth, type BehemothSnapshot } from './run';
import { stepHazards } from './hazards';
import { DEFAULT_RECIPE, Terrain, type RailLineSpec, type TerrainBlast, type TerrainRecipe } from './terrain';
import { stepMines, stepTrailer } from './trailer';
import { stepWeapons } from './weapons';
import { stepShields } from './shield';
import { stepTrain, type TrainState } from './train';
import { paySalvage } from './salvage';

/** The whole battle state plus the fixed-step update that advances it. */

export interface WorldOptions {
  seed: number;
  /** Visible frame width in world units. */
  frameWidth: number;
  /** Battlefield height in tiles. */
  fieldRows: number;
  /** What the terrain is built from (SPEC §4.6 biome × §3.1 approach); default temperate, no approach. */
  recipe?: TerrainRecipe;
  /** The Behemoth as the run left it (damage, weapons, ammo); default: a fresh Class II. */
  behemoth?: BehemothSnapshot;
  /** The battle's threat, which sizes its defenders and waves (default `ENCOUNTER.baseThreat`). */
  threat?: number;
  /** Relative odds of each unit the battle fields (`encounterMix`; default combined arms). */
  mix?: Partial<Record<EnemyId, number>>;
  /** The doctrine's split between posts and waves (multipliers, default 1; `battleForces`). */
  postScale?: number;
  waveScale?: number;
  /** Distance from the start to the extraction line (default `RUN.battleLength`). */
  battleLength?: number;
  /** The battle's mode and strength (SPEC §4.4); default a plain Assault. */
  objective?: ObjectiveSpec;
  /** How fast the alert clock runs (×, default 1; a Directive's objective battle, SPEC §3). */
  alertPace?: number;
  /** The battle's condition (SPEC §4.6); default none. */
  condition?: ConditionId | null;
  /** Unit kinds already seen this run (`RunState.sighted`), so a once-a-run callout isn't made again. */
  sighted?: readonly EnemyId[];
}

export interface World {
  seed: number;
  tick: number;
  time: number;
  /** Combat randomness (spread, AI choices, spawns). Terrain uses its own derived streams. */
  rng: Rng;
  terrain: Terrain;
  frame: FrameState;
  behemoth: BehemothState;
  enemies: Enemy[];
  projectiles: Projectile[];
  /** Jettisoned trailers lying in the track (SPEC §5.5). */
  mines: Mine[];
  /** Repair drones out of their bays. */
  drones: Drone[];
  /** Plasma burning on the ground (SPEC §6). */
  pools: Pool[];
  /** Oil slicks leaked by wrecks (`sim/spills.ts`). */
  spills: OilSpill[];
  /** Burning tiles (SPEC §6 "Fire"), keyed by `fireKey`; and seconds to the next burn tick. */
  fires: Map<number, TileFire>;
  fireTick: number;
  /** Smoke hanging over tiles (SPEC §6 "Fire"), keyed by `fireKey`: seconds until it clears. */
  smoke: Map<number, number>;
  /** Fire's own stream (what catches, what spreads), so a fire never shifts the battle's combat draws. */
  fireRng: Rng;
  /** Explosive terrain set off and waiting out its fuse (SPEC §4.6). */
  blasts: TerrainBlast[];
  /** Artillery target zones with a volley on the way (SPEC §7). */
  barrages: Barrage[];
  /** The drones' once-a-battle revive: drone-seconds of work done while it's under way. */
  revive: { work: number } | null;
  /** The revive has been used this battle (it worked). */
  revived: boolean;
  /** Appended by the sim, drained by the renderer. */
  events: SimEvent[];
  nextId: number;
  /** The battle's threat (SPEC §7): the node's strength, which sizes its defenders and waves. */
  threat: number;
  /** Relative odds of each unit the battle fields (`encounterMix`). */
  mix: Partial<Record<EnemyId, number>>;
  /** Defenders still ahead and the alert clock (SPEC §4.2). */
  encounter: EncounterState;
  /** The battle mode's targets (SPEC §4.4: fortress guns, a convoy); none in an Assault. */
  objective: ObjectiveState;
  /** An Intercept's armored train (SPEC §7.3); null in every other mode. */
  train: TrainState | null;
  /** World x of the extraction line: the Behemoth's center crossing it wins the battle (SPEC §4.4). */
  exitX: number;
  /** Sim time the Behemoth reached the extraction line; null until then. */
  extractedAt: number | null;
  /** Set once the Behemoth is Immobilized (SPEC §5.1). */
  lastStand: LastStandState | null;
  /** The battle's condition (SPEC §4.6: night, a storm); null for none. */
  condition: ConditionState | null;
  /** Unit kinds seen so far this run, this battle's included (SPEC §7.4 callouts, §9 first sight). */
  sighted: EnemyId[];
  stats: BattleStats;
  /** Dev console switches (`sim/dev.ts`); all off in a normal battle. */
  dev: DevFlags;
}

export interface DevFlags {
  /** Enemies hold still and hold fire: `stepEnemies` is skipped. */
  frozen: boolean;
}

export interface BattleStats {
  kills: number;
  blastKills: number;
  salvage: number;
  /** The biggest unit the final blast took out (by threat), for the run summary (SPEC §5.1); null for none. */
  blastBest: EnemyId | null;
}

/** Where the Behemoth starts (world x). */
export const START_X = 70;

/** Enemies this far behind the frame's left edge are dropped. */
const DESPAWN_BEHIND = 200;

/** A battle's rail line (SPEC §4.4): it always crosses a river or two, `TRAIN.rivers` of the way to the extraction line, and changes sides of the field at `TRAIN.crossovers`. */
export function railLine(exitX: number = START_X + RUN.battleLength * (MODES.intercept.length ?? 1)): RailLineSpec {
  const chunk = TERRAIN_GEN.tileSize * TERRAIN_GEN.chunkCols;
  const at = (share: number) => START_X + (exitX - START_X) * share;
  return {
    rivers: TRAIN.rivers.map((share) => Math.floor(at(share) / chunk)),
    crossovers: TRAIN.crossovers.map((share) => Math.round(at(share) / TERRAIN_GEN.tileSize)),
  };
}

export function createWorld(opts: WorldOptions): World {
  const threat = opts.threat ?? ENCOUNTER.baseThreat;
  const mix = opts.mix ?? homeMix(DOCTRINES.combined.mix, (opts.recipe ?? DEFAULT_RECIPE).biome);
  const spec = opts.objective ?? null;
  const mode = MODES[spec?.mode ?? 'assault'];
  const exitX = START_X + (opts.battleLength ?? RUN.battleLength) * (mode.length ?? 1);
  const terrainSeed = hashSeed(opts.seed, 0x7e44);
  let recipe = opts.recipe ?? DEFAULT_RECIPE;
  // An Intercept's rail line runs the whole battle (SPEC §4.4).
  if (mode.train) recipe = { ...recipe, line: railLine(exitX) };
  if (spec?.mode === 'breach') {
    recipe = { ...recipe, fortress: planFortress(opts.seed, terrainSeed, opts.fieldRows, recipe, START_X, exitX, spec.strength, spec.command ?? false) };
  }
  const terrain = new Terrain(terrainSeed, opts.fieldRows, recipe);
  // Beside a rail line it starts in the lane, on the line's wide side.
  const behemoth = restoreBehemoth(opts.behemoth ?? newRun(opts.seed).behemoth, START_X, terrain.hasLine ? terrain.laneY(START_X) : terrain.height / 2);
  const frame = createFrame({ ...CAMERA, width: opts.frameWidth }, frameFocus(behemoth), behemoth.chassis.speed.cruise);
  const world: World = {
    seed: opts.seed,
    tick: 0,
    time: 0,
    rng: new Rng(hashSeed(opts.seed, 0xc0b4)),
    terrain,
    frame,
    behemoth,
    enemies: [],
    projectiles: [],
    mines: [],
    drones: [],
    pools: [],
    spills: [],
    fires: new Map(),
    fireTick: 0,
    smoke: new Map(),
    fireRng: new Rng(hashSeed(opts.seed, 0xf12e)),
    blasts: [],
    barrages: [],
    revive: null,
    revived: false,
    events: [],
    nextId: 1,
    threat,
    // Only what can keep up with a running fight reinforces a train (the posts keep the doctrine's mix).
    mix: mode.train ? mode.train.waves : mix,
    encounter: createEncounter(
      opts.seed,
      { threat, mix, postScale: (opts.postScale ?? 1) * mode.posts, waveScale: opts.waveScale ?? 1, alertPace: opts.alertPace ?? 1 },
      START_X,
      exitX,
    ),
    objective: createObjective(spec, terrain, behemoth),
    train: null,
    exitX,
    extractedAt: null,
    lastStand: null,
    condition: createCondition(opts.condition ?? null, opts.seed),
    sighted: [...(opts.sighted ?? [])],
    stats: { kills: 0, blastKills: 0, salvage: 0, blastBest: null },
    dev: { frozen: false },
  };
  ensureTerrain(world);
  if (spec) startObjective(world, spec.strength, spec.train, spec.doctrine);
  return world;
}

function ensureTerrain(w: World): void {
  const ts = TERRAIN_GEN.tileSize;
  w.terrain.ensure(w.frame.left - 2 * ts, frameRight(w.frame) + TERRAIN_GEN.chunkCols * ts);
  w.terrain.prune(w.frame.left - 4 * ts - DESPAWN_BEHIND);
}

/**
 * The point the camera frame follows: the hull's center, or a little behind it while a trailer is
 * in tow, so the trailer stays in view (its center sits about where the hull's rear would).
 */
export function frameFocus(b: BehemothState): number {
  const t = hitched(b);
  return t ? b.x - (t.def.towBar + t.def.length / 2) : b.x;
}

/** Any live enemy behind the Behemoth, on screen or closing in from below the frame. */
export function threatBehind(w: World): boolean {
  const b = w.behemoth;
  const rear = b.x - b.chassis.length / 2;
  const reach = w.frame.left - SPAWNER.spawnDistance - 20;
  // A train's unarmed vehicles falling behind aren't a threat (the fight is alongside and ahead).
  return w.enemies.some((e) => e.alive && e.x < rear && e.x > reach && !(e.train && !e.weapon && e.guns.length === 0));
}

/** Advance the battle by one fixed 60 Hz step. */
export function stepWorld(w: World, cmd: PlayerCommand): void {
  const dt = SIM_DT;
  const b = w.behemoth;
  w.tick++;
  w.time += dt;
  stepCondition(w);

  if (!b.destroyed) {
    stepMovement(b, cmd, dt, w.terrain.height);
    resolveBehemothCollisions(w, dt, cmd.steer);
    stepTrailer(w, cmd, dt);
    checkExtraction(w);
    stepTurrets(b, cmd.aimX, cmd.aimY, dt);
    stepWeapons(w, cmd, dt);
    // The battle is won once extracted: no blowing up on the way out.
    stepSelfDestruct(b, cmd.selfDestruct && w.extractedAt === null, dt, w.events);
    stepReactor(w, dt);
  }
  // After the weapons, so point defense gets first call on the power.
  stepDrones(w, dt);

  stepLastStand(w, dt);
  // The camera stops for the last stand: it holds where the treads gave out.
  if (!w.lastStand) stepFrame(w.frame, frameFocus(b), b.chassis.speed.cruise, dt, threatBehind(w));
  else centerFrame(w.frame, frameFocus(b), dt);
  ensureTerrain(w);

  if (!w.dev.frozen) stepTrain(w, dt);
  if (!w.dev.frozen) stepShields(w, dt);
  if (!b.destroyed && !w.lastStand && w.extractedAt === null) stepEncounter(w, dt);
  if (!b.destroyed && w.extractedAt === null) stepObjective(w, dt);
  if (!w.dev.frozen) stepEnemies(w, dt);
  stepProjectiles(w, dt);
  stepPools(w, dt);
  stepFire(w, dt);
  stepSpills(w, dt);
  stepLightning(w);
  stepHazards(w, dt);
  stepMines(w, dt);
  stepConcealment(w, dt);
  // Buildings knocked down this step pay out (SPEC §8.1).
  for (const d of w.terrain.takeSalvageDrops()) paySalvage(w, d.x, d.y, d.amount, 'tile');

  const despawnX = w.frame.left - DESPAWN_BEHIND;
  w.enemies = w.enemies.filter((e) => e.alive && (e.train || e.x > despawnX));
  w.projectiles = w.projectiles.filter((p) => p.alive);
  w.barrages = w.barrages.filter((z) => z.until > w.time);
}

/**
 * Reaching the extraction line wins the battle (Assault, SPEC §4.4). The enemy breaks off: no new
 * units, nobody opens fire, and rounds already in the air fall short.
 */
function checkExtraction(w: World): void {
  const b = w.behemoth;
  if (w.extractedAt !== null || !mobile(b) || b.x < w.exitX) return;
  w.extractedAt = w.time;
  for (const p of w.projectiles) if (p.owner === 'enemy') p.alive = false;
  w.barrages = [];
  w.events.push({ type: 'extracted' });
}
