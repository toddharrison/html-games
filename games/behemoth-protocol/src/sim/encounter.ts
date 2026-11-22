import { APPROACHES, type ApproachId } from '../content/approaches';
import { BIOMES, type BiomeId } from '../content/biomes';
import { DOCTRINES, type DoctrineId } from '../content/doctrines';
import { ENEMIES, type EnemyId, type WaveSide } from '../content/enemies';
import { ENCOUNTER, SPAWNER } from '../content/tuning';
import { frameRight } from './frame';
import { Rng, hashSeed } from './rng';
import { cheapest, coverSpot, drawUnit, entryPoint, liveThreat, openSpot } from './spawner';
import { spawnEnemy } from './enemies';
import type { World } from './world';

/**
 * Encounters (SPEC §4.2, §4.4, §7): what a battle throws at the Behemoth, from its node's threat
 * (`World.threat`) and mix (`encounterMix`). Terrain and **defenders are placed by distance**: posts
 * along the strip, planned from the battle seed, each a group that's there whatever the Behemoth
 * does, met when the frame reaches it. **Reinforcements arrive by time**: the alert clock sends
 * waves, each bigger than the last and closer behind it, so braking buys time to shoot at the cost
 * of more enemies before the exit. The last stand (`lastStand.ts`) takes over the waves once the
 * Behemoth is Immobilized; the clock stops while it lasts and picks up again after a drone revive.
 */

/** A defended position: these units are met when the frame reaches `x`. */
export interface DefenderPost {
  x: number;
  units: EnemyId[];
}

export interface AlertClock {
  /** Waves sent so far. */
  wave: number;
  /** Seconds until the next wave, and the full length of this countdown (for the HUD). */
  next: number;
  span: number;
  /** Threat sent by waves and not yet on the field (held back by the cap, or still trickling in). */
  queue: number;
  /** Seconds until the next queued unit may arrive. */
  trickle: number;
  /** How fast the clock runs (×; a Directive's objective battle may hurry it, SPEC §3). */
  pace: number;
  /** The clock is stopped for good: no more waves, nothing more queued (a command post destroyed, SPEC §3). */
  cut: boolean;
}

/** What a battle's enemy brings (SPEC §7): its size, its units, and how it splits them. */
export interface Forces {
  /** The node's strength: sizes the posts and the waves. */
  threat: number;
  /** Relative odds of each unit. */
  mix: Partial<Record<EnemyId, number>>;
  /** Multipliers on post size and wave threat (the doctrine's split, `DoctrineDef.posts/waves`). */
  postScale: number;
  waveScale: number;
  /** How fast the alert clock runs (×, default 1). */
  alertPace?: number;
}

export interface EncounterState {
  /** Stops both defenders and waves (tests). The last stand isn't affected. */
  off: boolean;
  /** Multiplier on wave threat (the doctrine's split). */
  waveScale: number;
  /** Posts not reached yet, nearest first. */
  posts: DefenderPost[];
  alert: AlertClock;
}

/** A battle's forces from its node: the doctrine, shaded by the ground it's fought on. */
export function battleForces(threat: number, doctrine: DoctrineId, biome: BiomeId, approach: ApproachId | null): Forces {
  const d = DOCTRINES[doctrine];
  return { threat, mix: encounterMix(doctrine, biome, approach), postScale: d.posts ?? 1, waveScale: d.waves ?? 1 };
}

/** The units a battle draws on and their odds: the doctrine's mix, shaded by the ground (SPEC §7). */
export function encounterMix(doctrine: DoctrineId, biome: BiomeId, approach: ApproachId | null): Partial<Record<EnemyId, number>> {
  const mix: Partial<Record<EnemyId, number>> = {};
  const biomeForces = BIOMES[biome].forces ?? {};
  const approachForces = approach ? (APPROACHES[approach].forces ?? {}) : {};
  for (const [id, weight] of Object.entries(DOCTRINES[doctrine].mix) as [EnemyId, number][]) {
    mix[id] = weight * (biomeForces[id] ?? 1) * (approachForces[id] ?? 1);
  }
  return mix;
}

/**
 * Lays out the defenders between the start and the extraction line. Its own random stream, so the
 * same battle seed always has the same posts, however the fighting goes.
 */
export function planDefenders(seed: number, forces: Forces, startX: number, exitX: number): DefenderPost[] {
  const { threat, mix, postScale } = forces;
  const d = ENCOUNTER.defenders;
  const rng = new Rng(hashSeed(seed, 0xde7e));
  const floor = cheapest(mix);
  const posts: DefenderPost[] = [];
  for (let x = startX + rng.range(d.first[0], d.first[1]); x < exitX - d.clearOfExit; x += rng.range(d.spacing[0], d.spacing[1])) {
    let budget = threat * postScale * rng.range(d.share[0], d.share[1]);
    const units: EnemyId[] = [];
    while (budget >= floor) {
      const id = drawUnit(rng, mix, budget);
      if (!id) break;
      units.push(id);
      budget -= ENEMIES[id].threat;
    }
    if (units.length > 0) posts.push({ x, units });
  }
  return posts;
}

export function createEncounter(seed: number, forces: Forces, startX: number, exitX: number): EncounterState {
  const a = ENCOUNTER.alert;
  const pace = forces.alertPace ?? 1;
  return {
    off: false,
    waveScale: forces.waveScale,
    posts: planDefenders(seed, forces, startX, exitX),
    alert: { wave: 0, next: a.firstWave / pace, span: a.firstWave / pace, queue: 0, trickle: 0, pace, cut: false },
  };
}

/** Threat the alert clock's wave brings (1-based), before the doctrine's `waveScale`. */
export function alertWaveBudget(threat: number, wave: number): number {
  return threat * ENCOUNTER.alert.share + ENCOUNTER.alert.growth * (wave - 1);
}

/** Seconds from wave `wave` (1-based) to the next. */
export function alertInterval(wave: number): number {
  const a = ENCOUNTER.alert;
  return Math.max(a.minInterval, a.interval - a.intervalShrink * (wave - 1));
}

/** Stops the alert clock for good: no more waves, and nothing still queued comes in. */
export function cutAlert(a: AlertClock): void {
  a.cut = true;
  a.queue = 0;
}

/** Advances the defenders and the alert clock. Not called during the last stand or after extraction. */
export function stepEncounter(w: World, dt: number): void {
  const enc = w.encounter;
  if (enc.off) return;
  stepDefenders(w);
  stepAlert(w, dt);
}

/** Posts the frame has reached send in their units just beyond its leading edge. */
function stepDefenders(w: World): void {
  const enc = w.encounter;
  const reach = frameRight(w.frame) + SPAWNER.spawnDistance;
  while (enc.posts.length > 0 && enc.posts[0]!.x <= reach) {
    const post = enc.posts.shift()!;
    for (const id of post.units) {
      const def = ENEMIES[id];
      let at = def.spawn === 'cover' ? coverSpot(w, reach - SPAWNER.spawnDistance, post.x + ENCOUNTER.defenders.coverDepth) : null;
      // Open ground at the post's line, or a little beyond (a river or rock across the line).
      for (let step = 0; !at && step < 4; step++) at = openSpot(w, def, reach + step * 2 * w.terrain.tileSize);
      if (at) spawnEnemy(w, id, at.x, at.y);
    }
  }
}

function stepAlert(w: World, dt: number): void {
  const a = w.encounter.alert;
  if (a.cut) return;
  const cap = w.threat * ENCOUNTER.alert.cap;
  a.next -= dt;
  if (a.next <= 0) {
    a.wave++;
    a.span = a.next = alertInterval(a.wave) / a.pace;
    // Held-back units don't pile up without limit while the field is full.
    a.queue = Math.min(cap, a.queue + alertWaveBudget(w.threat, a.wave) * w.encounter.waveScale);
    w.events.push({ type: 'alert', wave: a.wave });
  }
  a.trickle -= dt;
  if (a.queue <= 0 || a.trickle > 0) return;
  if (a.queue < cheapest(w.mix)) {
    a.queue = 0;
    return;
  }
  const id = drawUnit(w.rng, w.mix, Math.min(a.queue, cap - liveThreat(w)));
  if (!id) return;
  const at = arrival(w, id);
  // No way in this time (rock along an edge, a river across the frame): another try next trickle.
  a.trickle = ENCOUNTER.alert.trickle;
  if (!at) return;
  spawnEnemy(w, id, at.x, at.y);
  a.queue -= ENEMIES[id].threat;
}

/** Where a wave unit comes in: troops into cover ahead when there's some, vehicles from a side. */
function arrival(w: World, id: EnemyId): { x: number; y: number } | null {
  const def = ENEMIES[id];
  if (def.spawn === 'cover') {
    const ahead = frameRight(w.frame);
    const spot = coverSpot(w, ahead, ahead + SPAWNER.coverBand[1]);
    if (spot) return spot;
  }
  const weights = ENCOUNTER.alert.sides;
  const sides = (Object.keys(weights) as WaveSide[]).filter((s) => def.spawn !== 'ahead' || s !== 'behind');
  return entryPoint(w, def, w.rng.weighted(sides, (s) => weights[s])!);
}
