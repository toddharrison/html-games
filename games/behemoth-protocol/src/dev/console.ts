import type Phaser from 'phaser';
import * as TUNING from '../content/tuning';
import { ADDONS } from '../content/addons';
import { APPROACHES } from '../content/approaches';
import { BIOME_IDS, BIOMES } from '../content/biomes';
import { ARMOR_ARCS, CHASSIS, type ArmorArc } from '../content/chassis';
import { CONDITIONS, type ConditionId } from '../content/conditions';
import { DEPOT_ADDONS, DEPOT_GRADES, DEPOT_MODULES, DEPOT_WEAPONS } from '../content/depot';
import { DIRECTIVES } from '../content/directives';
import { DOCTRINES } from '../content/doctrines';
import { ENEMIES, type EnemyId } from '../content/enemies';
import { MAP_EVENTS } from '../content/mapEvents';
import { MODES } from '../content/modes';
import { OBSTACLE_CLASSES } from '../content/obstacles';
import { MATERIALS } from '../content/terrain';
import { TRAILER_MODULES } from '../content/trailer';
import { GRADES, TRACKS } from '../content/upgrades';
import { WEAPONS } from '../content/weapons';
import { lookFromUrl } from '../config';
import { LOOKS, lookFor } from '../render/looks';
import { applyHit, component, damageComponent, damageTreads, igniteReactor } from '../sim/behemoth';
import { devExtract, devKillAll, devRearm, devRepair, devSpawn, devWave, setInvulnerable, type DevSide } from '../sim/dev';
import { paySalvage } from '../sim/salvage';
import type { World } from '../sim/world';
import type { BattleDev, TopDownBattleScene } from '../scenes/TopDownBattleScene';
import { TweakStore, leaves, type TweakValue } from './tweaks';

/**
 * The dev console: an HTML panel over the right of the page, opened with `\` (or the DEV tab).
 * On in the dev server, or anywhere with `?dev` in the URL. It drives the live battle (time, the
 * Behemoth, enemies, weather), relaunches a battle with any of the practice URL params, and
 * edits the tuning and content tables live (kept in localStorage, `tweaks.ts`).
 *
 * Keys typed into the panel never reach the game: it stops them before Phaser's window listener.
 */

/** The dev console is available: the dev server, or `?dev` in the URL. */
export function devEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev');
}

/** Persistent tables the Tweaks section edits (every object in tuning.ts, then the content tables). */
function tweakTables(): Record<string, object> {
  const tuning = Object.fromEntries(Object.entries(TUNING).filter(([, v]) => v && typeof v === 'object')) as Record<string, object>;
  return {
    ...tuning,
    CHASSIS,
    WEAPONS,
    ENEMIES,
    ADDONS,
    TRAILER_MODULES,
    MATERIALS,
    OBSTACLE_CLASSES,
    CONDITIONS,
    MODES,
    DOCTRINES,
    BIOMES,
    APPROACHES,
    DIRECTIVES,
    MAP_EVENTS,
    GRADES,
    TRACKS,
    DEPOT_WEAPONS,
    DEPOT_ADDONS,
    DEPOT_MODULES,
    DEPOT_GRADES,
  };
}

/** The live Behemoth's fitted chassis: edits last for this battle only. */
const LIVE_CHASSIS = 'this battle: chassis';

/** The URL params the New battle section knows, in the order it shows them. */
const PARAMS = ['seed', 'biome', 'approach', 'look', 'condition', 'mode', 'doctrine', 'directive', 'mix', 'exit', 'addons', 'trailer', 'weapons', 'shells', 'grades', 'mods', 'immobilize', 'cookoff', 'objective', 'map', 'depot', 'event', 'summary', 'res'] as const;

const CSS = `
#dev-tab { position: fixed; top: 8px; right: 8px; z-index: 20; font: 11px/1 ui-monospace, Menlo, monospace; background: #2a2d24; color: #e8b04a; border: 1px solid #e8b04a; padding: 4px 7px; cursor: pointer; opacity: .75; }
#dev-tab:hover { opacity: 1; }
#dev { position: fixed; top: 0; right: 0; bottom: 0; width: 360px; z-index: 21; overflow-y: auto; box-sizing: border-box; padding: 8px 10px 40px;
  font: 12px/1.35 ui-monospace, Menlo, monospace; color: #d8dccf; background: rgba(15,17,13,.95); border-left: 1px solid #3c4134; }
#dev[hidden], #dev-tab[hidden] { display: none; }
body.dev-open { padding-right: 360px; box-sizing: border-box; justify-content: safe center; }
#dev h1 { font-size: 13px; margin: 0 0 4px; color: #e8b04a; display: flex; justify-content: space-between; align-items: center; }
#dev .status { white-space: pre; color: #9aa08e; font-size: 11px; margin-bottom: 6px; }
#dev details { border-top: 1px solid #3c4134; padding: 4px 0; }
#dev summary { cursor: pointer; color: #e8b04a; font-weight: bold; padding: 2px 0; }
#dev .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 4px 0; }
#dev label { display: inline-flex; gap: 4px; align-items: center; }
#dev .grid { display: grid; grid-template-columns: 82px 1fr; gap: 3px 6px; align-items: center; margin: 4px 0; }
#dev button, #dev select, #dev input { font: inherit; color: #e6e9de; background: #23261f; border: 1px solid #4a5040; border-radius: 2px; padding: 2px 5px; }
#dev button { cursor: pointer; }
#dev button:hover { border-color: #e8b04a; }
#dev button.on { background: #e8b04a; color: #15170f; border-color: #e8b04a; }
#dev input[type=number] { width: 64px; }
#dev input[type=text], #dev .grid select { width: 100%; box-sizing: border-box; }
#dev fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
#dev fieldset:disabled { opacity: .4; }
#dev .hint { color: #7d8473; font-size: 11px; }
#dev .tweaks { max-height: 50vh; overflow-y: auto; margin-top: 4px; }
#dev .tweak { display: grid; grid-template-columns: 1fr 78px; gap: 4px; align-items: center; padding: 1px 0; }
#dev .tweak span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dev .tweak.changed span { color: #e8b04a; }
#dev .tweak input[type=number] { width: 100%; box-sizing: border-box; }
#dev .checks { display: flex; flex-wrap: wrap; gap: 2px 10px; }
`;

type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;

/** A DOM element: attributes (`on*` = listeners), then children. */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') (el as unknown as Record<string, boolean>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid !== null) el.append(kid);
  return el;
}

function select(options: readonly (string | [value: string, label: string])[], value = ''): HTMLSelectElement {
  const s = h('select');
  for (const o of options) {
    const [v, label] = typeof o === 'string' ? [o, o] : o;
    s.append(h('option', { value: v }, label));
  }
  // An unknown value (or none given) leaves the first option selected.
  if (options.some((o) => (typeof o === 'string' ? o : o[0]) === value)) s.value = value;
  return s;
}

function button(label: string, onclick: () => void, title = ''): HTMLButtonElement {
  return h('button', { type: 'button', onclick, ...(title ? { title } : {}) }, label);
}

function checkbox(label: string, onchange: (on: boolean) => void): { box: HTMLInputElement; el: HTMLLabelElement } {
  const box = h('input', { type: 'checkbox', onchange: () => onchange(box.checked) });
  return { box, el: h('label', {}, box, label) };
}

function num(value: number, step = 1, min?: number): HTMLInputElement {
  return h('input', { type: 'number', value, step, ...(min !== undefined ? { min } : {}) });
}

function section(title: string, open: boolean, ...kids: Node[]): HTMLDetailsElement {
  return h('details', open ? { open: true } : {}, h('summary', {}, title), ...kids);
}

const row = (...kids: (Node | string)[]) => h('div', { class: 'row' }, ...kids);

export class DevConsole {
  private readonly panel: HTMLDivElement;
  private readonly tab: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly battleOnly: HTMLFieldSetElement[] = [];
  private readonly tweaks: TweakStore;
  /** Sticky switches, put back on every new battle. */
  private god = false;
  private frozen = false;
  private noSpawns = false;
  private world: World | null = null;
  private liveChassis: TweakStore | null = null;
  private refreshTweaks: () => void = () => {};
  private refreshParts: () => void = () => {};
  private readonly syncs: (() => void)[] = [];
  private timer: number | null = null;
  private frames = 0;
  private fps = 0;
  private fpsAt = performance.now();
  private game!: Phaser.Game;

  /** Applies the saved tweaks right away, before the game is made; call `attach` once it is. */
  constructor() {
    this.tweaks = new TweakStore(tweakTables(), safeStorage());
    this.tweaks.apply();
    document.head.append(h('style', {}, CSS));
    this.status = h('div', { class: 'status' });
    this.tab = h('div', { id: 'dev-tab', title: 'Dev console (\\)', onclick: () => this.toggle(true) }, 'DEV');
    this.panel = h('div', { id: 'dev', hidden: true });
    document.body.append(this.tab, this.panel);
    this.updateTab();
  }

  attach(game: Phaser.Game): void {
    this.game = game;
    this.build();
    // Keys typed into the panel stay out of the game (Phaser listens on the window).
    for (const type of ['keydown', 'keyup', 'keypress']) {
      this.panel.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'keydown' && (e as KeyboardEvent).key === 'Escape') this.toggle(false);
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backslash') this.toggle(this.panel.hidden !== false);
    });
    game.events.on('step', () => this.frames++);
  }

  private toggle(open: boolean): void {
    this.panel.hidden = !open;
    // The game moves over to make room (index.html centers it in the body).
    document.body.classList.toggle('dev-open', open);
    this.updateTab();
    if (open && this.timer === null) {
      this.tick();
      this.timer = window.setInterval(() => this.tick(), 250);
    } else if (!open && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private updateTab(): void {
    const n = this.tweaks.count();
    this.tab.hidden = !this.panel.hidden;
    this.tab.textContent = n > 0 ? `DEV · ${n} tweak${n === 1 ? '' : 's'}` : 'DEV';
  }

  private battle(): BattleDev | null {
    const scene = this.game.scene.getScene('battle') as TopDownBattleScene | null;
    return scene?.devHooks() ?? null;
  }

  /** Every 250 ms while open: the status line, the sticky switches, and controls that mirror the game. */
  private tick(): void {
    const now = performance.now();
    if (now - this.fpsAt >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
    }
    const scenes = this.game.scene
      .getScenes(true)
      .map((s) => s.sys.settings.key)
      .join(', ');
    const dev = this.battle();
    for (const f of this.battleOnly) f.disabled = !dev;
    if (!dev) {
      this.world = null;
      this.status.textContent = `${scenes}  ${this.fps} fps\nNo battle running: battle controls are off.`;
      return;
    }
    const w = dev.world;
    if (w !== this.world) {
      this.world = w;
      this.liveChassis = new TweakStore({ [LIVE_CHASSIS]: w.behemoth.chassis }, null);
      this.refreshParts();
      this.refreshTweaks();
    }
    setInvulnerable(w, this.god);
    w.dev.frozen = this.frozen;
    if (this.noSpawns) w.encounter.off = true;
    const b = w.behemoth;
    const live = w.enemies.filter((e) => e.alive).length;
    const a = w.encounter.alert;
    this.status.textContent =
      `${scenes}  ${this.fps} fps  t ${w.time.toFixed(2)}s  ×${dev.timeScale}${dev.paused ? '  PAUSED' : ''}\n` +
      `seed ${w.seed}  ${w.terrain.recipe.biome}${w.terrain.recipe.approach ? '/' + w.terrain.recipe.approach : ''}  ${lookFor(w.terrain.recipe.biome, w.terrain.seed, lookFromUrl()).id}  ${w.objective.mode}  ${w.condition?.id ?? 'clear'}\n` +
      `${Math.round((b.x - 70) / 10)} m of ${Math.round((w.exitX - 70) / 10)}  ${Math.round(b.vx)} u/s  enemies ${live}  threat ${w.threat}\n` +
      `alert wave ${a.wave}, next ${a.cut ? 'cut' : a.next.toFixed(1) + 's'}  kills ${w.stats.kills}  salvage ${w.stats.salvage}`;
    for (const s of this.syncs) s();
  }

  // ── Panel ───────────────────────────────────────────────────────────────────────────────────

  private build(): void {
    this.panel.append(
      h('h1', {}, 'Dev console', button('×', () => this.toggle(false), 'Close (Esc or \\)')),
      this.status,
      this.timeSection(),
      this.behemothSection(),
      this.enemySection(),
      this.weatherSection(),
      this.newBattleSection(),
      this.tweakSection(),
    );
  }

  /** Battle-only controls, greyed out when there's no battle. */
  private battleFields(...kids: Node[]): HTMLFieldSetElement {
    const f = h('fieldset', {}, ...kids);
    this.battleOnly.push(f);
    return f;
  }

  private act(fn: (dev: BattleDev, w: World) => void): () => void {
    return () => {
      const dev = this.battle();
      if (dev) fn(dev, dev.world);
      this.tick();
    };
  }

  /** Damage asked for from the console lands even in god mode. */
  private hurt(fn: (w: World) => void): () => void {
    return this.act((_, w) => {
      const b = w.behemoth;
      const god = b.invulnerable;
      b.invulnerable = false;
      fn(w);
      b.invulnerable = god;
    });
  }

  private timeSection(): HTMLElement {
    const pause = checkbox('Paused', (on) => this.act((d) => (d.paused = on))());
    const debug = checkbox('Debug readout', (on) => this.act((d) => (d.debug = on))());
    const speeds = [0.1, 0.25, 0.5, 1, 2, 4];
    const speedButtons = speeds.map((k) => button(`×${k}`, this.act((d) => (d.timeScale = k))));
    this.syncs.push(() => {
      const d = this.battle();
      if (!d) return;
      pause.box.checked = d.paused;
      debug.box.checked = d.debug;
      speedButtons.forEach((btn, i) => btn.classList.toggle('on', speeds[i] === d.timeScale));
    });
    return section(
      'Time',
      true,
      this.battleFields(
        row(pause.el, button('Step 1/60 s', this.act((d) => ((d.paused = true), d.step()))), debug.el),
        row(...speedButtons),
        row(button('Restart battle', this.act((d) => d.restart()))),
      ),
    );
  }

  private behemothSection(): HTMLElement {
    const god = checkbox('God mode', (on) => ((this.god = on), this.tick()));
    const part = h('select');
    this.refreshParts = () => {
      const w = this.world;
      if (!w) return;
      const b = w.behemoth;
      const ids = ['treads', 'sensors', 'fireControl', 'magazine', 'reactor', ...b.hardpoints.filter((hp) => hp.weapon).map((hp) => hp.slot.id), ...b.addons.filter((a) => a.integrity).map((a) => a.def.id)];
      if (b.trailer) b.trailer.bays.forEach((bay, i) => bay && ids.push(`bay${i}`));
      const was = part.value;
      part.replaceChildren(...ids.map((id) => h('option', { value: id }, id)));
      if (ids.includes(was)) part.value = was;
    };
    const amount = num(20, 5, 0);
    const arc = select(ARMOR_ARCS);
    const hit = num(60, 10, 0);
    const salvage = num(100, 50, 0);
    const partLine = h('span', { class: 'hint' });
    this.syncs.push(() => {
      const w = this.world;
      const c = w && part.value ? component(w.behemoth, part.value) : null;
      partLine.textContent = c ? `${Math.round(c.hp)}/${c.max}` : '';
    });
    return section(
      'Behemoth',
      true,
      this.battleFields(
        row(
          god.el,
          button('Repair all', this.act((_, w) => devRepair(w))),
          button('Rearm', this.act((_, w) => devRearm(w)), 'Ammo to full loads, capacitor charged'),
        ),
        row(
          button('Immobilize', this.hurt((w) => damageTreads(w.behemoth, Infinity, w.events))),
          button('Reactor critical', this.act((_, w) => igniteReactor(w.behemoth, w.events))),
          button('Extract now', this.act((_, w) => devExtract(w))),
        ),
        row('Damage', part, amount, button('Hit', this.hurt((w) => damageComponent(w.behemoth, part.value, Number(amount.value), w.events))), partLine),
        row(
          'Shot on',
          arc,
          hit,
          button(
            'Fire',
            this.hurt((w) => {
              const b = w.behemoth;
              applyHit(b, arc.value as ArmorArc, Number(hit.value), w.rng, w.events, b.x, b.y);
            }),
            'A hit on that armor arc: what gets through strikes a component, like enemy fire',
          ),
        ),
        row('Salvage', salvage, button('Add', this.act((_, w) => paySalvage(w, w.behemoth.x, w.behemoth.y, Number(salvage.value), 'unit')))),
      ),
    );
  }

  private enemySection(): HTMLElement {
    const ids = Object.keys(ENEMIES) as EnemyId[];
    const unit = select(
      ids.map((id) => [id, `${ENEMIES[id].name}${ENEMIES[id].biome ? ` (${ENEMIES[id].biome})` : ''}${ENEMIES[id].spawn === 'objective' ? ' [obj]' : ''}`] as [string, string]),
      'lightTank',
    );
    const count = num(1, 1, 1);
    const side = select(['near', 'auto', 'ahead', 'behind', 'left', 'right'], 'near');
    const freeze = checkbox('Freeze enemies', (on) => ((this.frozen = on), this.tick()));
    const stop = checkbox('No spawns', (on) => {
      this.noSpawns = on;
      const w = this.battle()?.world;
      if (w) w.encounter.off = on;
    });
    const threat = num(0, 1, 0);
    const pace = num(1, 0.25, 0);
    const result = h('span', { class: 'hint' });
    threat.addEventListener('change', this.act((_, w) => void (Number.isFinite(Number(threat.value)) && (w.threat = Number(threat.value)))));
    pace.addEventListener('change', this.act((_, w) => void (Number(pace.value) > 0 && (w.encounter.alert.pace = Number(pace.value)))));
    this.syncs.push(() => {
      const w = this.world;
      if (!w) return;
      if (document.activeElement !== threat) threat.value = String(w.threat);
      if (document.activeElement !== pace) pace.value = String(w.encounter.alert.pace);
    });
    return section(
      'Enemies',
      true,
      this.battleFields(
        row(unit),
        row(
          count,
          side,
          button(
            'Spawn',
            this.act((_, w) => {
              let n = 0;
              for (let i = 0; i < Number(count.value); i++) if (devSpawn(w, unit.value as EnemyId, side.value as DevSide)) n++;
              result.textContent = n > 0 ? `spawned ${n}` : 'no ground for it';
            }),
            'near = on screen ahead; auto = the way the alert clock sends it; or from one side, off screen',
          ),
          result,
        ),
        row(button('Kill all', this.act((_, w) => void (result.textContent = `killed ${devKillAll(w)}`))), button('Alert wave now', this.act((_, w) => devWave(w)))),
        row(freeze.el, stop.el),
        row('Threat', threat, 'Alert pace', pace),
      ),
    );
  }

  private weatherSection(): HTMLElement {
    const buttons = (['clear', 'night', 'storm', 'thunderstorm'] as const).map((id) =>
      button(id, this.act((d) => d.setCondition(id === 'clear' ? null : (id as ConditionId)))),
    );
    this.syncs.push(() => {
      const id = this.world?.condition?.id ?? 'clear';
      buttons.forEach((btn) => btn.classList.toggle('on', btn.textContent === id));
    });
    return section(
      'Weather (live)',
      true,
      this.battleFields(row(...buttons), h('div', { class: 'hint' }, 'Terrain, biome, mode, and doctrine need a new battle: see below.')),
    );
  }

  /** Relaunches with practice URL params (config.ts): any battle, map, depot, event, or summary. */
  private newBattleSection(): HTMLElement {
    const now = new URLSearchParams(window.location.search);
    const get = (k: string) => now.get(k) ?? '';
    const none: [string, string] = ['', '—'];
    const ids = (o: object) => Object.keys(o);
    const fields: Record<string, HTMLInputElement | HTMLSelectElement> = {
      seed: h('input', { type: 'text', value: get('seed'), placeholder: 'random' }),
      biome: select([none, ...ids(BIOMES)], get('biome')),
      approach: select([none, ['none', 'none (biome mix)'], ...ids(APPROACHES)], get('approach')),
      look: select([none, ...BIOME_IDS.flatMap((b) => LOOKS[b].map((l) => [l.id, `${l.name} (${b})`] as [string, string]))], get('look')),
      condition: select([none, ['none', 'clear'], ...ids(CONDITIONS)], get('condition')),
      mode: select([none, ...ids(MODES)], get('mode')),
      doctrine: select([none, ...ids(DOCTRINES)], get('doctrine')),
      directive: select([none, ...ids(DIRECTIVES)], get('directive')),
      mix: h('input', { type: 'text', value: get('mix'), placeholder: 'siegeTank:1,lightTank:2' }),
      exit: h('input', { type: 'text', value: get('exit'), placeholder: 'meters to extraction' }),
      addons: h('input', { type: 'text', value: get('addons'), placeholder: `all or ${ids(ADDONS).slice(0, 2).join(',')}` }),
      trailer: h('input', { type: 'text', value: get('trailer'), placeholder: `${ids(TRAILER_MODULES).slice(0, 2).join(',')} (- = empty)` }),
      weapons: h('input', { type: 'text', value: get('weapons'), placeholder: 'turret:heavyLaser,prow:plasmaThrower' }),
      shells: h('input', { type: 'text', value: get('shells'), placeholder: 'turret:ap' }),
      grades: h('input', { type: 'text', value: get('grades'), placeholder: 'reactor:3,fireControl:2' }),
      mods: h('input', { type: 'text', value: get('mods'), placeholder: 'turret.traverse:3' }),
      immobilize: h('input', { type: 'text', value: get('immobilize'), placeholder: 'seconds in' }),
      cookoff: h('input', { type: 'text', value: get('cookoff'), placeholder: 'seconds in' }),
      objective: h('input', { type: 'text', value: get('objective'), placeholder: 'sector 1-3' }),
      map: h('input', { type: 'text', value: get('map'), placeholder: 'sector: map instead of battle' }),
      depot: h('input', { type: 'text', value: get('depot'), placeholder: 'battles won: open the depot' }),
      event: select([none, ['random', 'random'], ...ids(MAP_EVENTS)], now.has('event') ? get('event') || 'random' : ''),
      summary: select([none, 'won', 'failed', 'destroyed'], get('summary')),
      res: select([none, '480', '576', '640'], get('res')),
    };
    const grid = h('div', { class: 'grid' });
    for (const k of PARAMS) grid.append(h('span', {}, k), fields[k]!);

    const mixUnits = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => ENEMIES[id].spawn !== 'objective');
    const mixPick = select(mixUnits, 'lightTank');
    const addToMix = button('+ mix', () => {
      const f = fields.mix as HTMLInputElement;
      f.value = [f.value, `${mixPick.value}:1`].filter(Boolean).join(',');
    });
    const seedRandom = button('random seed', () => ((fields.seed as HTMLInputElement).value = String(Math.floor(Math.random() * 1e6))));

    const launch = (keep: boolean) => {
      const next = new URLSearchParams();
      if (keep) {
        for (const k of PARAMS) {
          const v = fields[k]!.value.trim();
          // `?event` alone opens a random event; the others need a value.
          if (k === 'event' && v === 'random') next.set(k, '');
          else if (v) next.set(k, v);
        }
      }
      if (new URLSearchParams(window.location.search).has('dev')) next.set('dev', '');
      const q = next.toString().replace(/=(?=&|$)/g, '');
      window.location.search = q ? `?${q}` : '';
    };
    return section(
      'New battle (reloads)',
      false,
      h('div', { class: 'hint' }, 'Any of these makes a practice run (no save touched). Map, depot, event, and summary open that screen instead.'),
      grid,
      row(mixPick, addToMix, seedRandom),
      row(button('Launch', () => launch(true)), button('Title (clear all)', () => launch(false))),
    );
  }

  private tweakSection(): HTMLElement {
    const names = [...Object.keys(this.tweaks.tables), LIVE_CHASSIS];
    const table = select(names, 'MOVEMENT');
    const filter = h('input', { type: 'text', placeholder: 'filter paths (e.g. hp, lightTank.)' });
    const onlyChanged = checkbox('changed only', () => render());
    const list = h('div', { class: 'tweaks' });
    const info = h('span', { class: 'hint' });

    const storeFor = (name: string) => (name === LIVE_CHASSIS ? this.liveChassis : this.tweaks);
    const render = () => {
      const name = table.value;
      const store = storeFor(name);
      const changedCount = this.tweaks.count();
      info.textContent = `${changedCount} saved tweak${changedCount === 1 ? '' : 's'}`;
      this.updateTab();
      if (!store) {
        list.replaceChildren(h('div', { class: 'hint' }, 'Start a battle to edit its chassis.'));
        return;
      }
      const q = filter.value.trim().toLowerCase();
      const changed = new Set(store.changed(name));
      const rows = leaves(store.tables[name]!).filter((l) => (!q || l.path.toLowerCase().includes(q)) && (!onlyChanged.box.checked || changed.has(l.path)));
      const shown = rows.slice(0, 400);
      list.replaceChildren(
        ...shown.map((l) => tweakRow(store, name, l.path, l.value, changed.has(l.path), render)),
        ...(rows.length > shown.length ? [h('div', { class: 'hint' }, `…${rows.length - shown.length} more: filter to narrow`)] : []),
        ...(rows.length === 0 ? [h('div', { class: 'hint' }, 'Nothing matches.')] : []),
      );
    };
    this.refreshTweaks = render;
    table.addEventListener('change', render);
    filter.addEventListener('input', render);
    render();
    return section(
      'Tweaks (tuning and content)',
      false,
      h('div', { class: 'hint' }, 'Live edits, kept across reloads until reset (the DEV tab counts them). The battle chassis edits last for this battle only. A few values are read once at load and need a reload.'),
      row(table),
      row(filter),
      row(
        onlyChanged.el,
        button('Reset table', () => (storeFor(table.value)?.reset(table.value), render())),
        button('Reset all', () => (this.tweaks.reset(), render())),
        info,
      ),
      list,
    );
  }
}

function tweakRow(store: TweakStore, table: string, path: string, value: TweakValue, changed: boolean, rerender: () => void): HTMLElement {
  const def = store.defaultOf(table, path);
  const title = `${table}.${path}  (default ${def})`;
  const input =
    typeof value === 'boolean'
      ? h('input', { type: 'checkbox', checked: value, onchange: (e) => (store.set(table, path, (e.target as HTMLInputElement).checked), rerender()) })
      : h('input', {
          type: 'number',
          value,
          step: stepFor(value),
          onchange: (e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) store.set(table, path, v);
            rerender();
          },
        });
  return h('div', { class: changed ? 'tweak changed' : 'tweak', title }, h('span', {}, path), input);
}

/** A spinner step that suits the number's size. */
function stepFor(v: number): number {
  const a = Math.abs(v);
  if (a === 0) return 0.1;
  if (Number.isInteger(v) && a >= 1) return a >= 100 ? 10 : 1;
  return a >= 1 ? 0.1 : a >= 0.1 ? 0.01 : 0.001;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
