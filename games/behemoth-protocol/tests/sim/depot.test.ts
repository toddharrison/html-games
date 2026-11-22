import { DEPOT } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../src/content/chassis';
import { DEPOT_WEAPONS } from '../../src/content/depot';
import { WEAPONS, type WeaponId } from '../../src/content/weapons';
import { applyAction, loadOf, openDepot, quote, type DepotAction } from '../../src/sim/depot';
import { loadMass, speedLimits } from '../../src/sim/behemoth';
import { newRun, leaveDepot, restoreBehemoth, type RunState } from '../../src/sim/run';
import { parseRun, serializeRun } from '../../src/save/runSave';

const c = CHASSIS.class2;

/** A run at the depot after one battle, with plenty of salvage and a given stock. */
function atDepot(salvage = 1000, stock?: WeaponId[]): RunState {
  const run = newRun(11);
  const depot = openDepot({ seed: run.seed, battle: 1 });
  if (stock) depot.stock = stock.map((weapon) => ({ weapon, sold: false }));
  return { ...run, battle: 1, next: 'depot', salvage, depot };
}

const hp = (run: RunState, slot: string) => run.behemoth.hardpoints.find((h) => h.slot === slot)!;

describe('depot stock', () => {
  it('is seeded per depot: same run and battle, same goods; no duplicates', () => {
    const a = openDepot({ seed: 5, battle: 2 });
    expect(openDepot({ seed: 5, battle: 2 })).toEqual(a);
    expect(a.actions).toBe(DEPOT.actions);
    expect(a.stock.length).toBeGreaterThanOrEqual(DEPOT.stock[0]);
    expect(a.stock.length).toBeLessThanOrEqual(DEPOT.stock[1]);
    expect(new Set(a.stock.map((i) => i.weapon)).size).toBe(a.stock.length);
    for (const i of a.stock) expect(DEPOT_WEAPONS[i.weapon]).toBeDefined();
    const others = [1, 3, 4, 6].map((battle) => JSON.stringify(openDepot({ seed: 5, battle }).stock));
    expect(others.some((s) => s !== JSON.stringify(a.stock))).toBe(true);
  });

  it('every weapon for sale has a mass', () => {
    for (const id of Object.keys(DEPOT_WEAPONS) as WeaponId[]) expect(WEAPONS[id].mass).toBeGreaterThan(0);
  });

  it('every weapon for sale fits some Class II slot', () => {
    const sizes = new Set(c.hardpoints.map((h) => h.size));
    for (const id of Object.keys(DEPOT_WEAPONS) as WeaponId[]) expect(sizes.has(WEAPONS[id].size!)).toBe(true);
  });
});

describe('depot actions', () => {
  it('a repair restores a component fully, priced by the damage, and uses an action', () => {
    let run = atDepot(500);
    run.behemoth.treads = 40;
    const q = quote(run, { kind: 'repair', component: 'treads' });
    expect(q).toEqual({ ok: true, salvage: DEPOT.repairBase + Math.ceil(60 * DEPOT.perHp.treads), actions: 1 });
    run = applyAction(run, { kind: 'repair', component: 'treads' });
    expect(run.behemoth.treads).toBe(c.treadHp);
    expect(run.salvage).toBe(500 - (q.ok ? q.salvage : 0));
    expect(run.depot!.actions).toBe(DEPOT.actions - 1);
  });

  it('armor is re-plated as one action covering every zone', () => {
    let run = atDepot();
    run.behemoth.armor = { frontLeft: 0, frontRight: 40, rear: 30, left: 80, right: 50 };
    const missing = c.armor.frontLeft + (c.armor.frontRight - 40) + (c.armor.rear - 30) + (c.armor.right - 50);
    expect(quote(run, { kind: 'repairArmor' })).toMatchObject({ salvage: DEPOT.repairBase + Math.ceil(missing * DEPOT.perHp.armor) });
    run = applyAction(run, { kind: 'repairArmor' });
    expect(run.behemoth.armor).toEqual(c.armor);
    expect(run.depot!.actions).toBe(DEPOT.actions - 1);
  });

  it('treads the salvage can not fully cover are patched partway with what is left', () => {
    let run = atDepot(55);
    run.behemoth.treads = 40;
    run.behemoth.addons.push({ id: 'outerTreads', hp: 20 });
    // Full would be 10 + 60 × 1.5 = 100; 55 buys 30 points for 10 + 45.
    const q = quote(run, { kind: 'repair', component: 'treads' });
    expect(q).toEqual({ ok: true, salvage: 55, actions: 1, partial: 30 });
    run = applyAction(run, { kind: 'repair', component: 'treads' });
    expect(run.behemoth.treads).toBe(70);
    expect(run.salvage).toBe(0);
    expect(run.depot!.actions).toBe(DEPOT.actions - 1);

    // The outboard set too: 41 buys floor(31 / 1.5) = 20 points for 40, leaving 1.
    run = { ...run, salvage: 41 };
    expect(quote(run, { kind: 'repair', component: 'outerTreads' })).toEqual({ ok: true, salvage: 40, actions: 1, partial: 20 });
    run = applyAction(run, { kind: 'repair', component: 'outerTreads' });
    expect(run.behemoth.addons.find((a) => a.id === 'outerTreads')!.hp).toBe(40);
    expect(run.salvage).toBe(1);
  });

  it('armor the salvage can not fully cover is re-plated partway, the same share in every zone', () => {
    let run = atDepot(30);
    run.behemoth.armor = { frontLeft: 0, frontRight: 0, rear: 30, left: c.armor.left, right: 50 };
    const missing = c.armor.frontLeft + c.armor.frontRight + (c.armor.rear - 30) + (c.armor.right - 50);
    // 30 buys (30 - 10) / 0.5 = 40 points.
    expect(quote(run, { kind: 'repairArmor' })).toEqual({ ok: true, salvage: 30, actions: 1, partial: 40 });
    run = applyAction(run, { kind: 'repairArmor' });
    const share = 40 / missing;
    expect(run.behemoth.armor.frontLeft).toBeCloseTo(c.armor.frontLeft * share);
    expect(run.behemoth.armor.frontRight).toBeCloseTo(c.armor.frontRight * share);
    expect(run.behemoth.armor.rear).toBeCloseTo(30 + (c.armor.rear - 30) * share);
    expect(run.behemoth.armor.right).toBeCloseTo(50 + (c.armor.right - 50) * share);
    expect(run.behemoth.armor.left).toBe(c.armor.left);
    expect(run.salvage).toBe(0);
  });

  it('other parts only repair in full, and a patch must buy at least one point', () => {
    const run = atDepot(30);
    run.behemoth.sensors = 0;
    run.behemoth.armor.frontLeft = 0;
    expect(quote(run, { kind: 'repair', component: 'sensors' })).toEqual({ ok: false, reason: 'Not enough salvage' });
    // Too little to buy even one point past the flat fee.
    expect(quote({ ...run, salvage: DEPOT.repairBase }, { kind: 'repairArmor' })).toEqual({ ok: false, reason: 'Not enough salvage' });
  });

  it('bringing a destroyed hardpoint back costs extra', () => {
    const run = atDepot();
    hp(run, 'prow').hp = 0;
    const q = quote(run, { kind: 'repair', component: 'prow' });
    expect(q).toMatchObject({ salvage: DEPOT.repairBase + 40 * DEPOT.perHp.hardpoint + DEPOT.reactivate });
    expect(hp(applyAction(run, { kind: 'repair', component: 'prow' }), 'prow').hp).toBe(40);
  });

  it('rearming refills a munitions weapon; unlimited weapons can not be rearmed', () => {
    let run = atDepot();
    hp(run, 'spine').ammo = 4;
    expect(quote(run, { kind: 'rearm', slot: 'spine' })).toMatchObject({ ok: true, salvage: DEPOT.rearmBase + 20 * 3 });
    run = applyAction(run, { kind: 'rearm', slot: 'spine' });
    expect(hp(run, 'spine').ammo).toBe(WEAPONS.missileRack.ammo);
    expect(quote(run, { kind: 'rearm', slot: 'spine' })).toEqual({ ok: false, reason: 'Full' });
    expect(quote(run, { kind: 'rearm', slot: 'turret' })).toEqual({ ok: false, reason: 'No ammo' });
  });

  it('installing needs a slot of the same size; the new weapon is whole and fully loaded', () => {
    let run = atDepot(1000, ['mortar', 'pdGuns', 'siegeHowitzer']);
    expect(quote(run, { kind: 'install', slot: 'flankL', stock: 0 })).toEqual({ ok: false, reason: 'Wrong size' });
    expect(quote(run, { kind: 'install', slot: 'turret', stock: 1 })).toEqual({ ok: false, reason: 'Wrong size' });
    hp(run, 'spine').hp = 3;
    run = applyAction(run, { kind: 'install', slot: 'spine', stock: 0 });
    expect(hp(run, 'spine')).toEqual({ slot: 'spine', weapon: 'mortar', hp: 40, ammo: WEAPONS.mortar.ammo, binding: null, shell: null });
    // The missile rack it displaced sells back at its condition (3 of 40 integrity).
    expect(run.salvage).toBe(1000 - DEPOT_WEAPONS.mortar!.price + Math.floor(DEPOT_WEAPONS.missileRack!.price * DEPOT.resale * (3 / 40)));
    expect(run.depot!.stock[0]!.sold).toBe(true);
    expect(quote(run, { kind: 'install', slot: 'prow', stock: 0 })).toEqual({ ok: false, reason: 'Sold' });
  });

  it('removing a weapon takes no action and pays back its resale value, even with no actions left', () => {
    let run = atDepot(0);
    run.depot!.actions = 0;
    const back = Math.floor(DEPOT_WEAPONS.apGuns!.price * DEPOT.resale);
    expect(quote(run, { kind: 'remove', slot: 'flankL' })).toEqual({ ok: true, salvage: -back, actions: 0 });
    run = applyAction(run, { kind: 'remove', slot: 'flankL' });
    expect(hp(run, 'flankL').weapon).toBeNull();
    expect(run.salvage).toBe(back);
    expect(run.depot!.actions).toBe(0);
    expect(quote(run, { kind: 'remove', slot: 'flankL' })).toEqual({ ok: false, reason: 'Empty' });
    expect(quote(run, { kind: 'repair', component: 'flankL' })).toEqual({ ok: false, reason: 'Empty' });
  });

  it('a swap costs the difference: the displaced weapon sells back at its condition', () => {
    const max = CHASSIS.class2.hardpoints.find((h) => h.id === 'turret')!.hp;
    const price = DEPOT_WEAPONS.siegeHowitzer!.price;
    const swap = (n: number) => {
      const run = atDepot(1000, ['siegeHowitzer']);
      hp(run, 'turret').hp = n;
      return quote(run, { kind: 'install', slot: 'turret', stock: 0 });
    };
    // Heavy cannon (160) out, siege howitzer (200) in.
    expect(swap(max)).toEqual({ ok: true, salvage: price - Math.floor(DEPOT_WEAPONS.heavyCannon!.price * DEPOT.resale), actions: 1 });
    expect(swap(max / 2)).toEqual({ ok: true, salvage: price - Math.floor(DEPOT_WEAPONS.heavyCannon!.price * DEPOT.resale * 0.5), actions: 1 });
    // A wreck is worth nothing.
    expect(swap(0)).toEqual({ ok: true, salvage: price, actions: 1 });
    // Affordability goes by the net price.
    const net = price - Math.floor(DEPOT_WEAPONS.heavyCannon!.price * DEPOT.resale);
    let run = atDepot(net, ['siegeHowitzer']);
    run = applyAction(run, { kind: 'install', slot: 'turret', stock: 0 });
    expect(hp(run, 'turret').weapon).toBe('siegeHowitzer');
    expect(run.salvage).toBe(0);
  });

  it('removing pays back by condition: a damaged weapon sells for less, a wreck for nothing', () => {
    const run = atDepot(0);
    const max = CHASSIS.class2.hardpoints.find((h) => h.id === 'flankL')!.hp;
    hp(run, 'flankL').hp = max / 4;
    expect(quote(run, { kind: 'remove', slot: 'flankL' })).toEqual({ ok: true, salvage: -Math.floor(DEPOT_WEAPONS.apGuns!.price * DEPOT.resale * 0.25), actions: 0 });
    hp(run, 'flankL').hp = 0;
    expect(quote(run, { kind: 'remove', slot: 'flankL' })).toEqual({ ok: true, salvage: 0, actions: 0 });
  });

  it('runs out of actions, and refuses what the salvage can not cover', () => {
    let run = atDepot(1000);
    run.behemoth.treads = 10;
    run.behemoth.sensors = 10;
    run.behemoth.reactor = 10;
    run.behemoth.armor.frontLeft = 0;
    for (const a of [{ kind: 'repair', component: 'treads' }, { kind: 'repair', component: 'sensors' }, { kind: 'repair', component: 'reactor' }] as DepotAction[]) {
      run = applyAction(run, a);
    }
    expect(run.depot!.actions).toBe(0);
    expect(quote(run, { kind: 'repairArmor' })).toEqual({ ok: false, reason: 'No actions left' });
    const before = run;
    expect(applyAction(run, { kind: 'repairArmor' })).toBe(before);

    const poor = atDepot(5);
    poor.behemoth.treads = 10;
    expect(quote(poor, { kind: 'repair', component: 'treads' })).toEqual({ ok: false, reason: 'Not enough salvage' });
    expect(quote(poor, { kind: 'repair', component: 'sensors' })).toEqual({ ok: false, reason: 'Undamaged' });
  });

  it('does not mutate the run it was given', () => {
    const run = atDepot();
    run.behemoth.treads = 20;
    const copy = structuredClone(run);
    applyAction(run, { kind: 'repair', component: 'treads' });
    expect(run).toEqual(copy);
  });

  it('a depot mid-visit survives a save round trip; leaving clears it', () => {
    let run = atDepot(1000, ['mortar', 'pdGuns']);
    run = applyAction(run, { kind: 'install', slot: 'flankR', stock: 1 });
    expect(parseRun(serializeRun(run))).toEqual(run);
    expect(leaveDepot(run).depot).toBeNull();
  });
});

describe('depot load readout', () => {
  it('matches the battle Behemoth, and previews an action without changing the run', () => {
    const run = atDepot(1000, ['siegeHowitzer']);
    run.behemoth.treads = 60;
    const load = loadOf(run.behemoth);
    const b = restoreBehemoth(run.behemoth, 0, 0);
    expect(load.mass).toBe(loadMass(b));
    expect(load.capacity).toBe(c.massCapacity);
    expect(load.cruise).toBeCloseTo(speedLimits(b).cruise, 9);

    const heavier = loadOf(applyAction(run, { kind: 'install', slot: 'turret', stock: 0 }).behemoth);
    expect(heavier.mass).toBe(load.mass - WEAPONS.heavyCannon.mass! + WEAPONS.siegeHowitzer.mass!);
    expect(heavier.cruise).toBeLessThan(load.cruise);
    const stripped = loadOf(applyAction(run, { kind: 'remove', slot: 'turret' }).behemoth);
    expect(stripped.cruise).toBeGreaterThan(load.cruise);
    expect(loadOf(run.behemoth)).toEqual(load);
  });

  it('removing a wrecked weapon lightens the load', () => {
    let run = atDepot();
    hp(run, 'prow').hp = 0;
    const before = loadOf(run.behemoth).mass;
    run = applyAction(run, { kind: 'remove', slot: 'prow' });
    expect(loadOf(run.behemoth).mass).toBe(before - WEAPONS.autocannon.mass!);
  });
});
