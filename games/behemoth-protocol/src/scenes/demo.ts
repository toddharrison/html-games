import { APPROACH_IDS, type ApproachId } from '../content/approaches';
import { BIOME_IDS, type BiomeId } from '../content/biomes';
import type { BattleModeId } from '../content/modes';
import type { ConditionId } from '../content/conditions';
import { ADDONS, type AddonId } from '../content/addons';
import { DEPOT_ADDONS, DEPOT_MODULES, DEPOT_WEAPONS } from '../content/depot';
import type { ModuleId } from '../content/trailer';
import { WEAPONS, type WeaponId } from '../content/weapons';
import { CONDITION } from '../content/tuning';
import type { HardpointSize } from '../content/chassis';
import { fits, loadOf, slotsOf } from '../sim/depot';
import { hashSeed, Rng } from '../sim/rng';
import { battleEnemy, battleSeed, newRun, type RunState } from '../sim/run';
import { createWorld, stepWorld, type World } from '../sim/world';
import { SIM_DT } from '../sim/loop';
import { demoCommand } from '../input/demoBot';

/**
 * The title screen's attract mode: a run of short clips, one per biome in turn, each a battle the
 * autopilot (`input/demoBot.ts`) plays behind the menu. Every clip opens mid-fight: the sim is run
 * ahead (`preroll`) before the first frame is drawn.
 */

export interface DemoClip {
  seed: number;
  biome: BiomeId;
  approach: ApproachId | null;
  mode: BattleModeId;
  /** Seconds of battle simulated before the clip is shown. */
  preroll: number;
  /** Seconds it's shown before the next one. */
  length: number;
  /** A shorter strip for a Breach, so its fortress is in view. */
  battleLength?: number;
  threat: number;
  /** Now and then a clip at night or in a storm (or a thunderstorm; SPEC §4.6), to show them off. */
  condition: ConditionId | null;
  /** A Behemoth fitted out at random (`demoLoadout`), so the show samples the weapons and setups. */
  loadout: DemoLoadout;
}

/** What a clip's Behemoth is fitted with: add-ons, trailer modules, and a weapon on every hardpoint. */
export interface DemoLoadout {
  addons: AddonId[];
  bays: (ModuleId | null)[];
  /** Weapon per hardpoint slot id. */
  weapons: Record<string, WeaponId>;
}

/**
 * Shown per clip, and how busy the battles are (above the opening battle's threat, for the show).
 * Every `conditionEvery`th clip is fought at night or in a storm, by turns.
 */
export const DEMO = {
  length: 10,
  threat: 10,
  fade: 0.4,
  conditionEvery: 4,
  /** Odds each add-on is bolted on, and each trailer bay is filled. */
  addonChance: 0.4,
  bayChance: 0.75,
  /** A loadout heavier than this share of the tread capacity is rolled again (a crawling hull is a dull show). */
  maxLoad: 1.1,
  /** Tries before falling back to the stock Behemoth. */
  tries: 8,
};

/** Modes in the order the clips walk through them (offset per pass, so a biome doesn't always get the same one). */
const MODE_ORDER: readonly BattleModeId[] = ['assault', 'chase', 'breach', 'intercept'];

/** Clip `i` of the show: biomes in turn, modes rotating, the approach drawn from the seed. */
export function demoClip(i: number, seed: number): DemoClip {
  // Biome b on pass k gets mode b + k, so each pass gives every biome the next mode.
  const b = i % BIOME_IDS.length;
  const pass = Math.floor(i / BIOME_IDS.length);
  const biome = BIOME_IDS[b]!;
  const mode = MODE_ORDER[(b + pass) % MODE_ORDER.length]!;
  const approaches: (ApproachId | null)[] = [null, ...APPROACH_IDS];
  const approach = approaches[hashSeed(seed, 0xde30) % approaches.length]!;
  const turn = Math.floor(i / DEMO.conditionEvery);
  // A storm where the biome has thunderstorms brings its lightning, to show it off.
  const storm: ConditionId = CONDITION.lightning.chance[biome] > 0 ? 'thunderstorm' : 'storm';
  const condition: ConditionId | null = i % DEMO.conditionEvery === DEMO.conditionEvery - 1 ? (turn % 2 === 0 ? 'night' : storm) : null;
  const base = { seed, biome, approach, mode, length: DEMO.length, threat: DEMO.threat, condition, loadout: demoLoadout(seed) };
  // Start where the action is: a few posts in (Assault), the convoy just caught up with (Chase),
  // the fortress coming into range (Breach, on a short strip).
  if (mode === 'chase') return { ...base, preroll: 5 };
  // The train has pulled out of its station and the hull is closing on its tail.
  if (mode === 'intercept') return { ...base, preroll: 6 };
  if (mode === 'breach') return { ...base, preroll: 7, battleLength: 1100 };
  return { ...base, preroll: 16 };
}

/**
 * A Behemoth fitted out at random from what depots sell (SPEC §8.2): each add-on at
 * `DEMO.addonChance`, the trailer's bays filled at `DEMO.bayChance`, and every hardpoint given a
 * weapon that fits it, a different one wherever there's a choice. Weapons are picked big slots
 * first within what the treads can carry (`DEMO.maxLoad` of capacity), keeping enough back for the
 * lightest weapon on each slot still to fill. Seeded, so a clip replays.
 */
export function demoLoadout(seed: number): DemoLoadout {
  const rng = new Rng(hashSeed(seed, 0xd10a));
  const pick = <T>(xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
  const trailer = ADDONS.trailer;
  const bayCount = trailer.kind === 'trailer' ? trailer.bays.length : 0;
  for (let i = 0; i < DEMO.tries; i++) {
    const addons = (Object.keys(DEPOT_ADDONS) as AddonId[]).filter(() => rng.chance(DEMO.addonChance));
    const modules = Object.keys(DEPOT_MODULES) as ModuleId[];
    const bays = addons.includes('trailer') ? Array.from({ length: bayCount }, () => (rng.chance(DEMO.bayChance) ? pick(modules) : null)) : [];
    const bare = newRun(seed, 'class2', addons, {}, bays).behemoth;
    // The hull's own slots, big ones first, and what each could take.
    const slots = slotsOf(bare)
      .filter((slot) => slot.position !== 'trailer')
      .sort((p, q) => SIZE_ORDER.indexOf(p.size) - SIZE_ORDER.indexOf(q.size))
      .map((slot) => ({ slot, fit: (Object.keys(DEPOT_WEAPONS) as WeaponId[]).filter((id) => fits(bare, slot.id, id)) }));
    // Tons left for weapons: the load with every hull slot emptied, against the limit.
    const load = loadOf(bare);
    const armed = bare.hardpoints.reduce((t, h) => t + (h.weapon && slots.some((s) => s.slot.id === h.slot) ? (WEAPONS[h.weapon].mass ?? 0) : 0), 0);
    let budget = load.capacity * DEMO.maxLoad - (load.mass - armed);
    const lightest = (fit: WeaponId[]) => Math.min(...fit.map((id) => WEAPONS[id].mass ?? 0));
    const weapons: Record<string, WeaponId> = {};
    slots.forEach(({ slot, fit }, k) => {
      const reserve = slots.slice(k + 1).reduce((t, s) => t + (s.fit.length > 0 ? lightest(s.fit) : 0), 0);
      const affordable = fit.filter((id) => (WEAPONS[id].mass ?? 0) <= budget - reserve);
      const fresh = affordable.filter((id) => !Object.values(weapons).includes(id));
      const options = fresh.length > 0 ? fresh : affordable.length > 0 ? affordable : fit.length > 0 ? [fit.reduce((a, b) => ((WEAPONS[a].mass ?? 0) <= (WEAPONS[b].mass ?? 0) ? a : b))] : [];
      if (options.length === 0) return;
      const id = pick(options);
      weapons[slot.id] = id;
      budget -= WEAPONS[id].mass ?? 0;
    });
    const run = newRun(seed, 'class2', addons, weapons, bays);
    const fitted = loadOf(run.behemoth);
    if (fitted.mass <= fitted.capacity * DEMO.maxLoad) return { addons, bays, weapons };
  }
  // Too much bolted on every time: the stock Behemoth, its own guns spelled out.
  const stock = newRun(seed).behemoth;
  return { addons: [], bays: [], weapons: Object.fromEntries(stock.hardpoints.filter((h) => h.weapon).map((h) => [h.slot, h.weapon!])) };
}

const SIZE_ORDER: readonly HardpointSize[] = ['L', 'M', 'S'];

/** The throwaway run a clip is played on: its seed, fitted with its loadout. */
export function demoRun(clip: DemoClip): RunState {
  const { addons, weapons, bays } = clip.loadout;
  return newRun(clip.seed, 'class2', addons, weapons, bays);
}

/**
 * A clip's battle, as the title plays it (and the autopilot bench, `dev/bench.ts`): its throwaway run
 * and loadout, its biome, mode, threat, and condition, on a field `fieldRows` tiles across.
 */
export function createDemoWorld(clip: DemoClip, frameWidth: number, fieldRows: number): World {
  const run = demoRun(clip);
  const recipe = { biome: clip.biome, approach: clip.approach };
  return createWorld({
    seed: battleSeed(run),
    recipe,
    frameWidth,
    fieldRows,
    behemoth: run.behemoth,
    ...battleEnemy(run, recipe),
    threat: clip.threat,
    ...(clip.battleLength !== undefined ? { battleLength: clip.battleLength } : {}),
    objective: { mode: clip.mode, strength: 'normal' },
    condition: clip.condition,
    sighted: run.sighted,
  });
}

/** Runs a clip's battle ahead to where the show starts (`preroll`), with the first wave pulled in. */
export function prerollDemo(w: World, clip: DemoClip): void {
  // The first reinforcements come early: there's only time for a glimpse.
  w.encounter.alert.next = Math.min(w.encounter.alert.next, clip.preroll + 3);
  for (let t = 0; t < clip.preroll && !w.behemoth.destroyed && w.extractedAt === null; t += SIM_DT) {
    stepWorld(w, demoCommand(w));
    w.events.length = 0;
  }
}
