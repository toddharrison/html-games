// The survivor's own thoughts (SPEC 12.2): the tutorial, told as what a kid alone out here would think
// next, with a quiet line under it saying how to do it. First person, present tense, plain; the log keeps
// them in quotes. Which one comes when is in sim/thoughts.ts.

export interface ThoughtText {
  /** What the kid thinks. */
  text: string;
  /** How to do it, shown smaller under the thought (never in the log). */
  hint?: string;
}

/** The first day, in order: each comes once, when the one before is done or passed. */
export const FIRST_THOUGHTS = {
  cold: {
    text: "There's snow up on those peaks. It's going to be cold tonight. Really cold. I need a fire before dark.",
    hint: 'C opens Make: what you know how to make, and what each thing needs. A fire is first.',
  },
  water: {
    text: 'My mouth is so dry. First thing: a drink. The lake is right there.',
    hint: 'Click the water to drink, or face it and press E.',
  },
  gather: {
    text: "A fire needs something dry that'll catch, little sticks, then bigger wood. There's stuff all over the ground.",
    hint: 'Hover over things to see what they are; click to pick them up. Make (C) shows what the fire still needs.',
  },
  fire: {
    text: 'How do I light it without matches? Some rocks spark if you hit them with steel. I could try the rocks around here.',
    hint: 'Click a rock outcrop to strike it with your tool.',
  },
  lay: {
    text: "I've got enough to start one. I should pick a good spot, out in the open, and lay it.",
    hint: 'Make (C), then A fire: choose where it goes.',
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

/**
 * What the kid makes of something that just happened while making fire: each comes once, soon after,
 * ahead of the first day's chain (an insight is the moment to say what it means).
 */
export const FIRE_THOUGHTS = {
  sparked: {
    text: "Sparks! If I take a piece of this rock with me, and get the sparks into something dry... that's a fire.",
    hint: 'Click the rock again to pry a piece loose. Then Make (C), A fire.',
  },
  carrying: {
    text: 'Got a piece of the sparking rock. Now somewhere to light it.',
    hint: 'Make (C), then A fire: click where to lay it.',
  },
  laid: {
    text: 'Okay. Tinder, sticks. Now the sparks, right down into the dry stuff, and blow gently.',
    hint: 'Click the laid fire to light it.',
  },
  noCatch: {
    text: "It won't catch. Maybe that stuff's no good, or not dry enough. I'll try something else.",
    hint: 'A failed try burns the tinder: lay in more. Different tinders catch differently here.',
  },
  lit: {
    text: "I did it. I actually did it. Fire. I'm not going to freeze tonight.",
    hint: 'Keep it fed: put sticks and wood on it before it burns down.',
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
