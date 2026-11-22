import { describe, expect, it } from 'vitest';
import { ADDONS, type AddonId } from '../../src/content/addons';
import type { ModuleId } from '../../src/content/trailer';
import { ARMOR_ARCS, CHASSIS } from '../../src/content/chassis';
import { DETONATION, MAGAZINE } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import {
  component,
  createBehemoth,
  damageComponent,
  detonationRadius,
  magazineLoad,
  pickInternal,
  type BehemothState,
} from '../../src/sim/behemoth';
import { applyAction, openDepot, quote } from '../../src/sim/depot';
import type { SimEvent } from '../../src/sim/events';
import { newRun, restoreBehemoth, snapshotBehemoth, type RunState } from '../../src/sim/run';
import { parseRun } from '../../src/save/runSave';
import { Rng } from '../../src/sim/rng';

/** The ammo magazine and its cook-off (SPEC §5.1), and blowout panels (§5.5). */

const c = CHASSIS.class2;
const loadout = () => Object.fromEntries(Object.entries(c.loadout).map(([slot, id]) => [slot, WEAPONS[id]]));
const make = (addons: readonly AddonId[] = [], bays: readonly (ModuleId | null)[] = []): BehemothState =>
  createBehemoth(c, loadout(), 0, 0, addons, bays);
const rack = (b: BehemothState) => b.hardpoints.find((h) => h.slot.id === 'spine')!;
const PANELS_HP = ADDONS.blowoutPanels.kind === 'panels' ? ADDONS.blowoutPanels.hp : 0;
const cookOffs = (events: SimEvent[]) => events.filter((e) => e.type === 'cookOff');

describe('magazine', () => {
  it('is a core component that holds the hull munitions (the stock missile rack)', () => {
    const b = make();
    expect(component(b, 'magazine')).toEqual({ hp: c.magazine.hp, max: c.magazine.hp });
    const full = WEAPONS.missileRack.ammo! * (WEAPONS.missileRack.projectile as { damage: number }).damage;
    expect(magazineLoad(b)).toBe(full);
    rack(b).ammo = 0;
    expect(magazineLoad(b)).toBe(0);
  });

  it('is hard to reach from any side, a little easier from behind', () => {
    for (const arc of ARMOR_ARCS) {
      const w = c.internals[arc];
      expect(w.magazine).toBeGreaterThan(0);
      expect(w.magazine).toBeLessThan(Math.max(w.treads, w.reactor, w.sensors));
    }
    expect(c.internals.rear.magazine).toBeGreaterThan(c.internals.frontLeft.magazine);
  });

  it('destroyed with rounds in it, it cooks off: every round is lost, and the hull is torn up from the inside', () => {
    const b = make();
    const events: SimEvent[] = [];
    const blast = magazineLoad(b) * MAGAZINE.perDamage;
    const before = { reactor: b.reactor.hp, fc: b.fireControl.hp, treads: b.treads.hp, turret: b.hardpoints[0]!.integrity.hp, rear: b.armor.rear.hp };
    damageComponent(b, 'magazine', 1000, events);
    expect(cookOffs(events)).toEqual([{ type: 'cookOff', damage: blast, vented: false }]);
    expect(rack(b).ammo).toBe(0);
    expect(rack(b).integrity.hp).toBeLessThan(rack(b).integrity.max);
    expect(b.reactor.hp).toBeLessThan(before.reactor);
    expect(b.fireControl.hp).toBeLessThan(before.fc);
    expect(b.treads.hp).toBeLessThan(before.treads);
    expect(b.armor.rear.hp).toBeLessThan(before.rear);
    // Weapons that don't use the magazine keep working.
    expect(b.hardpoints.find((h) => h.slot.id === 'pd')!.integrity.hp).toBe(b.hardpoints.find((h) => h.slot.id === 'pd')!.integrity.max);
    // Everything the blast did adds up to its size (inside share to neighbors, the rest to the armor).
    const armorLost = ARMOR_ARCS.reduce((sum, arc) => sum + (c.armor[arc] - b.armor[arc].hp), 0);
    expect(armorLost).toBeCloseTo(blast * (1 - MAGAZINE.inside), 5);
  });

  it('fired empty, it is safe: nothing goes off', () => {
    const b = make();
    rack(b).ammo = 0;
    const events: SimEvent[] = [];
    damageComponent(b, 'magazine', 1000, events);
    expect(cookOffs(events)).toEqual([]);
    expect(b.reactor.hp).toBe(c.reactor.hp);
    expect(b.armor.rear.hp).toBe(c.armor.rear);
  });

  it('the blast grows with the rounds left', () => {
    const damageTo = (ammo: number) => {
      const b = make();
      rack(b).ammo = ammo;
      const events: SimEvent[] = [];
      damageComponent(b, 'magazine', 1000, events);
      return c.armor.rear - b.armor.rear.hp;
    };
    expect(damageTo(24)).toBeGreaterThan(damageTo(6));
    expect(damageTo(6)).toBeGreaterThan(0);
  });

  it('a cook-off can set off a failing reactor', () => {
    const b = make();
    b.reactor.hp = 3;
    const events: SimEvent[] = [];
    damageComponent(b, 'magazine', 1000, events);
    expect(b.reactorFuse).not.toBeNull();
  });

  it('trailer pods keep their own rounds', () => {
    const b = make(['trailer'], ['missilePod']);
    const pod = b.hardpoints.find((h) => h.slot.position === 'trailer')!;
    const ammo = pod.ammo;
    damageComponent(b, 'magazine', 1000, []);
    expect(pod.ammo).toBe(ammo);
  });

  it('rounds still in the magazine make the reactor detonation bigger', () => {
    const b = make();
    const full = detonationRadius(b);
    expect(full).toBeCloseTo(c.reactor.blastRadius + magazineLoad(b) * DETONATION.radiusPerMunition, 5);
    rack(b).ammo = 0;
    expect(detonationRadius(b)).toBe(c.reactor.blastRadius);
    expect(full).toBeGreaterThan(c.reactor.blastRadius);
  });
});

describe('blowout panels', () => {
  it('vent a cook-off up and out: the rounds are lost, nothing inside is hurt, and the panels blow off', () => {
    const b = make(['blowoutPanels']);
    const panels = b.addons.find((a) => a.def.id === 'blowoutPanels')!;
    const events: SimEvent[] = [];
    damageComponent(b, 'magazine', 1000, events);
    expect(cookOffs(events)).toEqual([{ type: 'cookOff', damage: expect.any(Number), vented: true }]);
    expect(rack(b).ammo).toBe(0);
    expect(rack(b).integrity.hp).toBe(rack(b).integrity.max);
    expect(b.reactor.hp).toBe(c.reactor.hp);
    for (const arc of ARMOR_ARCS) expect(b.armor[arc].hp).toBe(c.armor[arc]);
    expect(panels.integrity!.hp).toBe(0);
    expect(events).toContainEqual({ type: 'componentDestroyed', component: 'blowoutPanels' });
  });

  it('blown off, they protect nothing until repaired', () => {
    const b = make(['blowoutPanels']);
    b.addons.find((a) => a.def.id === 'blowoutPanels')!.integrity!.hp = 0;
    const events: SimEvent[] = [];
    damageComponent(b, 'magazine', 1000, events);
    expect(cookOffs(events)[0]).toMatchObject({ vented: false });
    expect(b.reactor.hp).toBeLessThan(c.reactor.hp);
  });

  it('incoming fire never picks them', () => {
    expect(ADDONS.blowoutPanels.kind).toBe('panels');
    const b = make(['blowoutPanels']);
    const rng = new Rng(5);
    const picked = new Set<string>();
    for (const arc of ARMOR_ARCS) for (let i = 0; i < 500; i++) picked.add(pickInternal(b, arc, rng));
    expect(picked.has('magazine')).toBe(true);
    expect(picked.has('blowoutPanels')).toBe(false);
  });
});

describe('magazine between battles', () => {
  it('the snapshot keeps its damage, and a depot repairs it (and re-arms the panels)', () => {
    const b = make(['blowoutPanels']);
    damageComponent(b, 'magazine', 1000, []);
    const run0 = newRun(11);
    let run: RunState = { ...run0, battle: 1, next: 'depot', salvage: 1000, behemoth: snapshotBehemoth(b), depot: openDepot({ seed: 11, battle: 1 }) };
    expect(run.behemoth.magazine).toBe(0);
    expect(restoreBehemoth(run.behemoth, 0, 0).magazine.hp).toBe(0);
    const q = quote(run, { kind: 'repair', component: 'magazine' });
    expect(q).toMatchObject({ ok: true, actions: 1 });
    run = applyAction(run, { kind: 'repair', component: 'magazine' });
    expect(run.behemoth.magazine).toBe(c.magazine.hp);
    run = applyAction(run, { kind: 'repair', component: 'blowoutPanels' });
    expect(run.behemoth.addons.find((a) => a.id === 'blowoutPanels')!.hp).toBe(PANELS_HP);
  });

  it('a version 6 save loads with the magazine intact', () => {
    const run = newRun(1);
    const { magazine: _m, ...behemoth } = run.behemoth;
    const loaded = parseRun(JSON.stringify({ version: 6, run: { ...run, behemoth } }));
    expect(loaded?.behemoth.magazine).toBe(c.magazine.hp);
  });
});
