// A small helper for building HTML: h('div', { class: 'x' }, 'text', child).

type Props = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

/** Read and write this game's small settings in localStorage (SPEC 11.6: keys start with `snowline/`). */
export const settings = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`snowline/${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`snowline/${key}`, JSON.stringify(value));
    } catch {
      // Storage can be full or blocked (a page opened from disk); settings are a convenience.
    }
  },
};
