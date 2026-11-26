// The arc of a run (SPEC 5.3, 10): search aircraft, the severe storm and the rockslide, the wreckage and
// its beacon, the late signal. Numbers and words.

import type { Who } from './messages.ts';

/** Search flights in the first days: how many, and the window of days (SPEC 10). */
export const SEARCH_FLIGHTS = [2, 3] as const;
export const SEARCH_DAYS = [2, 10] as const;
/** Late flights cross the range after day 40, every few days. */
export const LATE_FROM = 40;
export const LATE_GAP = [5, 9] as const;
/** Minutes a flight is overhead. */
export const FLIGHT_MINUTES = 12;
/** Days after the beacon is switched on until rescue comes (SPEC 10: 1–3). */
export const BEACON_DAYS = [1, 3] as const;

/** What the tail wreckage holds (SPEC 10). */
export const WRECK_ITEMS: readonly { k: string; n: number }[] = [
  { k: 'beacon', n: 1 },
  { k: 'pot', n: 1 },
  { k: 'matches', n: 12 },
  { k: 'fishing-line', n: 1 },
  { k: 'first-aid', n: 1 },
  { k: 'ration-pack', n: 4 },
];

export const ARC_TEXT = {
  droneFar: () => 'A drone, very faint, somewhere beyond the ridge. An engine.',
  overhead: () => 'An aircraft came low over the valley, searching.',
  seen: (w: Who) => `The aircraft banked, and turned, and came back over the smoke. It dipped its wings. ${w.name} had been seen.`,
  missed: (w: Who) => `The aircraft droned on up the valley and was gone. Nobody had seen ${w.them}.`,
  missedAsleep: () => 'Something passed high overhead in the night of sleep, and was gone.',
  mirror: (w: Who) => `${w.name} angled the little mirror at the aircraft, flashing, flashing.`,
  stormDamage: (w: Who) => `The storm tore through the camp. ${w.name} crouched and held on while it went to pieces around ${w.them}.`,
  stormBuilds: (lost: string) => `When it was over, the ${lost} had gone.`,
  stormScatter: () => 'Things left lying out had been flung everywhere.',
  stormTrees: () => 'Trees were down all through the forest.',
  slide: () => 'In the dark there was a roar high on the mountain, on and on, and then silence. Somewhere up there, the mountain had come down.',
  slideSeen: () => 'A raw scar of new rock ran down from the cliffs below the glint. The slide had opened a way up.',
  searchTail: (w: Who) => `${w.name} pulled open what was left of the tail. Inside, strapped down and dry: a case with a light on it, a pot, matches, fishing line, a first-aid kit, food.`,
  tailEmpty: () => 'There was nothing more in the tail.',
  beaconOn: (w: Who) => `${w.name} pressed the switch on the beacon. A small light began to blink. Somewhere, someone would hear it.`,
  rescueBeacon: (w: Who) => `The thud of rotors came up the valley. They had followed the beacon. ${w.name} was going home.`,
  rescueAircraft: (w: Who) => `Before dark a float plane came down on the lake. ${w.name} waded out to meet it. ${w.They} was going home.`,
  lightSignal: (w: Who) => `${w.name} put fire to the signal pile. The green boughs caught, and a column of white smoke rose into the sky.`,
};
