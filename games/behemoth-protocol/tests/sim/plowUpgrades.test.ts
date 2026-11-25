import { describe, expect, it } from 'vitest';
import { ADDONS } from '../../src/content/addons';
import { DEPOT_ADDONS, DEPOT_TRACKS } from '../../src/content/depot';
import { OBSTACLE_CLASSES } from '../../src/content/obstacles';
import { MATERIALS } from '../../src/content/terrain';
import { DEPOT, TERRAIN_GEN } from '../../src/content/tuning';
import { NO_UPGRADES, TRACKS, trackMax, type Upgrades } from '../../src/content/upgrades';
import { parseRun, serializeRun } from '../../src/save/runSave';
import { addonOf, breaksRock, footprint, groundFootprint, IDLE_COMMAND, loadMass, type PlayerCommand } from '../../src/sim/behemoth';
import { addonDef, applyAction, damageOf, openDepot, partKind, quote, tracksOf, type DepotState } from '../../src/sim/depot';
import { newRun, restoreBehemoth, type RunState } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/**
 * The ram plow's upgrades (SPEC §5.6, §15 "Plow upgrades"): Harden for its integrity, and the
 * Breaker, which breaks rock at the nose instead of letting it turn the hull aside (SPEC §4.2).
 */

const TS = TERRAIN_GEN.tileSize;
const plow = ADDONS.ramPlow;
if (plow.kind !== 'plow') throw new Error('ramPlow is a plow');

const BREAKER: Upgrades = { grades: {}, mods: { ramPlow: { breaker: 1 } } };

function atDepot(run: RunState, set: Partial<DepotState> = {}, salvage = 3000): RunState {
  return { ...run, battle: 1, next: 'depot', salvage, depot: { ...openDepot({ seed: run.seed, battle: 1 }, run.behemoth), ...set } };
}

function battle(upgrades: Upgrades = NO_UPGRADES, addons: readonly 'ramPlow'[] = ['ramPlow']): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: newRun(11, 'class2', addons, {}, [], upgrades).behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function rock(w: World, col: number, r0: number, r1: number): void {
  for (let r = r0; r <= r1; r++) {
    const t = w.terrain.tile(col, r)!;
    t.mat = 'rock';
    t.state = 'intact';
    t.hp = MATERIALS.rock.maxHp;
  }
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}): void {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

/** Column a little ahead of the Behemoth's nose. */
const aheadCol = (w: World, gap = 2) => Math.floor(footprint(w.behemoth).x1 / TS) + gap;

/** Rows the ground box covers, first and last. */
function groundRows(w: World): [number, number] {
  const fp = groundFootprint(w.behemoth);
  return [Math.floor(fp.y0 / TS), Math.floor((fp.y1 - 0.001) / TS)];
}

const state = (w: World, col: number, row: number) => w.terrain.tile(col, row)!.state;

describe('the plow at the depot', () => {
  it('takes Harden and the Breaker; the Breaker is one level', () => {
    const s = newRun(11, 'class2', ['ramPlow']).behemoth;
    expect(partKind(s, 'ramPlow')).toBe('plow');
    expect(tracksOf(s, 'ramPlow')).toEqual(['harden', 'breaker']);
    expect(trackMax('breaker', DEPOT.maxModLevel)).toBe(1);
    // Nothing else takes the Breaker.
    for (const id of ['treads', 'reactor', 'turret', 'prow', 'armor.front']) expect(tracksOf(s, id)).not.toContain('breaker');
    expect(quote(atDepot(newRun(11)), { kind: 'mod', part: 'ramPlow', track: 'breaker' })).toEqual({ ok: false, reason: "Doesn't apply" });
  });

  it('a Harden level raises its integrity, and a worn blade keeps its share', () => {
    let run = atDepot(newRun(11, 'class2', ['ramPlow']));
    run.behemoth.addons[0]!.hp = plow.hp / 2;
    const mass = loadMass(restoreBehemoth(run.behemoth, 0, 0));
    run = applyAction(run, { kind: 'mod', part: 'ramPlow', track: 'harden' });
    const max = Math.round(plow.hp * (1 + TRACKS.harden.per));
    expect(damageOf(run.behemoth, 'ramPlow')).toEqual({ missing: max / 2, max });
    expect(run.salvage).toBe(3000 - DEPOT_TRACKS.harden[0]!);
    // In battle: the bigger blade, at the share it had; a level's weight on the treads.
    const b = restoreBehemoth(run.behemoth, 0, 0);
    expect(addonOf(b, 'ramPlow')!.integrity).toEqual({ hp: max / 2, max });
    expect(loadMass(b)).toBe(mass + TRACKS.harden.mass);
    // A repair restores it to the hardened maximum; three levels is the cap.
    run = applyAction(run, { kind: 'repair', component: 'ramPlow' });
    expect(run.behemoth.addons[0]!.hp).toBe(max);
    run = applyAction(applyAction(run, { kind: 'mod', part: 'ramPlow', track: 'harden' }), { kind: 'mod', part: 'ramPlow', track: 'harden' });
    expect(addonDef(run.behemoth, 'ramPlow')).toMatchObject({ hp: Math.round(plow.hp * (1 + 3 * TRACKS.harden.per)) });
    expect(quote(run, { kind: 'mod', part: 'ramPlow', track: 'harden' })).toEqual({ ok: false, reason: 'Maxed' });
  });

  it('the Breaker is bought once, weighs on the treads, and leaves the blade as it was', () => {
    let run = atDepot(newRun(11, 'class2', ['ramPlow']));
    const mass = loadMass(restoreBehemoth(run.behemoth, 0, 0));
    expect(addonDef(run.behemoth, 'ramPlow')).toBe(plow);
    run = applyAction(run, { kind: 'mod', part: 'ramPlow', track: 'breaker' });
    expect(run.salvage).toBe(3000 - DEPOT_TRACKS.breaker[0]!);
    expect(addonDef(run.behemoth, 'ramPlow')).toMatchObject({ hp: plow.hp, ram: plow.ram, breaksRock: true });
    expect(quote(run, { kind: 'mod', part: 'ramPlow', track: 'breaker' })).toEqual({ ok: false, reason: 'Maxed' });
    const b = restoreBehemoth(run.behemoth, 0, 0);
    expect(breaksRock(b)).toBe(true);
    expect(loadMass(b)).toBe(mass + TRACKS.breaker.mass);
  });

  it('its upgrades sell back with the plow, are gone with it, and survive a save', () => {
    let run = atDepot(newRun(11, 'class2', ['ramPlow']));
    run = applyAction(applyAction(run, { kind: 'mod', part: 'ramPlow', track: 'breaker' }), { kind: 'mod', part: 'ramPlow', track: 'harden' });
    expect(parseRun(serializeRun(run))?.behemoth.mods).toEqual({ ramPlow: { breaker: 1, harden: 1 } });
    const q = quote(run, { kind: 'removeAddon', addon: 'ramPlow' });
    expect(q.ok && q.salvage).toBe(-Math.floor((DEPOT_ADDONS.ramPlow!.price + DEPOT_TRACKS.breaker[0]! + DEPOT_TRACKS.harden[0]!) * DEPOT.resale));
    run = applyAction(run, { kind: 'removeAddon', addon: 'ramPlow' });
    expect(run.behemoth.mods['ramPlow']).toBeUndefined();
  });
});

describe('the Breaker in battle', () => {
  it('breaks the rock at the nose and drives straight through, at the cost of blade, treads, and speed', () => {
    const w = battle(BREAKER);
    const b = w.behemoth;
    const col = aheadCol(w);
    rock(w, col, 0, 15);
    const [r0, r1] = groundRows(w);
    const y0 = b.y;
    const v0 = b.vx;
    const treads = b.treads.hp;
    let minV = v0;
    for (let i = 0; i < 240; i++) {
      steps(w, 1);
      minV = Math.min(minV, b.vx);
      expect(b.deflect.dir).toBe(0);
    }
    // Straight through: not turned aside, past the face.
    expect(b.y).toBeCloseTo(y0, 6);
    expect(footprint(b).x0).toBeGreaterThan((col + 1) * TS);
    // The tiles under the ground box are flat; the rock either side of the gap stands.
    for (let r = r0; r <= r1; r++) expect(state(w, col, r)).toBe('flattened');
    expect(state(w, col, r0 - 1)).toBe('intact');
    expect(state(w, col, r1 + 1)).toBe('intact');
    // The blade took the rams (the front armor behind it none), the treads their share, and it slowed.
    const blade = addonOf(b, 'ramPlow')!.integrity!;
    expect(blade.hp).toBeLessThan(blade.max);
    expect(blade.hp).toBeGreaterThan(0);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max);
    expect(b.treads.hp).toBeLessThan(treads);
    expect(minV).toBeLessThan(v0);
    expect(w.events.filter((e) => e.type === 'collision' && e.obstacle === 'rock')).toHaveLength(r1 - r0 + 1);
    expect(w.events.some((e) => e.type === 'collision' && e.obstacle === 'immovable')).toBe(false);
    expect(w.events.some((e) => e.type === 'scrape')).toBe(false);
  });

  it('costs a tile what the rock class says, less the ram gear', () => {
    const w = battle(BREAKER);
    const b = w.behemoth;
    const [r0] = groundRows(w);
    // One tile, dead ahead of the upper half of the ground box.
    rock(w, aheadCol(w), r0, r0);
    const blade = addonOf(b, 'ramPlow')!.integrity!;
    let impact = 0;
    for (let i = 0; i < 240 && blade.hp === blade.max; i++) {
      impact = b.vx / b.chassis.speed.cruise;
      steps(w, 1);
    }
    // The class's armor damage at the speed it met the tile, cut by the plow's ram gear: all of it on the blade.
    const cut = 1 - (b.chassis.ram + plow.ram);
    expect(impact).toBeGreaterThan(0.5);
    expect(blade.max - blade.hp).toBeCloseTo(OBSTACLE_CLASSES.rock.armorDamage * impact * cut, 1);
  });

  it('without the Breaker, a plow still glances off', () => {
    const w = battle();
    const b = w.behemoth;
    const col = aheadCol(w);
    const [r0, r1] = groundRows(w);
    rock(w, col, r0 - 1, r1 + 1);
    const y0 = b.y;
    steps(w, 240);
    expect(breaksRock(b)).toBe(false);
    expect(Math.abs(b.y - y0)).toBeGreaterThan(TS);
    for (let r = r0 - 1; r <= r1 + 1; r++) expect(state(w, col, r)).toBe('intact');
    expect(w.events.some((e) => e.type === 'collision' && e.obstacle === 'immovable')).toBe(true);
  });

  it('a spent blade breaks nothing: the hull glances off again', () => {
    const w = battle(BREAKER);
    const b = w.behemoth;
    addonOf(b, 'ramPlow')!.integrity!.hp = 0;
    expect(breaksRock(b)).toBe(false);
    const col = aheadCol(w);
    const [r0, r1] = groundRows(w);
    rock(w, col, r0 - 1, r1 + 1);
    const y0 = b.y;
    steps(w, 240);
    expect(Math.abs(b.y - y0)).toBeGreaterThan(TS);
    for (let r = r0 - 1; r <= r1 + 1; r++) expect(state(w, col, r)).toBe('intact');
  });

  it('a blade that gives out part-way leaves the hull to slide off what is left, and never stops it', () => {
    const w = battle(BREAKER);
    const b = w.behemoth;
    // Enough for the first tile or two, no more.
    addonOf(b, 'ramPlow')!.integrity!.hp = 1;
    const col = aheadCol(w);
    const [r0, r1] = groundRows(w);
    for (let c = col; c < col + 3; c++) rock(w, c, r0 - 1, r1 + 1);
    steps(w, 600);
    expect(addonOf(b, 'ramPlow')!.integrity!.hp).toBe(0);
    expect(w.events.some((e) => e.type === 'componentDestroyed' && e.component === 'ramPlow')).toBe(true);
    expect(footprint(b).x0).toBeGreaterThan((col + 3) * TS);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('rock met from the side still slides the hull along it', () => {
    const w = battle(BREAKER);
    const b = w.behemoth;
    const fp = groundFootprint(b);
    // A wall along the hull's right side, a tile clear of the ground box, from behind it to well ahead.
    const row = Math.floor((fp.y1 - 0.001) / TS) + 2;
    const c0 = Math.floor(fp.x0 / TS) - 2;
    const c1 = c0 + 40;
    for (let c = c0; c <= c1; c++) rock(w, c, row, row);
    steps(w, 120, { steer: 1 });
    // Held off the wall, which stands; the blade isn't touched by a side scrape.
    expect(groundFootprint(b).y1).toBeLessThanOrEqual(row * TS + 0.001);
    for (let c = c0; c <= c1; c++) expect(state(w, c, row)).toBe('intact');
    const blade = addonOf(b, 'ramPlow')!.integrity!;
    expect(blade.hp).toBe(blade.max);
    expect(b.armor.right.hp).toBeLessThan(b.armor.right.max);
  });
});
