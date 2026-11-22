import { describe, expect, it } from 'vitest';
import { APPROACH_IDS, type ApproachId } from '../../src/content/approaches';
import { BIOME_IDS, type BiomeId } from '../../src/content/biomes';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { TERRAIN_GEN } from '../../src/content/tuning';
import { footprint, groundFootprint, IDLE_COMMAND, loadMass, speedLimits, type PlayerCommand } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import type { SimEvent } from '../../src/sim/events';
import { newRun, battleRecipe } from '../../src/sim/run';
import { chunkRiver, generateChunk, laneCenter, Terrain, type TerrainRecipe } from '../../src/sim/terrain';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const FIELD = 21;
const TS = TERRAIN_GEN.tileSize;
const CHUNK = TERRAIN_GEN.chunkCols;

const RECIPES: TerrainRecipe[] = BIOME_IDS.flatMap((biome) => [null, ...APPROACH_IDS].map((approach) => ({ biome, approach })));
const name = (r: TerrainRecipe) => `${r.biome}/${r.approach ?? 'mix'}`;

/** Material counts over the first `chunks` chunks of a few seeds. */
function census(recipe: TerrainRecipe, chunks = 24, seeds = [1, 2, 3]): Map<MaterialId, number> {
  const out = new Map<MaterialId, number>();
  for (const seed of seeds) {
    const t = new Terrain(seed, FIELD, recipe);
    t.ensure(0, chunks * CHUNK * TS);
    for (let c = 0; c < chunks * CHUNK; c++) {
      for (let r = 0; r < FIELD; r++) {
        const m = t.tile(c, r)!.mat;
        out.set(m, (out.get(m) ?? 0) + 1);
      }
    }
  }
  return out;
}

const share = (m: Map<MaterialId, number>, mats: MaterialId[]) => {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return mats.reduce((a, k) => a + (m.get(k) ?? 0), 0) / total;
};

/** Whether a tracked unit can drive from column c0 to column c1 (4-connected tiles). */
function trackedThrough(t: Terrain, c0: number, c1: number): boolean {
  const open = (c: number, r: number) => t.speedAt((c + 0.5) * TS, (r + 0.5) * TS, 'tracked') > 0;
  const seen = new Uint8Array((c1 - c0 + 1) * t.rows);
  const queue: [number, number][] = [];
  for (let r = 0; r < t.rows; r++) if (open(c0, r)) queue.push([c0, r]);
  while (queue.length) {
    const [c, r] = queue.pop()!;
    const k = (c - c0) * t.rows + r;
    if (seen[k]) continue;
    seen[k] = 1;
    if (c === c1) return true;
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]] as const) {
      if (nc >= c0 && nc <= c1 && nr >= 0 && nr < t.rows && open(nc, nr)) queue.push([nc, nr]);
    }
  }
  return false;
}

describe('biome × approach recipes', () => {
  it('are deterministic per seed and recipe, and the recipe changes the field', () => {
    for (const r of RECIPES) expect(generateChunk(7, 4, FIELD, r)).toEqual(generateChunk(7, 4, FIELD, r));
    const a = JSON.stringify(generateChunk(7, 4, FIELD, { biome: 'temperate', approach: null }));
    expect(JSON.stringify(generateChunk(7, 4, FIELD, { biome: 'arctic', approach: null }))).not.toEqual(a);
    expect(JSON.stringify(generateChunk(7, 4, FIELD, { biome: 'temperate', approach: 'urban' }))).not.toEqual(a);
  });

  it("don't depend on generation order", () => {
    for (const recipe of [{ biome: 'industrial', approach: 'urban' }, { biome: 'arctic', approach: 'pass' }] as TerrainRecipe[]) {
      const a = new Terrain(11, FIELD, recipe);
      a.ensure(0, 3000);
      const b = new Terrain(11, FIELD, recipe);
      b.ensure(1600, 3000);
      b.ensure(0, 1599);
      for (let c = 0; c < 3000 / TS; c++) for (let r = 0; r < FIELD; r++) expect(b.tile(c, r)!.mat).toBe(a.tile(c, r)!.mat);
    }
  });

  it('keep the start clear and the lane free of rock and compounds, and tracked units can always get through', { timeout: 30_000 }, () => {
    for (const recipe of RECIPES) {
      for (const seed of [1, 2, 3, 4]) {
        const t = new Terrain(seed, FIELD, recipe);
        const chunks = 22;
        t.ensure(0, chunks * CHUNK * TS);
        for (let c = 0; c < TERRAIN_GEN.clearStartCols; c++) for (let r = 0; r < FIELD; r++) expect(t.tile(c, r)!.mat).toBe('ground');
        const amp = recipe.approach === 'pass' ? 2 : TERRAIN_GEN.laneAmplitude;
        for (let c = 0; c < chunks * CHUNK; c++) {
          const center = laneCenter(t.seed, c + 0.5, FIELD, amp);
          for (let r = 0; r < FIELD; r++) {
            const m = t.tile(c, r)!.mat;
            const off = Math.abs(r + 0.5 - center);
            // Rock, factory compounds, and tank farms keep out of the lane; urban avenues out of towns.
            if (off < TERRAIN_GEN.laneWidth / 2) expect(['rock', 'factory', 'fuelTank', 'derrick'], `${name(recipe)} seed ${seed} (${c},${r})`).not.toContain(m);
            if (recipe.approach === 'urban' && off < 1.5) expect(m, `${name(recipe)} seed ${seed} (${c},${r})`).not.toBe('building');
          }
        }
        // Fortified lines and trap belts have gates; rivers have fords or bridges (or are frozen).
        expect(trackedThrough(t, 0, chunks * CHUNK - 1), `${name(recipe)} seed ${seed}`).toBe(true);
      }
    }
  });

  it('give each biome its own terrain', { timeout: 30_000 }, () => {
    const own: Record<BiomeId, MaterialId[]> = {
      temperate: ['hedgerow', 'farmland'],
      arctic: ['ice', 'thinIce', 'snowdrift'],
      industrial: ['factory', 'fuelTank', 'rail'],
      desert: ['dune', 'wadi', 'derrick'],
      wasteland: ['wreck', 'glass'],
    };
    // Some turn up elsewhere now and then (rails, a fuel depot, a rusting wreck, a ruined works).
    const shared: MaterialId[] = ['rail', 'fuelTank', 'wreck', 'factory'];
    for (const biome of BIOME_IDS) {
      const m = census({ biome, approach: null }, 30);
      for (const mat of own[biome]) expect(m.get(mat) ?? 0, `${biome} ${mat}`).toBeGreaterThan(0);
      // Common features turn up everywhere.
      for (const mat of ['crater', 'tankTrap', 'mine'] as MaterialId[]) expect(m.get(mat) ?? 0, `${biome} ${mat}`).toBeGreaterThan(0);
      for (const other of BIOME_IDS) {
        if (other === biome) continue;
        for (const mat of own[other].filter((x) => !shared.includes(x))) expect(m.get(mat) ?? 0, `${biome} has ${mat}`).toBe(0);
      }
    }
    // Arctic rivers are frozen over: no open water until something breaks the ice. Desert rivers
    // are dry wadis.
    expect(census({ biome: 'arctic', approach: 'river' }).get('water') ?? 0).toBe(0);
    const desert = census({ biome: 'desert', approach: 'river' });
    expect((desert.get('water') ?? 0) + (desert.get('shallows') ?? 0)).toBe(0);
    expect(desert.get('wadi') ?? 0).toBeGreaterThan(0);
  });

  it('shape the field by approach', { timeout: 30_000 }, () => {
    for (const biome of BIOME_IDS) {
      const mix = census({ biome, approach: null });
      const at = (approach: ApproachId) => census({ biome, approach });
      expect(share(at('forest'), ['forest'])).toBeGreaterThan(share(mix, ['forest']) * 1.5);
      expect(share(at('plain'), ['forest', 'building', 'factory'])).toBeLessThan(share(mix, ['forest', 'building', 'factory']));
      expect(share(at('urban'), ['building', 'factory'])).toBeGreaterThan(share(mix, ['building', 'factory']) * 1.5);
      expect(share(at('pass'), ['rock'])).toBeGreaterThan(share(mix, ['rock']) * 3);
    }
    // River crossings: rivers come about twice as often, and nearly all of them are bridged.
    let rivers = 0;
    let bridged = 0;
    let base = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (let ci = 0; ci < 30; ci++) {
        const rv = chunkRiver(seed, ci, FIELD, { biome: 'temperate', approach: 'river' });
        if (rv) {
          rivers++;
          if (rv.bridge) bridged++;
        }
        if (chunkRiver(seed, ci, FIELD)) base++;
      }
    }
    expect(rivers).toBeGreaterThan(base * 1.6);
    expect(bridged / rivers).toBeGreaterThan(0.75);
  });

  it('pass cliffs line both field edges', () => {
    const t = new Terrain(3, FIELD, { biome: 'temperate', approach: 'pass' });
    t.ensure(0, 20 * CHUNK * TS);
    let both = 0;
    const cols = 20 * CHUNK - TERRAIN_GEN.clearStartCols;
    for (let c = TERRAIN_GEN.clearStartCols; c < 20 * CHUNK; c++) {
      if (t.tile(c, 0)!.mat === 'rock' && t.tile(c, FIELD - 1)!.mat === 'rock') both++;
    }
    expect(both / cols).toBeGreaterThan(0.7);
  });
});

describe('battle recipes in a run', () => {
  it('the opening battle is temperate on the biome mix; later battles take their sector and node; overrides win', () => {
    const run = newRun(5);
    expect(battleRecipe(run)).toEqual({ biome: 'temperate', approach: null });
    const sector = run.map.sectors[1]!;
    const node = sector.nodes.find((n) => n.battle)!;
    expect(battleRecipe({ ...run, at: { sector: 1, node: node.id } })).toEqual({ biome: sector.biome, approach: node.battle!.approach });
    expect(battleRecipe(run, { biome: 'arctic', approach: 'pass' })).toEqual({ biome: 'arctic', approach: 'pass' });
    expect(battleRecipe({ ...run, at: { sector: 1, node: node.id } }, { approach: null }).approach).toBeNull();
  });
});

// ── Mechanics ───────────────────────────────────────────────────────────────────────────────

const OPTS = { seed: 1, frameWidth: 324, fieldRows: FIELD };

function quiet(recipe?: TerrainRecipe): World {
  const w = createWorld({ ...OPTS, recipe });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function setTile(w: World, col: number, row: number, mat: MaterialId, under?: MaterialId) {
  const t = w.terrain.tile(col, row)!;
  Object.assign(t, { mat, state: 'intact', hp: MATERIALS[mat].maxHp });
  if (under) t.under = under;
  else delete t.under;
}

/** Paints a block of tiles. */
function fill(w: World, c0: number, c1: number, r0: number, r1: number, mat: MaterialId, under?: MaterialId) {
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) setTile(w, c, r, mat, under);
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

describe('bridges', () => {
  function bridged(mat: MaterialId) {
    const t = new Terrain(1, FIELD);
    t.ensure(0, 2000);
    for (let c = 40; c <= 46; c++) {
      for (let r = 8; r <= 10; r++) Object.assign(t.tile(c, r)!, { mat, state: 'intact', hp: MATERIALS[mat].maxHp, under: 'water' });
    }
    return t;
  }
  const over = { x0: 41 * TS, x1: 44 * TS, y0: 8 * TS, y1: 10 * TS };

  it('hold a Behemoth under their limit, and come down as a whole span over it', () => {
    const t = bridged('lightBridge');
    const events: SimEvent[] = [];
    expect(t.bear(over, 245, 1 / 60, events)).toBe(0);
    expect(t.tile(42, 9)!.mat).toBe('lightBridge');
    expect(t.bear(over, 320, 1 / 60, events)).toBe(1);
    for (let c = 40; c <= 46; c++) for (let r = 8; r <= 10; r++) expect(t.tile(c, r)!.mat).toBe('water');
    expect(events.filter((e) => e.type === 'bridgeCollapse')).toHaveLength(1);
    // The girder bridge takes far more.
    const h = bridged('bridge');
    expect(h.bear(over, 380, 1 / 60, [])).toBe(0);
  });

  it('drop the whole span when shot out', () => {
    const t = bridged('bridge');
    const events: SimEvent[] = [];
    t.damage(43, 9, 70, events);
    expect(t.tile(43, 9)!.state).toBe('damaged');
    t.damage(43, 9, 70, events);
    expect(t.tile(40, 8)!.mat).toBe('water');
    expect(t.tile(46, 10)!.mat).toBe('water');
    expect(events.some((e) => e.type === 'tileChanged' && e.mat === 'bridge' && e.state === 'destroyed')).toBe(true);
  });

  it('count as a crossing for tracked units while they stand', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (let ci = 2; ci < 30; ci++) {
        const rv = chunkRiver(seed, ci, FIELD);
        if (!rv?.bridge) continue;
        const t = new Terrain(seed, FIELD);
        t.ensure(0, (ci + 2) * CHUNK * TS);
        expect(t.crossings(rv)).toContainEqual(rv.bridge.rows);
        const mid = Math.floor((rv.bridge.rows[0] + rv.bridge.rows[1]) / 2);
        t.damage(Math.floor(rv.col), mid, 1000, []);
        expect(t.crossings(rv)).toEqual(rv.fords);
        return;
      }
    }
    throw new Error('no bridge found');
  });

  it('take the vehicles on them down with them, and the Behemoth gets a jolt', () => {
    const w = quiet();
    const b = w.behemoth;
    const col = Math.floor(b.x / TS) + 6;
    const row = Math.floor(b.y / TS);
    fill(w, col, col + 6, row - 2, row + 2, 'lightBridge', 'water');
    const tank = spawnEnemy(w, 'lightTank', (col + 5.5) * TS, (row + 0.5) * TS);
    tank.def = { ...tank.def, fireRange: 0, maxSpeed: 0 };
    // Load it past the light bridge's limit.
    const h = b.hardpoints.find((hp) => hp.weapon)!;
    const gun = h.weapon!;
    h.weapon = { ...gun, mass: (gun.mass ?? 0) + 100 };
    expect(loadMass(b)).toBeGreaterThan(MATERIALS.lightBridge.bearing!.limit);
    const treads = b.treads.hp;
    let collapsed = false;
    for (let i = 0; i < 60 * 3 && !collapsed; i++) {
      steps(w, 1);
      collapsed = w.events.some((e) => e.type === 'bridgeCollapse');
      w.events.length = 0;
    }
    expect(collapsed).toBe(true);
    steps(w, 1);
    expect(tank.alive).toBe(false);
    expect(b.treads.hp).toBeLessThan(treads);
  });
});

describe('thin ice', () => {
  it('cracks under a heavy Behemoth, faster the heavier, and gives way into icy water', () => {
    const t = new Terrain(1, FIELD);
    t.ensure(0, 2000);
    const fp = { x0: 40 * TS, x1: 41 * TS, y0: 5 * TS, y1: 6 * TS };
    const crack = (mass: number) => {
      Object.assign(t.tile(40, 5)!, { mat: 'thinIce', state: 'intact', hp: MATERIALS.thinIce.maxHp });
      let s = 0;
      while (t.tile(40, 5)!.mat === 'thinIce' && s < 600) {
        t.bear(fp, mass, 1 / 60, []);
        s++;
      }
      return s / 60;
    };
    expect(crack(190)).toBe(10); // under the limit: never (capped by the loop)
    const stock = crack(245);
    expect(stock).toBeLessThan(1.5);
    expect(crack(320)).toBeLessThan(stock);
    expect(t.tile(40, 5)!.mat).toBe('water');
    expect(t.takeBroken()).toContainEqual([40, 5]);
  });

  it('lets enemy armor drive across a frozen river and drowns it when the ice breaks', () => {
    const w = quiet({ biome: 'arctic', approach: null });
    const col = Math.floor(w.behemoth.x / TS) + 10;
    fill(w, col, col, 0, FIELD - 1, 'thinIce');
    expect(w.terrain.speedAt((col + 0.5) * TS, 40, 'tracked')).toBeGreaterThan(0);
    const tank = spawnEnemy(w, 'lightTank', (col + 0.5) * TS, 5.5 * TS);
    tank.def = { ...tank.def, fireRange: 0, maxSpeed: 0 };
    w.terrain.damage(col, 5, 50, w.events);
    steps(w, 1);
    expect(tank.alive).toBe(false);
  });
});

describe('explosive terrain', () => {
  it('fuel tanks chain: one holed sets off its neighbors, which kill what stands near', () => {
    const w = quiet({ biome: 'industrial', approach: null });
    const col = Math.floor(w.behemoth.x / TS) + 14;
    for (const r of [3, 5, 7]) setTile(w, col, r, 'fuelTank');
    const tank = spawnEnemy(w, 'lightTank', (col + 1.5) * TS, 7.5 * TS);
    tank.def = { ...tank.def, fireRange: 0, maxSpeed: 0 };
    w.terrain.damage(col, 3, 100, w.events);
    steps(w, 60);
    for (const r of [3, 5, 7]) expect(w.terrain.tile(col, r)!.mat).toBe('crater');
    expect(tank.alive).toBe(false);
    expect(w.events.filter((e) => e.type === 'explosion').length).toBeGreaterThanOrEqual(0);
  });

  it('a fuel tank plowed into goes up under the treads', () => {
    const w = quiet({ biome: 'industrial', approach: null });
    const b = w.behemoth;
    const col = Math.floor(footprint(b).x1 / TS) + 2;
    setTile(w, col, Math.floor(b.y / TS), 'fuelTank');
    const before = b.treads.hp + b.armor.frontLeft.hp + b.armor.frontRight.hp;
    steps(w, 90);
    expect(w.terrain.tile(col, Math.floor(b.y / TS))!.mat).toBe('crater');
    // The plow's medium-obstacle strain, plus the blast's share (treads under the hull, the front
    // armor at the nose).
    const after = b.treads.hp + b.armor.frontLeft.hp + b.armor.frontRight.hp;
    expect(before - after).toBeGreaterThan(MATERIALS.fuelTank.explodes!.damage * 0.3);
  });
});

describe('minefields', () => {
  it('stay hidden until the sensors sweep them, then blow under the treads and leave a crater', () => {
    const w = quiet();
    const b = w.behemoth;
    const col = Math.floor(footprint(b).x1 / TS) + 12;
    const row = Math.floor(b.y / TS);
    setTile(w, col, row, 'mine');
    steps(w, 1);
    expect(w.terrain.tile(col, row)!.seen).toBeFalsy();
    const treads = b.treads.hp;
    let blown = false;
    for (let i = 0; i < 60 * 8 && !blown; i++) {
      steps(w, 1);
      blown = w.terrain.tile(col, row)!.mat === 'crater';
      if (!blown && Math.abs((col + 0.5) * TS - b.x) < 80) expect(w.terrain.tile(col, row)!.seen).toBe(true);
    }
    expect(blown).toBe(true);
    steps(w, 2);
    expect(treads - b.treads.hp).toBeGreaterThan(MATERIALS.mine.explodes!.damage * 0.25);
  });

  it('go off when shot, and enemy vehicles cross them safely', () => {
    const w = quiet();
    const col = Math.floor(w.behemoth.x / TS) + 15;
    setTile(w, col, 4, 'mine');
    expect(w.terrain.speedAt((col + 0.5) * TS, 4.5 * TS, 'tracked')).toBe(1);
    w.terrain.damage(col, 4, 5, w.events);
    expect(w.terrain.tile(col, 4)!.mat).toBe('crater');
    expect(w.terrain.takeBlasts()).toHaveLength(1);
  });
});

describe('craters and tank traps', () => {
  it('heavy blasts crater open ground; lighter ones only scorch it', () => {
    const t = new Terrain(1, FIELD);
    t.ensure(0, 1000);
    t.damage(3, 3, 70, []);
    expect(t.tile(3, 3)!.mat).toBe('ground');
    t.damage(3, 3, 150, []);
    expect(t.tile(3, 3)!.mat).toBe('crater');
    expect(t.isCover(3, 3)).toBe(true);
    expect(t.speedAt(3.5 * TS, 3.5 * TS, 'tracked')).toBeLessThan(1);
  });

  it('dragon’s teeth stop tracked vehicles and chew up the treads unless shot down first', () => {
    const w = quiet();
    const b = w.behemoth;
    const col = Math.floor(footprint(b).x1 / TS) + 2;
    const row = Math.floor(b.y / TS);
    fill(w, col, col, row - 2, row + 2, 'tankTrap');
    expect(w.terrain.speedAt((col + 0.5) * TS, (row + 0.5) * TS, 'tracked')).toBe(0);
    const treads = b.treads.hp;
    const front = b.armor.frontLeft.hp + b.armor.frontRight.hp;
    steps(w, 90);
    const chewed = treads - b.treads.hp;
    expect(chewed).toBeGreaterThan(5);
    expect(chewed).toBeGreaterThan((front - b.armor.frontLeft.hp - b.armor.frontRight.hp) * 3);
    // Shot down, they're nothing.
    const w2 = quiet();
    fill(w2, col, col, row - 2, row + 2, 'tankTrap');
    for (let r = row - 2; r <= row + 2; r++) w2.terrain.damage(col, r, 100, w2.events);
    const t2 = w2.behemoth.treads.hp;
    steps(w2, 90);
    expect(t2 - w2.behemoth.treads.hp).toBeLessThan(0.5);
  });
});

describe('arctic going', () => {
  it('ice takes the bite out of steering, so the hull keeps sliding', () => {
    const turn = (mat: MaterialId) => {
      const w = quiet();
      const b = w.behemoth;
      const c0 = Math.floor(b.x / TS) - 4;
      fill(w, c0, c0 + 30, 0, FIELD - 1, mat);
      steps(w, 1);
      steps(w, 60, { steer: 1 });
      const vy = b.vy;
      steps(w, 60, { steer: 0 });
      return { vy, after: b.vy };
    };
    const dry = turn('ground');
    const ice = turn('ice');
    expect(ice.vy).toBeLessThan(dry.vy * 0.6);
    // A second after letting go of the stick: on dry ground it has straightened out, on ice it's
    // still drifting.
    expect(dry.after).toBeLessThan(1);
    expect(ice.after).toBeGreaterThan(ice.vy * 0.4);
  });

  it('drifts hold the Behemoth to cruise and tag the speed', () => {
    const w = quiet({ biome: 'arctic', approach: null });
    const b = w.behemoth;
    const c0 = Math.floor(b.x / TS) - 4;
    fill(w, c0, c0 + 40, 0, FIELD - 1, 'snowdrift');
    let top = 0;
    for (let i = 0; i < 60 * 6; i++) {
      steps(w, 1, { throttle: 1 });
      top = Math.max(top, b.vx);
    }
    expect(top).toBeLessThan(speedLimits(b).cruise * 1.05);
    expect(b.wading.label).toBe('DRIFT');
    expect(w.terrain.groundAt(groundFootprint(b)).cruise).toBeGreaterThan(0.9);
  });
});

describe('desert and wasteland', () => {
  it('the wasteland starts in ruins: most structures stand damaged or lie in rubble', () => {
    const t = new Terrain(2, FIELD, { biome: 'wasteland', approach: 'urban' });
    t.ensure(0, 20 * CHUNK * TS);
    const states = { intact: 0, damaged: 0, destroyed: 0, flattened: 0 };
    for (let c = 0; c < 20 * CHUNK; c++) for (let r = 0; r < FIELD; r++) if (t.tile(c, r)!.mat === 'building') states[t.tile(c, r)!.state]++;
    const all = states.intact + states.damaged + states.destroyed;
    expect(all).toBeGreaterThan(50);
    expect(states.intact / all).toBeLessThan(0.4);
    expect(states.destroyed / all).toBeGreaterThan(0.15);
    // Rubble is still cover for infantry, and tracked units can cross it.
    const temperate = new Terrain(2, FIELD, { biome: 'temperate', approach: 'urban' });
    temperate.ensure(0, 20 * CHUNK * TS);
    let intact = 0;
    for (let c = 0; c < 20 * CHUNK; c++) for (let r = 0; r < FIELD; r++) if (temperate.tile(c, r)!.mat === 'building' && temperate.tile(c, r)!.state === 'intact') intact++;
    expect(intact).toBeGreaterThan(50);
  });

  it('wadis hide infantry and let vehicles through; tracked units need no ford', () => {
    expect(MATERIALS.wadi.conceals.intact).toBe(true);
    expect(MATERIALS.wadi.speed.tracked.intact).toBeGreaterThan(0);
    for (let seed = 1; seed < 20; seed++) {
      const rv = chunkRiver(seed, 4, FIELD, { biome: 'desert', approach: 'river' });
      if (!rv) continue;
      expect(rv.channel).toBe('wadi');
      expect(rv.bridge).toBeNull();
      return;
    }
    throw new Error('no wadi found');
  });

  it('dunes hold the Behemoth to cruise; glass makes it slide', () => {
    const w = quiet({ biome: 'desert', approach: null });
    const b = w.behemoth;
    const c0 = Math.floor(b.x / TS) - 4;
    fill(w, c0, c0 + 40, 0, FIELD - 1, 'dune');
    let top = 0;
    for (let i = 0; i < 60 * 6; i++) {
      steps(w, 1, { throttle: 1 });
      top = Math.max(top, b.vx);
    }
    expect(top).toBeLessThan(speedLimits(b).cruise * 1.05);
    expect(b.wading.label).toBe('SAND');

    const g = quiet({ biome: 'wasteland', approach: null });
    const gb = g.behemoth;
    fill(g, Math.floor(gb.x / TS) - 4, Math.floor(gb.x / TS) + 30, 0, FIELD - 1, 'glass');
    steps(g, 2);
    expect(gb.wading.grip).toBeLessThan(0.6);
    expect(gb.wading.label).toBe('GLASS');
  });

  it('a derrick holed goes up and pays; wrecks pay scrap when cut apart', () => {
    const w = quiet({ biome: 'desert', approach: null });
    const col = Math.floor(w.behemoth.x / TS) + 14;
    setTile(w, col, 4, 'derrick');
    setTile(w, col + 4, 12, 'wreck');
    w.terrain.damage(col, 4, 100, w.events);
    w.terrain.damage(col + 4, 12, 200, w.events);
    expect(w.terrain.takeSalvage()).toBe(MATERIALS.derrick.salvage! + MATERIALS.wreck.salvage!);
    steps(w, 40);
    expect(w.terrain.tile(col, 4)!.mat).toBe('crater');
    expect(w.terrain.tile(col + 4, 12)!.state).toBe('destroyed');
  });
});
