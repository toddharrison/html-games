// Items (SPEC 7.4, 7.8, 8.2): what the survivor can carry. An item stack is { k: kind, n: count, d: data }
// where `d` says which dealt thing it is (a plant, stone, wood, tinder, or herb index) when that matters.
// What a dealt item *does* comes from GameState.rules, never from here.

export interface FoodDef {
  /** Nutrition and hydration from one portion, eaten whole. */
  nutrition: number;
  hydration: number;
  /** Game minutes until it spoils; 0 never does. */
  spoils: number;
  /** Illness risk eating it raw (0–1), and what cooking turns it into. */
  rawRisk?: number;
  cooksTo?: string;
}

export interface ItemDef {
  name: string;
  /** Carrying weight of one. */
  weight: number;
  /** How many fit in one inventory slot. */
  stack: number;
  food?: FoodDef;
  /** A steel tool: one of the three starting tools. */
  steel?: boolean;
  /** Small enough for a pack rat to take from the ground at night (SPEC 9). */
  small?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  // Starting tools (SPEC 7.2).
  hatchet: { name: 'hatchet', weight: 2, stack: 1, steel: true },
  knife: { name: 'sheath knife', weight: 1, stack: 1, steel: true, small: true },
  multitool: { name: 'multi-tool', weight: 1, stack: 1, steel: true, small: true },
  // Pocket items (SPEC 4.1).
  'candy-bar': { name: 'candy bar', weight: 0.2, stack: 3, small: true, food: { nutrition: 10, hydration: 0, spoils: 0 } },
  granola: { name: 'squashed granola bar', weight: 0.2, stack: 3, small: true, food: { nutrition: 8, hydration: 0, spoils: 0 } },
  gum: { name: 'pack of gum', weight: 0.1, stack: 1, small: true, food: { nutrition: 1, hydration: 0, spoils: 0 } },
  bandana: { name: 'bandana', weight: 0.1, stack: 1, small: true },
  watch: { name: 'wristwatch', weight: 0.1, stack: 1, small: true },
  paperclip: { name: 'paperclip', weight: 0, stack: 1, small: true },
  pencil: { name: 'pencil stub', weight: 0, stack: 1, small: true },
  mirror: { name: 'small mirror', weight: 0.2, stack: 1, small: true },
  // Food that is the same in every valley (SPEC 6.6, 7.4).
  'cattail-root': { name: 'cattail root', weight: 0.4, stack: 6, food: { nutrition: 6, hydration: 1, spoils: 3 * 1440 } },
  'pine-nuts': { name: 'pine nuts', weight: 0.2, stack: 8, food: { nutrition: 5, hydration: 0, spoils: 0 } },
  'rose-hips': { name: 'rose hips', weight: 0.1, stack: 8, food: { nutrition: 3, hydration: 1, spoils: 6 * 1440 } },
  crayfish: { name: 'crayfish', weight: 0.2, stack: 6, food: { nutrition: 4, hydration: 1, spoils: 1440, rawRisk: 0.25, cooksTo: 'cooked-crayfish' } },
  mussels: { name: 'mussels', weight: 0.3, stack: 6, food: { nutrition: 4, hydration: 1, spoils: 1440, rawRisk: 0.3, cooksTo: 'cooked-mussels' } },
  'cooked-crayfish': { name: 'cooked crayfish', weight: 0.2, stack: 6, food: { nutrition: 7, hydration: 1, spoils: 1440 } },
  'cooked-mussels': { name: 'cooked mussels', weight: 0.3, stack: 6, food: { nutrition: 7, hydration: 1, spoils: 1440 } },
  // Dealt plants: d is the PLANTS index. Their nutrition and harm come from the deal (sim/food.ts).
  plant: { name: 'plant', weight: 0.2, stack: 10, food: { nutrition: 0, hydration: 1, spoils: 3 * 1440 } },
  herb: { name: 'herb', weight: 0.1, stack: 10, small: true },
  // Materials (M3 uses most of these).
  stick: { name: 'stick', weight: 0.5, stack: 8 },
  firewood: { name: 'firewood', weight: 1, stack: 6 },
  bark: { name: 'bark', weight: 0.3, stack: 6 },
  fibre: { name: 'plant fibre', weight: 0.1, stack: 10, small: true },
  cord: { name: 'cord', weight: 0.1, stack: 6, small: true },
  tinder: { name: 'tinder', weight: 0.1, stack: 8, small: true },
  stone: { name: 'stone', weight: 0.6, stack: 4, small: true },
  boughs: { name: 'green boughs', weight: 0.8, stack: 6 },
  feathers: { name: 'feathers', weight: 0, stack: 20, small: true },
  hide: { name: 'hide', weight: 1, stack: 3 },
  // Made things (M3, M4).
  'sharp-stick': { name: 'sharpened stick', weight: 0.5, stack: 1 },
  spear: { name: 'fish spear', weight: 0.8, stack: 1 },
  'hard-spear': { name: 'fire-hardened spear', weight: 0.8, stack: 1 },
  'bow-drill': { name: 'bow drill', weight: 0.6, stack: 1 },
  'bark-vessel': { name: 'bark vessel', weight: 0.4, stack: 1 },
  'water-vessel': { name: 'bark vessel of water', weight: 1.4, stack: 1 },
  'boiled-water': { name: 'bark vessel of boiled water', weight: 1.4, stack: 1 },
  'ember-pouch': { name: 'embers in bark', weight: 0.4, stack: 1 },
  basket: { name: 'bark basket', weight: 0.6, stack: 1 },
  snare: { name: 'snare', weight: 0.1, stack: 4, small: true },
  bow: { name: 'bow', weight: 0.8, stack: 1 },
  arrows: { name: 'arrows', weight: 0.1, stack: 12 },
  splint: { name: 'splint', weight: 0.3, stack: 1 },
  'warm-layers': { name: 'warm layers', weight: 1.5, stack: 1 },
  fish: { name: 'trout', weight: 0.6, stack: 4, food: { nutrition: 12, hydration: 2, spoils: 1440, rawRisk: 0.2, cooksTo: 'cooked-fish' } },
  'cooked-fish': { name: 'cooked trout', weight: 0.5, stack: 4, food: { nutrition: 18, hydration: 2, spoils: 1440 } },
  meat: { name: 'raw meat', weight: 0.6, stack: 6, food: { nutrition: 10, hydration: 1, spoils: 1440, rawRisk: 0.3, cooksTo: 'cooked-meat' } },
  'cooked-meat': { name: 'cooked meat', weight: 0.5, stack: 6, food: { nutrition: 16, hydration: 1, spoils: 1440 } },
  'smoked-meat': { name: 'smoked meat', weight: 0.3, stack: 8, food: { nutrition: 14, hydration: 0, spoils: 20 * 1440 } },
  'smoked-fish': { name: 'smoked trout', weight: 0.3, stack: 8, food: { nutrition: 15, hydration: 0, spoils: 20 * 1440 } },
  game: { name: 'small game', weight: 1.5, stack: 2 },
  // From the tail wreckage (SPEC 10).
  pot: { name: 'metal pot', weight: 1, stack: 1 },
  'pot-water': { name: 'pot of water', weight: 2, stack: 1 },
  'pot-boiled': { name: 'pot of boiled water', weight: 2, stack: 1 },
  matches: { name: 'matches', weight: 0.1, stack: 20, small: true },
  'fishing-line': { name: 'fishing line and hooks', weight: 0.1, stack: 1, small: true },
  'first-aid': { name: 'first-aid kit', weight: 0.5, stack: 1 },
  'ration-pack': { name: 'packaged food', weight: 0.3, stack: 6, food: { nutrition: 25, hydration: 2, spoils: 0 } },
  beacon: { name: 'emergency beacon', weight: 1.5, stack: 1 },
  // Washed up on the shore in the first days (SPEC 6.7).
  peanuts: { name: 'peanuts', weight: 0.1, stack: 6, small: true, food: { nutrition: 9, hydration: 0, spoils: 0 } },
  'metal-scrap': { name: 'scrap of bright aluminium', weight: 0.3, stack: 1 },
};

/** Inventory slots in pockets and hands, and what a basket or pack adds (SPEC 7.8). */
export const POCKET_SLOTS = 8;
export const BASKET_SLOTS = 4;
export const CARRY_LIMIT = 12;
export const BASKET_CARRY = 8;

export function itemDef(k: string): ItemDef {
  const d = ITEMS[k];
  if (!d) throw new Error(`unknown item ${k}`);
  return d;
}
