// Saves (SPEC 5.4, 11.6): one slot, the run in progress, in IndexedDB (database `snowline`). Autosaved on
// sleep and when the tab is hidden; deleted on death (permadeath). Saves can also go to and from a file,
// which is the backup, and the way to keep a run from the single-file build opened from disk.
//
// A save holds the GameState without the deal (it is dealt again from the seed) and without the map
// (it is generated again from the seed).

import { SCHEMA } from '../sim/newGame.ts';
import type { Rules } from '../sim/rules.ts';
import type { GameState } from '../sim/state.ts';
import { VERSION } from './version.ts';

export interface SaveRecord {
  game: 'snowline';
  schema: number;
  version: string;
  savedAt: number;
  seed: string;
  name: string;
  day: number;
  state: Omit<GameState, 'rules'>;
}

const DB = 'snowline';
const STORE = 'runs';
const KEY = 'current';

function open(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((ok) => {
    try {
      const req = f(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => ok((req.result as T) ?? null);
      req.onerror = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

export function toRecord(s: GameState): SaveRecord {
  const { rules: _rules, ...rest } = s;
  void _rules;
  return {
    game: 'snowline',
    schema: SCHEMA,
    version: VERSION,
    savedAt: Date.now(),
    seed: s.seed,
    name: s.protagonist.name,
    day: Math.floor(s.tick / 14400) + 1,
    state: structuredClone(rest),
  };
}

/** Save the run. Resolves false if the browser has no storage for this page. */
export async function saveRun(s: GameState): Promise<boolean> {
  if (s.over) return false;
  const ok = await run<IDBValidKey>('readwrite', (st) => st.put(toRecord(s), KEY));
  return ok !== null;
}

export function loadRun(): Promise<SaveRecord | null> {
  return run<SaveRecord>('readonly', (st) => st.get(KEY));
}

export async function deleteRun(): Promise<void> {
  await run('readwrite', (st) => st.delete(KEY));
}

/** Check a save (from storage or a file) and bring an older one up to date. Throws if it can't be used. */
export function migrate(r: SaveRecord): SaveRecord {
  if (r.game !== 'snowline' || !r.state) throw new Error('not a Snowline save');
  if (r.schema > SCHEMA) throw new Error(`this save is from a newer version (${r.version})`);
  if (r.schema < SCHEMA) throw new Error(`this save is from an older version of the game (${r.version}) and can't be carried on`);
  return r;
}

/** The game state from a save, with the deal put back. */
export function restore(r: SaveRecord, rules: Rules): GameState {
  return { ...structuredClone(r.state), rules: structuredClone(rules) } as GameState;
}

export function parseSave(text: string): SaveRecord {
  return migrate(JSON.parse(text) as SaveRecord);
}
