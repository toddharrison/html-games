// Game-wide numbers: starting values for tuning (SPEC 5, 6). Per-thing numbers live with their thing
// (a terrain's step time is in terrain.ts).

/** Simulation ticks per real second (SPEC 5.1). */
export const TICKS_PER_SECOND = 20;
/** Ticks per game minute. A game hour is 30 real seconds; a game day 12 real minutes. */
export const TICKS_PER_MINUTE = 10;
export const MINUTES_PER_DAY = 1440;
/** The crash happens late in the morning of day 1, leaving most of a day of light (2026-11-26: was 14:30). */
export const START_MINUTE = 11 * 60;

/** The valley is a square of this many tiles a side (SPEC 6.1). */
export const MAP_SIZE = 256;
/** The logical screen, in pixels; drawn at a whole-number scale. */
export const SCREEN_W = 384;
export const SCREEN_H = 216;
export const TILE = 16;

/** Ticks a step takes on open ground (SPEC 5.2). Terrain, features, and climbing add to it. */
export const BASE_STEP_TICKS = 6;
/** Uphill steps cost one more tick for every this many units of elevation climbed (0–255 across the valley). */
export const CLIMB_PER_TICK = 2;
/** The most ticks a climb adds to one step. */
export const MAX_CLIMB_TICKS = 6;
/** Ticks a step along a fallen tree across a stream takes (careful, but dry). */
export const LOG_STEP_TICKS = 9;

/**
 * Free walking (prototype, SPEC 5.2): the survivor walks over the tile grid in any of eight directions
 * instead of stepping tile to tile. The world, and what the survivor is "on", stay on tiles. False puts
 * every new run back on grid steps.
 */
export const FREE_WALK = true;
/** A position in free walking is in 1/256ths of a tile. */
export const SUB = 256;
/** The survivor's footprint, half its width and half its depth (1/256ths of a tile): about 10 by 6 pixels. */
export const FOOT_HALF_W = 80;
export const FOOT_HALF_H = 48;
/** A tap of a direction key walks at least this many ticks. */
export const TAP_TICKS = 3;
/** How far round a corner the survivor is eased when they walk into its edge (1/256ths of a tile, about 4 px). */
export const CORNER_EASE = 64;

/** How far the survivor sees, in tiles: by day, and at night with no light (SPEC 6.4). */
export const DAY_SIGHT = 14;
export const NIGHT_SIGHT = 2;
/** How far a fire lights, in tiles. */
export const FIRE_LIGHT = 6;
/** Standing within this many tiles of a viewpoint reveals the map around it. */
export const VIEWPOINT_REACH = 1;
/** How far a viewpoint shows, in tiles. */
export const VIEWPOINT_REVEAL = 30;

/**
 * Daylight, 0–100, at each hour from 0:00 to 24:00 (25 entries). Late summer in the mountains: light
 * at about 6:00, dark at about 21:00. A lookup table, not a trig curve (SPEC 6.5, 11.3 rule 5).
 */
export const DAYLIGHT = [0, 0, 0, 0, 0, 4, 22, 58, 85, 96, 100, 100, 100, 100, 100, 100, 98, 92, 78, 52, 22, 5, 0, 0, 0];

// ---- The body (SPEC 7.1). Vitals run 0–100; rates are per game minute. ----

/** With no intake, hydration empties in about 2 days and nutrition in about 5; a day awake drains rest. */
export const DRAIN = {
  hydration: 100 / (2 * 1440),
  nutrition: 100 / (5 * 1440),
  rest: 100 / (1.15 * 1440),
};
/** Walking and working use more water and food. */
export const EXERTION = 1.6;
/** Asleep, the body uses less. */
export const SLEEP_DRAIN = 0.5;
/** Rest regained per minute asleep, at sleep quality 1. */
export const SLEEP_GAIN = 0.32;
/** Health lost per minute while a vital is empty. Hydration at zero kills in about a day. */
export const EMPTY_HARM = { hydration: 100 / 1440, nutrition: 100 / (4 * 1440), warmth: 100 / (14 * 60), rest: 0 };
/** Health regained per minute when every other vital is above HEAL_ABOVE (doubled asleep). */
export const HEAL_RATE = 100 / (3 * 1440);
export const HEAL_ABOVE = 30;
/** How fast morale drifts toward what the survivor's situation says it should be. */
export const MORALE_DRIFT = 0.01;

// ---- Temperature (SPEC 6.5). Degrees C; tables, not trig. ----

/** The mean air temperature on day 1 at the lake, and how much colder each day of the run gets. */
export const SEASON_BASE = 13;
export const SEASON_COOLING = 0.25;
/** Added to the mean at each hour 0–24 (25 entries). */
export const DAY_CURVE = [-6, -6.5, -7, -7.5, -8, -7.5, -6, -4, -1.5, 1, 3, 4.5, 5.5, 6, 6.5, 6.5, 6, 5, 3, 1, -1, -3, -4, -5, -6];
/** Each band up is this much colder; cold air pools on the valley floor at night. */
export const BAND_COOLING = 3;
export const NIGHT_POOLING = 2;
/** Below this the body loses warmth; above it, it gains. */
export const COMFORT = 15;
/** Warmth lost per minute per degree below comfort, and gained per degree above (slowly). */
export const COLD_LOSS = 0.0038;
export const WARM_GAIN = 0.02;
/** Extra warmth per minute in clear midday sun. */
export const SUN_WARMTH = 0.05;
/** Warmth from a fire within its reach, per minute. */
export const FIRE_WARMTH = 0.35;
/** Being wet, or out in the wind, multiplies the loss. */
export const WET_CHILL = 1.8;
/** Wet clothes dry this much a minute: by a fire, in daylight, at night. */
export const DRYING = { fire: 1, day: 0.35, night: 0.08 };

// ---- Food and water (SPEC 7.3, 7.4) ----

/** Hydration from one drink at a source. */
export const DRINK = 18;
/** Chance per drink of waterborne illness, by source (SPEC 7.3). The dealt foul source multiplies it. */
export const WATER_RISK = { lake: 0.035, stream: 0.012, high: 0.003 };
export const FOUL_RISK = 7;
/** Days before waterborne illness shows (SPEC 7.7). */
export const WATER_ONSET_DAYS = [2, 5] as const;
/** A small taste: this fraction of the full effect. */
export const TASTE_DOSE = 0.15;
/** Minutes until a taste's effect is felt. */
export const TASTE_DELAY = 60;
/** Nutrition by plant outcome, for a full portion (a handful). */
export const PLANT_NUTRITION = { nourishing: 9, poor: 3, sickening: 2, deadly: 1 } as const;
/** Days until a harvested patch, bush, reed bed, or the shallows give again. */
export const REGROW_DAYS = { plant: 6, reeds: 4, shallows: 2, tree: 8, bush: 7 } as const;
/**
 * What doesn't grow back within a run (SPEC 8.2): how many times one tile gives before it's used up for
 * good. A tree's firewood (limbs cut with the steel tool), its bark (stripped, or shredded for tinder:
 * one supply), the lichen on it; a deadfall's breakable wood and the punk in it.
 */
export const SUPPLY = { wood: 3, bark: 3, lichen: 2, deadfall: 3, punk: 2 } as const;
/** Wind this strong or more (WEATHER[id].wind) brings down fresh branches and washes up driftwood. */
export const BLOWING = 0.7;
/** When foods are in season, by day of the run [first, last] (SPEC 7.4). */
export const SEASONS = {
  berry: [1, 30],
  bulb: [1, 60],
  greens: [1, 38],
  mushroom: [4, 45],
  'pine-nuts': [14, 80],
  'rose-hips': [10, 80],
} as const;
