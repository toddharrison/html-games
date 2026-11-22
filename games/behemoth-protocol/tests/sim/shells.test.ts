import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies';
import { shellsOf, WEAPONS, withShell, type BulletSpec, type ShellType } from '../../src/content/weapons';
import { IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { applyAction, openDepot, quote, shellOf } from '../../src/sim/depot';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/** Main-gun shell types (SPEC §6.2): high-explosive (default), armor-piercing, canister. */

const cannon = WEAPONS.heavyCannon;

function atDepot(): RunState {
  const run = newRun(11);
  return { ...run, battle: 1, next: 'depot', salvage: 1000, depot: openDepot({ seed: run.seed, battle: 1 }) };
}

/** A quiet battle (no spawns, autos off) with the main gun loaded with `shell`. */
function battle(shell: ShellType | null): World {
  const run = newRun(1);
  run.behemoth.hardpoints.find((h) => h.slot === 'turret')!.shell = shell;
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: run.behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 100, aimY: w.behemoth.y, ...cmd });
}

/** A unit that holds still with its hull toward `heading` and never shoots. */
function parked(w: World, id: 'heavyTank' | 'infantry', x: number, y: number, heading = Math.PI): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0, hp: 1000 };
  e.hp = 1000;
  e.vx = 0;
  e.heading = heading;
  return e;
}

const turret = (w: World) => w.behemoth.hardpoints.find((h) => h.slot.id === 'turret')!;

describe('shell content', () => {
  it('the heavy cannon takes all three, high-explosive first; the howitzer has no choice', () => {
    expect(shellsOf(cannon)).toEqual(['he', 'ap', 'canister']);
    expect(cannon.shells!.he).toBe(cannon.projectile);
    expect(shellsOf(WEAPONS.siegeHowitzer)).toEqual([]);
  });

  it('loading a shell swaps the projectile and keeps the gun; the default is the gun itself', () => {
    expect(withShell(cannon, null)).toBe(cannon);
    expect(withShell(cannon, 'he')).toBe(cannon);
    const ap = withShell(cannon, 'ap');
    expect(ap.projectile).toBe(cannon.shells!.ap);
    expect(ap.id).toBe('heavyCannon');
    expect(ap.reload).toBe(cannon.reload);
    expect(withShell(cannon, 'ap')).toBe(ap);
    expect(withShell(WEAPONS.siegeHowitzer, 'ap')).toBe(WEAPONS.siegeHowitzer);
  });
});

describe('shells at the depot', () => {
  it('choosing a shell is free and takes no action; the current one is already set', () => {
    let run = atDepot();
    expect(shellOf(run.behemoth, 'turret')).toBe('he');
    expect(quote(run, { kind: 'shell', slot: 'turret', shell: 'he' })).toEqual({ ok: false, reason: 'Set' });
    expect(quote(run, { kind: 'shell', slot: 'turret', shell: 'ap' })).toEqual({ ok: true, salvage: 0, actions: 0 });
    const actions = run.depot!.actions;
    run = applyAction(run, { kind: 'shell', slot: 'turret', shell: 'ap' });
    expect(shellOf(run.behemoth, 'turret')).toBe('ap');
    expect(run.depot!.actions).toBe(actions);
    expect(run.salvage).toBe(1000);
    // Going back to the default stores no choice at all.
    run = applyAction(run, { kind: 'shell', slot: 'turret', shell: 'he' });
    expect(run.behemoth.hardpoints.find((h) => h.slot === 'turret')!.shell).toBeNull();
  });

  it('only guns that take shells get a choice', () => {
    const run = atDepot();
    expect(quote(run, { kind: 'shell', slot: 'prow', shell: 'ap' })).toEqual({ ok: false, reason: 'Not allowed' });
    expect(shellOf(run.behemoth, 'prow')).toBeNull();
  });

  it('removing or replacing the gun clears its shell', () => {
    let run = applyAction(atDepot(), { kind: 'shell', slot: 'turret', shell: 'canister' });
    run = applyAction(run, { kind: 'remove', slot: 'turret' });
    expect(run.behemoth.hardpoints.find((h) => h.slot === 'turret')!.shell).toBeNull();
  });

  it('the battle loads the gun with it, and the snapshot keeps it', () => {
    const run = applyAction(atDepot(), { kind: 'shell', slot: 'turret', shell: 'ap' });
    const b = restoreBehemoth(run.behemoth, 0, 0);
    const h = b.hardpoints.find((hp) => hp.slot.id === 'turret')!;
    expect(h.shell).toBe('ap');
    expect(h.weapon!.projectile).toBe(cannon.shells!.ap);
    expect(snapshotBehemoth(b).hardpoints.find((hp) => hp.slot === 'turret')!.shell).toBe('ap');
  });

  it('a shell the gun can not take loads the default', () => {
    const run = newRun(1);
    run.behemoth.hardpoints.find((h) => h.slot === 'prow')!.shell = 'ap';
    const h = restoreBehemoth(run.behemoth, 0, 0).hardpoints.find((hp) => hp.slot.id === 'prow')!;
    expect(h.shell).toBeNull();
    expect(h.weapon).toBe(WEAPONS.autocannon);
  });
});

describe('shells in battle', () => {
  it('high-explosive is still the default: it bursts at the cursor and splashes', () => {
    const w = battle(null);
    const b = w.behemoth;
    const near = parked(w, 'heavyTank', b.x + 120, b.y + 14);
    steps(w, 1, { fireMain: true, aimX: b.x + 120, aimY: b.y });
    steps(w, 60);
    expect(near.hp).toBeLessThan(1000);
  });

  it('armor-piercing flies past the cursor to the first thing in line, cracks the front armor, and has no splash', () => {
    const w = battle('ap');
    const b = w.behemoth;
    const target = parked(w, 'heavyTank', b.x + 160, b.y);
    const beside = parked(w, 'heavyTank', b.x + 160, b.y + 20);
    steps(w, 1, { fireMain: true, aimX: b.x + 80, aimY: b.y });
    steps(w, 60);
    const ap = cannon.shells!.ap as BulletSpec;
    const front = ENEMIES.heavyTank.facing!.front;
    // Penetration 0.5 takes the front's 0.75 halfway back to 1.
    expect(1000 - target.hp).toBeCloseTo(ap.damage * ap.vs!.heavy! * (front + (1 - front) * ap.penetration!), 5);
    expect(beside.hp).toBe(1000);
  });

  it('canister fires a cone of pellets in one shot', () => {
    const w = battle('canister');
    steps(w, 1, { fireMain: true });
    const pellets = (cannon.shells!.canister as BulletSpec).pellets!;
    expect(w.projectiles.filter((p) => p.owner === 'player')).toHaveLength(pellets);
    expect(w.events.filter((e) => e.type === 'fire' && e.slot === 'turret')).toHaveLength(1);
    expect(turret(w).cooldown).toBeGreaterThan(0);
  });

  it('canister shreds a squad up close and barely scratches a heavy tank', () => {
    const w = battle('canister');
    const b = w.behemoth;
    const squad = parked(w, 'infantry', b.x + 80, b.y - 6);
    const tank = parked(w, 'heavyTank', b.x + 80, b.y + 10);
    steps(w, 1, { fireMain: true, aimX: b.x + 80, aimY: b.y });
    steps(w, 40);
    expect(1000 - squad.hp).toBeGreaterThan(1000 - tank.hp);
    // Pellets fizzle at short range.
    const far = battle('canister');
    const fb = far.behemoth;
    const distant = parked(far, 'infantry', fb.x + 220, fb.y);
    steps(far, 1, { fireMain: true, aimX: fb.x + 220, aimY: fb.y });
    steps(far, 60);
    expect(distant.hp).toBe(1000);
  });
});
