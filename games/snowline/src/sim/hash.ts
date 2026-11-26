// Hashes of plain data, for golden replays and replay files: the same state always gives the same hash.

/** JSON with object keys sorted, so the text never depends on the order keys were added. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (ArrayBuffer.isView(value)) {
    return canonicalJson(Array.from(value as unknown as ArrayLike<number>));
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(',')}}`;
}

/** FNV-1a, 32 bits, as eight hex digits. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The hash of any plain-data value. */
export function hashValue(value: unknown): string {
  return fnv1a(canonicalJson(value));
}
