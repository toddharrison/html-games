// Weather (SPEC 6.5): states, how each feels, and the odds of moving between them. Advanced every three
// game hours from the seed's `weather` stream, so the whole run's forecast is fixed by the seed.

export type WeatherId = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'thunderstorm' | 'wind' | 'severe';

export interface WeatherDef {
  name: string;
  /** Degrees added to the air temperature, by day and by night. */
  day: number;
  night: number;
  /** 0–1. */
  wind: number;
  /** Rain falls (snow above the snowline). */
  wet: boolean;
  /** Fraction of sight lost. */
  fog: number;
  /** How dark the sky is, 0–1, for the renderer. */
  gloom: number;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: { name: 'clear', day: 2, night: -3, wind: 0, wet: false, fog: 0, gloom: 0 },
  cloudy: { name: 'overcast', day: -1, night: 1, wind: 0.2, wet: false, fog: 0, gloom: 0.25 },
  fog: { name: 'fog', day: -2, night: 0, wind: 0, wet: false, fog: 0.6, gloom: 0.3 },
  drizzle: { name: 'drizzle', day: -2, night: 0, wind: 0.2, wet: true, fog: 0.15, gloom: 0.35 },
  rain: { name: 'rain', day: -4, night: -1, wind: 0.4, wet: true, fog: 0.25, gloom: 0.5 },
  thunderstorm: { name: 'thunderstorm', day: -5, night: -2, wind: 0.7, wet: true, fog: 0.3, gloom: 0.65 },
  wind: { name: 'high wind', day: -3, night: -3, wind: 0.9, wet: false, fog: 0, gloom: 0.15 },
  severe: { name: 'the great storm', day: -7, night: -5, wind: 1, wet: true, fog: 0.4, gloom: 0.8 },
};

export const WEATHER_IDS: readonly WeatherId[] = ['clear', 'cloudy', 'fog', 'drizzle', 'rain', 'thunderstorm', 'wind'];

/**
 * Relative odds of the next state from each state, before the time of day and the season adjust them.
 * Mountain pattern: clear mornings building to afternoon storms, fast changes.
 */
export const TRANSITIONS: Record<Exclude<WeatherId, 'severe'>, Partial<Record<WeatherId, number>>> = {
  clear: { clear: 6, cloudy: 3, fog: 1, wind: 1 },
  cloudy: { clear: 3, cloudy: 3, drizzle: 2, rain: 1, thunderstorm: 1, wind: 1 },
  fog: { clear: 3, cloudy: 3, fog: 2, drizzle: 1 },
  drizzle: { cloudy: 3, drizzle: 2, rain: 2, clear: 1 },
  rain: { cloudy: 3, rain: 2, drizzle: 2, thunderstorm: 1 },
  thunderstorm: { rain: 3, cloudy: 3, clear: 1 },
  wind: { clear: 3, cloudy: 2, wind: 2 },
};

/** Hours in a weather period. */
export const PERIOD_HOURS = 3;
/** Days the forecast covers. */
export const FORECAST_DAYS = 90;
/** From this day, rain falls as snow at and above the snowline band; the snowline drops a band every SNOW_STEP days. */
export const SNOW_FROM = 30;
export const SNOW_STEP = 10;
/** The severe storm comes once, in this window of days (SPEC 6.5). */
export const SEVERE_WINDOW = [18, 30] as const;

/** Storms the signs foretell: these states count as "a storm followed". */
export const STORMY: readonly WeatherId[] = ['rain', 'thunderstorm', 'severe'];
/** Hours before a storm that a foretelling sign shows. */
export const SIGN_LEAD = 9;
