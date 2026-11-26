// The valley's rules (SPEC 6.6): what each dealt thing *can* be. Things are named by how they look,
// never by a real species. Each row has a deck of outcomes: the core is always dealt, and spares fill
// the remaining places, so the last unknown can't be worked out by elimination. What each thing *is*
// in a given valley lives in GameState.rules (sim/rules.ts), never here.

export interface Deck<O extends string> {
  core: readonly O[];
  spares: readonly O[];
}

// ---- Wild plants: berries, bulbs, greens, mushrooms ----

export type PlantOutcome = 'nourishing' | 'poor' | 'sickening' | 'deadly';
export type PlantKind = 'berry' | 'bulb' | 'greens' | 'mushroom';

export interface PlantDef {
  id: string;
  name: string;
  kind: PlantKind;
  /** Plants in the same family look alike; a deal makes one lookalike pair (SPEC 6.3, 7.4). */
  family?: string;
  /** Colour hint for the renderer. */
  tint: 'red' | 'blue' | 'white' | 'pale' | 'purple' | 'green' | 'brown' | 'orange';
}

export const PLANTS: readonly PlantDef[] = [
  { id: 'glossy-red-berries', name: 'glossy red berries', kind: 'berry', family: 'red', tint: 'red' },
  { id: 'dull-red-berries', name: 'dull red berries', kind: 'berry', family: 'red', tint: 'red' },
  { id: 'dusty-blue-berries', name: 'dusty blue berries', kind: 'berry', family: 'blue', tint: 'blue' },
  { id: 'dark-blue-berries', name: 'dark blue berries', kind: 'berry', family: 'blue', tint: 'blue' },
  { id: 'white-berries', name: 'waxy white berries', kind: 'berry', tint: 'white' },
  { id: 'pale-bulbs', name: 'pale bulbs', kind: 'bulb', family: 'bulb', tint: 'pale' },
  { id: 'purple-bulbs', name: 'purple-skinned bulbs', kind: 'bulb', family: 'bulb', tint: 'purple' },
  { id: 'broad-greens', name: 'broad-leaved greens', kind: 'greens', tint: 'green' },
  { id: 'feathery-greens', name: 'feathery greens', kind: 'greens', tint: 'green' },
  { id: 'brown-mushrooms', name: 'brown-capped mushrooms', kind: 'mushroom', tint: 'brown' },
  { id: 'orange-fungus', name: 'orange shelf fungus', kind: 'mushroom', tint: 'orange' },
];

/** Exactly one deadly plant, at least three nourishing ones (SPEC 6.6: at least two good wild foods). */
export const PLANT_DECK: Deck<PlantOutcome> = {
  core: ['nourishing', 'nourishing', 'nourishing', 'deadly', 'sickening', 'sickening', 'poor', 'poor'],
  spares: ['nourishing', 'nourishing', 'poor', 'poor', 'sickening'],
};

// ---- Remedies ----

export type RemedyOutcome = 'stomach' | 'wound' | 'insects' | 'nothing' | 'irritant';

export interface ThingDef {
  id: string;
  name: string;
}

export const REMEDIES: readonly ThingDef[] = [
  { id: 'silvery-herb', name: 'silvery-leaved herb' },
  { id: 'sticky-herb', name: 'sticky-stemmed herb' },
  { id: 'pungent-herb', name: 'pungent low herb' },
  { id: 'red-stem-herb', name: 'red-stemmed herb' },
  { id: 'fuzzy-herb', name: 'fuzzy grey leaf' },
];

export const REMEDY_DECK: Deck<RemedyOutcome> = {
  core: ['stomach', 'wound', 'insects'],
  spares: ['nothing', 'nothing', 'irritant'],
};

// ---- Stone ----

export type StoneOutcome = 'sparks' | 'edge' | 'crumbles' | 'inert';

export const STONES: readonly ThingDef[] = [
  { id: 'dark-glassy-stone', name: 'dark glassy stone' },
  { id: 'grey-banded-stone', name: 'grey banded stone' },
  { id: 'rust-red-stone', name: 'rust-red stone' },
  { id: 'white-veined-stone', name: 'white-veined stone' },
  { id: 'speckled-stone', name: 'speckled stone' },
];

/** One spark-stone per valley; it is the one at the overhang (SPEC 6.6, fair deal). */
export const STONE_DECK: Deck<StoneOutcome> = {
  core: ['sparks', 'edge'],
  spares: ['inert', 'inert', 'crumbles', 'crumbles', 'edge'],
};

// ---- Wood and tinder ----

export type WoodOutcome = 'drill' | 'long-burning' | 'smoky' | 'quick';

export const WOODS: readonly ThingDef[] = [
  { id: 'pale-soft-wood', name: 'pale soft wood' },
  { id: 'red-barked-wood', name: 'red-barked wood' },
  { id: 'resinous-wood', name: 'resinous wood' },
  { id: 'grey-twisted-wood', name: 'grey twisted wood' },
  { id: 'white-barked-wood', name: 'white-barked wood' },
];

export const WOOD_DECK: Deck<WoodOutcome> = {
  core: ['drill', 'long-burning', 'smoky'],
  spares: ['quick', 'quick', 'smoky', 'long-burning'],
};

export type TinderOutcome = 'catches' | 'slow' | 'fails';

export const TINDERS: readonly ThingDef[] = [
  { id: 'dry-grass', name: 'dry grass' },
  { id: 'inner-bark', name: 'shredded inner bark' },
  { id: 'hanging-lichen', name: 'hanging grey lichen' },
  { id: 'seed-fluff', name: 'dry seed fluff' },
  { id: 'punk-wood', name: 'crumbly punk wood' },
];

export const TINDER_DECK: Deck<TinderOutcome> = {
  core: ['catches', 'fails'],
  spares: ['catches', 'slow', 'slow', 'fails'],
};

// ---- Water ----

export type WaterOutcome = 'foul' | 'usual';
export type WaterCause = 'beaver' | 'carcass';

/** The valley's water sources. The worldgen always makes a lake and two streams. */
export const WATER_SOURCES: readonly ThingDef[] = [
  { id: 'lake', name: 'the lake' },
  { id: 'stream-a', name: 'the near stream' },
  { id: 'stream-b', name: 'the far stream' },
];

export const WATER_DECK: Deck<WaterOutcome> = { core: ['foul', 'usual', 'usual'], spares: [] };
export const WATER_CAUSES: readonly WaterCause[] = ['beaver', 'carcass'];

// ---- Animal temper ----

export type Boldness = 'shy' | 'wary' | 'bold';
export type Deterrent = 'face' | 'noise' | 'fire';

export interface DangerAnimalDef {
  id: string;
  name: string;
  /** The warnings this animal can give before it attacks; the deal picks one (SPEC 9). */
  warnings: readonly string[];
}

export const DANGER_ANIMALS: readonly DangerAnimalDef[] = [
  {
    id: 'bear',
    name: 'black bear',
    warnings: ['huffs and pops its jaws', 'rears up tall', 'slaps the ground with a forepaw', 'goes very still and stares'],
  },
  {
    id: 'elk',
    name: 'elk',
    warnings: ['lowers its antlers', 'stamps and snorts', 'lays its ears flat', 'paces side-on'],
  },
  {
    id: 'cougar',
    name: 'cougar',
    warnings: ['crouches with a twitching tail', 'hisses', 'flattens its ears', 'goes very still and stares'],
  },
];

export const BOLDNESS_DECK: Deck<Boldness> = { core: ['wary'], spares: ['shy', 'shy', 'wary', 'bold', 'bold'] };
export const DETERRENT_DECK: Deck<Deterrent> = { core: ['fire'], spares: ['face', 'face', 'noise', 'noise', 'fire'] };

// ---- Weather signs ----

export type SignOutcome = 'foretells' | 'noise';

export const SIGNS: readonly ThingDef[] = [
  { id: 'lake-wind', name: 'the wind swinging round to blow off the lake' },
  { id: 'moon-ring', name: 'a ring round the moon' },
  { id: 'marmots-early', name: 'marmots going to ground early' },
  { id: 'red-dawn', name: 'a red sky at dawn' },
  { id: 'mares-tails', name: 'high streaky cloud' },
  { id: 'low-smoke', name: 'smoke hanging low' },
  { id: 'biting-insects', name: 'insects biting hard' },
];

export const SIGN_DECK: Deck<SignOutcome> = {
  core: ['foretells', 'foretells', 'noise', 'noise'],
  spares: ['foretells', 'noise', 'noise', 'foretells', 'noise'],
};
