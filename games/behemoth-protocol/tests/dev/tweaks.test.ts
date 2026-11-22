import { describe, expect, it } from 'vitest';
import { leaves, TweakStore, type KeyValueStore } from '../../src/dev/tweaks';

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const tables = () => ({
  MOVE: { speed: 10, grip: { ice: 0.2, on: true }, band: [3, 7], name: 'x' },
  UNITS: { tank: { hp: 40 } },
});

describe('dev console: tweaks', () => {
  it('lists number and boolean leaves by path, arrays included, strings skipped', () => {
    const t = tables();
    expect(leaves(t.MOVE).map((l) => l.path)).toEqual(['speed', 'grip.ice', 'grip.on', 'band.0', 'band.1']);
  });

  it('a shared object is listed once, and cycles end', () => {
    const shared = { n: 1 };
    const o: Record<string, unknown> = { a: shared, b: shared };
    o.self = o;
    expect(leaves(o).map((l) => l.path)).toEqual(['a.n']);
  });

  it('sets a value live and keeps it across a reload', () => {
    const store = memory();
    const t = tables();
    const tw = new TweakStore(t, store);
    tw.set('MOVE', 'grip.ice', 0.5);
    tw.set('MOVE', 'band.1', 9);
    expect(t.MOVE.grip.ice).toBe(0.5);
    expect(t.MOVE.band[1]).toBe(9);

    const fresh = tables();
    const again = new TweakStore(fresh, store);
    again.apply();
    expect(fresh.MOVE.grip.ice).toBe(0.5);
    expect(fresh.MOVE.band[1]).toBe(9);
    expect(again.changed('MOVE')).toEqual(['grip.ice', 'band.1']);
  });

  it('setting a value back to its default drops the override', () => {
    const store = memory();
    const t = tables();
    const tw = new TweakStore(t, store);
    tw.set('UNITS', 'tank.hp', 60);
    tw.set('UNITS', 'tank.hp', 40);
    expect(tw.changed('UNITS')).toEqual([]);
    expect(tw.count()).toBe(0);
  });

  it('reset puts the defaults back, one table or all', () => {
    const store = memory();
    const t = tables();
    const tw = new TweakStore(t, store);
    tw.set('MOVE', 'speed', 99);
    tw.set('UNITS', 'tank.hp', 1);
    tw.reset('MOVE');
    expect(t.MOVE.speed).toBe(10);
    expect(t.UNITS.tank.hp).toBe(1);
    tw.reset();
    expect(t.UNITS.tank.hp).toBe(40);
    expect(store.data.size).toBe(0);
  });

  it('ignores saved overrides for paths that no longer exist, or the wrong type', () => {
    const store = memory();
    store.setItem('behemoth-protocol/dev-tweaks', JSON.stringify({ MOVE: { gone: 3, speed: 'fast', 'grip.on': false }, NOPE: { a: 1 } }));
    const t = tables();
    const tw = new TweakStore(t, store);
    tw.apply();
    expect(t.MOVE.speed).toBe(10);
    expect(t.MOVE.grip.on).toBe(false);
    expect(tw.count()).toBe(1);
  });

  it('survives a corrupt save', () => {
    const store = memory();
    store.setItem('behemoth-protocol/dev-tweaks', '{not json');
    expect(() => new TweakStore(tables(), store).apply()).not.toThrow();
  });
});
