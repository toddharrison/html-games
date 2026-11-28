// The survivor's own thoughts (SPEC 12.2): the tutorial, told as what a kid alone out here would think
// next, with a quiet line under it saying how to do it. First person, present tense, plain; the log keeps
// them in quotes. Which one comes when is in sim/thoughts.ts.

export interface ThoughtText {
  /** What the kid thinks. */
  text: string;
  /** How to do it, shown smaller under the thought (never in the log). */
  hint?: string;
}

/**
 * The first day, in order: each comes once, when the one before is done or passed. What the kid notices
 * first comes from how the crash left them and the day it is (NOTICING); these are what comes after, or
 * first on a day with nothing pressing (the wreck). The cold comes in the afternoon, with the night
 * ahead (2026-11-27: it was always first).
 */
export const FIRST_THOUGHTS = {
  wreck: {
    text: "The plane. There might still be something in there I can use.",
    hint: 'Click the wreck to search it.',
  },
  cold: {
    text: "There's snow up on those peaks. It's going to be cold tonight. Really cold. I need a fire before dark.",
    hint: 'C opens Make: what you know how to make, and what each thing needs. A fire is first.',
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
    text: "The sun's getting low. I need somewhere out of the wind for the night. Under rock, or something I build.",
    hint: 'R to rest or sleep. Shelter, a bed of boughs, and a fire all make a night warmer. Click a lean-to to sleep in it.',
  },
  dark: {
    text: "It's getting dark. I shouldn't wander far now.",
  },
} satisfies Record<string, ThoughtText>;

/**
 * What the kid notices when it's true: the body and the weather speaking up (2026-11-27). Whichever is
 * truest is thought first, so the first thing noticed differs from run to run; each comes back when true
 * again, a while later, in its next wording. The first wording says how to deal with it.
 */
export const NOTICING = {
  wetCold: [
    { text: "My clothes are soaked through and I can't stop shaking. I have to dry out, by a fire.", hint: 'Wet clothes steal warmth fast. Standing by a fire dries them.' },
    { text: "I'm wet to the skin and freezing. A fire. I need a fire." },
  ],
  rain: [
    { text: "I'm getting soaked. If I'm still wet when it gets dark, I'll freeze. I need to get under something.", hint: 'Rock overhead or a lean-to keeps the rain off. A fire dries you out.' },
    { text: 'The rain is getting in everywhere. I need cover.' },
  ],
  wind: [
    { text: "The wind blows right through my jacket. I'm so cold. I need to get out of it, behind rock or something I build.", hint: 'Wind chills you fast in the open. An overhang, a lean-to, or a wall breaks it; a fire warms.' },
    { text: "This wind goes straight through me. I've got to get out of it." },
  ],
  thirsty: [
    { text: 'My mouth is like sand. I need a drink before anything else.', hint: 'Click water to drink, or face it and press E.' },
    { text: "I'm so thirsty. I need water." },
    { text: 'My lips are cracking. Water, now.' },
  ],
  hot: [
    { text: "The sun's beating down. I'm sweating it all out. I'll need more water than I think.", hint: 'Hot sun dries you out faster. Drink often; shade and shelter help.' },
    { text: "It's so hot out here in the open. I'm drying up." },
  ],
  hungry: [
    { text: "My stomach's growling. I haven't eaten since before the plane.", hint: 'Anything in your pockets (I) can be eaten. Berries need care: taste a little and wait, or watch whether the birds eat them. J keeps your notes.' },
    { text: "My stomach's cramping. I have to eat something." },
    { text: "I'm so hungry I'm getting dizzy. I need food." },
  ],
  chilled: [
    { text: "I'm so cold. My hands won't work properly. I need a fire, or shelter, or both.", hint: 'A fire warms you; shelter and a bed of boughs keep the warmth in.' },
    { text: "I can't get warm. I need a fire." },
  ],
  tired: [
    { text: 'I can barely keep my eyes open. I have to sleep.', hint: 'R to rest or sleep. Somewhere sheltered, by a fire, sleeps best.' },
    { text: 'Everything feels heavy. I need to lie down somewhere safe.' },
  ],
} satisfies Record<string, ThoughtText[]>;

/**
 * When something doesn't work: the kid thinks through why, and what to try (2026-11-27). Each cause is
 * one the game really has; its lines come in turn, the later ones surer, each once. `{tinder}` and
 * `{other}` are filled in with what the kid calls them.
 */
export const CLUES = {
  noTinder: [
    { text: "The sticks just go black. They're too thick to catch from a spark. I need something fine and dry first, that catches from nothing.", hint: 'Gather tinder (a dry tuft of grass, bark, fluff) and put it in the laid fire under the sticks.' },
  ],
  flaredOut: [
    { text: "It went up and out in a second. Nothing caught from it. I need little sticks right on top, so the flame has something to climb.", hint: 'Put two sticks in the laid fire with the tinder, then light it.' },
  ],
  dudTinder: [
    { text: "Nothing. Not even smoke. Maybe the {tinder} just doesn't burn, however dry it is.", hint: 'A failed try burns the tinder: lay in more. Different tinders catch differently here.' },
    { text: "The {tinder} is no good. I need a different kind of tinder{other}.", hint: 'J keeps what you learn about each tinder.' },
  ],
  nest: [
    { text: 'The spark lands on it and just dies. Maybe I packed it down too flat.', hint: 'Try again: each try is practice.' },
    { text: "A nest! Fluff it up loose, like a bird's nest, so a spark falls right into it, and then blow on it gently." },
  ],
  weakSparks: [
    { text: "The multi-tool only throws tiny sparks. They have to land right in the tinder. A bigger blade would throw more.", hint: 'Sparks off a knife or a hatchet are bigger. Matches or embers catch more easily still.' },
  ],
  slow: [
    { text: 'It smoulders, then dies. This {tinder} is slow to take. Keep at it, or find something that catches quicker.', hint: 'Each try is practice, and practice helps.' },
  ],
  unlucky: [
    { text: 'So close. It glowed for a second. Again: steadier, and blow gently when it glows.', hint: 'Each try is practice, and practice helps.' },
    { text: "Almost. I know I can do this. Again." },
  ],
  drillWood: [
    { text: "All that work and only smoke. Maybe it's the wood. A different kind for the drill?", hint: 'Make a bow drill from another wood. J keeps what you learn about each.' },
    { text: 'This wood will never make a coal. It has to be another kind.' },
  ],
  craftFail: [
    { text: 'It came apart in my hands. I rushed it. Slower, and keep the edge sharp.', hint: 'Making things gets surer with practice; a steel tool helps.' },
    { text: 'Again it fell apart. Slower this time. Careful.' },
  ],
} satisfies Record<string, ThoughtText[]>;

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
  lit: {
    text: "I did it. I actually did it. Fire. I'm not going to freeze tonight.",
    hint: 'Keep it fed: put sticks and wood on it before it burns down.',
  },
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
