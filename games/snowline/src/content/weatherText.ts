// The log's words for the weather and its signs (SPEC 6.5, 12.2). Sign lines follow SIGNS in decks.ts.

import type { WeatherId } from './weather.ts';

export const WEATHER_TEXT = {
  change: {
    clear: 'The cloud broke up and the sky cleared.',
    cloudy: 'Cloud came over the peaks.',
    fog: 'Fog crept in off the lake.',
    drizzle: 'A thin drizzle began to fall.',
    rain: 'It began to rain.',
    thunderstorm: 'Thunder rolled down the valley. The storm broke.',
    wind: 'The wind picked up, tearing at everything.',
    severe: 'The sky went dark as evening. Something worse than any storm so far was coming down the valley.',
  } satisfies Record<WeatherId, string>,
  sign: [
    'The wind swung round to blow off the lake.',
    'There was a ring round the moon.',
    'The marmots went to ground early.',
    'The sky was red at dawn.',
    'High, streaky cloud combed across the sky.',
    'Smoke and mist hung low over the water.',
    'The insects were biting hard.',
  ],
  snowFirst: 'Snow had fallen on the high peaks.',
  snowNow: 'It was snowing.',
  winter: 'Snow lay down to the lake. Winter had come.',
} as const;
