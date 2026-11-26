// Game text (SPEC 12.2): short, plain, past-tense sentences. All of it lives here for later editing or
// translation. Tone: ages 10 and up; the pilot's death is implied, never shown.

export const TEXT = {
  title: 'Snowline',
  tagline: 'A survival game about a teenager alone in a mountain valley.',
  inDevelopment:
    'In development. You can forage, drink, taste, and sleep, but there is no fire, weather, or rescue yet: every run ends in death for now.',
  opening: (name: string): string[] => [
    'The engine coughed and quit somewhere over the mountains.',
    'Now there was only the lake, the trees, and the quiet.',
    `${name} was alone.`,
  ],
  viewpoint: 'From up here the valley lay open, all the way down to the lake.',
  viewpointWreck: 'Far up on the bare rock, something caught the light.',
  viewpointKnoll: 'An open knoll, high and bare. Anyone flying over would see it.',
} as const;

/** A word for the time of day, for the HUD: the survivor has no clock (unless they have a watch). */
export function partOfDay(minute: number): string {
  const h = minute / 60;
  if (h < 4.5) return 'night';
  if (h < 6.5) return 'dawn';
  if (h < 11) return 'morning';
  if (h < 13.5) return 'midday';
  if (h < 18) return 'afternoon';
  if (h < 20) return 'dusk';
  if (h < 21.5) return 'evening';
  return 'night';
}
