// Loose things on the ground (SPEC 6.7): what can be picked up by hand, where it lies, and what it gives.
// The numeric ids are what World.loose stores, so their order is fixed: add new entries at the end.
// Placement is in sim/worldgen/loose.ts; gathering in sim/loose.ts; the drawings in render/sprites.ts.

import { TINDER_SOURCE, WOOD_SOURCE } from './recipes.ts';

export const L = {
  none: 0,
  twigs: 1,
  branch: 2,
  stones: 3,
  chip: 4,
  grass: 5,
  fluff: 6,
  driftwood: 7,
  driftlog: 8,
  stalks: 9,
  cones: 10,
  feather: 11,
  tracksHare: 12,
  tracksElk: 13,
  tracksBear: 14,
  tracksCougar: 15,
} as const;
export type LooseId = (typeof L)[keyof typeof L];

/** Where a gathered item's dealt index comes from: fixed, the nearest tree's wood, or the nearest outcrop's stone. */
export type LooseData = number | 'tree' | 'outcrop' | undefined;

export interface LooseDef {
  id: string;
  /** What the cursor and the action call it. `{stone}` is filled with the outcrop's stone. */
  name: string;
  /** What gathering gives: an item, a count range, and its dealt index. Tracks give nothing. */
  gives?: { k: string; n: [number, number]; d?: LooseData };
  /** A second item a bigger thing also gives (a branch's piece of wood). */
  also?: { k: string; n: number; d?: LooseData };
  minutes: number;
  /** Days until another lies there. */
  regrow: number;
  /** Never comes back once taken (`regrow` is ignored). */
  once?: true;
  /** Wind (BLOWING) brings another before `regrow` is up: fallen branches, driftwood. */
  blows?: true;
  /** Only there in this food's season. */
  season?: 'pine-nuts';
  /** Tracks: which animal made them. */
  animal?: 'hare' | 'elk' | 'bear' | 'cougar';
  /** Bigger things are drawn bigger (SPEC 6.8). */
  big?: boolean;
}

export const LOOSE: readonly LooseDef[] = [
  { id: 'none', name: '', minutes: 0, regrow: 0 },
  { id: 'twigs', name: 'dry twigs', gives: { k: 'stick', n: [2, 3] }, minutes: 4, regrow: 3, blows: true },
  { id: 'branch', name: 'a fallen branch', gives: { k: 'stick', n: [2, 3] }, also: { k: 'firewood', n: 1, d: 'tree' }, minutes: 8, regrow: 9, big: true, blows: true },
  { id: 'stones', name: 'loose stones', gives: { k: 'stone', n: [1, 2] }, minutes: 5, regrow: 0, once: true },
  { id: 'chip', name: 'chips of {stone}', gives: { k: 'stone', n: [1, 1], d: 'outcrop' }, minutes: 4, regrow: 0, once: true },
  { id: 'grass', name: 'a tuft of dry grass', gives: { k: 'tinder', n: [2, 3], d: TINDER_SOURCE.grass }, minutes: 4, regrow: 3 },
  { id: 'fluff', name: 'cattail fluff', gives: { k: 'tinder', n: [2, 3], d: TINDER_SOURCE.seedFluff }, minutes: 5, regrow: 5 },
  { id: 'driftwood', name: 'driftwood', gives: { k: 'firewood', n: [1, 2], d: WOOD_SOURCE.driftwood }, minutes: 8, regrow: 5, blows: true },
  { id: 'driftlog', name: 'a driftwood log', gives: { k: 'firewood', n: [3, 4], d: WOOD_SOURCE.driftwood }, minutes: 18, regrow: 10, big: true, blows: true },
  { id: 'stalks', name: 'fibrous stalks', gives: { k: 'fibre', n: [3, 4] }, minutes: 10, regrow: 4 },
  { id: 'cones', name: 'pine cones', gives: { k: 'pine-nuts', n: [2, 3] }, minutes: 12, regrow: 8, season: 'pine-nuts' },
  { id: 'feather', name: 'a feather', gives: { k: 'feathers', n: [2, 4] }, minutes: 1, regrow: 14 },
  // Prints are named by how they look; looking closer says whose they are.
  { id: 'tracks-hare', name: 'small paired prints', minutes: 3, regrow: 0, animal: 'hare' },
  { id: 'tracks-elk', name: 'split-hoof prints', minutes: 3, regrow: 0, animal: 'elk' },
  { id: 'tracks-bear', name: 'broad prints with claw marks', minutes: 3, regrow: 0, animal: 'bear' },
  { id: 'tracks-cougar', name: 'round prints, no claw marks', minutes: 3, regrow: 0, animal: 'cougar' },
];

export function isTracks(l: number): boolean {
  return l >= L.tracksHare && l <= L.tracksCougar;
}

/** What looking at tracks tells (SPEC 6.7): plain, and never a real species' name for a dealt thing. */
/**
 * Dens (SPEC 6.3, 9): where each animal sleeps, placed where it would really choose (worldgen
 * placeTerritories). Indexed by a den feature's data byte. Named by how they look until looked at.
 */
export const DENS: readonly { animal: 'bear' | 'cougar' | 'marmot'; name: string; look: string; action: string }[] = [
  {
    animal: 'bear',
    name: 'a hollow dug under the rock',
    action: 'Look into the hollow',
    look: 'Earth torn out from under the rock and heaped at the mouth, and coarse dark hairs caught on the stone. A bed of needles inside, pressed flat. Something big sleeps here in the cold months. Not a place to be.',
  },
  {
    animal: 'cougar',
    name: 'a shelf under the rocks',
    action: 'Look under the shelf',
    look: 'The ground under the rock is scraped bare and dry, and there are old bones pushed to the back, cracked open. From here you could watch the whole meadow below without being seen.',
  },
  {
    animal: 'marmot',
    name: 'holes among the rocks',
    action: 'Look at the holes',
    look: 'Burrows between the rocks, each with a fan of fresh earth, and well-worn paths between them. Something whistled, sharp, and a fat brown shape dropped out of sight.',
  },
];

export const TRACKS_TEXT: Record<'hare' | 'elk' | 'bear' | 'cougar', string> = {
  hare: 'Small prints in pairs, the long hind feet landing ahead of the front ones, coming and going along the same line. A hare run.',
  elk: 'Split hooves, big as a hand, pressed deep, and droppings like a scatter of dark beans. Elk had come this way, several of them.',
  bear: 'A broad print with five toes and the marks of long claws in front of them, wider than a hand. A bear had walked here, not long ago.',
  cougar: 'A round print, four toes and no claw marks, the pad shaped like a lobed heart. A big cat. The prints went on, very straight.',
};
