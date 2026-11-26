// The debug overlay (`?debug=1`, SPEC 11.5): tick, time, position, the tile under the survivor and
// under the mouse, stream counters, time controls, reveal-map and reveal-rules toggles, a test fire,
// and replay export and import. The backquote key hides and shows it.

import { BAND_NAMES, FEATURES, FLAG, TERRAIN } from '../content/terrain.ts';
import { describeRules } from '../sim/rules.ts';
import { STREAMS } from '../sim/rng.ts';
import { clock, daylight, formatClock, sightRadius } from '../sim/time.ts';
import { idx, inBounds, type World } from '../sim/world.ts';
import type { Session } from '../platform/session.ts';
import type { Vitals } from '../sim/state.ts';
import { VERSION } from '../platform/version.ts';
import { h } from './dom.ts';

export const SPEEDS = [0, 1, 4, 16, 64, 120];

export interface DebugActions {
  setSpeed(speed: number): void;
  fire(): void;
  exportReplay(): void;
  importReplay(file: File): void;
  toggleMap(): void;
  give(k: string, d: number, n: number): void;
  vital(vital: keyof Vitals, value: number): void;
}

export class DebugPanel {
  readonly el = h('div', { class: 'debug' });
  revealMap = false;
  revealRules = false;
  private readonly info = h('pre', {});
  private readonly rules = h('div', { class: 'rules' });
  private readonly speedRow = h('div', { class: 'row' });
  private speed = 1;
  private lastUpdate = 0;

  private readonly actions: DebugActions;

  constructor(actions: DebugActions) {
    this.actions = actions;
    for (const s of SPEEDS) {
      this.speedRow.append(
        h('button', { 'data-speed': s, onclick: () => this.setSpeed(s) }, s === 0 ? 'pause' : `${s}×`),
      );
    }
    const file = h('input', { type: 'file', accept: '.json,application/json' });
    file.addEventListener('change', () => {
      if (file.files?.[0]) actions.importReplay(file.files[0]);
      file.value = '';
    });
    this.el.append(
      h('div', { class: 'head' }, `debug · ${VERSION}`),
      this.info,
      this.speedRow,
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => this.toggle('map') }, 'reveal map'),
        h('button', { onclick: () => this.toggle('rules') }, 'reveal rules'),
        h('button', { onclick: () => actions.toggleMap() }, 'map (click to teleport)'),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => actions.fire() }, 'test fire here'),
        h('button', { onclick: () => actions.exportReplay() }, 'export replay'),
        h('label', { class: 'file' }, 'import replay', file),
      ),
      this.console(),
      this.rules,
    );
    this.markSpeed();
  }

  /** A tiny console: `give <item> [data] [count]`, `set <vital> <value>`. */
  private console(): HTMLElement {
    const box = h('input', { type: 'text', placeholder: 'give stick 0 4 · set hydration 20', spellcheck: 'false' });
    const out = h('span', { class: 'out' });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const [cmd, a, b, c] = box.value.trim().split(/\s+/);
      if (cmd === 'give' && a) {
        this.actions.give(a, b === undefined ? -1 : Number(b), c === undefined ? 1 : Number(c));
        out.textContent = `gave ${a}`;
      } else if (cmd === 'set' && a && b) {
        this.actions.vital(a as keyof Vitals, Number(b));
        out.textContent = `set ${a}`;
      } else out.textContent = 'give <item> [data] [n] · set <vital> <value>';
      box.value = '';
    });
    return h('div', { class: 'row console' }, box, out);
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.actions.setSpeed(s);
    this.markSpeed();
  }

  private markSpeed(): void {
    for (const b of this.speedRow.querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.speed) === this.speed);
  }

  private toggle(what: 'map' | 'rules'): void {
    if (what === 'map') this.revealMap = !this.revealMap;
    else this.revealRules = !this.revealRules;
    this.rules.hidden = !this.revealRules;
    this.lastUpdate = 0;
  }

  update(s: Session, hover: { x: number; y: number } | null, now: number): void {
    if (now - this.lastUpdate < 200 || this.el.hidden) return;
    this.lastUpdate = now;
    const st = s.state;
    const w = s.world;
    const c = clock(st.tick);
    const p = st.player;
    const lines = [
      `seed ${s.seed}${w.genSeed !== s.seed ? ` (valley from ${w.genSeed}, ${w.attempts} tries)` : ''}`,
      `tick ${st.tick} · day ${c.day} ${formatClock(c)} · light ${daylight(st.tick)} · sight ${sightRadius(st.tick)}`,
      `at ${p.x},${p.y} facing ${'NESW'[p.facing]} · step ${p.stepLeft}/${p.stepTotal}`,
      `here: ${tileInfo(w, p.x, p.y)}`,
      hover ? `mouse ${hover.x},${hover.y}: ${tileInfo(w, hover.x, hover.y)}` : 'mouse: off the view',
      `viewpoints ${st.viewpoints.filter(Boolean).length}/${st.viewpoints.length} · lights ${st.lights.length} · animals: none yet`,
      `streams: ${STREAMS.filter((n) => n in st.rng)
        .map((n) => `${n} ${st.rng[n].n}`)
        .join(', ')}`,
      `commands logged ${s.log.length}`,
    ];
    this.info.textContent = lines.join('\n');
    if (this.revealRules && !this.rules.childElementCount) {
      const rows = describeRules(st.rules);
      this.rules.append(
        h('div', { class: 'head' }, `the deal (plant deck reshuffled ${st.rules.reshuffles}×)`),
        h('table', {}, ...rows.map((r) => h('tr', {}, h('td', {}, r.row), h('td', {}, r.thing), h('td', {}, r.outcome)))),
      );
    }
  }
}

function tileInfo(w: World, x: number, y: number): string {
  if (!inBounds(x, y)) return 'off the map';
  const i = idx(x, y);
  const f = w.feature[i]!;
  const flags = Object.entries(FLAG)
    .filter(([, bit]) => w.flags[i]! & bit)
    .map(([k]) => k);
  return [
    TERRAIN[w.terrain[i]!]!.name,
    BAND_NAMES[w.band[i]!],
    `elev ${w.elev[i]}`,
    f ? `${FEATURES[f]!.name}#${w.data[i]}` : '',
    w.water[i] ? `water ${w.water[i]}` : '',
    flags.join('+'),
  ]
    .filter(Boolean)
    .join(', ');
}
