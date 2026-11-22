import { MODES } from '../content/modes';
import { ADDONS } from '../content/addons';
import { APPROACHES } from '../content/approaches';
import { BIOMES } from '../content/biomes';
import { ARMOR_ARCS, CHASSIS } from '../content/chassis';
import { DIRECTIVES, type DirectiveId } from '../content/directives';
import { CONDITIONS } from '../content/conditions';
import { DOCTRINES } from '../content/doctrines';
import { MAP_EVENTS, type MapEventId } from '../content/mapEvents';
import { DEPOT } from '../content/tuning';
import { GRADES, TRACKS } from '../content/upgrades';
import { TRAILER_MODULES } from '../content/trailer';
import { BINDINGS, SHELL_TYPES, WEAPONS } from '../content/weapons';
import { callsignFor, RUN_NEXT, type RunState } from '../sim/run';
import { generateMap, INTEL_FIELDS, nodeAt, objectiveNode, setObjectiveModes, type MapPos, type SectorMap } from '../sim/sectorMap';

/**
 * The run save (SPEC §2, §12): versioned JSON in localStorage, written only at node boundaries
 * (after a battle is won, and on leaving a depot) and deleted when the reactor goes. Resuming
 * mid-battle restarts that battle from its start. The profile save (unlocks, NG+) comes in M5.
 */

export const RUN_SAVE_KEY = 'behemoth-protocol/run';
/**
 * 2: add-ons (on the Behemoth and in the depot's stock). 3: the trailer and its modules.
 * 4: hardpoint bindings and the fire-control component. 5: the front armor split into two halves,
 * and the armored prow became the ram plow. 6: main-gun shell types. 7: the ammo magazine.
 * 8: component grades and mods (and grades for sale). 9: the sector map (the route, where the run
 * is, supply caches) and the depot's opening action count. 10: the Behemoth's callsign. 11: the
 * Directive, each sector's objective result, and the run's totals (salvage earned, time in battle).
 * 12: conditions on battle nodes, event nodes (and `next: 'event'`), and the last event's result.
 * Older saves are migrated on load.
 */
export const RUN_SAVE_VERSION = 12;

/** The slice of the Storage API the save needs, so tests can pass a plain map. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SaveFile {
  version: number;
  run: RunState;
}

export function serializeRun(run: RunState): string {
  const file: SaveFile = { version: RUN_SAVE_VERSION, run };
  return JSON.stringify(file);
}

/** The saved run, or null when the text isn't a save this version can load. */
export function parseRun(text: string): RunState | null {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(file)) return null;
  const v = file['version'];
  const migrations = [fromV1, fromV2, fromV3, fromV4, fromV5, fromV6, fromV7, fromV8, fromV9, fromV10, fromV11];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > RUN_SAVE_VERSION) return null;
  const run = migrations.slice(v - 1).reduce((r, migrate) => migrate(r), file['run']);
  return isRun(run) ? run : null;
}

/** Version 1 predates add-ons: none on the Behemoth, none for sale. */
function fromV1(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['behemoth'])) return run;
  const depot = run['depot'];
  return { ...run, behemoth: { ...run['behemoth'], addons: [] }, depot: isObject(depot) ? { ...depot, addons: [] } : depot };
}

/** Version 2 predates the trailer: none on the Behemoth, no modules for sale. */
function fromV2(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['behemoth'])) return run;
  const depot = run['depot'];
  return { ...run, behemoth: { ...run['behemoth'], trailer: null }, depot: isObject(depot) ? { ...depot, modules: [] } : depot };
}

/** Version 3 predates bindings and fire control: every weapon on its default, fire control intact. */
function fromV3(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['behemoth'])) return run;
  const b = run['behemoth'];
  const chassis = typeof b['chassis'] === 'string' ? CHASSIS[b['chassis'] as keyof typeof CHASSIS] : undefined;
  const hps = Array.isArray(b['hardpoints']) ? b['hardpoints'].map((h) => (isObject(h) ? { ...h, binding: null } : h)) : b['hardpoints'];
  return { ...run, behemoth: { ...b, fireControl: chassis?.fireControl.hp ?? 0, hardpoints: hps } };
}

/** The single front zone's size in version 4, per chassis. */
const V4_FRONT: Record<string, number> = { class2: 120 };

/**
 * Version 4 had one front armor zone: each half gets the same share of integrity it had left.
 * Its armored prow (`armoredProw`) is the ram plow now, on the Behemoth and in the depot's stock.
 */
function fromV4(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['behemoth'])) return run;
  const b = run['behemoth'];
  const armor = b['armor'];
  const id = typeof b['chassis'] === 'string' ? b['chassis'] : '';
  const chassis = CHASSIS[id as keyof typeof CHASSIS];
  const old = V4_FRONT[id];
  if (!isObject(armor) || !isNum(armor['front']) || !chassis || !old) return run;
  const { front, ...rest } = armor;
  const share = Math.min(1, Math.max(0, (front as number) / old));
  const plow = (key: string) => (item: unknown) => (isObject(item) && item[key] === 'armoredProw' ? { ...item, [key]: 'ramPlow' } : item);
  const addons = Array.isArray(b['addons']) ? b['addons'].map(plow('id')) : b['addons'];
  const depot = run['depot'];
  const stock = isObject(depot) && Array.isArray(depot['addons']) ? { ...depot, addons: depot['addons'].map(plow('addon')) } : depot;
  return {
    ...run,
    behemoth: { ...b, addons, armor: { ...rest, frontLeft: chassis.armor.frontLeft * share, frontRight: chassis.armor.frontRight * share } },
    depot: stock,
  };
}

/** Version 5 predates shell types: every gun loaded with its default. */
function fromV5(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['behemoth'])) return run;
  const b = run['behemoth'];
  const hps = Array.isArray(b['hardpoints']) ? b['hardpoints'].map((h) => (isObject(h) ? { ...h, shell: null } : h)) : b['hardpoints'];
  return { ...run, behemoth: { ...b, hardpoints: hps } };
}

/** Version 6 predates the magazine: it starts intact. */
function fromV6(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['behemoth'])) return run;
  const b = run['behemoth'];
  const chassis = typeof b['chassis'] === 'string' ? CHASSIS[b['chassis'] as keyof typeof CHASSIS] : undefined;
  return { ...run, behemoth: { ...b, magazine: chassis?.magazine.hp ?? 0 } };
}

/** Version 7 predates upgrades: every part Gen 1, no mods, no grades for sale. */
function fromV7(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['behemoth'])) return run;
  const depot = run['depot'];
  return { ...run, behemoth: { ...run['behemoth'], grades: {}, mods: {} }, depot: isObject(depot) ? { ...depot, grades: [] } : depot };
}

/**
 * Version 8 predates the sector map: the run gets its map (from its seed) and starts at its foot,
 * keeping the Behemoth, salvage, and battles won. A run between battles goes to the map; one at a
 * depot keeps it (with the standard action count).
 */
function fromV8(run: unknown): unknown {
  if (!isObject(run) || !isNum(run['seed'])) return run;
  const depot = run['depot'];
  const next = run['next'] === 'depot' && isObject(depot) ? 'depot' : 'map';
  return {
    ...run,
    next,
    map: generateMap(run['seed'] >>> 0),
    at: null,
    path: [],
    cache: 0,
    // A version 8 depot opened with the 3 actions depots had then (before `DEPOT.actions` went to 5).
    depot: next === 'depot' && isObject(depot) ? { ...depot, total: 3 } : null,
  };
}

/** Version 9 predates callsigns: the one its seed would have drawn. */
function fromV9(run: unknown): unknown {
  if (!isObject(run) || !isNum(run['seed']) || typeof run['callsign'] === 'string') return run;
  return { ...run, callsign: callsignFor(run['seed']) };
}

/**
 * Version 10 predates Directives: the one matching the last sector's objective mode (so the run's
 * goal is what its map already showed), every objective set to that mode, the sectors already
 * behind it counted as taken, and the totals started from what's known (salvage in hand, no time).
 */
function fromV10(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['map']) || !Array.isArray(run['map']['sectors'])) return run;
  const map = run['map'] as unknown as SectorMap;
  const last = objectiveNode(map, map.sectors.length - 1)?.battle?.mode;
  const named = run['directive'];
  const directive: DirectiveId =
    typeof named === 'string' && named in DIRECTIVES ? (named as DirectiveId) : last === 'chase' ? 'interdiction' : last === 'assault' ? 'breakthrough' : 'decapitation';
  setObjectiveModes(map, directive);
  // Objectives behind the Behemoth: every sector before its own, and its own once it's at (or past) the objective.
  const at = run['at'];
  const sector = isObject(at) && isNum(at['sector']) ? at['sector'] : 0;
  const atObjective = isObject(at) && isNum(at['node']) && objectiveNode(map, sector)?.id === at['node'] && run['next'] !== 'battle';
  const done = Math.min(map.sectors.length, sector + (atObjective ? 1 : 0));
  return {
    ...run,
    directive,
    objectives: Array<boolean>(Math.max(0, done)).fill(true),
    earned: isNum(run['salvage']) ? run['salvage'] : 0,
    time: 0,
  };
}

/**
 * Version 11 predates conditions and events: every battle is fought clear, no node is an event
 * (the map stays as it was drawn), and no event has been decided.
 */
function fromV11(run: unknown): unknown {
  if (!isObject(run) || !isObject(run['map']) || !Array.isArray(run['map']['sectors'])) return run;
  const sectors = run['map']['sectors'].map((sec) =>
    isObject(sec) && Array.isArray(sec['nodes'])
      ? {
          ...sec,
          nodes: sec['nodes'].map((n) =>
            isObject(n)
              ? { ...n, event: n['event'] ?? null, battle: isObject(n['battle']) ? { ...n['battle'], condition: n['battle']['condition'] ?? null } : n['battle'] }
              : n,
          ),
        }
      : sec,
  );
  return { ...run, map: { ...run['map'], sectors }, lastEvent: run['lastEvent'] ?? null };
}

export function loadRun(storage: StorageLike | null = browserStorage()): RunState | null {
  const text = safe(() => storage?.getItem(RUN_SAVE_KEY) ?? null, null);
  return text === null ? null : parseRun(text);
}

/** Returns whether the save was written (storage can be full, blocked, or missing). */
export function saveRun(run: RunState, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  return safe(() => {
    storage.setItem(RUN_SAVE_KEY, serializeRun(run));
    return true;
  }, false);
}

export function clearRun(storage: StorageLike | null = browserStorage()): void {
  safe(() => storage?.removeItem(RUN_SAVE_KEY), undefined);
}

function browserStorage(): StorageLike | null {
  return safe(() => (typeof localStorage === 'undefined' ? null : localStorage), null);
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Structural check, so a hand-edited or stale save can't crash the game on load. */
function isRun(v: unknown): v is RunState {
  if (!isObject(v)) return false;
  if (typeof v['callsign'] !== 'string') return false;
  if (typeof v['directive'] !== 'string' || !(v['directive'] in DIRECTIVES)) return false;
  if (!Array.isArray(v['objectives']) || !v['objectives'].every((t) => typeof t === 'boolean')) return false;
  if (!isNum(v['earned']) || !isNum(v['time'])) return false;
  if (!isNum(v['seed']) || !isNum(v['battle']) || !isNum(v['salvage']) || !isNum(v['kills']) || !isNum(v['cache'])) return false;
  if (!(RUN_NEXT as readonly unknown[]).includes(v['next'])) return false;
  if (!isMap(v['map'])) return false;
  const map = v['map'] as RunState['map'];
  const at = v['at'];
  const path = v['path'];
  if (!(at === null || isPos(map, at)) || !Array.isArray(path) || !path.every((p) => isPos(map, p))) return false;
  // A battle or depot to resume needs a node to be at (a practice depot can open before any).
  if (v['next'] === 'battle' && at === null) return false;
  const depot = v['depot'];
  if (
    depot !== null &&
    !(
      isObject(depot) &&
      isNum(depot['actions']) &&
      isNum(depot['total']) &&
      Array.isArray(depot['stock']) &&
      depot['stock'].every((i) => isObject(i) && typeof i['weapon'] === 'string' && i['weapon'] in WEAPONS && typeof i['sold'] === 'boolean') &&
      Array.isArray(depot['addons']) &&
      depot['addons'].every((i) => isObject(i) && typeof i['addon'] === 'string' && i['addon'] in ADDONS && typeof i['sold'] === 'boolean') &&
      Array.isArray(depot['modules']) &&
      depot['modules'].every((i) => isObject(i) && typeof i['module'] === 'string' && i['module'] in TRAILER_MODULES && typeof i['sold'] === 'boolean') &&
      Array.isArray(depot['grades']) &&
      depot['grades'].every((i) => isObject(i) && isCore(i['component']) && isGen(i['gen']) && typeof i['sold'] === 'boolean')
    )
  )
    return false;
  const report = v['lastBattle'];
  if (report !== null && !(isObject(report) && ['battle', 'kills', 'salvage', 'bonus', 'time'].every((k) => isNum(report[k])))) return false;
  if (!isEventReport(v['lastEvent'])) return false;
  // An event to decide needs an event node to be at.
  if (v['next'] === 'event' && !(at !== null && nodeAt(map, at as MapPos)?.kind === 'event')) return false;
  const b = v['behemoth'];
  if (!isObject(b) || typeof b['chassis'] !== 'string' || !(b['chassis'] in CHASSIS)) return false;
  if (!isNum(b['treads']) || !isNum(b['sensors']) || !isNum(b['reactor']) || !isNum(b['fireControl']) || !isNum(b['magazine'])) return false;
  const armor = b['armor'];
  if (!isObject(armor) || !ARMOR_ARCS.every((a) => isNum(armor[a]))) return false;
  if (!isUpgrades(b['grades'], b['mods'])) return false;
  const addons = b['addons'];
  if (!Array.isArray(addons)) return false;
  if (!addons.every((a) => isObject(a) && typeof a['id'] === 'string' && a['id'] in ADDONS && (a['hp'] === null || isNum(a['hp'])))) return false;
  // A trailer exactly when its add-on is fitted.
  const trailer = b['trailer'];
  const hasTrailer = addons.some((a) => isObject(a) && a['id'] === 'trailer');
  if (trailer === null ? hasTrailer : !(hasTrailer && isTrailer(trailer))) return false;
  const hps = b['hardpoints'];
  if (!Array.isArray(hps)) return false;
  return hps.every(
    (h) =>
      isObject(h) &&
      typeof h['slot'] === 'string' &&
      isNum(h['hp']) &&
      (h['weapon'] === null || (typeof h['weapon'] === 'string' && h['weapon'] in WEAPONS)) &&
      (h['ammo'] === null || isNum(h['ammo'])) &&
      (h['binding'] === null || (typeof h['binding'] === 'string' && (BINDINGS as readonly string[]).includes(h['binding']))) &&
      (h['shell'] === null || (typeof h['shell'] === 'string' && h['shell'] in SHELL_TYPES)),
  );
}

const isNumOrNull = (v: unknown) => v === null || isNum(v);

function isPos(map: RunState['map'], p: unknown): p is MapPos {
  return isObject(p) && isNum(p['sector']) && isNum(p['node']) && nodeAt(map, p as unknown as MapPos) !== undefined;
}

/** Every sector a known biome; every node well formed, leading only to nodes in its sector. */
function isMap(m: unknown): boolean {
  if (!isObject(m) || !Array.isArray(m['sectors']) || m['sectors'].length === 0) return false;
  return m['sectors'].every((sec) => {
    if (!isObject(sec) || typeof sec['biome'] !== 'string' || !(sec['biome'] in BIOMES) || !isNum(sec['layers']) || !Array.isArray(sec['nodes'])) return false;
    const count = sec['nodes'].length;
    return sec['nodes'].every(
      (n, i) =>
        isObject(n) &&
        n['id'] === i &&
        isNum(n['layer']) &&
        isNum(n['col']) &&
        Array.isArray(n['next']) &&
        n['next'].every((id) => Number.isInteger(id) && (id as number) >= 0 && (id as number) < count) &&
        ((n['kind'] === 'depot' && n['battle'] === null && n['event'] === null) ||
          (n['kind'] === 'battle' && isIntel(n['battle']) && n['event'] === null) ||
          (n['kind'] === 'event' && n['battle'] === null && isEventIntel(n['event']))),
    );
  });
}

function isIntel(b: unknown): boolean {
  const fields = (f: unknown) => Array.isArray(f) && f.every((x) => (INTEL_FIELDS as readonly unknown[]).includes(x));
  return (
    isObject(b) &&
    ['seed', 'threat', 'salvage'].every((k) => isNum(b[k])) &&
    (b['approach'] === null || (typeof b['approach'] === 'string' && b['approach'] in APPROACHES)) &&
    typeof b['doctrine'] === 'string' &&
    b['doctrine'] in DOCTRINES &&
    typeof b['mode'] === 'string' &&
    b['mode'] in MODES &&
    ['normal', 'strong', 'objective'].includes(b['strength'] as string) &&
    typeof b['cache'] === 'boolean' &&
    fields(b['fog']) &&
    fields(b['deep']) &&
    (b['condition'] === null || (typeof b['condition'] === 'string' && b['condition'] in CONDITIONS)) &&
    (b['shift'] === undefined || isNum(b['shift']))
  );
}

function isEventIntel(e: unknown): boolean {
  return isObject(e) && typeof e['id'] === 'string' && e['id'] in MAP_EVENTS && isNum(e['seed']) && typeof e['fog'] === 'boolean';
}

/** The last event decided: a known event, one of its options, one of that option's outcomes. */
function isEventReport(r: unknown): boolean {
  if (r === null) return true;
  if (!isObject(r) || typeof r['id'] !== 'string' || !(r['id'] in MAP_EVENTS) || !isNum(r['option']) || !isNum(r['outcome'])) return false;
  const option = MAP_EVENTS[r['id'] as MapEventId].options[r['option']];
  return !!option && !!option.outcomes[r['outcome']];
}

const isCore = (v: unknown) => typeof v === 'string' && v in GRADES;
const isGen = (v: unknown) => v === 2 || v === 3;

/** Grades are Gen 2 or 3 per core component; mods are whole levels within the cap, per known track. */
function isUpgrades(grades: unknown, mods: unknown): boolean {
  if (!isObject(grades) || !Object.entries(grades).every(([k, v]) => isCore(k) && isGen(v))) return false;
  if (!isObject(mods)) return false;
  return Object.values(mods).every(
    (tracks) =>
      isObject(tracks) &&
      Object.entries(tracks).every(([t, level]) => t in TRACKS && Number.isInteger(level) && (level as number) >= 0 && (level as number) <= DEPOT.maxModLevel),
  );
}

function isTrailer(t: unknown): boolean {
  if (!isObject(t) || !isNum(t['armor']) || !Array.isArray(t['bays'])) return false;
  return t['bays'].every(
    (bay) =>
      bay === null ||
      (isObject(bay) && typeof bay['module'] === 'string' && bay['module'] in TRAILER_MODULES && isNumOrNull(bay['hp']) && isNumOrNull(bay['loads'])),
  );
}
