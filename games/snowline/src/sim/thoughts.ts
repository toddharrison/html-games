// The survivor's thoughts (SPEC 12.2): the tutorial as what the kid thinks next. Each game minute, at most
// one thought, and none within THOUGHT_GAP of the last. What the kid notices (the body and the weather:
// thirst, wind through the jacket, rain) comes first when it's true, and comes back when true again a
// while later; the first day's thoughts come in order, each once, until its need is met. A failure's clue
// (`clue`) comes at once. Reads the state; writes only `memory` (`thought:<id>` counts and `thought-at`),
// the log, and a `thought` event for the screen.

import { BEAR_TRAIL_THOUGHT, CLUES, FIRE_THOUGHTS, FIRST_THOUGHTS, FULL_THOUGHT, NOTICING, type ThoughtText } from '../content/thoughtText.ts';
import { L } from '../content/loose.ts';
import { T, TRAIL_BY } from '../content/terrain.ts';
import { count, has } from './inventory.ts';
import { fact, knownWith } from './knowledge.ts';
import { say } from './log.ts';
import { recall, remember } from './memory.ts';
import type { GameState, SimEvent } from './state.ts';
import { fireNear, shelterAt } from './surroundings.ts';
import { clock } from './time.ts';
import { weatherNow } from './weather.ts';
import { idx, inBounds, type World } from './world.ts';
import { HOUR, MIN } from '../content/balance.ts';

/** Game time between thoughts (30 game minutes). */
const THOUGHT_GAP = 30 * MIN;
/** The first thought waits for the opening words to fade (ticks: ten real seconds). */
const FIRST_AT = 200;
/** Something noticed comes back no sooner than this (8 game hours). */
const RETURN_GAP = 8 * HOUR;
/** The bear-trail warning comes back no sooner than this (half a game day). */
const BEAR_GAP = 12 * HOUR;

/** On a tile of the bear's trail, with bear prints within three tiles. */
function onBearTrail(s: GameState, w: World): boolean {
  const { x, y } = s.player;
  if (w.trails[idx(x, y)] !== TRAIL_BY.bear) return false;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inBounds(x + dx, y + dy) && w.loose[idx(x + dx, y + dy)] === L.tracksBear) return true;
  return false;
}

/** A first-evening thought holds back the ones after it until its need is met, or this long has passed (2 game hours). */
const PATIENCE = 2 * HOUR;

type Id = keyof typeof FIRST_THOUGHTS;

interface Step {
  id: Id;
  /** Ready to be thought now. */
  when: (s: GameState, w: World) => boolean;
  /** Already done: skip it. */
  done: (s: GameState, w: World) => boolean;
  /** Comes when its time comes, even if an earlier one is still waiting (night falls regardless). */
  urgent?: true;
}

const hour = (s: GameState) => clock(s.tick).hour;
const day = (s: GameState) => clock(s.tick).day;
const thought = (s: GameState, id: string) => recall(s, `thought:${id}`) > 0;
const firesLit = (s: GameState) => recall(s, 'fires-lit') > 0;
const slept = (s: GameState) => recall(s, 'thought:slept') > 0;
const sheltered = (s: GameState, w: World) =>
  w.terrain[idx(s.player.x, s.player.y)] === T.shelter || s.builds.some((b) => b.kind === 'lean-to' && Math.abs(b.x - s.player.x) + Math.abs(b.y - s.player.y) <= 1);
const evening = (s: GameState) => day(s) > 1 || hour(s) >= 17;

/** The survivor knows a spark-stone; and carries a piece of one. */
const knowsSparkStone = (s: GameState) => knownWith(s, 'stone', 'sparks') >= 0;
const carriesSparkStone = (s: GameState) => s.inventory.some((it) => it.k === 'stone' && it.d !== undefined && fact(s, 'stone', it.d)?.value === 'sparks');
const laid = (s: GameState) => s.builds.some((b) => b.kind === 'fire-lay');
const canLightSomehow = (s: GameState) => carriesSparkStone(s) || has(s, 'matches') || has(s, 'ember-pouch');
const enoughToLay = (s: GameState) => has(s, 'tinder') && count(s, 'stick') >= 2;

/** Something the kid noticed already says it's cold out (the wind, rain, wet clothes). */
const feltCold = (s: GameState) => thought(s, 'wind') || thought(s, 'rain') || thought(s, 'wetCold') || thought(s, 'chilled');
/** Thinking about fire: the night's cold has been thought of, or a fire lit already. */
const onFire = (s: GameState) => thought(s, 'cold') || firesLit(s);

/**
 * The first day, in order. A step is skipped once done; the chain waits on the first one not done whose
 * time hasn't come. The cold comes in the afternoon (or at once, if the kid has felt it already), and the
 * fire's steps follow it; before that, the wreck is the first idea on a day when nothing pressing is noticed.
 */
const FIRST: Step[] = [
  { id: 'cold', when: (s) => hour(s) >= 14 || day(s) > 1 || feltCold(s), done: onFire, urgent: true }, // the reason for the fire: done once thought
  { id: 'wreck', when: () => true, done: (s) => recall(s, 'crash-searched') > 0 },
  { id: 'gather', when: onFire, done: (s) => enoughToLay(s) || laid(s) || firesLit(s) },
  { id: 'fire', when: (s) => onFire(s) && (has(s, 'tinder') || has(s, 'stick')), done: (s) => knowsSparkStone(s) || canLightSomehow(s) || firesLit(s) },
  { id: 'lay', when: (s) => onFire(s) && enoughToLay(s) && canLightSomehow(s), done: (s) => laid(s) || firesLit(s) },
  { id: 'shelter', when: evening, done: (s, w) => slept(s) || sheltered(s, w), urgent: true },
  { id: 'dark', when: (s) => day(s) > 1 || hour(s) >= 20, done: slept, urgent: true },
];

/** No fire within two tiles: the kid is out in it. */
const noFire = (s: GameState) => !fireNear(s, s.player.x, s.player.y, 2);
const shelter = (s: GameState, w: World) => shelterAt(s, w, s.player.x, s.player.y);

/**
 * What the kid notices, most pressing first: each only when it's really so (the body and the weather the
 * sim runs on: wind chills, wet clothes chill, hot sun dries you out).
 */
const NOTICE: { id: keyof typeof NOTICING; when: (s: GameState, w: World) => boolean }[] = [
  { id: 'wetCold', when: (s) => s.player.wet >= 50 && s.vitals.warmth < 65 && noFire(s) },
  { id: 'rain', when: (s, w) => weatherNow(s, w).wetting && shelter(s, w).rain < 0.5 && s.player.wet >= 25 },
  { id: 'wind', when: (s, w) => weatherNow(s, w).wind >= 0.6 && s.vitals.warmth < 72 && shelter(s, w).wind < 0.3 && noFire(s) },
  { id: 'thirsty', when: (s) => s.vitals.hydration < 62 },
  { id: 'chilled', when: (s) => s.vitals.warmth < 35 && noFire(s) },
  { id: 'hot', when: (s, w) => weatherNow(s, w).hot && s.vitals.hydration < 80 && shelter(s, w).rain < 0.5 },
  { id: 'hungry', when: (s) => s.vitals.nutrition < 60 },
  { id: 'tired', when: (s) => s.vitals.rest < 20 },
];

/** The wording for the n-th time (from 0): the first says how to deal with it; then the others in turn. */
function wording(lines: readonly ThoughtText[], n: number): ThoughtText {
  return n === 0 || lines.length === 1 ? lines[0]! : lines[1 + ((n - 1) % (lines.length - 1))]!;
}

/** What the kid makes of each step toward the first fire, latest first; each once. */
const FIRE_REACTIONS: { id: keyof typeof FIRE_THOUGHTS; when: (s: GameState) => boolean }[] = [
  { id: 'lit', when: firesLit },
  { id: 'laid', when: (s) => !firesLit(s) && canLightSomehow(s) && s.builds.some((b) => b.kind === 'fire-lay' && (b.items ?? []).some((i) => i.k === 'tinder')) },
  { id: 'carrying', when: (s) => !firesLit(s) && !laid(s) && carriesSparkStone(s) },
  { id: 'sparked', when: (s) => !firesLit(s) && knowsSparkStone(s) && !carriesSparkStone(s) },
];
/** A reaction waits only this long after the last thought (10 game minutes). */
const REACT_GAP = 10 * MIN;

function think(s: GameState, id: string, t: ThoughtText, events: SimEvent[]): void {
  remember(s, `thought:${id}`);
  s.memory['thought-at'] = s.tick;
  s.memory[`thought-last:${id}`] = s.tick;
  say(s, `“${t.text}”`);
  events.push({ type: 'thought', text: t.text, hint: t.hint ?? '' });
}

/**
 * Something didn't work: the kid's clue to why, and what to try (CLUES), at once. Each cause's lines come
 * in turn, each once, so a failure tried again says the next, surer thing, and then nothing more.
 * `fill` fills in `{name}` slots. Returns how many of this cause's lines have now been said.
 */
export function clue(s: GameState, id: keyof typeof CLUES, events: SimEvent[], fill: Record<string, string> = {}): number {
  const lines: readonly ThoughtText[] = CLUES[id];
  const n = recall(s, `thought:clue:${id}`);
  if (n >= lines.length) return n;
  const t = lines[n]!;
  const put = (x: string) => x.replace(/\{(\w+)\}/g, (_, k: string) => fill[k] ?? '');
  think(s, `clue:${id}`, { text: put(t.text), ...(t.hint ? { hint: put(t.hint) } : {}) }, events);
  return n + 1;
}

/** Each game minute: the next thought, if one is due. */
export function thinkMinute(s: GameState, w: World, events: SimEvent[]): void {
  if (s.over) return;
  if (s.sleep) {
    s.memory['thought:slept'] = 1;
    return;
  }
  if (s.tick < FIRST_AT) return;
  // A warning doesn't wait its turn: on a bear's trail with its prints in sight, say so now.
  if (onBearTrail(s, w) && s.tick - (s.memory['thought-last:bear-trail'] ?? -BEAR_GAP) >= BEAR_GAP) return think(s, 'bear-trail', BEAR_TRAIL_THOUGHT, events);
  const since = s.tick - (s.memory['thought-at'] ?? -THOUGHT_GAP);
  // What just happened comes before the next idea: an insight is the moment to say what it means.
  if (since >= REACT_GAP) {
    const r = FIRE_REACTIONS.find((x) => !thought(s, x.id) && x.when(s));
    if (r) {
      // Only the latest: the earlier steps it passed are no longer news.
      for (const x of FIRE_REACTIONS.slice(FIRE_REACTIONS.indexOf(r) + 1)) s.memory[`thought:${x.id}`] = 1;
      return think(s, r.id, FIRE_THOUGHTS[r.id], events);
    }
  }
  if (since < THOUGHT_GAP) return;

  // What's pressing now comes before the next idea.
  for (const r of NOTICE) {
    const last = s.memory[`thought-last:${r.id}`];
    if (!r.when(s, w) || (last !== undefined && s.tick - last < RETURN_GAP)) continue;
    return think(s, r.id, wording(NOTICING[r.id], recall(s, `thought:${r.id}`)), events);
  }

  let waiting = false;
  for (const step of FIRST) {
    const done = step.done(s, w);
    if (thought(s, step.id) || done) {
      // Thought but not yet done: give the player time before the next idea.
      if (!done && s.tick - (s.memory[`thought-last:${step.id}`] ?? 0) < PATIENCE) waiting = true;
      continue;
    }
    if (!step.when(s, w) || (waiting && !step.urgent)) continue;
    return think(s, step.id, FIRST_THOUGHTS[step.id], events);
  }
  if (!thought(s, 'full') && recall(s, 'full') > 0) return think(s, 'full', FULL_THOUGHT, events);
}
