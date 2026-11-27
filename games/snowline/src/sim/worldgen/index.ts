// World generation (SPEC 6.3): the whole pipeline, retried on a derived seed until a valley passes
// every validation check. Everything is driven by the seed, so the result is still deterministic.

import type { Rules } from '../rules.ts';
import { SIZE, type World } from '../world.ts';
import { coverGround } from './cover.ts';
import { layLogBridges } from './bridges.ts';
import { layTrails, validate } from './finish.ts';
import { type Gen, newGen, pt } from './gen.ts';
import { placeSetPieces } from './setpieces.ts';
import { cutBands, raiseCliffs } from './shape.ts';
import { shapeValley } from './geology.ts';
import { chooseStart, sealWreck } from './wreck.ts';
import { scatterLoose } from './loose.ts';

/** Tries before giving up. A valley that needs more than a couple is a sign the pipeline needs work. */
export const MAX_ATTEMPTS = 40;

/** The seed for try number `attempt` (0 is the seed itself). */
export function attemptSeed(seed: string, attempt: number): string {
  return attempt === 0 ? seed : `${seed}~${attempt}`;
}

/** One try. Returns the finished state, or why it failed. */
export function tryGenerate(genSeed: string, rules: Rules): { gen: Gen; problems: string[] } {
  const g = newGen(genSeed, rules);
  const stages: (() => string | null | void)[] = [
    () => shapeValley(g),
    () => cutBands(g),
    () => raiseCliffs(g),
    () => chooseStart(g),
    () => sealWreck(g),
    () => coverGround(g),
    () => placeSetPieces(g),
  ];
  for (const stage of stages) {
    const problem = stage();
    if (problem) return { gen: g, problems: [problem] };
  }
  layTrails(g);
  layLogBridges(g);
  return { gen: g, problems: validate(g) };
}

export function generateWorld(seed: string, rules: Rules): World {
  const failures: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const genSeed = attemptSeed(seed, attempt);
    const { gen, problems } = tryGenerate(genSeed, rules);
    if (problems.length === 0) return toWorld(seed, gen, attempt + 1, failures);
    failures.push(`${genSeed}: ${problems.join('; ')}`);
  }
  throw new Error(`no valid valley for seed ${seed} in ${MAX_ATTEMPTS} tries:\n${failures.join('\n')}`);
}

function toWorld(seed: string, g: Gen, attempts: number, failures: string[]): World {
  return {
    seed,
    genSeed: g.genSeed,
    attempts,
    failures,
    size: SIZE,
    elev: g.elev,
    band: g.band,
    terrain: g.terrain,
    feature: g.feature,
    data: g.data,
    water: g.water,
    flags: g.flags,
    start: pt(g.start),
    crash: pt(g.crash),
    overhang: { rock: pt(g.overhang.rock), shelter: pt(g.overhang.shelter) },
    sparkOutcrop: pt(g.sparkOutcrop),
    decoyOutcrop: pt(g.decoyOutcrop),
    outcrops: g.outcrops.map((o) => ({ stone: o.stone, at: pt(o.at) })),
    mouth: pt(g.mouth),
    streams: { a: g.streamA.map(pt), b: g.streamB.map(pt) },
    wreck: pt(g.wreck),
    slideGap: g.slideGap.map(pt),
    slidePath: g.slidePath.map(pt),
    knoll: pt(g.knoll),
    viewpoints: g.viewpoints.map(pt),
    patches: g.patches,
    territories: g.territories,
    midden: pt(g.midden),
    waterCauseSites: g.waterCauseSites.map(pt),
    landmarks: g.landmarks,
    loose: scatterLoose(g),
    age: g.age,
    trails: g.trailBy,
    trailLines: g.trailLines,
    bridges: g.bridges,
  };
}
