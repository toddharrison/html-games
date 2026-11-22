import type { EnemyId } from './enemies';

/**
 * Battle modes (SPEC §4.4): what a battle asks of the Behemoth beyond reaching the extraction line.
 * Every mode ends at the extraction line; Breach and Chase add an objective, a set of target units
 * (`sim/objective.ts`). Destroying them pays the mode's bonus, a share per target; missing some never
 * stops the run, it just pays less. M3: Assault, Breach, Chase. Pursuit and Duel wait for enemy
 * Behemoths (M4).
 */

export type BattleModeId = 'assault' | 'breach' | 'chase';
export const MODE_IDS: readonly BattleModeId[] = ['assault', 'breach', 'chase'];

/** Targets per node strength (normal, strong, objective). */
export type ByStrength = { normal: number; strong: number; objective: number };

export interface ModeDef {
  id: BattleModeId;
  name: string;
  /** The map's intel line and the battle's opening call. */
  goal: string;
  /** Relative odds of a battle node (past the opening battle) being fought in this mode. */
  weight: number;
  /** Salvage for destroying every target, paid as a share per target destroyed. */
  bonus: number;
  /** Multiplier on the doctrine's post size: the objective brings its own fight. */
  posts: number;
  /** What a target is called on the HUD and in the banners (singular, plural). */
  target?: [string, string];
  /** Breach: the fortified line holding the objective (SPEC §4.4: walls, bunkers, emplacements). */
  fortress?: {
    /** Where its wall stands, as a share of the way from the start to the extraction line (range). */
    at: readonly [number, number];
    /** Armed positions set into the wall: the targets. */
    guns: ByStrength;
    /** What fills each position, in turn along the wall. */
    units: readonly EnemyId[];
    /** Gates through the wall and their width in rows. */
    gates: number;
    gateWidth: readonly [number, number];
    /**
     * Field batteries dug in behind the wall near the sides (not targets): they shell the approach
     * and the breach. `batteryDepth` is how far behind the wall (world units).
     */
    batteries: ByStrength;
    batteryDepth: number;
  };
  /** Chase: a convoy fleeing up the field toward the far end (SPEC §4.4). */
  convoy?: {
    /** Haulers: the targets. */
    haulers: ByStrength;
    /** Mine layers at the convoy's tail (escorts, not targets). */
    layers: ByStrength;
    /** Light tanks and hovercraft screening the convoy (escorts drawn from these odds). */
    escorts: ByStrength;
    escortMix: Partial<Record<EnemyId, number>>;
    /**
     * Its speed, as a multiple of the Behemoth's rated cruise: a little faster, so a cruising
     * Behemoth loses ground and has to surge (or shoot) to close.
     */
    speed: number;
    /** A damaged vehicle slows down: at 0 HP it would be down to this share of the convoy's speed. */
    hurt: number;
    /** Gap between vehicles in the column (world units), and how far ahead of the frame's top the lead starts. */
    spacing: number;
    lead: number;
    /** Seconds between a mine layer's mines, and how many it carries. */
    mineEvery: number;
    mines: number;
  };
}

export const MODES: Record<BattleModeId, ModeDef> = {
  assault: {
    id: 'assault',
    name: 'Assault',
    goal: 'Reach the extraction line',
    weight: 2,
    bonus: 0,
    posts: 1,
  },
  breach: {
    id: 'breach',
    name: 'Breach',
    goal: 'Destroy the fortress guns, then exit',
    weight: 1,
    bonus: 60,
    posts: 0.8,
    target: ['gun', 'guns'],
    fortress: {
      at: [0.55, 0.7],
      guns: { normal: 3, strong: 4, objective: 5 },
      units: ['gunEmplacement', 'weaponTower', 'rocketBunker'],
      gates: 2,
      gateWidth: [3, 4],
      batteries: { normal: 1, strong: 1, objective: 2 },
      batteryDepth: 150,
    },
  },
  chase: {
    id: 'chase',
    name: 'Chase',
    goal: 'Run down the convoy before it escapes',
    weight: 1,
    bonus: 60,
    posts: 0.6,
    target: ['hauler', 'haulers'],
    convoy: {
      haulers: { normal: 3, strong: 4, objective: 5 },
      layers: { normal: 1, strong: 1, objective: 2 },
      escorts: { normal: 2, strong: 3, objective: 3 },
      escortMix: { lightTank: 1, hovercraft: 1 },
      speed: 1.15,
      hurt: 0.5,
      spacing: 34,
      lead: 170,
      mineEvery: 2.4,
      mines: 6,
    },
  },
};
