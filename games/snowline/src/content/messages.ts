// The message log's text (SPEC 12.2): short, plain, past tense, with the protagonist's name and pronouns.
// Tone: ages 10 and up. Hunting is named plainly but never described graphically.

export interface Who {
  name: string;
  they: string;
  them: string;
  their: string;
  They: string;
  Their: string;
  /** "was"/"were" don't change, but "has"/"have" style verbs do not appear: past tense keeps it simple. */
}

export function who(p: { name: string; gender: 'boy' | 'girl' }): Who {
  const f = p.gender === 'girl';
  return {
    name: p.name,
    they: f ? 'she' : 'he',
    them: f ? 'her' : 'him',
    their: f ? 'her' : 'his',
    They: f ? 'She' : 'He',
    Their: f ? 'Her' : 'His',
  };
}

const plural = (n: number, one: string) => (n === 1 ? `a ${one}` : `${n} ${one}`);

const DEATH: Record<string, (w: Who) => string> = {
  thirst: (w) => `${w.name} had gone too long without water.`,
  hunger: (w) => `${w.name} had nothing left to keep going on.`,
  cold: (w) => `The cold took ${w.name} in the night.`,
  'food-poisoning': (w) => `What ${w.name} had eaten was too much for ${w.them}.`,
  'deadly-poisoning': (w) => `The poison was too strong. ${w.name} did not get up again.`,
  waterborne: (w) => `The sickness in the water wore ${w.name} down.`,
  wound: (w) => `${w.name} had lost too much blood.`,
  infection: () => `The fever never broke.`,
  attack: (w) => `${w.name} did not survive the attack.`,
  drowning: (w) => `The cold water closed over ${w.name}.`,
  fall: (w) => `${w.name} fell, and did not get up.`,
  winter: (w) => `Winter came down to the lake, and ${w.name} could not outlast it.`,
  exhaustion: (w) => `${w.name} was worn out, and stopped.`,
};

export const MSG = {
  death: (w: Who, cause: string) => (DEATH[cause] ?? DEATH.exhaustion!)(w),
  drink: (w: Who, source: string) => `${w.name} drank from ${source}.`,
  notThirsty: (w: Who) => `${w.They} could not drink any more.`,
  taste: (w: Who, thing: string) => `${w.name} put a little of the ${thing} on ${w.their} tongue, and waited.`,
  tasteSafe: (w: Who, thing: string) => `The ${thing} had done ${w.them} no harm.`,
  tasteSick: (w: Who, thing: string) => `${w.Their} stomach turned over. The ${thing} were not good to eat.`,
  tasteDeadly: (w: Who, thing: string) => `${w.Their} tongue went numb and ${w.their} gut clenched. The ${thing} were dangerous.`,
  eat: (w: Who, thing: string) => `${w.name} ate the ${thing}.`,
  eatGood: (_w: Who, thing: string) => `The ${thing} sat well. They were good food.`,
  eatPoor: (w: Who, thing: string) => `The ${thing} filled ${w.their} stomach but did little for ${w.them}.`,
  eatSick: (w: Who, thing: string) => `${w.name} was sick. It was the ${thing}.`,
  eatDeadly: (w: Who, thing: string) => `Cramps doubled ${w.name} over. The ${thing} were poison.`,
  rawIll: (w: Who) => `${w.Their} stomach rebelled. It had been raw.`,
  found: (w: Who, n: number, thing: string) => `${w.name} found ${plural(n, thing)}.`,
  nothingLeft: () => `There was nothing more here for now.`,
  noWay: () => `There was no way through to there.`,
  outOfSeason: (thing: string) => `There were no ${thing} to be had at this time of year.`,
  watchSafe: (thing: string) => `Jays dropped down and ate the ${thing}.`,
  watchUnsafe: (thing: string) => `Birds came and went, and left the ${thing} alone.`,
  tooDark: () => `It was too dark to see.`,
  full: (w: Who) => `${w.Their} hands and pockets were full.`,
  /** `what` is 'it', 'them', or 'the rest', after a line saying what was found or made. */
  setDown: (w: Who, what: string) => `${w.Their} hands and pockets were full, so ${w.they} set ${what} down at ${w.their} feet.`,
  spoiled: (w: Who, thing: string) => `The ${thing} had gone bad. ${w.They} threw ${thing.endsWith('s') ? 'them' : 'it'} away.`,
  waterIll: (w: Who) => `Cramps knotted ${w.name}'s stomach. Something ${w.they} drank days ago.`,
  suspectWater: (w: Who, source: string) => `${w.They} thought back. Most of ${w.their} water had come from ${source}.`,
  causeBeaver: (source: string) => `Beavers had dammed the water here. Below a beaver pond, ${source} could not be clean.`,
  causeCarcass: (source: string) => `A dead elk lay rotting in the water. ${source[0]!.toUpperCase()}${source.slice(1)} was fouled.`,
  crash: (w: Who) => `${w.name} searched the broken nose of the plane again. There was nothing more to take.`,
  picked: (w: Who, n: number, thing: string) => `${w.name} picked up ${plural(n, thing)}.`,
  dropped: (w: Who, thing: string) => `${w.name} put down the ${thing}.`,
  sleep: (w: Who) => `${w.name} lay down to sleep.`,
  rest: (w: Who) => `${w.name} sat and rested.`,
  wake: (w: Who) => `${w.name} woke.`,
  wakeThirst: (w: Who) => `${w.name} woke with a dry mouth and a pounding head.`,
  wakeCold: (w: Who) => `${w.name} woke shivering.`,
  collapse: (w: Who) => `${w.name} could not keep ${w.their} eyes open, and slept where ${w.they} fell.`,
  cold: (w: Who) => `${w.name} was shivering hard.`,
  hungry: (w: Who) => `${w.Their} stomach ached with hunger.`,
  thirsty: (w: Who) => `${w.Their} mouth was dry.`,
  tired: (w: Who) => `${w.name} could barely keep going.`,
  sticks: (w: Who, n: number) => `${w.name} gathered ${plural(n, 'stick')}.`,
  busy: () => `Not now.`,
} as const;

/** What a background already knows of the valley on day 1 (SPEC 6.6, protagonists). */
export const START_FACT = (w: Who, thing: string, value: string) => `${w.name} knew one thing already, from home: ${thing}, ${value}.`;
