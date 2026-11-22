import type { EnemyId } from './enemies';

/**
 * Doctrines (SPEC §7.2): how a defending force weights the roster, so the same units make very
 * different fights. The sector map shows a battle's doctrine as its defender intel (SPEC §3.1), and
 * the battle's defenders and waves draw from the doctrine's mix (`sim/encounter.ts`), so the intel is accurate. M3 first pass: the
 * four M1 units, plus hovercraft for the raiders and field batteries for the long guns (a few for
 * the entrenched and combined arms), and siege tanks for the armored fist (rarely, combined arms); later units (AT guns, rocket artillery, …) join the mixes as they arrive.
 */

export type DoctrineId = 'combined' | 'armoredFist' | 'entrenched' | 'raiders' | 'longGuns';

export interface DoctrineDef {
  id: DoctrineId;
  name: string;
  /** What the map's intel panel says about the defenders. */
  intel: string;
  /** Relative odds of each unit per spawn (missing = never). */
  mix: Partial<Record<EnemyId, number>>;
  /** Relative odds of a battle node fielding this doctrine (0 = objectives only). */
  weight: number;
  /**
   * How the force splits between defenders placed by distance and reinforcements sent by the alert
   * clock (multipliers on post size and wave threat; default 1 each). A dug-in force holds its
   * ground but is slow to reinforce; raiders keep their strength mobile.
   */
  posts?: number;
  waves?: number;
}

export const DOCTRINES: Record<DoctrineId, DoctrineDef> = {
  combined: {
    id: 'combined',
    name: 'Combined arms',
    intel: 'A balanced mix',
    mix: { lightTank: 4, infantry: 3, heavyTank: 1.5, missileLauncher: 1.5, artillery: 0.5, siegeTank: 0.2 },
    weight: 3,
  },
  armoredFist: {
    id: 'armoredFist',
    name: 'Armored fist',
    intel: 'Heavy armor',
    mix: { heavyTank: 4, lightTank: 2, missileLauncher: 0.5, infantry: 0.5, siegeTank: 0.8 },
    weight: 2,
  },
  entrenched: {
    id: 'entrenched',
    name: 'Entrenched',
    intel: 'Infantry, dug in',
    mix: { infantry: 6, heavyTank: 1, lightTank: 1, missileLauncher: 0.5, artillery: 0.75 },
    weight: 2,
    posts: 1.1,
    waves: 0.5,
  },
  raiders: {
    id: 'raiders',
    name: 'Mobile raiders',
    intel: 'Fast skirmishers',
    mix: { lightTank: 4, hovercraft: 3, infantry: 1, missileLauncher: 1 },
    weight: 2,
    posts: 0.7,
    waves: 1.3,
  },
  longGuns: {
    id: 'longGuns',
    name: 'Long guns',
    intel: 'Missiles and artillery',
    mix: { missileLauncher: 3, artillery: 2.5, lightTank: 1.5, infantry: 1.5, heavyTank: 0.5 },
    weight: 2,
  },
};

export const DOCTRINE_IDS = Object.keys(DOCTRINES) as DoctrineId[];
