// Dealing the valley's rules (SPEC 6.6). The seed's `rules` stream shuffles each row's deck and deals
// it across that row's things. The deal is plain data in GameState.rules; systems read dealt
// properties only through it. The deal never reads the terrain, and the terrain never reads the deal's
// stream, so each can change without moving the other.

import {
  BOLDNESS_DECK,
  DANGER_ANIMALS,
  DETERRENT_DECK,
  PLANTS,
  PLANT_DECK,
  REMEDIES,
  REMEDY_DECK,
  SIGNS,
  SIGN_DECK,
  STONES,
  STONE_DECK,
  TINDERS,
  TINDER_DECK,
  WATER_CAUSES,
  WATER_DECK,
  WATER_SOURCES,
  WOODS,
  WOOD_DECK,
  type Boldness,
  type Deck,
  type Deterrent,
  type PlantOutcome,
  type RemedyOutcome,
  type SignOutcome,
  type StoneOutcome,
  type TinderOutcome,
  type WaterCause,
  type WaterOutcome,
  type WoodOutcome,
} from '../content/decks.ts';
import { makeRng, nextInt, pick, shuffle, type RngState } from './rng.ts';

export interface Temper {
  boldness: Boldness;
  deterrent: Deterrent;
  /** Index into the animal's `warnings`. */
  warning: number;
}

/** The deal. Every array is in the order of its content table (PLANTS, STONES, ...). */
export interface Rules {
  plants: PlantOutcome[];
  /** The lookalike pair the world places side by side: a nourishing berry and a bad one of the same family. */
  lookalike: { good: number; bad: number };
  remedies: RemedyOutcome[];
  stones: StoneOutcome[];
  woods: WoodOutcome[];
  tinders: TinderOutcome[];
  water: WaterOutcome[];
  waterCause: WaterCause;
  tempers: Temper[];
  signs: SignOutcome[];
  /** How many times the plant deck was reshuffled to make the deal fair (for the debug overlay). */
  reshuffles: number;
}

/** Deal `deck` across `count` things: the whole core, spares to fill, then shuffled together. */
export function dealDeck<O extends string>(rng: RngState, count: number, deck: Deck<O>): O[] {
  if (deck.core.length > count || deck.core.length + deck.spares.length < count) {
    throw new Error(`a deck of ${deck.core.length}+${deck.spares.length} can't be dealt across ${count}`);
  }
  const spares = shuffle(rng, deck.spares).slice(0, count - deck.core.length);
  return shuffle(rng, [...deck.core, ...spares]);
}

const GOOD: readonly PlantOutcome[] = ['nourishing'];
const BAD: readonly PlantOutcome[] = ['sickening', 'deadly'];

/** Every berry lookalike pair in a plant deal: same family, one nourishing and one bad. In content order. */
export function lookalikePairs(plants: readonly PlantOutcome[]): { good: number; bad: number }[] {
  const pairs: { good: number; bad: number }[] = [];
  for (let i = 0; i < PLANTS.length; i++) {
    for (let j = 0; j < PLANTS.length; j++) {
      const a = PLANTS[i]!;
      const b = PLANTS[j]!;
      if (i === j || a.kind !== 'berry' || b.kind !== 'berry' || !a.family || a.family !== b.family) continue;
      if (GOOD.includes(plants[i]!) && BAD.includes(plants[j]!)) pairs.push({ good: i, bad: j });
    }
  }
  return pairs;
}

/** The fairness checks that need only the deal (SPEC 6.6, "A fair deal"); the map's are in worldgen. */
export function dealProblems(r: Rules): string[] {
  const problems: string[] = [];
  const count = <O>(list: readonly O[], o: O) => list.filter((x) => x === o).length;
  if (count(r.plants, 'deadly') !== 1) problems.push('not exactly one deadly plant');
  if (count(r.plants, 'nourishing') < 2) problems.push('fewer than two good wild foods');
  const pairs = lookalikePairs(r.plants);
  if (!pairs.some((p) => p.good === r.lookalike.good && p.bad === r.lookalike.bad)) problems.push('the lookalike pair is not one good and one bad');
  if (count(r.stones, 'sparks') !== 1) problems.push('not exactly one spark-stone');
  if (count(r.water, 'foul') !== 1) problems.push('not exactly one foul water source');
  if (count(r.tinders, 'catches') < 1) problems.push('no tinder catches');
  if (count(r.woods, 'drill') < 1) problems.push('no wood suits a bow drill');
  for (const need of ['stomach', 'wound', 'insects'] as const) if (!r.remedies.includes(need)) problems.push(`no remedy for ${need}`);
  if (!r.tempers.some((t) => t.deterrent === 'fire')) problems.push('fire turns no animal');
  return problems;
}

/** Most reshuffles of the plant deck before giving up (a fair deal comes within a few). */
const MAX_RESHUFFLES = 200;

/** Deal the valley's rules for a seed. */
export function dealRules(seed: string): Rules {
  const rng = makeRng(seed, 'rules');
  let plants: PlantOutcome[] = [];
  let pairs: { good: number; bad: number }[] = [];
  let reshuffles = 0;
  for (;;) {
    plants = dealDeck(rng, PLANTS.length, PLANT_DECK);
    pairs = lookalikePairs(plants);
    if (pairs.length > 0) break;
    if (++reshuffles > MAX_RESHUFFLES) throw new Error(`no fair plant deal for seed ${seed}`);
  }
  const lookalike = pick(rng, pairs);
  const remedies = dealDeck(rng, REMEDIES.length, REMEDY_DECK);
  const stones = dealDeck(rng, STONES.length, STONE_DECK);
  const woods = dealDeck(rng, WOODS.length, WOOD_DECK);
  const tinders = dealDeck(rng, TINDERS.length, TINDER_DECK);
  const water = dealDeck(rng, WATER_SOURCES.length, WATER_DECK);
  const waterCause = pick(rng, WATER_CAUSES);
  const boldness = dealDeck(rng, DANGER_ANIMALS.length, BOLDNESS_DECK);
  const deterrents = dealDeck(rng, DANGER_ANIMALS.length, DETERRENT_DECK);
  const tempers = DANGER_ANIMALS.map((a, i) => ({
    boldness: boldness[i]!,
    deterrent: deterrents[i]!,
    warning: nextInt(rng, a.warnings.length),
  }));
  const signs = dealDeck(rng, SIGNS.length, SIGN_DECK);
  const rules: Rules = { plants, lookalike, remedies, stones, woods, tinders, water, waterCause, tempers, signs, reshuffles };
  const problems = dealProblems(rules);
  if (problems.length) throw new Error(`unfair deal for seed ${seed}: ${problems.join('; ')}`);
  return rules;
}

/** The deal as readable rows, for the debug overlay's reveal-rules view. */
export function describeRules(r: Rules): { row: string; thing: string; outcome: string }[] {
  const rows: { row: string; thing: string; outcome: string }[] = [];
  PLANTS.forEach((p, i) => {
    const tag = i === r.lookalike.good ? ' (lookalike, good)' : i === r.lookalike.bad ? ' (lookalike, bad)' : '';
    rows.push({ row: 'plant', thing: p.name, outcome: r.plants[i]! + tag });
  });
  REMEDIES.forEach((p, i) => rows.push({ row: 'remedy', thing: p.name, outcome: r.remedies[i]! }));
  STONES.forEach((p, i) => rows.push({ row: 'stone', thing: p.name, outcome: r.stones[i]! }));
  WOODS.forEach((p, i) => rows.push({ row: 'wood', thing: p.name, outcome: r.woods[i]! }));
  TINDERS.forEach((p, i) => rows.push({ row: 'tinder', thing: p.name, outcome: r.tinders[i]! }));
  WATER_SOURCES.forEach((p, i) =>
    rows.push({ row: 'water', thing: p.name, outcome: r.water[i] === 'foul' ? `foul (${r.waterCause})` : 'usual' }),
  );
  DANGER_ANIMALS.forEach((a, i) => {
    const t = r.tempers[i]!;
    rows.push({ row: 'temper', thing: a.name, outcome: `${t.boldness}; warns: ${a.warnings[t.warning]}; backs off from ${t.deterrent}` });
  });
  SIGNS.forEach((p, i) => rows.push({ row: 'sign', thing: p.name, outcome: r.signs[i]! }));
  return rows;
}
