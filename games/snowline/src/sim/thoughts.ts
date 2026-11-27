// The survivor's thoughts (SPEC 12.2): the tutorial as what the kid thinks next. Each game minute, at most
// one thought, and none within THOUGHT_GAP of the last. The first evening's thoughts come in order, each
// once, until its need is met; the returning ones (thirst, hunger, cold, tiredness) come back when they
// apply again, a while later. Reads the state; writes only `memory` (`thought:<id>` counts and
// `thought-at`), the log, and a `thought` event for the screen.

import { BEAR_TRAIL_THOUGHT, FIRST_THOUGHTS, FULL_THOUGHT, RETURNING_THOUGHTS, type ThoughtText } from '../content/thoughtText.ts';
import { L } from '../content/loose.ts';
import { T, TRAIL_BY } from '../content/terrain.ts';
import { has } from './inventory.ts';
import { say } from './log.ts';
import { recall, remember } from './memory.ts';
import type { GameState, SimEvent } from './state.ts';
import { clock } from './time.ts';
import { idx, inBounds, type World } from './world.ts';

/** Game minutes between thoughts (ticks). */
const THOUGHT_GAP = 300;
/** The first thought waits for the opening words to fade. */
const FIRST_AT = 200;
/** A returning thought comes back no sooner than this (ticks: 8 game hours). */
const RETURN_GAP = 4800;
/** The bear-trail warning comes back no sooner than this (half a game day). */
const BEAR_GAP = 7200;

/** On a tile of the bear's trail, with bear prints within three tiles. */
function onBearTrail(s: GameState, w: World): boolean {
  const { x, y } = s.player;
  if (w.trails[idx(x, y)] !== TRAIL_BY.bear) return false;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inBounds(x + dx, y + dy) && w.loose[idx(x + dx, y + dy)] === L.tracksBear) return true;
  return false;
}

/** A first-evening thought holds back the ones after it until its need is met, or this long has passed (2 game hours). */
const PATIENCE = 1200;

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

/** The first evening, in order. A step is skipped once done; the chain waits on the first one not done whose time hasn't come. */
const FIRST: Step[] = [
  { id: 'water', when: () => true, done: (s) => s.drinks.length > 0 || s.vitals.hydration >= 95 },
  { id: 'look', when: () => true, done: (s) => thought(s, 'look') }, // only a nudge: done once thought
  { id: 'gather', when: () => true, done: (s) => (has(s, 'tinder') && has(s, 'stick')) || firesLit(s) },
  { id: 'fire', when: (s) => has(s, 'tinder'), done: firesLit },
  { id: 'shelter', when: evening, done: (s, w) => slept(s) || sheltered(s, w), urgent: true },
  { id: 'dark', when: (s) => day(s) > 1 || hour(s) >= 20, done: slept, urgent: true },
  { id: 'food', when: (s) => s.vitals.nutrition < 75 || day(s) > 1, done: (s) => s.stats.meals > 0 || s.known.facts.some((f) => f.key.startsWith('plant:')), urgent: true },
];

const RETURNING: { id: keyof typeof RETURNING_THOUGHTS; when: (s: GameState) => boolean }[] = [
  { id: 'thirsty', when: (s) => s.vitals.hydration < 30 },
  { id: 'hungry', when: (s) => s.vitals.nutrition < 25 },
  { id: 'cold', when: (s) => s.vitals.warmth < 30 },
  { id: 'tired', when: (s) => s.vitals.rest < 15 },
];

function think(s: GameState, id: string, t: ThoughtText, events: SimEvent[]): void {
  remember(s, `thought:${id}`);
  s.memory['thought-at'] = s.tick;
  s.memory[`thought-last:${id}`] = s.tick;
  say(s, `“${t.text}”`);
  events.push({ type: 'thought', text: t.text, hint: t.hint ?? '' });
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
  if (s.tick - (s.memory['thought-at'] ?? -THOUGHT_GAP) < THOUGHT_GAP) return;

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
  if (!thought(s, 'water')) return;
  for (const r of RETURNING) {
    const last = s.memory[`thought-last:${r.id}`];
    if (!r.when(s) || (last !== undefined && s.tick - last < RETURN_GAP)) continue;
    return think(s, r.id, RETURNING_THOUGHTS[r.id], events);
  }
}
