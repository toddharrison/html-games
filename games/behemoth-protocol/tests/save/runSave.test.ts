import { describe, expect, it } from 'vitest';
import { clearRun, loadRun, parseRun, RUN_SAVE_KEY, saveRun, serializeRun, type StorageLike } from '../../src/save/runSave';
import { enterMapNode, newRun } from '../../src/sim/run';
import { generateMap } from '../../src/sim/sectorMap';
import { CHASSIS } from '../../src/content/chassis';

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('run save', () => {
  it('round-trips a run', () => {
    const run = { ...newRun(7), battle: 2, salvage: 140, next: 'depot' as const };
    run.behemoth.treads = 33;
    const store = memory();
    expect(saveRun(run, store)).toBe(true);
    expect(loadRun(store)).toEqual(run);
  });

  it('round-trips a run partway up the map', () => {
    let run = enterMapNode(newRun(12), { sector: 0, node: 0 });
    run = { ...run, next: 'map', cache: 1, battle: 1 };
    run = enterMapNode(run, { sector: 0, node: run.map.sectors[0]!.nodes[0]!.next[0]! });
    expect(parseRun(serializeRun(run))).toEqual(run);
  });

  it('migrates a version 8 save onto a fresh map from its seed, keeping the Behemoth', () => {
    const { map: _m, at: _a, path: _p, cache: _c, ...old } = { ...newRun(21), battle: 3, salvage: 90, next: 'battle' as const };
    old.behemoth.treads = 40;
    const loaded = parseRun(JSON.stringify({ version: 8, run: old }))!;
    expect(loaded).toMatchObject({ next: 'map', at: null, path: [], cache: 0, battle: 3, salvage: 90, depot: null });
    expect(loaded.map).toEqual(generateMap(21));
    expect(loaded.behemoth.treads).toBe(40);
    const atDepot = parseRun(JSON.stringify({ version: 8, run: { ...old, next: 'depot', depot: { actions: 2, stock: [], addons: [], modules: [], grades: [] } } }))!;
    expect(atDepot.next).toBe('depot');
    expect(atDepot.depot).toMatchObject({ actions: 2, total: 3 });
  });

  it('migrates a version 9 save: the callsign its seed draws', () => {
    const { callsign: _c, ...old } = newRun(33);
    const loaded = parseRun(JSON.stringify({ version: 9, run: old }))!;
    expect(loaded.callsign).toBe(newRun(33).callsign);
  });

  it('rejects a broken map or a battle with no node', () => {
    const bad = (edit: (run: Record<string, any>) => void) => {
      const file = JSON.parse(serializeRun(enterMapNode(newRun(3), { sector: 0, node: 0 })));
      edit(file.run);
      return parseRun(JSON.stringify(file));
    };
    expect(bad(() => {})).not.toBeNull();
    expect(bad((r) => (r.map.sectors[0].biome = 'moon'))).toBeNull();
    expect(bad((r) => (r.map.sectors[0].nodes[0].next = [99]))).toBeNull();
    expect(bad((r) => (r.map.sectors[0].nodes[0].battle.doctrine = 'zerg'))).toBeNull();
    expect(bad((r) => (r.at = { sector: 9, node: 0 }))).toBeNull();
    expect(bad((r) => (r.at = null))).toBeNull();
    expect(bad((r) => (r.next = 'lunch'))).toBeNull();
  });

  it('clearing removes it', () => {
    const store = memory();
    saveRun(newRun(1), store);
    clearRun(store);
    expect(loadRun(store)).toBeNull();
  });

  it('rejects other versions, garbage, and malformed runs', () => {
    expect(parseRun('not json')).toBeNull();
    expect(parseRun(JSON.stringify({ version: 999, run: newRun(1) }))).toBeNull();
    const bad = JSON.parse(serializeRun(newRun(1)));
    bad.run.behemoth.hardpoints[0].weapon = 'noSuchGun';
    expect(parseRun(JSON.stringify(bad))).toBeNull();
    const noArmor = JSON.parse(serializeRun(newRun(1)));
    delete noArmor.run.behemoth.armor.rear;
    expect(parseRun(JSON.stringify(noArmor))).toBeNull();
  });

  it('migrates a version 4 save: the single front zone splits into two halves, same share each', () => {
    const run = newRun(1);
    const { frontLeft: _l, frontRight: _r, ...rest } = run.behemoth.armor;
    const v4 = { version: 4, run: { ...run, behemoth: { ...run.behemoth, armor: { ...rest, front: 90 } } } };
    const loaded = parseRun(JSON.stringify(v4));
    const half = CHASSIS.class2.armor.frontLeft * 0.75;
    expect(loaded?.behemoth.armor).toEqual({ ...rest, frontLeft: half, frontRight: half });
  });

  it('migrates a version 4 armored prow to the ram plow, fitted or for sale', () => {
    const run = newRun(1);
    const { frontLeft: _l, frontRight: _r, ...rest } = run.behemoth.armor;
    const behemoth = { ...run.behemoth, armor: { ...rest, front: 120 }, addons: [{ id: 'armoredProw', hp: 30 }] };
    const depot = { actions: 3, stock: [], addons: [{ addon: 'armoredProw', sold: false }], modules: [] };
    const loaded = parseRun(JSON.stringify({ version: 4, run: { ...run, next: 'depot', behemoth, depot } }));
    expect(loaded?.behemoth.addons).toEqual([{ id: 'ramPlow', hp: 30 }]);
    expect(loaded?.depot?.addons).toEqual([{ addon: 'ramPlow', sold: false }]);
  });

  it('migrates a version 5 save: every gun on its default shell', () => {
    const run = newRun(1);
    const hardpoints = run.behemoth.hardpoints.map(({ shell: _s, ...h }) => h);
    const loaded = parseRun(JSON.stringify({ version: 5, run: { ...run, behemoth: { ...run.behemoth, hardpoints } } }));
    expect(loaded?.behemoth.hardpoints.every((h) => h.shell === null)).toBe(true);
  });

  it('keeps a chosen shell and rejects an unknown one', () => {
    const run = newRun(1);
    run.behemoth.hardpoints.find((h) => h.slot === 'turret')!.shell = 'ap';
    expect(parseRun(serializeRun(run))?.behemoth.hardpoints.find((h) => h.slot === 'turret')?.shell).toBe('ap');
    const bad = JSON.parse(serializeRun(run));
    bad.run.behemoth.hardpoints[0].shell = 'nuke';
    expect(parseRun(JSON.stringify(bad))).toBeNull();
  });

  it('survives storage that throws or is missing', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(saveRun(newRun(1), broken)).toBe(false);
    expect(loadRun(broken)).toBeNull();
    expect(() => clearRun(broken)).not.toThrow();
    expect(saveRun(newRun(1), null)).toBe(false);
    expect(loadRun(null)).toBeNull();
  });

  it('uses a namespaced key', () => {
    const store = memory();
    saveRun(newRun(1), store);
    expect([...store.data.keys()]).toEqual([RUN_SAVE_KEY]);
  });
});
