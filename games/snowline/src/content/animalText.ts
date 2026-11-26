// The log's words for animals (SPEC 9, 12.2).

import type { Who } from './messages.ts';

const cap = (t: string) => t[0]!.toUpperCase() + t.slice(1);

export const ANIMAL_TEXT = {
  flush: () => 'A grouse burst out from almost underfoot and whirred away.',
  whistle: () => 'A marmot whistled, sharp and high. Everything nearby went still.',
  jayEats: () => 'A jay dropped down and stripped a beakful of berries. It came back for more.',
  jaySteals: (thing: string) => `A jay snatched the ${thing} and was gone.`,
  ratSteals: (thing: string) => `Something small scurried off in the dark with the ${thing}.`,
  gnawed: (thing: string) => `Something had gnawed the ${thing} to splinters.`,
  goats: () => 'Goats picked their way up through the cliffs, one ledge at a time. There was a way up there.',
  warns: (name: string, warning: string) => `The ${name} ${warning}.`,
  watched: (name: string, warning: string) => `From a distance, the ${name} was seen to bristle at a passing jay. It ${warning}.`,
  turned: (name: string, how: string) =>
    how === 'face'
      ? `Facing it, not moving, it was the ${name} that gave way. It turned and went.`
      : how === 'noise'
        ? `The shouting worked. The ${name} turned and went.`
        : `The ${name} would not come near the fire. It turned and went.`,
  backedAway: (name: string) => `Backing away slowly, step by step, put enough room between them. The ${name} let it go.`,
  shyLeaves: (name: string) => `The ${name} caught the scent of a person and slipped away.`,
  attack: (w: Who, name: string) => `${cap(`the ${name}`)} charged. ${w.name} was knocked down and hurt.`,
  glasses: (w: Who) => `${w.Their} glasses were broken.`,
  followed: (w: Who) => `Something was following ${w.name}. ${w.They} never quite saw it.`,
  bearRaid: (things: string) => `A bear had torn into the food left out: ${things}. Nothing was left.`,
  quills: (w: Who) => `${w.name} blundered into a porcupine. Quills, a dozen of them.`,
  pulledQuills: (w: Who) => `${w.name} pulled out the quills, one at a time, eyes watering.`,
  shout: (w: Who) => `${w.name} shouted and waved ${w.their} arms.`,
  missed: (w: Who, name: string) => `${w.name} threw and missed. The ${name} was gone.`,
  hit: (w: Who, name: string) => `${w.name} killed the ${name}.`,
  dressed: (w: Who, verb: string, name: string) => `${w.name} ${verb} the ${name}.`,
  fishMiss: (w: Who) => `${w.name} stabbed at a fish and came up with nothing.`,
  fishHit: (w: Who) => `${w.name} speared a trout.`,
  fishLine: (w: Who, n: number) => (n ? `${w.name} caught ${n === 1 ? 'a trout' : `${n} trout`} on the line.` : `Nothing bit.`),
  fishGone: (w: Who) => `The trout had gone before ${w.they} could throw.`,
  watchFish: (run: boolean, n: number) =>
    run
      ? 'The stream was thick with trout, nosing upstream over the gravel. The run had come.'
      : n <= 1
        ? 'Trout hung in the current, turning away from shadows. They always came back to the same places.'
        : n === 2
          ? 'A trout darted at something and was back in its place before the ripple faded. They held still, facing upstream, and let the water bring the food.'
          : 'Bending close, the fish seemed to slide when the head moved. It was not quite where it looked to be. It was lower, nearer the stones.',
  weirTake: (w: Who, n: number) => `${w.name} took ${n === 1 ? 'a trout' : `${n} trout`} from the weir.`,
  snareSet: (w: Who) => `${w.name} set a snare on the run.`,
  snareCaught: () => 'Something was caught in the snare.',
  snareTook: (w: Who) => `${w.name} took the hare from the snare.`,
};
