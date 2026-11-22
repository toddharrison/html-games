/**
 * Live edits to the tuning and content tables (dev console, `console.ts`). Tables are edited in
 * place, so the sim sees the new number on its next read; the changes are kept in `localStorage`
 * and put back on the next load. Only number and boolean leaves can be edited.
 */

export const TWEAKS_KEY = 'behemoth-protocol/dev-tweaks';

export type TweakValue = number | boolean;

export interface Leaf {
  path: string;
  value: TweakValue;
}

/** The slice of `Storage` the store needs (tests pass a map). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Every number and boolean under `root`, by dotted path (array items by index). An object reached twice is listed once. */
export function leaves(root: object): Leaf[] {
  const out: Leaf[] = [];
  const seen = new Set<object>();
  const walk = (o: object, prefix: string) => {
    if (seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'number' || typeof v === 'boolean') out.push({ path, value: v });
      else if (v && typeof v === 'object') walk(v, path);
    }
  };
  walk(root, '');
  return out;
}

function parent(root: object, path: string): { holder: Record<string, unknown>; key: string } | null {
  const keys = path.split('.');
  const key = keys.pop()!;
  let o: unknown = root;
  for (const k of keys) {
    o = o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
  }
  return o && typeof o === 'object' ? { holder: o as Record<string, unknown>, key } : null;
}

export class TweakStore {
  /** Each table's values as the game shipped them, for reset and for spotting changes. */
  private readonly defaults: Record<string, Map<string, TweakValue>> = {};
  private overrides: Record<string, Record<string, TweakValue>> = {};

  constructor(
    readonly tables: Record<string, object>,
    private readonly store: KeyValueStore | null,
  ) {
    for (const [name, t] of Object.entries(tables)) this.defaults[name] = new Map(leaves(t).map((l) => [l.path, l.value]));
  }

  /** Puts the saved overrides back onto the tables (ones whose path or type no longer match are dropped). */
  apply(): void {
    let saved: unknown = null;
    try {
      saved = JSON.parse(this.store?.getItem(TWEAKS_KEY) ?? 'null');
    } catch {
      saved = null;
    }
    this.overrides = {};
    if (!saved || typeof saved !== 'object') return;
    for (const [table, paths] of Object.entries(saved as Record<string, unknown>)) {
      if (!this.defaults[table] || !paths || typeof paths !== 'object') continue;
      for (const [path, value] of Object.entries(paths as Record<string, unknown>)) {
        const def = this.defaults[table].get(path);
        if (def !== undefined && typeof def === typeof value) this.write(table, path, value as TweakValue);
      }
    }
    this.save();
  }

  defaultOf(table: string, path: string): TweakValue | undefined {
    return this.defaults[table]?.get(path);
  }

  set(table: string, path: string, value: TweakValue): void {
    this.write(table, path, value);
    this.save();
  }

  private write(table: string, path: string, value: TweakValue): void {
    const p = parent(this.tables[table]!, path);
    if (!p) return;
    p.holder[p.key] = value;
    const o = (this.overrides[table] ??= {});
    if (value === this.defaults[table]?.get(path)) delete o[path];
    else o[path] = value;
    if (Object.keys(o).length === 0) delete this.overrides[table];
  }

  /** Paths changed from their defaults in a table, in the order they were changed. */
  changed(table: string): string[] {
    return Object.keys(this.overrides[table] ?? {});
  }

  /** Values changed across all tables. */
  count(): number {
    return Object.values(this.overrides).reduce((n, o) => n + Object.keys(o).length, 0);
  }

  /** Back to the defaults: one table, or all of them. */
  reset(table?: string): void {
    for (const name of table ? [table] : Object.keys(this.overrides)) {
      for (const path of this.changed(name)) this.write(name, path, this.defaults[name]!.get(path)!);
    }
    this.save();
  }

  private save(): void {
    try {
      if (this.count() === 0) this.store?.removeItem(TWEAKS_KEY);
      else this.store?.setItem(TWEAKS_KEY, JSON.stringify(this.overrides));
    } catch {
      // Storage full or blocked: the changes still hold for this session.
    }
  }
}
