// The message log's text for fire, gathering, crafting, building, and reflection (SPEC 12.2).

import type { Who } from './messages.ts';

export const FIRE_MSG = {
  firstFire: (w: Who) => `The tinder caught. A thread of smoke, a flicker, then flame. ${w.name} had fire.`,
  lit: (w: Who, slow: boolean) => (slow ? `The tinder smoked a long time before it caught, but ${w.name} had a fire going.` : `${w.name} got a fire going.`),
  wouldNotCatch: (w: Who, tinder: string) => `${w.name} tried to light the ${tinder}, but it would not catch.`,
  drillSmoked: (w: Who, wood: string) => `${w.name} worked the bow drill until ${w.their} arms burned. The ${wood} only smoked; no coal came.`,
  woodBurned: (_w: Who, wood: string, outcome: string) =>
    outcome === 'long-burning'
      ? `The ${wood} burned long and slow.`
      : outcome === 'smoky'
        ? `The ${wood} smoked thick and white.`
        : outcome === 'quick'
          ? `The ${wood} flared up and was gone in no time.`
          : `The ${wood} burned steadily.`,
  revived: (w: Who) => `${w.name} blew on the coals until they caught again.`,
  burnedDown: (_w: Who) => `The fire had burned down to coals.`,
  out: (_w: Who) => `The fire went out.`,
  embersDied: (_w: Who) => `The embers in the bark had gone cold.`,
  lightning: () => `Lightning struck high on the slope. Something up there was burning.`,
  sparks: (w: Who, stone: string, weak: boolean) =>
    weak ? `Steel on the ${stone} threw a few thin sparks. ${w.name} stared at them.` : `Steel on the ${stone} threw a spray of sparks. ${w.name} struck it again, and again.`,
  edge: (_w: Who, stone: string) => `The ${stone} flaked under the steel, leaving an edge like glass.`,
  crumbles: (_w: Who, stone: string) => `The ${stone} crumbled under the steel.`,
  nothing: (_w: Who, stone: string) => `Nothing came of striking the ${stone}.`,
  tookStone: (w: Who, stone: string) => `${w.name} pried loose a piece of the ${stone}.`,
  full: (w: Who) => `${w.Their} hands and pockets were full.`,
  banked: (w: Who) => `${w.name} buried the coals in ash for the night.`,
  wrapped: (w: Who) => `${w.name} wrapped a few live embers in bark.`,
  snagEmbers: (w: Who) => `The snag was still smouldering. ${w.name} wrapped a few glowing pieces in bark.`,
  filled: (w: Who) => `${w.name} filled it with water.`,
  cooked: (w: Who, food: string) => `${w.name} cooked it over the fire: ${food}.`,
  smoked: (w: Who) => `${w.name} hung it in the smoke until it was dry and dark. It would keep.`,
  boiled: (_w: Who) => `The water boiled.`,
  drankBoiled: (w: Who) => `${w.name} drank the boiled water, warm and flat.`,
  drankVessel: (w: Who) => `${w.name} drank the water.`,
};

export const CRAFT_MSG = {
  made: (w: Who, thing: string) => `${w.name} made ${thing}.`,
  failed: (w: Who, thing: string) => `${w.name} tried to make ${thing}, but it came apart. The materials were spoiled.`,
  built: (w: Who, thing: string) => `${w.name} finished: ${thing}.`,
  gathered: (w: Who, n: number, thing: string) => `${w.name} gathered ${n} ${thing}.`,
  cut: (w: Who, n: number, thing: string, tool: string) => `${w.name} cut ${n} ${thing} with the ${tool}.`,
  noTool: (w: Who) => `${w.name} needed something sharp for that.`,
  stored: (w: Who) => `${w.name} hung the food in the cache.`,
  unstored: (w: Who) => `${w.name} took the food down from the cache.`,
  reflect: (w: Who) => `Lying awake before dawn, ${w.name} turned things over in ${w.their} mind.`,
};
