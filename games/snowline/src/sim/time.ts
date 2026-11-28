// The clock (SPEC 5.1) and daylight (6.4). Integer arithmetic and a lookup table only.

import { DAYLIGHT, DAY_SIGHT, MINUTES_PER_DAY, NIGHT_SIGHT, START_MINUTE, TICKS_PER_MINUTE } from '../content/balance.ts';

export interface Clock {
  /** Day of the run, from 1. */
  day: number;
  /** Minute of the day, 0–1439. */
  minute: number;
  hour: number;
}

/** Game minutes since midnight before day 1, at a tick. */
export function totalMinutes(tick: number): number {
  return START_MINUTE + Math.floor(tick / TICKS_PER_MINUTE);
}

/** Game minutes from a tick until a time of day (the next one; a whole day if it's now). */
export function minutesUntil(tick: number, hour: number, minute = 0): number {
  const now = clock(tick).minute;
  const target = hour * 60 + minute;
  return (target - now + MINUTES_PER_DAY) % MINUTES_PER_DAY || MINUTES_PER_DAY;
}

export function clock(tick: number): Clock {
  const total = totalMinutes(tick);
  const minute = total % MINUTES_PER_DAY;
  return { day: Math.floor(total / MINUTES_PER_DAY) + 1, minute, hour: Math.floor(minute / 60) };
}

/** Daylight, 0–100, at a minute of the day: the hourly table, joined by straight lines. */
export function daylightAt(minuteOfDay: number): number {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay - h * 60;
  const a = DAYLIGHT[h]!;
  const b = DAYLIGHT[h + 1]!;
  return a + Math.floor(((b - a) * m) / 60);
}

export function daylight(tick: number): number {
  return daylightAt(clock(tick).minute);
}

/** How far the survivor sees, in tiles, with no light of their own. */
export function sightRadius(tick: number): number {
  return NIGHT_SIGHT + Math.floor(((DAY_SIGHT - NIGHT_SIGHT) * daylight(tick)) / 100);
}

/** "14:05". */
export function formatClock(c: Clock): string {
  const m = c.minute % 60;
  return `${String(c.hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
