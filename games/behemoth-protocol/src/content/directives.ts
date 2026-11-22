import type { BattleModeId } from './modes';

/**
 * Directives (SPEC §3): the run's orders. A Directive is picked at the start of a run and sets what
 * every sector's **objective battle** asks for: its mode, what counts as taking it, and how it's
 * shaped. Taking a sector's objective earns extra depot actions (`DIRECTIVE.sectorReward`); the last
 * sector's objective decides the run: taken, the Directive is complete; missed, it has failed (the
 * Behemoth can't turn back for it). M3: three Directives built on the M3 modes. Enemy Behemoths and
 * trains bring more in M4.
 */

export type DirectiveId = 'decapitation' | 'interdiction' | 'breakthrough';
export const DIRECTIVE_IDS: readonly DirectiveId[] = ['decapitation', 'interdiction', 'breakthrough'];

/** What takes a sector's objective battle (beyond reaching the extraction line, which every battle needs). */
export type DirectiveGoal =
  /** Destroy the command post that stands behind the fortress wall (Breach). */
  | { kind: 'command' }
  /** Destroy at least this share of the battle's targets, rounded up (Chase: 3 of 5 haulers). */
  | { kind: 'share'; share: number }
  /**
   * Extract within par: the time the battle's length takes at the chassis' rated cruise, times
   * `slack`. Surging beats it; braking, worn treads, or an overload eat into it.
   */
  | { kind: 'par'; slack: number };

export interface DirectiveDef {
  id: DirectiveId;
  name: string;
  /** One line for the picker. */
  brief: string;
  /** The orders: a few sentences for the picker. */
  orders: string;
  /** Every sector's objective battle is fought in this mode. */
  mode: BattleModeId;
  goal: DirectiveGoal;
  /** What a sector's objective is called (map intel, banners, the summary), and the last sector's. */
  objective: string;
  final: string;
  /** The objective battle's length, as a multiple of `RUN.battleLength`. */
  length: number;
  /** How fast the objective battle's alert clock runs (×; 1.25 = waves 25% sooner). */
  alertPace: number;
}

export const DIRECTIVES: Record<DirectiveId, DirectiveDef> = {
  decapitation: {
    id: 'decapitation',
    name: 'Decapitation',
    brief: 'Destroy the enemy high command.',
    orders:
      'Each sector is run from a command post behind a fortress wall. Break in and destroy it: with it go their orders, and the reinforcements stop. The last one is the high command.',
    mode: 'breach',
    goal: { kind: 'command' },
    objective: 'Command post',
    final: 'High command',
    length: 1,
    alertPace: 1,
  },
  interdiction: {
    id: 'interdiction',
    name: 'Interdiction',
    brief: 'Cut the enemy supply line.',
    orders:
      "A supply convoy crosses each sector. Run it down before it escapes: stop at least three of every five haulers. The last convoy carries the front line's fuel.",
    mode: 'chase',
    goal: { kind: 'share', share: 0.6 },
    objective: 'Supply convoy',
    final: 'Fuel convoy',
    length: 1,
    alertPace: 1,
  },
  breakthrough: {
    id: 'breakthrough',
    name: 'Breakthrough',
    brief: 'Smash through to the coast.',
    orders:
      'Each sector is held by a deep defensive line. Punch through it before it closes behind you: extract within par time. The last line holds the coast road.',
    mode: 'assault',
    goal: { kind: 'par', slack: 1.2 },
    objective: 'Defensive line',
    final: 'Coast line',
    length: 1.3,
    alertPace: 1.25,
  },
};
