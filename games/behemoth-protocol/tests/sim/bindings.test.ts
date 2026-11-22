import { FIRE_CONTROL } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../src/content/chassis';
import { WEAPONS } from '../../src/content/weapons';
import { parseRun, serializeRun } from '../../src/save/runSave';
import {
  allowedBindings,
  channelsUsed,
  defaultBindingFor,
  fireControlSpread,
  firingBinding,
  IDLE_COMMAND,
  pickInternal,
  type PlayerCommand,
} from '../../src/sim/behemoth';
import { applyAction, bindingOf, channelsOf, fits, openDepot, quote, type DepotAction } from '../../src/sim/depot';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { SIM_DT } from '../../src/sim/loop';
import { Rng } from '../../src/sim/rng';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const class2 = CHASSIS.class2;
const slot = (id: string) => class2.hardpoints.find((s) => s.id === id) ?? class2.addonMounts[id as 'coax']!.hardpoint!;

/** A quiet battle (no spawns, autos off) from a run's Behemoth. */
function battle(run: RunState = newRun(1)): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: run.behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

/** Player shots per slot over a few seconds. */
function shots(w: World, seconds: number, cmd: Partial<PlayerCommand> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  const b = w.behemoth;
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 150, aimY: b.y, ...cmd });
    for (const ev of w.events) if (ev.type === 'fire' && ev.owner === 'player' && ev.slot) out[ev.slot] = (out[ev.slot] ?? 0) + 1;
    w.events.length = 0;
  }
  return out;
}

/** A target that holds still and never shoots back. */
function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, 'lightTank', x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0, hp: 1e6 };
  e.hp = 1e6;
  e.vx = 0;
  return e;
}

const hp = (w: World, id: string) => w.behemoth.hardpoints.find((h) => h.slot.id === id)!;

/** A run at a depot with money and actions to spare. */
function atDepot(run: RunState = newRun(3)): RunState {
  return { ...run, battle: 1, next: 'depot', salvage: 5000, depot: openDepot({ seed: run.seed, battle: 1 }, run.behemoth) };
}

describe('allowed and default bindings', () => {
  it('main guns LMB, secondaries RMB, missiles Space, the rest Auto', () => {
    expect(defaultBindingFor(WEAPONS.heavyCannon, slot('turret'))).toBe('lmb');
    expect(defaultBindingFor(WEAPONS.autocannon, slot('prow'))).toBe('rmb');
    expect(defaultBindingFor(WEAPONS.missileRack, slot('spine'))).toBe('space');
    expect(defaultBindingFor(WEAPONS.apGuns, slot('flankL'))).toBe('auto');
  });

  it('L guns and coax weapons are never Auto; point defense is Auto only', () => {
    expect(allowedBindings(WEAPONS.heavyCannon, slot('turret'))).toEqual(['lmb', 'rmb', 'space']);
    expect(allowedBindings(WEAPONS.flakCannon, slot('coax'))).toEqual(['lmb', 'rmb', 'space']);
    expect(allowedBindings(WEAPONS.pdLaser, slot('pd'))).toEqual(['auto']);
    expect(allowedBindings(WEAPONS.missileRack, slot('spine'))).toEqual(['lmb', 'rmb', 'space', 'auto']);
    // An auto weapon on the coax goes on RMB.
    expect(defaultBindingFor(WEAPONS.mortar, slot('coax'))).toBe('rmb');
  });
});

describe('firing by binding', () => {
  it('a secondary moved to LMB fires with the main gun, not with RMB', () => {
    const w = battle();
    hp(w, 'prow').binding = 'lmb';
    const aim = { aimX: w.behemoth.x + 150, aimY: w.behemoth.y };
    expect(shots(w, 1, { ...aim, fireSecondary: true }).prow).toBeUndefined();
    const fired = shots(w, 2, { ...aim, fireMain: true });
    expect(fired.prow).toBeGreaterThan(3);
    expect(fired.turret).toBeGreaterThan(0);
  });

  it('auto guns put on a trigger fire at the cursor only while it is held', () => {
    const w = battle();
    const b = w.behemoth;
    b.autoEnabled.fill(true);
    hp(w, 'flankL').binding = 'rmb';
    // On the right: only the right flank's AP guns can reach it.
    dummy(w, b.x, b.y + 50);
    const aim = { aimX: b.x, aimY: b.y - 60 };
    const idle = shots(w, 1, aim);
    expect(idle.flankL).toBeUndefined();
    expect(idle.flankR).toBeGreaterThan(0);
    expect(shots(w, 1, { ...aim, fireSecondary: true }).flankL).toBeGreaterThan(0);
  });

  it('a secondary on Auto engages on its own, in toggle group 4', () => {
    const w = battle();
    const b = w.behemoth;
    hp(w, 'prow').binding = 'auto';
    dummy(w, b.x + 120, b.y);
    expect(shots(w, 1).prow).toBeUndefined();
    b.autoEnabled[FIRE_CONTROL.group - 1] = true;
    expect(shots(w, 2).prow).toBeGreaterThan(3);
  });

  it('a missile rack on Auto launches a salvo at the target in reach', () => {
    const w = battle();
    const b = w.behemoth;
    const rack = hp(w, 'spine');
    rack.binding = 'auto';
    b.autoEnabled[FIRE_CONTROL.group - 1] = true;
    expect(shots(w, 1).spine).toBeUndefined();
    const e = dummy(w, b.x + 160, b.y + 30);
    expect(shots(w, 1).spine).toBe(WEAPONS.missileRack.salvo!.count);
    expect(w.projectiles.filter((p) => p.owner === 'player' && p.targetId === e.id).length).toBeGreaterThan(0);
  });

  it('a missile rack on LMB fires a salvo with the main trigger', () => {
    const w = battle();
    hp(w, 'spine').binding = 'lmb';
    expect(shots(w, 0.5, { fireMissile: true }).spine).toBeUndefined();
    expect(shots(w, 1, { fireMain: true }).spine).toBe(WEAPONS.missileRack.salvo!.count);
  });

  it('L guns on separate triggers fire independently; on one trigger they ripple', () => {
    const run = newRun(1, 'class2', ['dorsalRing'], { dorsalRing: 'heavyCannon' });
    const w = battle(run);
    hp(w, 'dorsalRing').binding = 'rmb';
    // Both triggers held from the first tick: both guns go at once, no ripple gap between them.
    const first = shots(w, SIM_DT, { fireMain: true, fireSecondary: true });
    expect(first.turret).toBe(1);
    expect(first.dorsalRing).toBe(1);
    const w2 = battle(run);
    hp(w2, 'dorsalRing').binding = 'space';
    hp(w2, 'turret').binding = 'space';
    const rippled = shots(w2, SIM_DT, { fireMissile: true });
    expect(rippled.turret).toBe(1);
    expect(rippled.dorsalRing).toBeUndefined();
  });
});

describe('fire control', () => {
  it('auto spread widens with damage and is worst under local control', () => {
    const b = battle().behemoth;
    expect(fireControlSpread(b)).toBe(1);
    b.fireControl.hp = b.fireControl.max / 2;
    expect(fireControlSpread(b)).toBeCloseTo(1 + FIRE_CONTROL.damaged / 2);
    b.fireControl.hp = 0;
    expect(fireControlSpread(b)).toBe(FIRE_CONTROL.local);
  });

  it('destroyed: player-bound autos fall back to their trigger; built-in autos keep firing', () => {
    const w = battle();
    const b = w.behemoth;
    b.autoEnabled.fill(true);
    hp(w, 'prow').binding = 'auto';
    b.fireControl.hp = 0;
    expect(firingBinding(b, hp(w, 'prow'))).toBe('rmb');
    expect(firingBinding(b, hp(w, 'flankL'))).toBe('auto');
    dummy(w, b.x + 40, b.y - 30);
    const idle = shots(w, 1, { aimX: b.x + 40, aimY: b.y - 30 });
    expect(idle.prow).toBeUndefined();
    expect(idle.flankL).toBeGreaterThan(0);
    expect(shots(w, 1, { aimX: b.x + 40, aimY: b.y - 30, fireSecondary: true }).prow).toBeGreaterThan(0);
  });

  it('is an internal component that takes hits through the armor', () => {
    const b = battle().behemoth;
    const rng = new Rng(5);
    const picks = Array.from({ length: 2000 }, () => pickInternal(b, 'frontLeft', rng));
    expect(picks).toContain('fireControl');
  });
});

describe('bindings at the depot', () => {
  it('rebinding is free, takes no action, and is undone by setting the default back', () => {
    let run = atDepot();
    const actions = run.depot!.actions;
    expect(quote(run, { kind: 'bind', slot: 'prow', binding: 'lmb' })).toEqual({ ok: true, salvage: 0, actions: 0 });
    run = applyAction(run, { kind: 'bind', slot: 'prow', binding: 'lmb' });
    expect(bindingOf(run.behemoth, 'prow')).toBe('lmb');
    expect(run.depot!.actions).toBe(actions);
    expect(run.salvage).toBe(5000);
    run = applyAction(run, { kind: 'bind', slot: 'prow', binding: 'rmb' });
    expect(run.behemoth.hardpoints.find((h) => h.slot === 'prow')!.binding).toBeNull();
    // Still free with no actions left.
    expect(quote({ ...run, depot: { ...run.depot!, actions: 0 } }, { kind: 'bind', slot: 'prow', binding: 'space' }).ok).toBe(true);
  });

  it('refuses bindings the weapon does not allow, and the current one', () => {
    const run = atDepot();
    expect(quote(run, { kind: 'bind', slot: 'turret', binding: 'auto' })).toEqual({ ok: false, reason: 'Not allowed' });
    expect(quote(run, { kind: 'bind', slot: 'pd', binding: 'lmb' })).toEqual({ ok: false, reason: 'Not allowed' });
    expect(quote(run, { kind: 'bind', slot: 'turret', binding: 'lmb' })).toEqual({ ok: false, reason: 'Set' });
  });

  it('player-bound autos take a fire-control channel each; there are only so many', () => {
    const run0 = newRun(3, 'class2', ['sponsonL'], { sponsonL: 'flakCannon' });
    let run = atDepot(run0);
    const bind = (slot: string): DepotAction => ({ kind: 'bind', slot, binding: 'auto' });
    run = applyAction(run, bind('prow'));
    run = applyAction(run, bind('spine'));
    expect(channelsOf(run.behemoth)).toEqual({ used: 2, max: class2.fireControl.channels });
    expect(quote(run, bind('sponsonL'))).toEqual({ ok: false, reason: 'No channel' });
    // Built-in autos (AP guns, PD) don't count.
    expect(channelsUsed(restoreBehemoth(run.behemoth, 0, 0))).toBe(2);
  });

  it('installing or removing a weapon resets its binding', () => {
    let run = atDepot();
    run = applyAction(run, { kind: 'bind', slot: 'prow', binding: 'lmb' });
    run.depot!.stock = [{ weapon: 'rotaryGun', sold: false }];
    run = applyAction(run, { kind: 'install', slot: 'prow', stock: 0 });
    expect(bindingOf(run.behemoth, 'prow')).toBe('rmb');
    run = applyAction(run, { kind: 'bind', slot: 'prow', binding: 'space' });
    run = applyAction(run, { kind: 'remove', slot: 'prow' });
    expect(run.behemoth.hardpoints.find((h) => h.slot === 'prow')!.binding).toBeNull();
  });

  it('point defense does not fit a turret slot; other weapons do, on a trigger', () => {
    const s = newRun(1, 'class2', ['coax']).behemoth;
    expect(fits(s, 'coax', 'mortar')).toBe(true);
    expect(fits(s, 'coax', 'apGuns')).toBe(false); // S, wrong size anyway
  });

  it('repairs fire control like any core component', () => {
    let run = atDepot();
    run.behemoth.fireControl = 10;
    const q = quote(run, { kind: 'repair', component: 'fireControl' });
    expect(q.ok).toBe(true);
    run = applyAction(run, { kind: 'repair', component: 'fireControl' });
    expect(run.behemoth.fireControl).toBe(class2.fireControl.hp);
  });
});

describe('bindings in the run', () => {
  it('carry from the depot into battle and back through the snapshot and the save', () => {
    let run = atDepot();
    run = applyAction(run, { kind: 'bind', slot: 'prow', binding: 'auto' });
    run.behemoth.fireControl = 17;
    const b = restoreBehemoth(run.behemoth, 0, 0);
    expect(b.hardpoints.find((h) => h.slot.id === 'prow')!.binding).toBe('auto');
    expect(b.fireControl.hp).toBe(17);
    expect(snapshotBehemoth(b)).toEqual(run.behemoth);
    expect(parseRun(serializeRun(run))).toEqual(run);
  });

  it('a saved binding the slot no longer allows stays at the default', () => {
    const s = structuredClone(newRun(1).behemoth);
    s.hardpoints.find((h) => h.slot === 'turret')!.binding = 'auto';
    expect(restoreBehemoth(s, 0, 0).hardpoints.find((h) => h.slot.id === 'turret')!.binding).toBe('lmb');
  });

  it('version 3 saves load with default bindings and fire control intact', () => {
    const run = newRun(1);
    const v3 = JSON.parse(serializeRun(run));
    v3.version = 3;
    delete v3.run.behemoth.fireControl;
    for (const h of v3.run.behemoth.hardpoints) delete h.binding;
    expect(parseRun(JSON.stringify(v3))).toEqual(run);
    const bad = JSON.parse(serializeRun(run));
    bad.run.behemoth.hardpoints[0].binding = 'feet';
    expect(parseRun(JSON.stringify(bad))).toBeNull();
  });
});
