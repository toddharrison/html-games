import { describe, expect, it } from 'vitest';
import { ARMOR_ARCS, CHASSIS } from '../../src/content/chassis';
import { MAP_EVENTS, MAP_EVENT_IDS, type MapEventId } from '../../src/content/mapEvents';
import { SECTOR_MAP } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import { canChoose, changePart, chooseEventOption, drawOutcome, effectLines, lastEventOutcome, nextBattles, rearmAll, shiftThreat } from '../../src/sim/mapEvents';
import { hashSeed } from '../../src/sim/rng';
import { enterMapNode, newRun, runWhere, type RunState } from '../../src/sim/run';
import { generateMap, hiddenEvent, hiddenIntel, nodeAt, onRouteFrom, reachable, revealSector, type MapPos } from '../../src/sim/sectorMap';
import { parseRun, serializeRun } from '../../src/save/runSave';

const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);

/** A run standing at an event node of sector 1 (the first node past the opening battle, made the event asked for). */
function atEvent(id: MapEventId, seed = 3, salvage = 200): RunState {
  let run: RunState = { ...newRun(seed), salvage };
  const start = reachable(run.map, null)[0]!;
  run = { ...run, at: start, path: [start] };
  const pos = reachable(run.map, start)[0]!;
  const node = nodeAt(run.map, pos)!;
  node.kind = 'event';
  node.battle = null;
  node.event = { id, seed: hashSeed(seed, 0xe7e8, pos.sector, pos.node), fog: false };
  return enterMapNode(run, pos);
}

/** The option index whose drawn outcome is `outcome` on some seed, and that seed. */
function seedFor(id: MapEventId, option: number, outcome: number): number {
  for (let seed = 1; seed < 500; seed++) {
    const run = atEvent(id, seed);
    const ev = nodeAt(run.map, run.at!)!.event!;
    if (drawOutcome(ev.seed, id, option) === outcome) return seed;
  }
  throw new Error('no seed draws that outcome');
}

describe('event content', () => {
  it('every event has options with outcomes; the last option does nothing', () => {
    for (const id of MAP_EVENT_IDS) {
      const def = MAP_EVENTS[id];
      expect(def.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of def.options) {
        expect(opt.outcomes.length).toBeGreaterThan(0);
        for (const o of opt.outcomes) expect(o.weight).toBeGreaterThan(0);
      }
      const last = def.options.at(-1)!;
      expect(last.cost ?? 0).toBe(0);
      expect(last.outcomes.every((o) => o.effects.length === 0)).toBe(true);
    }
  });

  it('every line uses only characters the pixel font has', () => {
    const ok = /^[A-Za-z0-9 .,:;'\-/%!?+()*<>=#]*$/;
    for (const def of Object.values(MAP_EVENTS)) {
      const lines = [def.title, def.text, def.teaser, ...def.options.flatMap((o) => [o.label, o.hint, ...o.outcomes.map((x) => x.text)])];
      for (const l of lines) expect(l, l).toMatch(ok);
    }
  });
});

describe('events on the map', () => {
  it('never at an entry or an objective; event nodes carry an event and no battle', () => {
    let events = 0;
    for (const seed of SEEDS) {
      for (const sector of generateMap(seed).sectors) {
        for (const n of sector.nodes) {
          if (n.kind !== 'event') continue;
          events++;
          expect(n.layer).toBeGreaterThan(0);
          expect(n.layer).toBeLessThan(sector.layers - 1);
          expect(n.battle).toBeNull();
          expect(MAP_EVENT_IDS).toContain(n.event!.id);
        }
      }
    }
    // A few a map, across every lane.
    expect(events / SEEDS.length).toBeGreaterThan(2);
    expect(events / SEEDS.length).toBeLessThan(8);
  });

  it('siblings are never the same event, and none repeats until every kind has come up', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      const dealt = map.sectors.flatMap((s) => s.nodes.filter((n) => n.event).map((n) => n.event!.id));
      expect(new Set(dealt.slice(0, MAP_EVENT_IDS.length)).size).toBe(Math.min(dealt.length, MAP_EVENT_IDS.length));
      for (const s of map.sectors) {
        for (let k = 0; k < s.layers; k++) {
          const ids = s.nodes.filter((n) => n.layer === k && n.event).map((n) => n.event!.id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    }
  });

  it('events leave every remaining battle as it was drawn (their own stream)', () => {
    // The opening battle still uses the run seed, and its intel is untouched.
    for (const seed of SEEDS.slice(0, 10)) expect(generateMap(seed).sectors[0]!.nodes[0]!.battle!.seed).toBe(seed);
  });

  it('a fogged event hides its kind two steps out; near, or with Gen 3 sensors, it shows', () => {
    const intel = { id: 'convoy' as const, seed: 1, fog: true };
    expect(hiddenEvent(intel, false, 1)).toBe(true);
    expect(hiddenEvent(intel, true, 1)).toBe(false);
    expect(hiddenEvent(intel, false, 3)).toBe(false);
    expect(hiddenEvent({ ...intel, fog: false }, false, 1)).toBe(false);
    expect(SECTOR_MAP.eventFog).toBeGreaterThan(0);
  });

  it('entering an event node opens the event', () => {
    const run = atEvent('convoy');
    expect(run.next).toBe('event');
    expect(run.depot).toBeNull();
    expect(runWhere(run)).toBe('at an event, sector 1');
  });
});

describe('choosing', () => {
  it('applies the drawn outcome, records it, and returns to the map', () => {
    const run = atEvent('convoy');
    const ev = nodeAt(run.map, run.at!)!.event!;
    const outcome = drawOutcome(ev.seed, 'convoy', 0);
    const after = chooseEventOption(run, 0);
    expect(after.next).toBe('map');
    expect(after.lastEvent).toEqual({ id: 'convoy', option: 0, outcome });
    expect(after.salvage).toBeGreaterThan(run.salvage);
    // The same choice always turns out the same way.
    expect(chooseEventOption(run, 0)).toEqual(after);
    // The run passed in is left alone.
    expect(run.next).toBe('event');
  });

  it('refuses an option it cannot pay for, and does nothing away from an event', () => {
    const poor = atEvent('scavengers', 3, 10);
    expect(canChoose(poor, 0)).toBe(false);
    expect(chooseEventOption(poor, 0)).toBe(poor);
    const rich = atEvent('scavengers', 3, 100);
    const after = chooseEventOption(rich, 0);
    expect(after.salvage).toBe(100 - MAP_EVENTS.scavengers.options[0]!.cost!);
    expect(after.next).toBe('map');
    const map = { ...rich, next: 'map' as const };
    expect(chooseEventOption(map, 0)).toBe(map);
  });

  it('driving on changes nothing but the step', () => {
    const run = atEvent('dump');
    const last = MAP_EVENTS.dump.options.length - 1;
    const after = chooseEventOption(run, last);
    expect(after.behemoth).toEqual(run.behemoth);
    expect(after.salvage).toBe(run.salvage);
    expect(after.cache).toBe(run.cache);
  });

  it('a mined convoy hurts the treads; a clean one only pays', () => {
    const mined = atEvent('convoy', seedFor('convoy', 0, 1));
    const after = chooseEventOption(mined, 0);
    expect(after.behemoth.treads).toBeLessThan(mined.behemoth.treads);
    const clean = atEvent('convoy', seedFor('convoy', 0, 0));
    expect(chooseEventOption(clean, 0).behemoth.treads).toBe(clean.behemoth.treads);
  });

  it('the outcome text and effect lines come back for the result screen', () => {
    const after = chooseEventOption(atEvent('drop'), 0);
    const out = lastEventOutcome(after)!;
    expect(out.title).toBe('Stray supply drop');
    expect(out.lines).toContain('+1 action at the next depot');
    expect(lastEventOutcome(newRun(1))).toBeNull();
  });
});

describe('effects', () => {
  const chassis = CHASSIS.class2;

  it('treads: repair adds a share of full integrity up to full; damage stops at 5%', () => {
    const s = structuredClone(newRun(1).behemoth);
    s.treads = 20;
    changePart(s, 'treads', 0.3);
    expect(s.treads).toBeCloseTo(20 + 0.3 * chassis.treadHp);
    changePart(s, 'treads', 0.9);
    expect(s.treads).toBe(chassis.treadHp);
    s.treads = 8;
    changePart(s, 'treads', -0.5);
    expect(s.treads).toBeCloseTo(0.05 * chassis.treadHp);
  });

  it('treads: outboard sets mend and wear by their own size', () => {
    const s = structuredClone(newRun(1, 'class2', ['outerTreads']).behemoth);
    const outer = s.addons.find((a) => a.id === 'outerTreads')!;
    outer.hp = 40;
    changePart(s, 'treads', 0.2);
    expect(outer.hp).toBeCloseTo(60);
  });

  it('armor: a repair re-plates a share of what each zone is missing', () => {
    const s = structuredClone(newRun(1).behemoth);
    for (const arc of ARMOR_ARCS) s.armor[arc] = 0;
    changePart(s, 'armor', 0.4);
    for (const arc of ARMOR_ARCS) expect(s.armor[arc]).toBeCloseTo(0.4 * chassis.armor[arc]);
  });

  it('rearm fills every munitions weapon', () => {
    const s = structuredClone(newRun(1).behemoth);
    const rack = s.hardpoints.find((h) => h.ammo !== null)!;
    rack.ammo = 0;
    rearmAll(s);
    expect(rack.ammo).toBe(WEAPONS[rack.weapon!].ammo);
  });

  it('reveal clears the fog off the whole sector', () => {
    const map = generateMap(4);
    revealSector(map, 1);
    for (const n of map.sectors[1]!.nodes) {
      if (n.battle) expect(hiddenIntel(n.battle, false, 1)).toEqual([]);
      if (n.event) expect(n.event.fog).toBe(false);
    }
  });

  it('threat: the next battles, or every battle ahead in the sector; never below 1; the shift is kept', () => {
    const map = generateMap(6);
    const at: MapPos = { sector: 0, node: 0 };
    const next = nextBattles(map, at).map((p) => nodeAt(map, p)!.battle!);
    expect(next.length).toBeGreaterThan(0);
    const before = next.map((b) => b.threat);
    shiftThreat(map, at, 2, 'next');
    next.forEach((b, i) => {
      expect(b.threat).toBe(before[i]! + 2);
      expect(b.shift).toBe(2);
    });
    shiftThreat(map, at, -2, 'next');
    for (const b of next) expect(b.shift).toBeUndefined();
    const objective = map.sectors[0]!.nodes.at(-1)!.battle!;
    const t = objective.threat;
    shiftThreat(map, at, -1, 'sector');
    expect(objective.threat).toBe(t - 1);
    shiftThreat(map, at, -100, 'sector');
    expect(objective.threat).toBe(1);
    // The next sector is untouched.
    expect(map.sectors[1]!.nodes.every((n) => !n.battle?.shift)).toBe(true);
  });

  it('the next battles look past depots and events to the first battle on each route', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const map = generateMap(seed);
      for (const n of map.sectors[1]!.nodes) {
        const at = { sector: 1, node: n.id };
        const found = nextBattles(map, at);
        if (n.next.length > 0) expect(found.length).toBeGreaterThan(0);
        for (const p of found) {
          expect(nodeAt(map, p)!.kind).toBe('battle');
          // Nothing between: every node on the way there from here isn't a battle.
          expect(onRouteFrom(map, at, p) || p.sector > at.sector).toBe(true);
        }
      }
    }
  });

  it('describes each effect in a line', () => {
    expect(
      effectLines([
        { kind: 'salvage', amount: 40 },
        { kind: 'damage', part: 'treads', share: 0.12 },
        { kind: 'threat', amount: -2, scope: 'next' },
      ]),
    ).toEqual(['+40 salvage', 'Treads -12%', 'Defenders weakened (-2): next battles']);
  });
});

describe('the save', () => {
  it('round-trips an event in progress and one decided', () => {
    const run = atEvent('orders');
    expect(parseRun(serializeRun(run))).toEqual(run);
    const after = chooseEventOption(run, 0);
    expect(parseRun(serializeRun(after))).toEqual(after);
  });

  it('rejects an event step away from an event node, and an unknown event', () => {
    const run = atEvent('orders');
    expect(parseRun(serializeRun({ ...run, at: { sector: 0, node: 0 } }))).toBeNull();
    const bad = structuredClone(run);
    nodeAt(bad.map, bad.at!)!.event!.id = 'nope' as MapEventId;
    expect(parseRun(serializeRun(bad))).toBeNull();
    expect(parseRun(serializeRun({ ...run, next: 'map', lastEvent: { id: 'orders', option: 9, outcome: 0 } }))).toBeNull();
  });

  it('a version 11 save loads with every battle clear, no events, and none decided', () => {
    const run = newRun(9);
    const old = structuredClone(run) as unknown as { map: { sectors: { nodes: Record<string, unknown>[] }[] }; lastEvent?: unknown };
    delete old.lastEvent;
    for (const s of old.map.sectors) {
      s.nodes = s.nodes
        .filter((n) => n['kind'] !== 'event')
        .map((n) => {
          const { event: _e, ...rest } = n;
          const battle = rest['battle'] as Record<string, unknown> | null;
          if (battle) delete battle['condition'];
          return rest;
        });
      s.nodes.forEach((n, i) => {
        n['id'] = i;
        n['next'] = [];
      });
    }
    const loaded = parseRun(JSON.stringify({ version: 11, run: old }))!;
    expect(loaded).not.toBeNull();
    expect(loaded.lastEvent).toBeNull();
    for (const s of loaded.map.sectors)
      for (const n of s.nodes) {
        expect(n.event).toBeNull();
        if (n.battle) expect(n.battle.condition).toBeNull();
      }
  });
});
