// Things to notice and find (SPEC 6.7): the wreckage that washes up on the shore in the first days, and
// what the survivor notices on first coming near a landmark. Words and timings; the logic is in
// sim/notice.ts.

import type { Item } from '../sim/state.ts';

export interface DebrisDef {
  id: string;
  /** Game minutes after the crash it washes up. */
  after: number;
  items: Item[];
  /** What the survivor notices from a distance. */
  notice: string;
}

/** Each comes once, at its time, on a shore tile near the crash chosen by position hash. */
export const DEBRIS: readonly DebrisDef[] = [
  { id: 'cable', after: 5 * 60, items: [{ k: 'cord', n: 3 }], notice: 'Something dark and tangled lay at the edge of the water.' },
  { id: 'peanuts', after: 19 * 60, items: [{ k: 'peanuts', n: 3 }], notice: 'A scrap of bright colour had washed up on the shore.' },
  { id: 'scrap', after: 49 * 60, items: [{ k: 'metal-scrap', n: 1 }], notice: 'Something on the shore flashed in the light, and flashed again.' },
];

/** How far off the survivor notices a thing in daylight, in tiles. */
export const NOTICE_RANGE = 6;

export const LANDMARK_NOTICE: Record<string, string> = {
  waterfall: 'Somewhere ahead, water was falling: a steady roar, and spray hanging in the air.',
  snag: 'A dead tree stood split down the middle, black inside, as if something had torn it open.',
  bones: 'Something pale lay scattered in the grass ahead. Bones, old and clean.',
  avalanche: 'A whole slope of trees lay flattened, every trunk pointing downhill.',
  tarn: 'A small still lake lay cupped in the rock, so clear the stones showed on its bottom.',
  arch: 'The rock ahead had a hole clean through it, with sky on the other side.',
  'beaver-dam': 'Sticks and mud were piled across the water ahead, too neatly to be chance.',
  carcass: 'A bad smell came on the air, and the hum of flies. Something dead lay in the water.',
};
