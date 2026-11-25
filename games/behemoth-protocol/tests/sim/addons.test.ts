import { DEPOT } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { ADDONS, type AddonId } from '../../src/content/addons';
import { CHASSIS } from '../../src/content/chassis';
import { DEPOT_ADDONS, DEPOT_WEAPONS } from '../../src/content/depot';
import { OBSTACLE_CLASSES } from '../../src/content/obstacles';
import { WEAPONS } from '../../src/content/weapons';
import { parseRun, serializeRun } from '../../src/save/runSave';
import {
  addonOf,
  applyHit,
  createBehemoth,
  damageComponent,
  damageTreads,
  footprint,
  hullWidth,
  IDLE_COMMAND,
  loadMass,
  massCapacity,
  mountPosition,
  pickInternal,
  ramRating,
  speedLimits,
  treadDrive,
  treadIntegrity,
  treadSpeedScale,
  type BehemothState,
  type PlayerCommand,
} from '../../src/sim/behemoth';
import { applyObstacle } from '../../src/sim/collision';
import { applyAction, loadOf, openDepot, quote } from '../../src/sim/depot';
import type { SimEvent } from '../../src/sim/events';
import { Rng } from '../../src/sim/rng';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { spawnEnemy } from '../../src/sim/enemies';
import { createWorld, stepWorld } from '../../src/sim/world';

const c = CHASSIS.class2;

function make(addons: AddonId[], extra: Record<string, keyof typeof WEAPONS> = {}): BehemothState {
  const ids = { ...c.loadout, ...extra };
  const loadout = Object.fromEntries(Object.entries(ids).map(([slot, id]) => [slot, WEAPONS[id]]));
  return createBehemoth(c, loadout, 100, 128, addons);
}

const outer = (b: BehemothState) => addonOf(b, 'outerTreads')!.integrity!;
const plow = (b: BehemothState) => addonOf(b, 'ramPlow')!.integrity!;

describe('add-ons on the Behemoth', () => {
  it('sponsons add hardpoints; unknown add-ons and repeats are dropped', () => {
    const b = make(['sponsonL', 'sponsonL', 'nope' as AddonId, 'sponsonR'], { sponsonL: 'autocannon' });
    expect(b.addons.map((a) => a.def.id)).toEqual(['sponsonL', 'sponsonR']);
    const ids = b.hardpoints.map((h) => h.slot.id);
    expect(ids.slice(0, c.hardpoints.length)).toEqual(c.hardpoints.map((s) => s.id));
    expect(ids.slice(c.hardpoints.length)).toEqual(['sponsonL', 'sponsonR']);
    expect(b.hardpoints.find((h) => h.slot.id === 'sponsonL')!.weapon?.id).toBe('autocannon');
    expect(b.hardpoints.find((h) => h.slot.id === 'sponsonR')!.weapon).toBeNull();
    // A sponson's integrity is its hardpoint's.
    expect(addonOf(b, 'sponsonL')!.integrity).toBeNull();
  });

  it('every add-on weighs; the outboard treads add capacity and widen the hull', () => {
    const bare = make([]);
    const b = make(['ramPlow', 'outerTreads', 'sponsonL']);
    expect(loadMass(b)).toBe(loadMass(bare) + ADDONS.ramPlow.mass + ADDONS.outerTreads.mass + ADDONS.sponsonL.mass);
    expect(massCapacity(b)).toBe(c.massCapacity + (ADDONS.outerTreads.kind === 'treads' ? ADDONS.outerTreads.capacity : 0));
    expect(hullWidth(bare)).toBe(c.width);
    expect(hullWidth(b)).toBe(56);
    const fp = footprint(b);
    expect(fp.y1 - fp.y0).toBe(56);
  });

  it('two gun sponsons overload one tread set; the outboard treads carry them', () => {
    const heavy = { sponsonL: 'rotaryGun', sponsonR: 'rotaryGun' } as const;
    const one = make(['sponsonL', 'sponsonR'], heavy);
    const two = make(['sponsonL', 'sponsonR', 'outerTreads'], heavy);
    expect(loadMass(one)).toBeGreaterThan(massCapacity(one));
    expect(loadMass(two)).toBeLessThan(massCapacity(two));
    expect(speedLimits(two).cruise).toBeGreaterThan(speedLimits(one).cruise * 1.5);
  });
});

describe('tread sets', () => {
  it('with one set, drive is just that set’s speed scale', () => {
    const b = make([]);
    b.treads.hp = 40;
    expect(treadDrive(b)).toBeCloseTo(treadSpeedScale(0.4), 12);
  });

  it('a wrecked outboard set fades out of the drive and takes its capacity with it', () => {
    const b = make(['outerTreads']);
    const events: SimEvent[] = [];
    outer(b).hp = 1;
    expect(treadDrive(b)).toBeGreaterThan(0.99);
    damageComponent(b, 'outerTreads', 10, events);
    expect(treadDrive(b)).toBe(1);
    expect(massCapacity(b)).toBe(c.massCapacity);
    expect(b.immobilized).toBe(false);
    expect(events.some((e) => e.type === 'componentDestroyed' && e.component === 'outerTreads')).toBe(true);
    expect(treadIntegrity(b)).toBeCloseTo(0.5);
  });

  it('losing the inner set is not fatal while the outer one runs; losing both is', () => {
    const b = make(['outerTreads']);
    const events: SimEvent[] = [];
    damageComponent(b, 'treads', 1e6, events);
    expect(b.immobilized).toBe(false);
    expect(speedLimits(b).cruise).toBeGreaterThan(0);
    damageComponent(b, 'outerTreads', 1e6, events);
    expect(b.immobilized).toBe(true);
    expect(events.filter((e) => e.type === 'immobilized')).toHaveLength(1);
  });

  it('damage with no arc is shared so each set loses the same share; Infinity wrecks them all', () => {
    const b = make(['outerTreads']);
    damageTreads(b, 50, []);
    expect(b.treads.hp / b.treads.max).toBeCloseTo(outer(b).hp / outer(b).max);
    expect(b.treads.hp + outer(b).hp).toBeCloseTo(b.treads.max + outer(b).max - 50);
    damageTreads(b, Infinity, []);
    expect(b.immobilized).toBe(true);
  });

  it('the outboard pods take most tread hits from the flanks, about half from the front', () => {
    const b = make(['outerTreads']);
    const rng = new Rng(3);
    const count = (arc: 'left' | 'frontLeft') => {
      let inner = 0;
      let out = 0;
      for (let i = 0; i < 4000; i++) {
        const id = pickInternal(b, arc, rng);
        if (id === 'treads') inner++;
        if (id === 'outerTreads') out++;
      }
      return { inner, out };
    };
    const flank = count('left');
    expect(flank.out / (flank.out + flank.inner)).toBeCloseTo(0.8, 1);
    const front = count('frontLeft');
    expect(front.out / (front.out + front.inner)).toBeCloseTo(0.5, 1);
    // The treads' total share of the draw is the same as with one set.
    const bare = make([]);
    let treadsBare = 0;
    for (let i = 0; i < 4000; i++) if (pickInternal(bare, 'left', rng) === 'treads') treadsBare++;
    expect((flank.inner + flank.out) / treadsBare).toBeCloseTo(1, 1);
  });

  it('infantry rockets (a tread strike) hit the outboard pods first from the side', () => {
    const b = make(['outerTreads']);
    const rng = new Rng(5);
    for (let i = 0; i < 60; i++) applyHit(b, 'right', 1, rng, [], 0, 0, { target: 'treads', bypass: 1 });
    expect(outer(b).max - outer(b).hp).toBeGreaterThan((b.treads.max - b.treads.hp) * 2);
  });
});

describe('ram plow', () => {
  it('incoming fire skips it and strikes the front armor', () => {
    const b = make(['ramPlow']);
    applyHit(b, 'frontLeft', 30, new Rng(1), [], 0, 0);
    expect(plow(b).hp).toBe(plow(b).max);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max - 30);
  });

  it('rams wear it first, then spill into the front half that struck, and it breaks off', () => {
    const b = make(['ramPlow']);
    const events: SimEvent[] = [];
    // Struck right of the centerline, hard enough to spend the plow and then some.
    const ram = OBSTACLE_CLASSES.heavy.armorDamage;
    let rams = 0;
    while (plow(b).hp > 0) {
      b.vx = c.speed.cruise;
      applyObstacle(b, 'heavy', events, b.x + 30, b.y + 10);
      rams++;
      expect(rams).toBeLessThan(1000);
    }
    const dealt = rams * ram * 0.4; // ram gear 0.6 while it held
    expect(dealt).toBeGreaterThanOrEqual(plow(b).max);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.armor.frontRight.max - b.armor.frontRight.hp).toBeCloseTo(dealt - plow(b).max, 6);
    expect(events.filter((e) => e.type === 'componentDestroyed' && e.component === 'ramPlow')).toHaveLength(1);
    expect(events.some((e) => e.type === 'componentDamaged' && e.component === 'ramPlow')).toBe(true);
  });

  it('is ram gear while it holds: less ram damage and a smaller speed dip', () => {
    const bare = make([]);
    const rammer = make(['ramPlow']);
    expect(ramRating(bare)).toBe(0);
    expect(ramRating(rammer)).toBeCloseTo(0.6);
    for (const b of [bare, rammer]) {
      b.vx = c.speed.cruise;
      applyObstacle(b, 'heavy', [], 0, 0);
    }
    expect(rammer.vx).toBeGreaterThan(bare.vx);
    // The plow soaks the armor share; the treads still strain, but much less.
    expect(rammer.armor.frontLeft.hp).toBe(rammer.armor.frontLeft.max);
    expect(rammer.armor.frontRight.hp).toBe(rammer.armor.frontRight.max);
    expect(plow(rammer).max - plow(rammer).hp).toBeCloseTo(OBSTACLE_CLASSES.heavy.armorDamage * 0.4, 6);
    const strain = (b: BehemothState) => b.treads.max - b.treads.hp;
    expect(strain(rammer)).toBeCloseTo(strain(bare) * 0.4, 6);
    plow(rammer).hp = 0;
    expect(ramRating(rammer)).toBe(0);
  });
});

describe('sponson weapons in battle', () => {
  it('a sponson autocannon fires on the secondary trigger at targets on its side', () => {
    const run = newRun(1, 'class2', ['sponsonL'], { sponsonL: 'autocannon' });
    const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: run.behemoth });
    w.encounter.off = true;
    w.behemoth.autoEnabled.fill(false);
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 20, b.y - 70);
    e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0, hp: 1000 };
    e.hp = 1000;
    const cmd: PlayerCommand = { ...IDLE_COMMAND, fireSecondary: true };
    let fired = 0;
    for (let i = 0; i < 120; i++) {
      stepWorld(w, { ...cmd, aimX: e.x, aimY: e.y });
      fired += w.events.filter((ev) => ev.type === 'fire' && ev.slot === 'sponsonL').length;
      w.events.length = 0;
    }
    expect(fired).toBeGreaterThan(0);
  });
});

describe('dorsal turret ring', () => {
  it('adds a second turret ring with an L slot that turns with it; arrives empty', () => {
    const b = make(['dorsalRing']);
    expect(b.turrets.map((t) => t.def.id)).toEqual(['main', 'dorsal']);
    const slot = b.hardpoints.find((h) => h.slot.id === 'dorsalRing')!;
    expect(slot.slot.size).toBe('L');
    expect(slot.weapon).toBeNull();
    expect(addonOf(b, 'dorsalRing')!.integrity).toBeNull();
    expect(loadMass(b)).toBe(loadMass(make([])) + ADDONS.dorsalRing.mass);
    // It sits aft of the main ring and turns about its own pivot.
    const dorsal = b.turrets[1]!;
    dorsal.angle = Math.PI / 2;
    const p = mountPosition(b, slot);
    expect(p.x).toBeCloseTo(b.x + dorsal.def.pivot.x, 9);
    expect(p.y).toBeCloseTo(b.y, 9);
  });

  it('both main guns fire on the main trigger, each from its own turret', () => {
    const run = newRun(1, 'class2', ['dorsalRing'], { dorsalRing: 'heavyCannon' });
    const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: run.behemoth });
    w.encounter.off = true;
    w.behemoth.autoEnabled.fill(false);
    const b = w.behemoth;
    const shots = new Map<string, { x: number }>();
    for (let i = 0; i < 240; i++) {
      stepWorld(w, { ...IDLE_COMMAND, fireMain: true, aimX: b.x + 150, aimY: b.y });
      for (const ev of w.events) if (ev.type === 'fire' && ev.slot) shots.set(ev.slot, { x: ev.x - b.x });
      w.events.length = 0;
    }
    expect([...shots.keys()].sort()).toEqual(['dorsalRing', 'turret']);
    // The dorsal gun's muzzle is behind the main gun's (same barrel length, pivot further aft).
    expect(shots.get('dorsalRing')!.x).toBeLessThan(shots.get('turret')!.x);
  });

  it('a depot bolts it on empty; it takes an L gun; the save keeps both', () => {
    const run0 = newRun(11);
    const depot = openDepot({ seed: run0.seed, battle: 1 }, run0.behemoth);
    depot.addons = [{ addon: 'dorsalRing', sold: false }];
    depot.stock = [
      { weapon: 'rotaryGun', sold: false },
      { weapon: 'siegeHowitzer', sold: false },
    ];
    let run: RunState = { ...run0, battle: 1, next: 'depot', salvage: 2000, depot };
    expect(quote(run, { kind: 'installAddon', stock: 0 })).toEqual({ ok: true, salvage: DEPOT_ADDONS.dorsalRing!.price, actions: 1 });
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    expect(run.behemoth.hardpoints.at(-1)).toEqual({ slot: 'dorsalRing', weapon: null, hp: 60, ammo: null, binding: null, shell: null });
    expect(quote(run, { kind: 'install', slot: 'dorsalRing', stock: 0 }).ok).toBe(false);
    run = applyAction(run, { kind: 'install', slot: 'dorsalRing', stock: 1 });
    expect(parseRun(serializeRun(run))).toEqual(run);
    const b = restoreBehemoth(run.behemoth, 0, 0);
    expect(b.turrets).toHaveLength(2);
    expect(b.hardpoints.find((h) => h.slot.id === 'dorsalRing')!.weapon?.id).toBe('siegeHowitzer');
  });
});

describe('add-ons at the depot', () => {
  /** A run at the depot with plenty of salvage and the given add-ons for sale. */
  function atDepot(addons: AddonId[], salvage = 2000): RunState {
    const run = newRun(11);
    const depot = openDepot({ seed: run.seed, battle: 1 }, run.behemoth);
    depot.addons = addons.map((addon) => ({ addon, sold: false }));
    return { ...run, battle: 1, next: 'depot', salvage, depot };
  }

  it('each depot stocks 1–2 add-ons, seeded, never ones already fitted', () => {
    for (let battle = 1; battle < 40; battle++) {
      const d = openDepot({ seed: 9, battle });
      expect(d.addons.length).toBeGreaterThanOrEqual(DEPOT.addonStock[0]);
      expect(d.addons.length).toBeLessThanOrEqual(DEPOT.addonStock[1]);
      expect(new Set(d.addons.map((a) => a.addon)).size).toBe(d.addons.length);
      expect(openDepot({ seed: 9, battle })).toEqual(d);
    }
    const fitted = newRun(9, 'class2', ['ramPlow', 'outerTreads', 'sponsonL', 'dorsalRing', 'coax', 'blowoutPanels', 'trailer']).behemoth;
    // What's left to offer: the other sponson, the twin turret, and a trailer bigger than the one in tow.
    const seen = new Set<string>();
    for (let battle = 1; battle < 40; battle++) {
      for (const a of openDepot({ seed: 9, battle }, fitted).addons) seen.add(a.addon);
    }
    expect([...seen].sort()).toEqual(['heavyTrailer', 'sponsonR', 'twinTurret']);
  });

  it('the weapons on sale do not depend on the add-ons', () => {
    const fitted = newRun(9, 'class2', ['ramPlow']).behemoth;
    expect(openDepot({ seed: 9, battle: 3 }, fitted).stock).toEqual(openDepot({ seed: 9, battle: 3 }, newRun(9).behemoth).stock);
  });

  it('bolting on a sponson costs an action; it arrives empty and takes an M weapon', () => {
    let run = atDepot(['sponsonR']);
    run.depot!.stock = [{ weapon: 'rotaryGun', sold: false }];
    expect(quote(run, { kind: 'installAddon', stock: 0 })).toEqual({ ok: true, salvage: DEPOT_ADDONS.sponsonR!.price, actions: 1 });
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    expect(run.depot!.actions).toBe(DEPOT.actions - 1);
    expect(run.depot!.addons[0]!.sold).toBe(true);
    expect(run.behemoth.hardpoints.at(-1)).toEqual({ slot: 'sponsonR', weapon: null, hp: 40, ammo: null, binding: null, shell: null });
    expect(quote(run, { kind: 'install', slot: 'sponsonR', stock: 0 }).ok).toBe(true);
    run = applyAction(run, { kind: 'install', slot: 'sponsonR', stock: 0 });
    expect(restoreBehemoth(run.behemoth, 0, 0).hardpoints.find((h) => h.slot.id === 'sponsonR')!.weapon?.id).toBe('rotaryGun');
  });

  it('removing a sponson takes its weapon with it, and both sell back', () => {
    const run = { ...atDepot([]), behemoth: newRun(11, 'class2', ['sponsonL'], { sponsonL: 'autocannon' }).behemoth };
    const before = loadOf(run.behemoth).mass;
    const back = Math.floor(DEPOT_ADDONS.sponsonL!.price * DEPOT.resale) + Math.floor(DEPOT_WEAPONS.autocannon!.price * DEPOT.resale);
    expect(quote(run, { kind: 'removeAddon', addon: 'sponsonL' })).toEqual({ ok: true, salvage: -back, actions: 0 });
    const after = applyAction(run, { kind: 'removeAddon', addon: 'sponsonL' });
    expect(after.salvage).toBe(run.salvage + back);
    expect(after.behemoth.addons).toEqual([]);
    expect(after.behemoth.hardpoints.some((h) => h.slot === 'sponsonL')).toBe(false);
    expect(loadOf(after.behemoth).mass).toBe(before - ADDONS.sponsonL.mass - WEAPONS.autocannon.mass!);
    expect(after.depot!.actions).toBe(DEPOT.actions);
  });

  it("can't bolt on the same add-on twice", () => {
    let run = atDepot(['ramPlow', 'ramPlow']);
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    expect(quote(run, { kind: 'installAddon', stock: 1 })).toEqual({ ok: false, reason: 'Fitted' });
  });

  it('the prow and outboard treads repair like armor and treads; the load readout counts them', () => {
    let run = atDepot(['ramPlow', 'outerTreads']);
    run = applyAction(run, { kind: 'installAddon', stock: 0 });
    run = applyAction(run, { kind: 'installAddon', stock: 1 });
    const load = loadOf(run.behemoth);
    expect(load.capacity).toBe(c.massCapacity + 140);
    run.behemoth.addons.find((a) => a.id === 'ramPlow')!.hp = 20;
    run.behemoth.addons.find((a) => a.id === 'outerTreads')!.hp = 0;
    expect(loadOf(run.behemoth).capacity).toBe(c.massCapacity);
    expect(quote(run, { kind: 'repair', component: 'ramPlow' })).toEqual({ ok: true, salvage: DEPOT.repairBase + 60 * DEPOT.perHp.plow, actions: 1 });
    expect(quote(run, { kind: 'repair', component: 'outerTreads' })).toEqual({ ok: true, salvage: DEPOT.repairBase + 100 * DEPOT.perHp.treads, actions: 1 });
    run = applyAction(run, { kind: 'repair', component: 'outerTreads' });
    expect(run.behemoth.addons.find((a) => a.id === 'outerTreads')!.hp).toBe(100);
    expect(loadOf(run.behemoth).capacity).toBe(c.massCapacity + 140);
  });
});

describe('add-ons carry over', () => {
  it('snapshot and restore keep add-ons and their damage', () => {
    const b = make(['ramPlow', 'outerTreads', 'sponsonR'], { sponsonR: 'missileRack' });
    plow(b).hp = 12;
    outer(b).hp = 34;
    b.hardpoints.find((h) => h.slot.id === 'sponsonR')!.ammo = 3;
    const back = restoreBehemoth(snapshotBehemoth(b), 0, 0);
    expect(back.addons.map((a) => a.def.id)).toEqual(['ramPlow', 'outerTreads', 'sponsonR']);
    expect(plow(back).hp).toBe(12);
    expect(outer(back).hp).toBe(34);
    expect(back.hardpoints.find((h) => h.slot.id === 'sponsonR')!.ammo).toBe(3);
  });

  it('round-trips through the save, and a version 1 save loads with no add-ons', () => {
    const run: RunState = { ...newRun(4, 'class2', ['outerTreads', 'sponsonL']), depot: openDepot({ seed: 4, battle: 1 }), next: 'depot' };
    expect(parseRun(serializeRun(run))).toEqual(run);
    const v1 = JSON.parse(serializeRun(newRun(4)));
    v1.version = 1;
    delete v1.run.behemoth.addons;
    v1.run.next = 'depot';
    v1.run.depot = { actions: 3, stock: [{ weapon: 'mortar', sold: false }] };
    const loaded = parseRun(JSON.stringify(v1))!;
    expect(loaded.behemoth.addons).toEqual([]);
    expect(loaded.depot!.addons).toEqual([]);
    const bad = JSON.parse(serializeRun(run));
    bad.run.behemoth.addons[0].id = 'jetpack';
    expect(parseRun(JSON.stringify(bad))).toBeNull();
  });
});

describe('the wider hull', () => {
  it('with outboard treads, generated rock still never boxes it in driving blind', () => {
    let contacts = 0;
    for (const seed of [1, 2, 8, 12, 18, 39]) {
      const w = createWorld({ seed, frameWidth: 324, fieldRows: 21, behemoth: newRun(seed, 'class2', ['outerTreads']).behemoth });
      w.encounter.off = true;
      const rng = new Rng(seed);
      let steer: -1 | 0 | 1 = 0;
      for (let i = 0; i < 60 * 180; i++) {
        if (i % 90 === 0) steer = rng.pick([-1, 0, 0, 1] as const);
        const was = w.behemoth.deflect.dir;
        stepWorld(w, { ...IDLE_COMMAND, steer, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
        if (was === 0 && w.behemoth.deflect.dir !== 0) contacts++;
        for (const e of w.events) {
          if (e.type === 'tileChanged' && w.terrain.tile(e.col, e.row)?.mat === 'rock') throw new Error(`seed ${seed}: crumbled rock`);
        }
        w.events.length = 0;
      }
    }
    expect(contacts).toBeGreaterThan(0);
  });
});
