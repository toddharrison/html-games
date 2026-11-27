// The survivor's own thoughts (SPEC 12.2): the tutorial, told as what a kid alone out here would think
// next, with a quiet line under it saying how to do it. First person, present tense, plain; the log keeps
// them in quotes. Which one comes when is in sim/thoughts.ts.

export interface ThoughtText {
  /** What the kid thinks. */
  text: string;
  /** How to do it, shown smaller under the thought (never in the log). */
  hint?: string;
}

/** The first evening, in order: each comes once, when the one before is done or passed. */
export const FIRST_THOUGHTS = {
  water: {
    text: 'My mouth is so dry. First thing: a drink. The lake is right there.',
    hint: 'Click the water to drink, or face it and press E.',
  },
  look: {
    text: "Okay. Breathe. What's around here that I could use?",
    hint: 'Hover over things to see what they are. Right-click for everything you could do with one.',
  },
  gather: {
    text: "It's going to be cold tonight. If I could make a fire... I'd need dry grass, twigs, bigger wood.",
    hint: 'Click things on the ground to pick them up. I shows what you are carrying.',
  },
  fire: {
    text: 'Some rocks spark if you hit them with steel. I should try the rocks around here.',
    hint: 'Strike an outcrop with your tool, or carry a stone and strike it from your pockets (I). C shows what you can make.',
  },
  shelter: {
    text: "The sun's getting low. I need somewhere out of the wind for the night. Under rock, or in the trees.",
    hint: 'R to rest or sleep. Shelter, a bed of boughs, and a fire all make a night warmer.',
  },
  dark: {
    text: "It's getting dark. I shouldn't wander far now.",
  },
  food: {
    text: "I'm getting hungry. There were berries... but I don't know which ones are safe.",
    hint: 'Taste a little and wait, or watch whether the birds eat them. J keeps your notes on what you learn.',
  },
} satisfies Record<string, ThoughtText>;

/** Whenever they apply again, a while after the last time. */
export const RETURNING_THOUGHTS = {
  thirsty: { text: "I'm so thirsty. I need water." },
  hungry: { text: "My stomach's cramping. I have to eat something." },
  cold: { text: "I'm so cold. I need a fire, or shelter, or both." },
  tired: { text: "I can barely keep my eyes open. I have to sleep." },
} satisfies Record<string, ThoughtText>;

/** On a bear's trail, with its prints in sight: a warning, as soon as it's true. */
export const BEAR_TRAIL_THOUGHT: ThoughtText = {
  text: "Those are bear prints, and they keep going along here. This is a bear's trail. I shouldn't be following it.",
  hint: "Hover over prints to see what made them; look closer to learn more. A bear's den is somewhere along its trail.",
};

/** Once, the first time the pockets overflow. */
export const FULL_THOUGHT: ThoughtText = {
  text: "My hands are full. If I had something to carry things in...",
  hint: 'What does not fit is set down at your feet. Put things down from your pockets (I) to make room.',
};
