// The protagonist roster (SPEC 4): backgrounds, traits, starting tools, pocket items, names, and looks.
// Each background and trait is a short list of modifiers that systems read; no system has code for a
// particular background. The modifiers are read from M2 on.

export type SkillId = 'firecraft' | 'foraging' | 'fishing' | 'hunting' | 'crafting';
/** A field the background's one valley fact comes from (SPEC 6.6, protagonists). */
export type FactField = 'temper' | 'water' | 'plant' | 'stone' | 'wood' | 'remedy';

export interface Modifiers {
  skills?: Partial<Record<SkillId, number>>;
  /** Techniques known from the start (insight ids, SPEC 8.1). */
  techniques?: readonly string[];
  /** The field of the one valley fact the survivor starts with. */
  fact?: FactField;
  /** Multipliers on rest cost and similar; 1 is no change. Read by the systems that use them. */
  moveRest?: number;
  heavyWorkRest?: number;
  coldWater?: number;
  skillGain?: number;
  reflection?: number;
  morale?: number;
}

export interface BackgroundDef {
  id: string;
  name: string;
  blurb: string;
  mods: Modifiers;
}

export const BACKGROUNDS: readonly BackgroundDef[] = [
  {
    id: 'scout',
    name: 'Scout',
    blurb: 'Knows firecraft: tinder and kindling, sparks off steel, the bow drill. Cord, and a bough bed.',
    mods: { skills: { firecraft: 1 }, techniques: ['cord', 'bow-drill', 'tinder-nest', 'kindling', 'sparks', 'bough-bed'], fact: 'wood' },
  },
  { id: 'angler', name: 'Angler', blurb: 'Has fished every summer they can remember: knows a fish spear, and to aim below the fish.', mods: { skills: { fishing: 1 }, techniques: ['spear', 'aim-low'], fact: 'water' } },
  {
    id: 'hunter',
    name: "Hunter's kid",
    blurb: 'Grew up tracking and at camp fires: knows snares, kindling, and hanging food from bears. Animals notice them later.',
    mods: { skills: { hunting: 1 }, techniques: ['snare', 'kindling', 'cache'], fact: 'temper' },
  },
  { id: 'farm', name: 'Farm kid', blurb: 'Good with tools; heavy work costs less rest. Keeps firewood dry, and knows a splint.', mods: { skills: { crafting: 1 }, techniques: ['woodpile', 'splint'], heavyWorkRest: 0.8, fact: 'plant' } },
  { id: 'runner', name: 'Runner', blurb: 'Moving costs less rest; better in cold water. Knows how to splint a hurt ankle.', mods: { techniques: ['splint'], moveRest: 0.8, coldWater: 0.8, fact: 'stone' } },
  {
    id: 'reader',
    name: 'Reader',
    blurb: 'Read every survival book in the library, and knows the most, but has done none of it. Steadier.',
    mods: { techniques: ['tinder-nest', 'kindling', 'sparks', 'reflector', 'bark-vessel', 'hot-stones', 'weir', 'signal'], reflection: 1.5, morale: 1.1, fact: 'remedy' },
  },
  { id: 'city', name: 'City kid', blurb: 'Knows only what any kid knows, but learns faster. The hard way.', mods: { skillGain: 1.3 } },
];

export interface TraitDef {
  id: string;
  name: string;
  blurb: string;
}

export const TRAITS: readonly TraitDef[] = [
  { id: 'light-sleeper', name: 'Light sleeper', blurb: 'Wakes at night noises; sleeps badly without a secure shelter.' },
  { id: 'afraid-dark', name: 'Afraid of the dark', blurb: 'Morale drops at night without a fire.' },
  { id: 'weak-stomach', name: 'Weak stomach', blurb: 'Food illnesses hit harder.' },
  { id: 'glasses', name: 'Wears glasses', blurb: 'Glasses can be knocked off or broken.' },
  { id: 'poor-swimmer', name: 'Poor swimmer', blurb: 'Deep water is far more dangerous.' },
  { id: 'picky-eater', name: 'Picky eater', blurb: 'Unfamiliar food hurts morale, until used to it.' },
  { id: 'restless', name: 'Restless', blurb: 'A day spent entirely in camp hurts morale.' },
];

export interface ToolDef {
  id: string;
  name: string;
  strong: string;
  weak: string;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'hatchet', name: 'hatchet', strong: 'felling, splitting, building; good sparks', weak: 'fine carving, butchering' },
  { id: 'knife', name: 'sheath knife', strong: 'carving, butchering, cord and fibre work', weak: 'cutting wood' },
  { id: 'multitool', name: 'multi-tool', strong: 'adequate at everything; best at snares and repairs', weak: 'nothing fast; poor sparks' },
];

export const POCKET_ITEMS: readonly { id: string; name: string }[] = [
  { id: 'candy-bar', name: 'a candy bar' },
  { id: 'bandana', name: 'a bandana' },
  { id: 'watch', name: 'a wristwatch' },
  { id: 'paperclip', name: 'a paperclip' },
  { id: 'gum', name: 'a pack of gum' },
  { id: 'pencil', name: 'a pencil stub' },
  { id: 'mirror', name: 'a small mirror' },
  { id: 'granola', name: 'a squashed granola bar' },
];

/** Equal numbers of boys' and girls' names (SPEC 4.1). */
export const NAMES = {
  boy: ['Eli', 'Mateo', 'Owen', 'Sam', 'Theo', 'Jonah', 'Kai', 'Felix', 'Ravi', 'Luca', 'Desmond', 'Tomas', 'Arlo', 'Isaac'],
  girl: ['Maya', 'Nora', 'Isla', 'June', 'Priya', 'Ada', 'Hazel', 'Lena', 'Rosa', 'Tess', 'Wren', 'Kira', 'Elsie', 'Mira'],
} as const;

/** Appearance choices, as indexes into the renderer's colour lists. */
export const LOOKS = { skin: 6, hair: 6, hairStyle: 3, shirt: 8, pants: 5 } as const;
