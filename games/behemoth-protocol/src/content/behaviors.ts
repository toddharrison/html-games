/**
 * Enemy behaviors (SPEC §7): where a unit wants to be on the battlefield, as reusable pieces with
 * their own settings. A unit's `EnemyDef.behavior` is one of these, built by the presets below with
 * the unit's own numbers; the sim's step functions (`sim/ai/`) read nothing but the def. Shared
 * steering knobs (how hard units chase a moving point, how they keep in frame) are in
 * `tuning.ts` (`STEER`).
 *
 * Each preset makes a fresh copy, so every unit's settings are its own: the dev console's tweaks
 * edit `ENEMIES.<id>.behavior.*` per unit.
 */

/** A spot on a circle round the Behemoth: the preferred distance band, and how fast the spot drifts round it (rad/s). */
export interface Orbit {
  minRange: number;
  maxRange: number;
  angularSpeed: number;
}

/** How often a behavior rethinks its plan (seconds, a roll in this range), and the chance it switches sides when it does. */
export interface Replan {
  every: readonly [number, number];
  flip: number;
}

/**
 * The last stand (SPEC §5.1): once the Behemoth is Immobilized the unit drops its usual behavior and
 * closes to a ring this far from the hull (`besiege`), from any side, its spot drifting round at
 * `angularSpeed`. Troops that hide dig into cover on the ring within `coverReach` of where they are.
 */
export interface SiegeDef {
  minRange: number;
  maxRange: number;
  angularSpeed: number;
  coverReach: number;
}

/**
 * A weave on top of the behavior (SPEC §7.4 ski troops): a sideways jink of `speed` units/s that
 * flips every `flip` seconds, which throws off a lead. While it weaves the Behemoth's automatic
 * weapons can't track it (`EVASION`). Inside `clearance` of the hull it skis straight off it instead.
 */
export interface WeaveDef {
  speed: number;
  flip: readonly [number, number];
  clearance: number;
}

/** Settings every behavior has. */
interface Common {
  /**
   * How far inside the frame's trailing edge (fraction of the frame's length) it holds when behind
   * the Behemoth (SPEC §7 fairness rules: rear attackers stay in view).
   */
  rearInset: number;
  /** Its last-stand ring; null = it keeps its own behavior (a convoy runs on, a bomb truck was closing in already). */
  siege: SiegeDef | null;
  weave?: WeaveDef;
}

/**
 * Circles the Behemoth at range (light tanks, hovercraft, ski troops), matching its forward speed,
 * now and then changing direction and distance. It aims `lead` seconds of the hull's travel ahead.
 */
export interface SkirmisherDef extends Common {
  kind: 'skirmisher';
  orbit: Orbit;
  replan: Replan;
  lead: number;
}

/**
 * Keeps a spot ahead of the Behemoth within `arc` degrees of straight ahead, drifting across the
 * arc and falling back as it advances (heavy tanks hold close and straight ahead; missile launchers
 * far off and to the side). Beside or behind the hull it drives up a lane `laneGap` clear of the
 * hull's side, steering at least `laneStep` ahead of itself.
 */
export interface HoldAheadDef extends Common {
  kind: 'holdAhead';
  orbit: Orbit;
  arc: number;
  replan: Replan;
  laneGap: number;
  laneStep: number;
}

/**
 * Walks to the best cover within `reach` beside the Behemoth's path and holds there as it passes
 * (infantry). It wants to be between `laneClear` beyond the hull's side and `laneReach` × its fire
 * range off the path; cover scores worse by `inPath` per unit inside that band, `farOff` per unit
 * beyond it, and `behind` per unit behind the hull. It looks again every `recheck` seconds.
 */
export interface AmbusherDef extends Common {
  kind: 'ambusher';
  reach: number;
  recheck: number;
  laneClear: number;
  laneReach: number;
  score: { inPath: number; farOff: number; behind: number };
}

/** Never moves; only its turrets turn (fortress guns, batteries, hedge guns, trapdoor teams). */
export interface FixedDef extends Common {
  kind: 'fixed';
}

/**
 * Drives up the guaranteed lane for the far end at the convoy's pace (SPEC §4.4 Chase), steering
 * for a point `lookAhead` up the lane, slowing as it's damaged. With no convoy pace set it drives at
 * `idlePace` × its top speed.
 */
export interface ConvoyDef extends Common {
  kind: 'convoy';
  lookAhead: number;
  idlePace: number;
}

/** Drives flat out at where the Behemoth will be, leading it by at most `maxLead` s of its travel (SPEC §7.4 bomb truck). */
export interface ChargeDef extends Common {
  kind: 'charge';
  maxLead: number;
}

/**
 * Works round behind the Behemoth and holds there (SPEC §7.4 spider walker), `hold` behind its tail
 * (the trailer's, when one is in tow), a little off to one side (`across` × the lane's half-width),
 * well inside the frame. It keeps `sideGap` clear of the hull's side while it works round; met
 * ahead, it first steps `stepAside` beyond that lane and lets the hull go by.
 */
export interface StalkerDef extends Common {
  kind: 'stalker';
  hold: { minRange: number; maxRange: number };
  replan: Replan;
  sideGap: number;
  stepAside: number;
  across: number;
}

export type BehaviorDef = SkirmisherDef | HoldAheadDef | AmbusherDef | FixedDef | ConvoyDef | ChargeDef | StalkerDef;
export type BehaviorKind = BehaviorDef['kind'];

/** A behavior's settings: the unit's own numbers, with the preset's defaults for anything it leaves out. */
type Opts<D extends BehaviorDef, Required extends keyof D> = Pick<D, Required> & Partial<Omit<D, 'kind' | Required>>;

/** A preferred distance band for a behavior that has one (the orbit or the hold), for its first roll; 0 otherwise. */
export function behaviorBand(b: BehaviorDef): { minRange: number; maxRange: number } {
  switch (b.kind) {
    case 'skirmisher':
    case 'holdAhead':
      return b.orbit;
    case 'stalker':
      return b.hold;
    case 'ambusher':
      return { minRange: 0, maxRange: b.reach };
    default:
      return { minRange: 0, maxRange: 0 };
  }
}

export function skirmisher(o: Opts<SkirmisherDef, 'orbit' | 'siege' | 'rearInset'>): SkirmisherDef {
  return { kind: 'skirmisher', lead: 0.6, ...o, replan: o.replan ?? { every: [3, 7], flip: 0.4 } };
}

export function holdAhead(o: Opts<HoldAheadDef, 'orbit' | 'arc' | 'siege' | 'rearInset'>): HoldAheadDef {
  return { kind: 'holdAhead', laneGap: 14, laneStep: 40, ...o, replan: o.replan ?? { every: [4, 8], flip: 0.5 } };
}

export function ambusher(o: Opts<AmbusherDef, 'reach' | 'siege'>): AmbusherDef {
  return {
    kind: 'ambusher',
    rearInset: 0,
    recheck: 1,
    laneClear: 18,
    laneReach: 0.7,
    ...o,
    score: o.score ?? { inPath: 3, farOff: 2, behind: 2 },
  };
}

export function fixed(): FixedDef {
  return { kind: 'fixed', rearInset: 0, siege: null };
}

export function convoy(o: Partial<Omit<ConvoyDef, 'kind'>> = {}): ConvoyDef {
  return { kind: 'convoy', rearInset: 0, siege: null, lookAhead: 60, idlePace: 0.6, ...o };
}

export function charge(o: Partial<Omit<ChargeDef, 'kind'>> = {}): ChargeDef {
  return { kind: 'charge', rearInset: 0, siege: null, maxLead: 1.5, ...o };
}

export function stalker(o: Opts<StalkerDef, 'hold' | 'siege' | 'rearInset'>): StalkerDef {
  return { kind: 'stalker', sideGap: 30, stepAside: 10, across: 0.5, ...o, replan: o.replan ?? { every: [4, 8], flip: 0.35 } };
}
