import { RIPPLE_GAP } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { ADDONS } from '../../src/content/addons';
import { DEPOT_ADDONS } from '../../src/content/depot';
import { WEAPONS } from '../../src/content/weapons';
import { IDLE_COMMAND, loadMass, mountPosition, turretWorldAngle, type PlayerCommand } from '../../src/sim/behemoth';
import { applyAction, fits, openDepot, quote } from '../../src/sim/depot';
import { SIM_DT } from '../../src/sim/loop';
import { angleDiff } from '../../src/sim/math';
import { newRun, restoreBehemoth, type RunState } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/** A quiet battle (no spawns, autos off) with these mounts fitted. */
function battle(addons: Parameters<typeof newRun>[2], extra: Parameters<typeof newRun>[3]): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: newRun(1, 'class2', addons, extra).behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

/** Steps the world, returning each player shot's time and slot. */
function shots(w: World, seconds: number, cmd: (t: number) => Partial<PlayerCommand>): { t: number; slot: string; angle: number }[] {
  const out: { t: number; slot: string; angle: number }[] = [];
  const b = w.behemoth;
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    const t = i * SIM_DT;
    stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 150, aimY: b.y, ...cmd(t) });
    for (const ev of w.events) if (ev.type === 'fire' && ev.owner === 'player' && ev.slot) out.push({ t, slot: ev.slot, angle: ev.angle });
    w.events.length = 0;
  }
  return out;
}

describe('ripple fire', () => {
  const twin = () => battle(['dorsalRing'], { dorsalRing: 'heavyCannon' });

  it('two L guns on one trigger fire in turn, never closer than the ripple gap', () => {
    const fired = shots(twin(), 8, () => ({ fireMain: true }));
    expect(fired.length).toBeGreaterThan(4);
    // They alternate, starting with the main turret.
    fired.forEach((s, i) => expect(s.slot).toBe(i % 2 === 0 ? 'turret' : 'dorsalRing'));
    for (let i = 1; i < fired.length; i++) expect(fired[i]!.t - fired[i - 1]!.t).toBeGreaterThanOrEqual(RIPPLE_GAP - 1e-9);
    // The second gun follows the first after one gap, not one reload.
    expect(fired[1]!.t - fired[0]!.t).toBeCloseTo(RIPPLE_GAP, 1);
  });

  it('each click fires the other gun, even when both are reloaded', () => {
    // Click (one tick) every 4 s: well past the reload, so both guns are ready each time.
    const fired = shots(twin(), 12.5, (t) => ({ fireMain: t % 4 < SIM_DT / 2 }));
    expect(fired.map((s) => s.slot)).toEqual(['turret', 'dorsalRing', 'turret', 'dorsalRing']);
  });

  it('a wrecked gun drops out of the ripple', () => {
    const w = twin();
    w.behemoth.hardpoints.find((h) => h.slot.id === 'dorsalRing')!.integrity.hp = 0;
    const fired = shots(w, 6, () => ({ fireMain: true }));
    expect(fired.length).toBeGreaterThan(1);
    expect(fired.every((s) => s.slot === 'turret')).toBe(true);
    expect(fired[1]!.t - fired[0]!.t).toBeCloseTo(WEAPONS.heavyCannon.reload, 1);
  });

  it('one L gun fires as it always did', () => {
    const fired = shots(battle([], {}), 6, () => ({ fireMain: true }));
    expect(fired[1]!.t - fired[0]!.t).toBeCloseTo(WEAPONS.heavyCannon.reload, 1);
  });
});

describe('coaxial mount', () => {
  it('sits on the main turret, turns with it, and fires on RMB along its facing', () => {
    const w = battle(['coax'], { coax: 'rotaryGun' });
    const b = w.behemoth;
    const coax = b.hardpoints.find((h) => h.slot.id === 'coax')!;
    const main = b.turrets[0]!;
    expect(coax.slot.ring).toBe('main');
    expect(loadMass(b)).toBe(loadMass(battle([], {}).behemoth) + ADDONS.coax.mass + WEAPONS.rotaryGun.mass!);
    // Aim off to the side: the slow turret lags, and the coax fires where the turret points, not
    // at the cursor.
    const fired = shots(w, 0.5, () => ({ fireSecondary: true, aimX: b.x, aimY: b.y - 150 }));
    expect(fired.length).toBeGreaterThan(0);
    const last = fired.at(-1)!;
    const spread = WEAPONS.rotaryGun.projectile.kind === 'bullet' ? WEAPONS.rotaryGun.projectile.spread : 0;
    expect(Math.abs(angleDiff(last.angle, turretWorldAngle(b, main)))).toBeLessThan(spread + 0.1);
    expect(Math.abs(angleDiff(last.angle, -Math.PI / 2))).toBeGreaterThan(0.3);
    // The mount itself rides the turret round.
    main.angle = Math.PI;
    const p = mountPosition(b, coax);
    expect(p.x).toBeLessThan(b.x + main.def.pivot.x);
  });

  it('a depot bolts it on empty; it takes M weapons (autos go on a trigger)', () => {
    const run0 = newRun(11);
    const depot = openDepot({ seed: run0.seed, battle: 1 }, run0.behemoth);
    depot.addons = [{ addon: 'coax', sold: false }];
    depot.stock = [
      { weapon: 'mortar', sold: false },
      { weapon: 'flakCannon', sold: false },
    ];
    let run: RunState = { ...run0, battle: 1, next: 'depot', salvage: 2000, depot };
    expect(quote(run, { kind: 'installAddon', stock: 0 })).toEqual({ ok: true, salvage: DEPOT_ADDONS.coax!.price, actions: 1 });
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    expect(run.behemoth.hardpoints.at(-1)).toEqual({ slot: 'coax', weapon: null, hp: 30, ammo: null, binding: null, shell: null });
    // An auto weapon goes on a trigger there (it can't aim on its own).
    expect(fits(run.behemoth, 'coax', 'mortar')).toBe(true);
    expect(fits(run.behemoth, 'coax', 'flakCannon')).toBe(true);
    expect(fits(newRun(1, 'class2', ['sponsonL']).behemoth, 'sponsonL', 'mortar')).toBe(true);
    run = applyAction(run, { kind: 'install', slot: 'coax', stock: 1 });
    expect(restoreBehemoth(run.behemoth, 0, 0).hardpoints.find((h) => h.slot.id === 'coax')!.weapon?.id).toBe('flakCannon');
  });
});
