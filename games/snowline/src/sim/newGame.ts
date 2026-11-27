// Starting a run (SPEC 4.3, 5.4): a run is the world seed plus the protagonist.

import { FREE_WALK, MAP_SIZE, SUB } from '../content/balance.ts';
import { DANGER_ANIMALS, PLANTS, REMEDIES, STONES, WOODS } from '../content/decks.ts';
import { START_FACT, who } from '../content/messages.ts';
import { BACKGROUNDS } from '../content/protagonists.ts';
import { give } from './inventory.ts';
import { learn, lookName, type Row } from './knowledge.ts';
import { say } from './log.ts';
import { makeStreams, nextInt } from './rng.ts';
import { dealRules, type Rules } from './rules.ts';
import type { Protagonist } from './protagonist.ts';
import { startingSkills } from './skills.ts';
import type { GameState } from './state.ts';
import { reveal } from './step.ts';
import type { World } from './world.ts';
import { generateWorld } from './worldgen/index.ts';
import { startSystems } from './start.ts';

/** The hand-checked valley for a player's first run (SPEC 6.3). */
export const DEFAULT_SEED = 'first-light';

/** The save format. Bump it when GameState changes shape (SPEC 11.6). */
export const SCHEMA = 5;

/** Deal the rules and generate the valley for a seed. Slow (a few hundred ms): do it once per seed. */
export function buildValley(seed: string): { rules: Rules; world: World } {
  const rules = dealRules(seed);
  return { rules, world: generateWorld(seed, rules) };
}

/** A fresh run on a generated valley, at the start of day 1. */
export function newGame(seed: string, protagonist: Protagonist, world: World, rules: Rules, walk: 'grid' | 'free' = FREE_WALK ? 'free' : 'grid'): GameState {
  const { x, y } = world.start;
  const bg = BACKGROUNDS.find((b) => b.id === protagonist.background);
  const state: GameState = {
    schema: SCHEMA,
    seed,
    protagonist,
    tick: 0,
    rng: makeStreams(seed),
    player: {
      x,
      y,
      facing: 2,
      fromX: x,
      fromY: y,
      stepLeft: 0,
      stepTotal: 0,
      intent: -1,
      queued: -1,
      bumped: false,
      wet: 0,
      route: null,
      ...(walk === 'free' ? { fx: x * SUB + SUB / 2, fy: y * SUB + SUB / 2, lastFx: x * SUB + SUB / 2, lastFy: y * SUB + SUB / 2, vx: 0, vy: 0, nudge: 0 } : {}),
    },
    // Only a free-walking run says so: a grid run's state is as it always was.
    ...(walk === 'free' ? { walk } : {}),
    // Shaken, a little thirsty, and it has been a while since breakfast.
    vitals: { health: 92, hydration: 70, nutrition: 72, rest: 68, warmth: 80, morale: 42 },
    conditions: [],
    inventory: [],
    skills: startingSkills(protagonist.background),
    explored: new Array<number>((MAP_SIZE * MAP_SIZE) >> 5).fill(0),
    viewpoints: world.viewpoints.map(() => false),
    fires: [],
    builds: [],
    memory: {},
    smoulder: null,
    weather: { f: [], severeDay: 0 },
    animals: [],
    fish: [],
    nextFish: 1,
    arc: { flights: [], stormHit: false, slide: false, searched: false, rescueAt: -1, rescueBy: '', felled: {} },
    rules,
    known: { facts: [], techniques: ['sharpen', ...(bg?.mods.techniques ?? [])].sort(), seen: [] },
    task: null,
    sleep: null,
    stashes: [],
    regrow: {},
    taken: {},
    pending: [],
    drinks: [],
    log: [],
    over: null,
    stats: { discoveries: 0, meals: 0, distance: 0 },
    exerting: false,
  };
  give(state, protagonist.tool, 1);
  for (const p of protagonist.pockets) give(state, p, 1);
  startingFact(state);
  startSystems(state, world);
  state.stats.discoveries = 0;
  reveal(state);
  return state;
}

/** Each background except City kid starts with one valley fact from its own field (SPEC 6.6). */
function startingFact(s: GameState): void {
  const field = BACKGROUNDS.find((b) => b.id === s.protagonist.background)?.mods.fact;
  if (!field) return;
  const r = s.rng.events;
  const sink: never[] = [];
  let row: Row;
  let i: number;
  let value: string;
  switch (field) {
    case 'plant':
      row = 'plant';
      i = nextInt(r, PLANTS.length);
      value = s.rules.plants[i]!;
      break;
    case 'water':
      row = 'water';
      i = s.rules.water.indexOf('foul');
      value = 'foul';
      break;
    case 'temper':
      row = 'temper';
      i = nextInt(r, DANGER_ANIMALS.length);
      value = describeTemper(s, i);
      break;
    case 'stone':
      row = 'stone';
      i = nextInt(r, STONES.length);
      value = s.rules.stones[i]!;
      break;
    case 'wood':
      row = 'wood';
      i = s.rules.woods.indexOf('drill');
      if (i < 0) i = nextInt(r, WOODS.length);
      value = s.rules.woods[i]!;
      break;
    case 'remedy':
      row = 'remedy';
      i = nextInt(r, REMEDIES.length);
      value = s.rules.remedies[i]!;
      break;
  }
  learn(s, row, i, 'known', value, 'knew it from home', sink);
  say(s, START_FACT(who(s.protagonist), lookName(row, i), value));
}

/** An animal's dealt temper in a few words (for the notes). */
export function describeTemper(s: GameState, i: number): string {
  const t = s.rules.tempers[i]!;
  return `${t.boldness}; warns: ${DANGER_ANIMALS[i]!.warnings[t.warning]}; backs off from ${t.deterrent}`;
}
