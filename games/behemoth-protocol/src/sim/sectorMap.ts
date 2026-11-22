import { APPROACH_IDS, type ApproachId } from '../content/approaches';
import { BIOMES, BIOME_IDS, type BiomeId } from '../content/biomes';
import { DIRECTIVES, type DirectiveId } from '../content/directives';
import { DOCTRINES, DOCTRINE_IDS, type DoctrineId } from '../content/doctrines';
import { MODES, MODE_IDS, type BattleModeId } from '../content/modes';
import { ENCOUNTER, RUN, SECTOR_MAP } from '../content/tuning';
import { Rng, hashSeed } from './rng';

/**
 * The sector map (SPEC §3, §3.1): a run is a few sectors, each a biome, climbed as a layered route
 * of nodes. Every route through a sector starts at its entry node (sector 1: a battle; later ones: a
 * forward depot), branches through battles and depots, passes a depot, and ends at the sector's
 * objective battle. Battle nodes carry intel (approach, defenders, strength, reward), some of it
 * fogged until the node is close. Generated once from the run seed and kept in the run save, so a
 * content change never reshapes a map mid-run. Plain data. The run's Directive (SPEC §3) sets the
 * mode of every sector's objective battle.
 */

export type NodeKind = 'battle' | 'depot';
/** The battle's mode (SPEC §4.4): what it asks beyond reaching the extraction line. */
export type BattleMode = BattleModeId;
export type Strength = 'normal' | 'strong' | 'objective';
export type IntelField = 'approach' | 'doctrine' | 'strength' | 'reward';
export const INTEL_FIELDS: readonly IntelField[] = ['approach', 'doctrine', 'strength', 'reward'];

export interface BattleIntel {
  /** The battle's own seed (terrain and combat). */
  seed: number;
  /** Null: the biome's own balanced mix. */
  approach: ApproachId | null;
  doctrine: DoctrineId;
  mode: BattleMode;
  strength: Strength;
  /** Sizes the battle's defenders and alert waves (SPEC §7). */
  threat: number;
  /** Salvage for reaching the extraction line. */
  salvage: number;
  /** A supply cache: +1 action at the next depot. */
  cache: boolean;
  /** Fields hidden while the node is two or more steps away. */
  fog: IntelField[];
  /** Fields hidden even one step away (a subset of `fog`). */
  deep: IntelField[];
}

export interface MapNode {
  /** Index in its sector's `nodes`. */
  id: number;
  /** Step up the sector's route: 0 = entry, `layers - 1` = objective. */
  layer: number;
  /** Lane across the map, 0 … columns − 1 (fractional for the single entry and objective nodes). */
  col: number;
  kind: NodeKind;
  /** Nodes in the next layer this one leads to (empty for the objective). */
  next: number[];
  battle: BattleIntel | null;
}

export interface Sector {
  biome: BiomeId;
  layers: number;
  nodes: MapNode[];
}

export interface SectorMap {
  sectors: Sector[];
}

export interface MapPos {
  sector: number;
  node: number;
}

/** @param directive sets every objective battle's mode; null draws it like any other battle's. */
export function generateMap(seed: number, directive: DirectiveId | null = null): SectorMap {
  const biomes = sectorBiomes(seed);
  let offset = 0;
  const sectors = biomes.map((biome, s) => {
    const sector = generateSector(seed, s, biome, offset);
    offset += sector.layers;
    return sector;
  });
  const map = { sectors };
  if (directive) setObjectiveModes(map, directive);
  return map;
}

/** Every sector's objective battle in the Directive's mode (everything else about the map stays). */
export function setObjectiveModes(map: SectorMap, directive: DirectiveId): void {
  for (const sector of map.sectors) {
    const intel = sector.nodes.find((n) => n.layer === sector.layers - 1)?.battle;
    if (intel) intel.mode = DIRECTIVES[directive].mode;
  }
}

/** The sector's objective battle node. */
export function objectiveNode(map: SectorMap, sector: number): MapNode | undefined {
  const s = map.sectors[sector];
  return s?.nodes.find((n) => n.layer === s.layers - 1);
}

/** A biome per sector, no repeats; each biome only from its `earliestSector`. */
function sectorBiomes(seed: number): BiomeId[] {
  const rng = new Rng(hashSeed(seed, 0xb10e));
  const out: BiomeId[] = [];
  for (let s = 0; s < SECTOR_MAP.sectors; s++) {
    if (s === 0 && SECTOR_MAP.firstBiome) {
      out.push(SECTOR_MAP.firstBiome);
      continue;
    }
    const pool = BIOME_IDS.filter((id) => !out.includes(id) && (BIOMES[id].earliestSector ?? 1) <= s + 1);
    out.push(pool.length > 0 ? rng.pick(pool) : rng.pick(BIOME_IDS));
  }
  return out;
}

function generateSector(seed: number, s: number, biome: BiomeId, layerOffset: number): Sector {
  const rng = new Rng(hashSeed(seed, 0x5ec7, s));
  const layers = rng.int(SECTOR_MAP.layers[0], SECTOR_MAP.layers[1]);
  const cols = SECTOR_MAP.columns;
  const last = layers - 1;
  const depotLayer = layers - 2;

  // Random walks up the lanes from layer 1 to the depot layer; a walk never crosses another's edge.
  const cells = new Set<string>();
  const edges = new Set<string>();
  const lanes = shuffle(rng, Array.from({ length: cols }, (_, i) => i)).slice(0, Math.min(cols, SECTOR_MAP.walks));
  for (let c of lanes) {
    for (let k = 1; k <= depotLayer; k++) {
      cells.add(`${k}:${c}`);
      if (k === depotLayer) break;
      let n = Math.max(0, Math.min(cols - 1, c + rng.int(-1, 1)));
      if (n !== c && edges.has(`${k}:${n}>${c}`)) n = c;
      edges.add(`${k}:${c}>${n}`);
      c = n;
    }
  }

  const nodes: MapNode[] = [];
  const add = (layer: number, col: number) => nodes.push({ id: nodes.length, layer, col, kind: 'battle', next: [], battle: null });
  add(0, (cols - 1) / 2);
  for (let k = 1; k <= depotLayer; k++) {
    for (let c = 0; c < cols; c++) if (cells.has(`${k}:${c}`)) add(k, c);
  }
  add(last, (cols - 1) / 2);
  const inLayer = (k: number) => nodes.filter((n) => n.layer === k);
  for (const n of nodes) {
    if (n.layer === 0) n.next = inLayer(1).map((m) => m.id);
    else if (n.layer === depotLayer) n.next = [nodes.length - 1];
    else if (n.layer < depotLayer) n.next = inLayer(n.layer + 1).filter((m) => edges.has(`${n.layer}:${n.col}>${m.col}`)).map((m) => m.id);
  }

  // The greedy pass can be cornered where routes merge (a depot on one, two battles on the other),
  // so it's redrawn until every route keeps the rules, keeping the best try.
  let best: NodeKind[] = [];
  let fewest = Infinity;
  for (let attempt = 0; attempt < 40 && fewest > 0; attempt++) {
    assignKinds(rng, nodes, s, layers);
    const broken = brokenRoutes(nodes);
    if (broken < fewest) {
      fewest = broken;
      best = nodes.map((n) => n.kind);
    }
  }
  nodes.forEach((n, i) => (n.kind = best[i]!));

  // Intel for the battles. Siblings get different approaches where there are enough to go round.
  for (let k = 0; k < layers; k++) {
    let approaches: (ApproachId | null)[] = [];
    for (const n of inLayer(k)) {
      if (n.kind !== 'battle') continue;
      if (approaches.length === 0) approaches = shuffle(rng, [null, ...APPROACH_IDS]);
      n.battle = battleIntel(rng, seed, s, n, layers, layerOffset, approaches.pop()!);
    }
  }
  return { biome, layers, nodes };
}

/**
 * Battles and depots. The entry is a battle in sector 1 and a forward depot after that; the layer
 * before the objective is all depots. Elsewhere a node is a depot by chance, never right after
 * another depot, and always once a route has had `maxBattleRun` battles in a row.
 */
function assignKinds(rng: Rng, nodes: MapNode[], s: number, layers: number): void {
  const depotLayer = layers - 2;
  const parents = (n: MapNode) => nodes.filter((p) => p.next.includes(n.id));
  // Battles in a row on the longest route into each node (0 for a depot).
  const run = new Map<number, number>();
  for (const n of nodes) {
    const ps = parents(n);
    const before = Math.max(0, ...ps.map((p) => run.get(p.id) ?? 0));
    if (n.layer === 0) n.kind = s === 0 ? 'battle' : 'depot';
    else if (n.layer === depotLayer) n.kind = 'depot';
    else if (n.layer === layers - 1) n.kind = 'battle';
    else {
      // The layer just before the depot layer must be battles, so a battle two before it makes a run of two.
      const forcedAfter = n.layer === depotLayer - 2 ? 1 : 0;
      const depotOk = !ps.some((p) => p.kind === 'depot') && n.layer !== depotLayer - 1;
      const battleOk = before + 1 + forcedAfter <= SECTOR_MAP.maxBattleRun;
      n.kind = depotOk && (!battleOk || rng.chance(SECTOR_MAP.depotChance)) ? 'depot' : 'battle';
    }
    run.set(n.id, n.kind === 'depot' ? 0 : before + 1);
  }
}

/** Routes with two depots in a row or more than `maxBattleRun` battles in a row. */
function brokenRoutes(nodes: MapNode[]): number {
  let broken = 0;
  const walk = (n: MapNode, run: number, prev: NodeKind | null) => {
    const r = n.kind === 'battle' ? run + 1 : 0;
    if (r > SECTOR_MAP.maxBattleRun || (prev === 'depot' && n.kind === 'depot')) {
      broken++;
      return;
    }
    for (const id of n.next) walk(nodes[id]!, r, n.kind);
  };
  walk(nodes[0]!, 0, null);
  return broken;
}

function battleIntel(rng: Rng, seed: number, s: number, n: MapNode, layers: number, layerOffset: number, drawn: ApproachId | null): BattleIntel {
  const opening = s === 0 && n.layer === 0;
  const objective = n.layer === layers - 1;
  const strength: Strength = objective ? 'objective' : !opening && rng.chance(SECTOR_MAP.strong.chance) ? 'strong' : 'normal';
  const extra = strength === 'objective' ? SECTOR_MAP.objective : strength === 'strong' ? SECTOR_MAP.strong : { threat: 0, salvage: 0 };
  const doctrine: DoctrineId = opening || objective ? 'combined' : rng.weighted(DOCTRINE_IDS, (id) => DOCTRINES[id].weight)!;
  const fog: IntelField[] = [];
  const deep: IntelField[] = [];
  if (!opening) {
    // An objective always shows as one.
    for (const f of INTEL_FIELDS.filter((x) => !objective || x !== 'strength')) {
      if (!rng.chance(SECTOR_MAP.fog.far[f])) continue;
      fog.push(f);
      if (rng.chance(SECTOR_MAP.fog.deep)) deep.push(f);
    }
  }
  return {
    // The opening battle uses the run seed itself, so `?seed=N` still names a known battlefield.
    seed: opening ? seed >>> 0 : hashSeed(seed, 0xba77, s, n.id),
    approach: opening ? null : drawn,
    doctrine,
    // On its own stream, so modes left every other field of the maps they were added to alone.
    // The opening battle is a plain Assault: it teaches the basics, and `?seed=N` stays the same fight.
    mode: opening ? 'assault' : new Rng(hashSeed(seed, 0x30de, s, n.id)).weighted(MODE_IDS, (m) => MODES[m].weight)!,
    strength,
    threat: ENCOUNTER.baseThreat + Math.round((layerOffset + n.layer) * SECTOR_MAP.threatPerLayer) + extra.threat,
    salvage: RUN.extractionBonus + extra.salvage,
    cache: !opening && rng.chance(SECTOR_MAP.cacheChance),
    fog,
    deep,
  };
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ── Getting around ──────────────────────────────────────────────────────────────────────────────

export function nodeAt(map: SectorMap, pos: MapPos): MapNode | undefined {
  return map.sectors[pos.sector]?.nodes[pos.node];
}

export const samePos = (a: MapPos | null, b: MapPos | null) => !!a && !!b && a.sector === b.sector && a.node === b.node;

/**
 * Where the Behemoth can go from `at` (null: the run's start). After a sector's objective, the next
 * sector's entry; after the last sector's, nowhere (the run is won).
 */
export function reachable(map: SectorMap, at: MapPos | null): MapPos[] {
  const entry = (sector: number) => map.sectors[sector]?.nodes.filter((n) => n.layer === 0).map((n) => ({ sector, node: n.id })) ?? [];
  if (!at) return entry(0);
  const node = nodeAt(map, at);
  if (!node) return [];
  if (node.next.length > 0) return node.next.map((id) => ({ sector: at.sector, node: id }));
  return entry(at.sector + 1);
}

/** The last sector's objective: winning it completes the run. */
export function isFinalNode(map: SectorMap, pos: MapPos): boolean {
  const sector = map.sectors[pos.sector];
  return pos.sector === map.sectors.length - 1 && !!sector && nodeAt(map, pos)?.layer === sector.layers - 1;
}

/**
 * Intel fields the player can't see yet on a battle node. `near`: one step away (or nearer);
 * `sensors`: the Behemoth's sensor grade (Gen 2 sees through deep fog, Gen 3 through all of it).
 */
export function hiddenIntel(intel: BattleIntel, near: boolean, sensors: number): IntelField[] {
  if (sensors >= 3) return [];
  if (near) return sensors >= 2 ? [] : intel.deep;
  return intel.fog;
}

/** Whether `to` is still ahead of `from` in the same sector (on some route from it). */
export function onRouteFrom(map: SectorMap, from: MapPos | null, to: MapPos): boolean {
  if (!from) return to.sector === 0;
  if (from.sector !== to.sector) return to.sector > from.sector;
  const nodes = map.sectors[from.sector]!.nodes;
  const seen = new Set<number>();
  const stack = [...nodes[from.node]!.next];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === to.node) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...nodes[id]!.next);
  }
  return false;
}

/** The depot stock's seed key for a depot node, so sibling depots sell different goods. */
export function depotKey(pos: MapPos): number {
  return hashSeed(0xd390, pos.sector, pos.node);
}
