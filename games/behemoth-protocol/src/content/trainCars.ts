import type { EnemyId } from './enemies';
import type { ByStrength } from './modes';

/**
 * Armored train cars (SPEC §4.4 Intercept, §7.3). A train is a chain of vehicles on the battle's
 * rail line, front to back, in **sections**: an engine and the cars it pulls. Each vehicle is a unit
 * on the field (`enemy`: its armor, weapons, and salvage are in content/enemies.ts); what's here is
 * its place in the train. How a train runs (pace, cutting loose, derailing) is `TRAIN` in tuning.ts.
 *
 * Built so far: the engine and the boxcar. The armed cars and the railway gun are still to come
 * (docs/SPEC-armored-train.md §T6, §T7): add them here and to `ENEMIES`, and fill them in from the
 * node's threat in `trainLayout`.
 */

export type TrainCarId = 'engine' | 'boxcar';

export interface TrainCarDef {
  id: TrainCarId;
  name: string;
  /** The unit it is on the field. */
  enemy: EnemyId;
  /** Its length along the track (world units): the train's spacing is worked out from it. */
  length: number;
  /** Pulls its section: one of the Intercept's targets. Every section starts with one. */
  engine?: boolean;
  /**
   * Destroyed, it goes up in a blast of this size (on its neighbors, and the Behemoth if it's close)
   * and the chain parts there (an ammo car).
   */
  volatile?: { radius: number; damage: number };
  /** Its letter on the HUD's train strip. */
  glyph: string;
}

export const TRAIN_CARS: Record<TrainCarId, TrainCarDef> = {
  engine: { id: 'engine', name: 'Engine', enemy: 'trainEngine', length: 40, engine: true, glyph: 'E' },
  boxcar: { id: 'boxcar', name: 'Boxcar', enemy: 'trainBoxcar', length: 34, glyph: 'b' },
};

/** A train's vehicles from a layout string (`?train=engine,boxcar,...`), front to back; unknown names are skipped. */
export function parseTrain(text: string): TrainCarId[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is TrainCarId => s in TRAIN_CARS);
}

/** How long a train is, by the node's strength: its sections, and the cars behind each engine. */
export const TRAIN_LAYOUT: { sections: ByStrength; cars: ByStrength } = {
  sections: { normal: 3, strong: 3, objective: 4 },
  cars: { normal: 4, strong: 5, objective: 5 },
};

/** A train's vehicles, front to back, for a node of this strength: each section an engine and its cars. */
export function trainLayout(strength: keyof ByStrength): TrainCarId[] {
  const out: TrainCarId[] = [];
  for (let s = 0; s < TRAIN_LAYOUT.sections[strength]; s++) {
    out.push('engine');
    for (let c = 0; c < TRAIN_LAYOUT.cars[strength]; c++) out.push('boxcar');
  }
  return out;
}
