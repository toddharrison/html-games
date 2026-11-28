// The opening (SPEC 12.2, 2026-11-27): a short scene before play, read a page at a time. It starts in the
// dark (the flight and the crash), then the scene fades in on the kid lying on the shore by the wreck,
// waking. The pilot's death is implied, never shown (SPEC 12.2 tone). Past tense, the log's voice.

import type { Who } from './messages.ts';

export interface WakingPage {
  /** Still in the dark: the screen black behind the words. */
  dark: boolean;
  lines: string[];
  /** A plain line for the player under the last page: what the game is. */
  hint?: string;
}

/** Why the kid was on the plane, by background: where they were flying to. */
const BOUND_FOR: Record<string, (w: Who) => string> = {
  scout: () => 'to a wilderness camp at the end of a lake with no road to it',
  angler: (w) => `to spend the rest of the summer fishing at ${w.their} uncle's lake camp`,
  hunter: (w) => `to ${w.their} grandfather's cabin, a long way past the last town`,
  farm: (w) => `to help at ${w.their} aunt's place up north for the end of the summer`,
  runner: () => 'home from a summer running camp, the long way round',
  reader: (w) => `to ${w.their} grandmother's, where the road ran out and the books on the shelf were all about the woods`,
  city: () => 'to a summer program at a research station in the mountains, the first time anywhere without a sidewalk',
};

export function wakingPages(w: Who, background: string): WakingPage[] {
  const bound = (BOUND_FOR[background] ?? BOUND_FOR.city!)(w);
  return [
    {
      dark: true,
      lines: [`${w.name} was flying north in a little plane, ${bound}.`, 'Somewhere over the mountains, the engine coughed, and caught, and coughed again, and stopped.'],
    },
    {
      dark: true,
      lines: ['The pilot stayed calm, talking into the radio, looking for anywhere flat.', 'Trees came up too fast. A bang, a long tearing, and then nothing at all.'],
    },
    {
      dark: false,
      lines: [`Cold. The sound of water, somewhere close. ${w.name} opened ${w.their} eyes.`, `${w.They} lay on the ground beside what was left of the plane.`],
    },
    {
      dark: false,
      lines: [
        `In the front seat the pilot didn't move, and didn't answer. ${w.name} called, and called again, and then knew.`,
        "There was nobody else. The plane's whole tail was gone, torn off somewhere up the mountain.",
      ],
    },
    {
      dark: false,
      lines: ['Nobody knew exactly where the plane had come down. Someone would be looking.', `Until they came, ${w.name} would have to stay alive.`],
      hint: "Stay alive until you're found: water, a fire before the cold, shelter, food. The kid's thoughts will say what to try next.",
    },
  ];
}
