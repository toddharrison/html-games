// Crafting and building (SPEC 8.2, 7.6), and how each starting tool handles each kind of work (7.2).
// A recipe is locked until its technique is known (SPEC 8.1).

/** Kinds of work, for the starting tools' strengths. */
export type Work = 'wood' | 'fine' | 'fibre' | 'butcher' | 'plain';

/** Time multipliers per tool and kind of work (lower is faster), and how well each throws sparks. */
export const TOOL_WORK: Record<string, Record<Work, number> & { sparks: number }> = {
  hatchet: { wood: 0.6, fine: 1.4, fibre: 1.1, butcher: 1.4, plain: 1, sparks: 1 },
  knife: { wood: 1.6, fine: 0.7, fibre: 0.75, butcher: 0.7, plain: 1, sparks: 0.85 },
  multitool: { wood: 1, fine: 1, fibre: 1, butcher: 1, plain: 1, sparks: 0.55 },
};

export interface Ingredient {
  k: string;
  n: number;
  /** Must be this dealt thing (a wood, say), or any if left out. */
  d?: number;
}

export interface RecipeDef {
  id: string;
  label: string;
  /** The technique that unlocks it; none means anyone can. */
  technique?: string;
  inputs: Ingredient[];
  /** Needs the steel tool (and so its speed for `work`), a burning fire within reach, or neither. */
  steel?: boolean;
  fire?: boolean;
  work: Work;
  minutes: number;
  out: { k: string; n: number };
  /** Chance of spoiling the materials at crafting level 0; each level takes off a fifth of it. */
  fail?: number;
  /** The made thing remembers the wood it came from (a bow drill's spindle and board). */
  keepsWood?: boolean;
}

export const RECIPES: readonly RecipeDef[] = [
  { id: 'cord', label: 'Twist cord', technique: 'cord', inputs: [{ k: 'fibre', n: 3 }], work: 'fibre', minutes: 20, out: { k: 'cord', n: 1 }, fail: 0.2 },
  { id: 'sharp-stick', label: 'Sharpen a stick', technique: 'sharpen', inputs: [{ k: 'stick', n: 1 }], steel: true, work: 'fine', minutes: 10, out: { k: 'sharp-stick', n: 1 } },
  { id: 'spear', label: 'Split a fish spear', technique: 'spear', inputs: [{ k: 'sharp-stick', n: 1 }, { k: 'cord', n: 1 }], steel: true, work: 'fine', minutes: 30, out: { k: 'spear', n: 1 }, fail: 0.25 },
  { id: 'hard-spear', label: 'Harden the spear in the fire', technique: 'fire-harden', inputs: [{ k: 'spear', n: 1 }], fire: true, work: 'plain', minutes: 40, out: { k: 'hard-spear', n: 1 } },
  {
    id: 'bow-drill',
    label: 'Make a bow drill',
    technique: 'bow-drill',
    inputs: [{ k: 'stick', n: 2 }, { k: 'cord', n: 1 }, { k: 'firewood', n: 1 }],
    steel: true,
    work: 'fine',
    minutes: 45,
    out: { k: 'bow-drill', n: 1 },
    fail: 0.3,
    keepsWood: true,
  },
  { id: 'bark-vessel', label: 'Fold a bark vessel', technique: 'bark-vessel', inputs: [{ k: 'bark', n: 2 }, { k: 'stick', n: 1 }], work: 'fine', minutes: 25, out: { k: 'bark-vessel', n: 1 }, fail: 0.2 },
  { id: 'basket', label: 'Stitch a bark basket', technique: 'basket', inputs: [{ k: 'bark', n: 3 }, { k: 'cord', n: 2 }], work: 'fibre', minutes: 60, out: { k: 'basket', n: 1 }, fail: 0.2 },
  { id: 'snare', label: 'Tie snares', technique: 'snare', inputs: [{ k: 'cord', n: 1 }, { k: 'stick', n: 1 }], work: 'fibre', minutes: 20, out: { k: 'snare', n: 2 } },
  { id: 'bow', label: 'Make a bow', technique: 'bow', inputs: [{ k: 'stick', n: 2 }, { k: 'cord', n: 2 }], steel: true, work: 'wood', minutes: 90, out: { k: 'bow', n: 1 }, fail: 0.3 },
  { id: 'arrows', label: 'Make arrows', technique: 'bow', inputs: [{ k: 'stick', n: 2 }, { k: 'feathers', n: 2 }], steel: true, fire: true, work: 'fine', minutes: 45, out: { k: 'arrows', n: 3 } },
  { id: 'splint', label: 'Bind a splint', technique: 'splint', inputs: [{ k: 'stick', n: 2 }, { k: 'cord', n: 1 }], work: 'plain', minutes: 15, out: { k: 'splint', n: 1 } },
  { id: 'warm-layers', label: 'Make warm layers', technique: 'warm-layers', inputs: [{ k: 'hide', n: 2 }, { k: 'tinder', n: 4, d: 0 }, { k: 'cord', n: 2 }], work: 'fibre', minutes: 120, out: { k: 'warm-layers', n: 1 } },
];

/** Camp improvements (SPEC 7.6): built on the tile the survivor stands on, or (fire and tree ones) faces. */
export interface BuildDef {
  id: string;
  label: string;
  technique?: string;
  inputs: Ingredient[];
  minutes: number;
  /** Built where: 'here' (the camp spot), 'fire' (the faced fire), 'tree' (the faced tree), 'open' (faced open ground). */
  at: 'here' | 'fire' | 'tree' | 'open' | 'water';
}

export const BUILDS: readonly BuildDef[] = [
  { id: 'lean-to', label: 'Build a lean-to', inputs: [{ k: 'stick', n: 8 }, { k: 'boughs', n: 4 }], minutes: 90, at: 'here' },
  { id: 'bed', label: 'Lay a bough bed', inputs: [{ k: 'boughs', n: 4 }], minutes: 30, at: 'here' },
  { id: 'wall', label: 'Weave a wall and door', technique: 'walls', inputs: [{ k: 'stick', n: 6 }, { k: 'cord', n: 1 }], minutes: 120, at: 'here' },
  { id: 'reflector', label: 'Ring the fire with reflector stones', inputs: [{ k: 'stone', n: 3 }], minutes: 30, at: 'fire' },
  { id: 'woodpile', label: 'Build a covered woodpile', inputs: [{ k: 'stick', n: 4 }, { k: 'bark', n: 2 }], minutes: 45, at: 'here' },
  { id: 'cache', label: 'Rig a hanging food cache', technique: 'cache', inputs: [{ k: 'cord', n: 2 }], minutes: 40, at: 'tree' },
  { id: 'weir', label: 'Build a fish weir of stones', technique: 'weir', inputs: [{ k: 'stone', n: 6 }], minutes: 120, at: 'water' },
  { id: 'signal', label: 'Build a signal fire pile', technique: 'signal', inputs: [{ k: 'firewood', n: 6 }, { k: 'boughs', n: 4 }], minutes: 60, at: 'open' },
];

/**
 * Where each wood comes from (SPEC 6.6: the wood row's things). The deal decides what each wood does.
 * Index into WOODS in decks.ts.
 */
export const WOOD_SOURCE = { driftwood: 0, deadfall: 1, conifer: 2, stunted: 3, aspen: 4 } as const;

/** Where each tinder comes from. Index into TINDERS in decks.ts. */
export const TINDER_SOURCE = { grass: 0, innerBark: 1, lichen: 2, seedFluff: 3, punk: 4 } as const;

/** Minutes of burning each wood gives one piece of firewood, by its dealt outcome. */
export const WOOD_BURN: Record<string, number> = { drill: 50, 'long-burning': 120, smoky: 60, quick: 30 };
export const STICK_BURN = 12;
/** How likely a tinder is to catch, by its dealt outcome. */
export const TINDER_CATCH: Record<string, number> = { catches: 0.65, slow: 0.35, fails: 0 };
