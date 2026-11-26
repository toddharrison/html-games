// Game-wide numbers: starting values for tuning (SPEC 5, 6). Per-thing numbers live with their thing
// (a terrain's step time is in terrain.ts).

/** Simulation ticks per real second (SPEC 5.1). */
export const TICKS_PER_SECOND = 20;
/** Ticks per game minute. A game hour is 30 real seconds; a game day 12 real minutes. */
export const TICKS_PER_MINUTE = 10;
export const MINUTES_PER_DAY = 1440;
/** The crash happens in the afternoon of day 1. */
export const START_MINUTE = 14 * 60 + 30;

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
