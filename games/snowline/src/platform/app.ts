// The browser app: screens, the loop, input, saves, and the run. URL parameters (SPEC 11.5):
//   ?seed=...       start straight into that valley (candidate 0 unless ?candidate=N)
//   ?debug=1        the debug overlay; backquote hides and shows it
//   ?ff=HH:MM       with debug, fast-forward (by running ticks, never skipping) to that time
//   ?at=X,Y         with debug, start at that tile (a logged teleport, so replays still hold)
//   ?check=1        the golden replay check page (platform/check.ts)

import { SCREEN_H, SCREEN_W, TILE } from '../content/balance.ts';
import { TEXT } from '../content/text.ts';
import { Renderer } from '../render/renderer.ts';
import { availableActions, itemActions } from '../sim/actions.ts';
import { itemName } from '../sim/food.ts';
import { candidate, type Protagonist } from '../sim/protagonist.ts';
import { DEFAULT_SEED } from '../sim/newGame.ts';
import { decodeRun } from '../sim/runCode.ts';
import type { GameState, SimEvent } from '../sim/state.ts';
import { clock } from '../sim/time.ts';
import { runTo, stateHash, valley } from '../tools/runner.ts';
import { restOptions } from '../ui/actionsUi.ts';
import { makePage } from '../ui/make.ts';
import { packPage, type PackTab } from '../ui/pack.ts';
import { insightText } from '../ui/insight.ts';
import { notePage, type Note } from '../ui/note.ts';
import type { MakeEntry } from '../sim/craft.ts';
import { fireSiteProblem } from '../sim/fire.ts';
import { buildDef, buildSiteProblem } from '../sim/craft.ts';
import { standFor } from '../sim/reach.ts';
import { idx } from '../sim/world.ts';
import { DX4, DY4 } from '../sim/worldgen/grid.ts';
import { DebugPanel } from '../ui/debug.ts';
import { h } from '../ui/dom.ts';
import { Hud } from '../ui/hud.ts';
import { journal, type JournalTab } from '../ui/journal.ts';
import { MapScreen } from '../ui/mapScreen.ts';
import { lookAt, lookHint, offered, type Look } from '../ui/look.ts';
import type { Reach } from '../sim/reach.ts';
import { ListMenu } from '../ui/menu.ts';
import { selectScreen } from '../ui/select.ts';
import { summaryScreen } from '../ui/summary.ts';
import { randomSeed, titleScreen } from '../ui/title.ts';
import { loadPrefs, settingsScreen, type Prefs } from '../ui/settings.ts';
import { Sound, playEvents } from './audio.ts';
import { Input, type Action } from './input.ts';
import { download, parseReplay, toReplay } from './replay.ts';
import { deleteRun, loadRun, migrate, parseSave, restore, saveRun, toRecord, type SaveRecord } from './saves.ts';
import { Loop, Session } from './session.ts';

type Modal = 'title' | 'loading' | 'select' | 'map' | 'pause' | 'menu' | 'journal' | 'make' | 'pack' | 'summary' | 'settings' | 'note' | null;

/** A note can't be closed this soon after it shows (ms), so a key or click already on its way doesn't skip it unread. */
const NOTE_GUARD = 400;

/** Game minutes pass this many times faster while the survivor sleeps (SPEC 5.1: by running ticks). */
const SLEEP_SPEED = 90;
/** Game minutes pass this many times faster while the survivor is busy with a task (SPEC 5.1). */
const TASK_SPEED = 8;
/** Events that drop a fast-forwarded task back to normal speed for the rest of it: the player should see them. */
const STEADY_ON = new Set<SimEvent['type']>(['animal', 'thought', 'storm', 'slide', 'aircraft', 'sick', 'weather', 'lightning', 'notice', 'over']);

/** The tile the survivor faces. */
const faced = (st: GameState) => ({ x: st.player.x + DX4[st.player.facing]!, y: st.player.y + DY4[st.player.facing]! });

export class App {
  private readonly stage = h('div', { class: 'stage' });
  private readonly canvas = h('canvas', { width: SCREEN_W, height: SCREEN_H, class: 'view' });
  private readonly overlay = h('div', { class: 'overlay' });
  private readonly renderer = new Renderer(this.canvas);
  private readonly hud = new Hud();
  private readonly map = new MapScreen();
  private readonly debug: DebugPanel | null;
  private readonly input: Input;
  private readonly loop: Loop;
  private readonly params: URLSearchParams;
  private session: Session | null = null;
  private modal: Modal = null;
  private menu: ListMenu | null = null;
  private journalTab: JournalTab = 'notes';
  private packTab: PackTab = 'carrying';
  private speed = 1;
  /** Something happened during the current task, so it runs at normal speed until it ends. */
  private steadied = false;
  /** Choosing where to lay a fire (from the Make page): the tile under the mouse shows a preview. */
  private placing: MakeEntry | null = null;
  /** The Make page's entries, for its number keys. */
  private makeEntries: MakeEntry[] = [];
  private scale = 1;
  private hover: { x: number; y: number } | null = null;
  /** The mouse in stage pixels, for the label beside it. */
  private mouse: { x: number; y: number } | null = null;
  private readonly tip = h('div', { class: 'tip', hidden: true }, h('div', { class: 'name' }), h('div', { class: 'do' }));
  private look: Look | null = null;
  private lookKey = '';
  private camera = { x: 0, y: 0 };
  private taskLabel = '';
  private overShown = false;
  /** Thoughts and insights waiting to be shown as notes, each pausing the game (SPEC 12.2). */
  private notes: Note[] = [];
  private noteAt = 0;
  readonly sound = new Sound();

  constructor(root: HTMLElement, params: URLSearchParams) {
    this.params = params;
    this.debug = params.get('debug') === '1' ? this.makeDebug() : null;
    this.input = new Input(
      (c) => this.session?.queue(c),
      (a) => this.onAction(a),
    );
    this.loop = new Loop(
      () => this.onTick(),
      (alpha, now) => this.onFrame(alpha, now),
    );
    this.stage.append(this.canvas, this.hud.el, this.tip, this.overlay);
    root.append(this.stage);
    if (this.debug) root.append(this.debug.el);
    addEventListener('resize', () => this.fit());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autosave();
    });
    this.canvas.addEventListener('mousemove', (e) => this.pointAt(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
      this.mouse = null;
    });
    // The mouse (SPEC 12.4): a click does the obvious thing; a right-click offers everything.
    this.canvas.addEventListener('mousedown', (e) => {
      this.pointAt(e);
      if (e.button === 0) this.click();
    });
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.pointAt(e);
      this.contextMenu();
    });
    this.overlay.addEventListener('mousedown', (e) => {
      if (this.modal === 'note') this.closeNote();
      else if (e.target === this.overlay && this.modal === 'menu') this.setModal(null);
    });
    this.overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    this.applyPrefs(loadPrefs());
    const wakeSound = () => this.sound.start();
    addEventListener('keydown', wakeSound);
    addEventListener('pointerdown', wakeSound);
    this.fit();
  }

  private applyPrefs(p: Prefs): void {
    this.stage.style.setProperty('--text', String(p.textSize));
    this.renderer.reduceFlashes = p.reduceFlashes;
    this.hints = p.hints;
  }

  /** Show the how-to line under a thought (Prefs.hints). */
  private hints = true;

  /** The settings screen, from the title or the pause menu; `back` returns there. */
  private openSettings(back: () => void): void {
    this.setModal(
      'settings',
      settingsScreen({
        prefs: loadPrefs(),
        volume: this.sound.volume,
        muted: this.sound.muted,
        music: this.sound.music,
        apply: (p) => this.applyPrefs(p),
        setVolume: (v) => this.sound.setVolume(v),
        setMuted: (m) => this.sound.setMuted(m),
        setMusic: (m) => this.sound.setMusic(m),
        rebind: (k) => this.input.rebind(k),
        back,
      }),
    );
  }

  start(): void {
    const seed = this.params.get('seed');
    if (seed) this.begin(seed, candidate(seed, Number(this.params.get('candidate') ?? 0)));
    else this.showTitle();
  }

  /** Scale the logical screen by the largest whole number that fits the window (SPEC 6.1). */
  private fit(): void {
    this.scale = Math.max(1, Math.floor(Math.min(innerWidth / SCREEN_W, innerHeight / SCREEN_H)));
    this.stage.style.width = `${SCREEN_W * this.scale}px`;
    this.stage.style.height = `${SCREEN_H * this.scale}px`;
    this.stage.style.setProperty('--k', String(this.scale));
  }

  private setModal(m: Modal, content?: HTMLElement): void {
    this.modal = m;
    if (m !== 'menu') this.menu = null;
    this.overlay.replaceChildren(...(content ? [content] : []));
    this.overlay.classList.toggle('ctx', !!content?.classList.contains('context'));
    this.overlay.classList.toggle('noting', m === 'note');
    this.overlay.hidden = !content;
    this.input.playing = m === null;
    if (m !== null) this.input.release();
    this.loop.paused = m !== null || this.speed === 0;
    (this.overlay.querySelector('[autofocus]') as HTMLElement | null)?.focus();
  }

  // ---- Screens before and after a run ----

  private showTitle(): void {
    this.loop.stop();
    this.session = null;
    this.notes = [];
    this.hud.el.hidden = true;
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = '#14161a';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Behind the title, the first valley at dusk.
    setTimeout(() => {
      if (this.modal !== 'title') return;
      const { rules, world } = valley(DEFAULT_SEED);
      const s = new Session(DEFAULT_SEED, candidate(DEFAULT_SEED, 0), world, rules);
      s.state.animals = [];
      for (let n = 0; n < 2500; n++) s.tick();
      this.renderer.setWorld(world);
      if (this.modal === 'title') this.renderer.draw(s.state, 0, performance.now());
    }, 50);
    const screen = titleScreen({
      start: (seedOrCode) => {
        const run = decodeRun(seedOrCode);
        if (run) this.begin(run.seed, run.protagonist);
        else this.showSelect(seedOrCode);
      },
      continue: () => this.continueSaved(),
      settings: () => this.openSettings(() => this.showTitle()),
      importSave: (file) =>
        file
          .text()
          .then((t) => this.resume(parseSave(t)))
          .catch((e) => alert(`Could not load that save: ${(e as Error).message}`)),
    });
    this.setModal('title', screen);
    void loadRun().then((r) => {
      if (r && this.modal === 'title') screen.dispatchEvent(new CustomEvent('saved', { detail: r }));
    });
  }

  private showSelect(seed: string): void {
    this.setModal('select', selectScreen(seed, (p) => this.begin(seed, p), () => this.showTitle()));
  }

  private continueSaved(): void {
    void loadRun().then((r) => {
      if (!r) return;
      try {
        this.resume(migrate(r));
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  private resume(r: SaveRecord): void {
    this.begin(r.seed, r.state.protagonist, undefined, r);
  }

  /** Build the valley (a moment's work) and start a run in it, or carry on a saved one. */
  private begin(seed: string, who: Protagonist, then?: (s: Session) => void, saved?: SaveRecord): void {
    this.setModal('loading', h('div', { class: 'screen loading' }, h('p', {}, 'Finding the valley…')));
    setTimeout(() => {
      const { rules, world } = valley(seed);
      const s = new Session(seed, who, world, rules);
      if (saved) s.state = restore(saved, rules);
      this.session = s;
      // In debug, the running session for scripts that drive the game (renders/kidmap).
      if (this.debug) (window as unknown as { __snowline: Session }).__snowline = s;
      this.overShown = false;
      this.notes = [];
      this.sound.newRun();
      this.renderer.setWorld(world);
      then?.(s);
      const at = this.debug ? /^(\d+),(\d+)$/.exec(this.params.get('at') ?? '') : null;
      if (at) s.queue({ c: 'debug-teleport', x: Number(at[1]), y: Number(at[2]) });
      this.fastForward(s);
      this.hud.reset(s.state);
      this.hud.el.hidden = false;
      this.setModal(null);
      this.loop.stop();
      this.loop.start();
      if (s.state.tick === 0) this.hud.say(TEXT.opening(who.name), 9000);
    }, 30);
  }

  /** `?ff=HH:MM` (debug only): run ticks until the clock reads that time. */
  private fastForward(s: Session): void {
    const ff = this.debug ? this.params.get('ff') : null;
    const m = ff ? /^(\d{1,2}):(\d{2})$/.exec(ff) : null;
    if (!m) return;
    const target = Number(m[1]) * 60 + Number(m[2]);
    for (let n = 0; n < 15000 && clock(s.state.tick).minute !== target; n++) s.tick();
  }

  private showSummary(): void {
    const s = this.session!;
    this.setModal(
      'summary',
      summaryScreen(s.state, {
        newValley: () => this.showSelect(randomSeed()),
        again: () => this.begin(s.seed, s.protagonist),
        title: () => this.showTitle(),
      }),
    );
  }

  private autosave(): void {
    const s = this.session;
    if (s && !s.state.over) void saveRun(s.state);
  }

  // ---- The loop ----

  private onTick(): void {
    const s = this.session;
    if (!s || s.state.over) return;
    const events = s.tick();
    if (events.length) this.onEvents(events);
  }

  private onEvents(events: SimEvent[]): void {
    playEvents(events, this.sound, this.session?.state);
    for (const e of events) {
      if (e.type === 'task-start') this.steadied = false;
      else if (STEADY_ON.has(e.type)) this.steadied = true;
      if (e.type === 'viewpoint') {
        this.hud.say([e.index === 0 ? TEXT.viewpointKnoll : e.index === 1 ? TEXT.viewpointWreck : TEXT.viewpoint]);
      } else if (e.type === 'thought') {
        this.notes.push({ kind: 'thought', text: e.text, hint: this.hints ? e.hint : '' });
      } else if (e.type === 'discovery' && this.session) {
        const card = insightText(this.session.state, e.key);
        if (card) this.notes.push({ kind: 'insight', ...card });
      } else if (e.type === 'sleep') {
        this.autosave();
      } else if (e.type === 'lightning') {
        this.renderer.lightning(performance.now());
      } else if (e.type === 'over') {
        void deleteRun();
      }
    }
    if (this.notes.length && this.modal === null) this.showNote();
  }

  /** Pause on the next thought or insight, on a notebook slip. */
  private showNote(): void {
    const n = this.notes.shift();
    if (!n) return this.setModal(null);
    this.noteAt = performance.now();
    this.setModal('note', notePage(n, this.notes.length));
  }

  /** Done reading: the next note, or back to play. */
  private closeNote(): void {
    if (performance.now() - this.noteAt < NOTE_GUARD) return;
    this.showNote();
  }

  private onFrame(alpha: number, now: number): void {
    const s = this.session;
    if (!s) return;
    const st = s.state;
    this.loop.speed = (this.speed || 1) * (st.sleep ? SLEEP_SPEED : st.task && !this.steadied ? TASK_SPEED : 1);
    this.stage.classList.toggle('asleep', !!st.sleep && !st.sleep.awake);
    this.updateLook(st);
    const mark = this.look && this.modal === null && (this.look.primary || this.look.options.length) ? { x: this.look.x, y: this.look.y } : null;
    this.camera = this.renderer.draw(st, alpha, now, this.debug && !this.debug.el.hidden ? this.hover : null, this.placing ? null : mark, this.ghost(st));
    this.hud.update(st, this.taskLabel);
    this.debug?.update(s, this.hover, now);
    this.sound.update(this.modal === null || this.modal === 'menu' ? st : null, s.world, this.loop.speed);
    if (st.over && !this.overShown && this.modal === null) {
      this.overShown = true;
      setTimeout(() => this.showSummary(), 2500);
    }
  }

  // ---- Keys ----

  private onAction(a: Action): void {
    if (a === 'debug') {
      if (this.debug) this.debug.el.hidden = !this.debug.el.hidden;
      return;
    }
    if (this.modal === 'note') {
      if (a === 'act' || a === 'confirm' || a === 'pause') this.closeNote();
      return;
    }
    if (this.modal === 'menu' && this.menu) {
      if (a === 'pause') this.setModal(null);
      else this.menu.key(a);
      return;
    }
    if (this.modal === 'pack') {
      if (a === 'pause' || a === 'inventory') this.setModal(null);
      else if (a === 'left' || a === 'right') {
        this.packTab = this.packTab === 'carrying' ? 'found' : 'carrying';
        this.openInventory();
      } else if (a.startsWith('slot') && this.packTab === 'carrying') this.openItem(Number(a.slice(4)) - 1);
      return;
    }
    if (this.modal === 'make') {
      if (a === 'pause' || a === 'craft') this.setModal(null);
      else if (a.startsWith('slot')) {
        const e = this.makeEntries[Number(a.slice(4)) - 1];
        if (e && (!e.missing || e.where === 'placed')) this.chooseMake(e);
      }
      return;
    }
    if (this.modal === 'journal') {
      if (a === 'pause' || a === 'journal') this.setModal(null);
      else if (a === 'left' || a === 'right') this.turnPage(a === 'right' ? 1 : -1);
      return;
    }
    if (this.modal === 'map') {
      if (a === 'map' || a === 'pause') this.setModal(null);
      return;
    }
    if (this.modal === 'pause') {
      if (a === 'pause') this.setModal(null);
      return;
    }
    if (this.modal === 'settings') return;
    if (this.modal !== null) return;
    const s = this.session;
    if (!s || s.state.over) return;
    if (s.state.sleep) {
      if (a === 'act' || a === 'confirm' || a === 'pause' || a === 'rest') s.queue({ c: 'wake' });
      return;
    }
    if (this.placing) {
      if (a === 'pause' || a === 'craft') return this.stopPlacing();
      if (a === 'act' || a === 'confirm') {
        const at = faced(s.state);
        return this.place(at.x, at.y);
      }
    }
    switch (a) {
      case 'act':
        return this.openActions();
      case 'inventory':
        return this.openInventory();
      case 'craft':
        return this.openMake();
      case 'journal':
        return this.openJournal();
      case 'rest':
        return this.openRest();
      case 'map':
        return this.openMap();
      case 'pause':
        if (s.state.task || s.state.player.route) s.queue({ c: 'cancel' });
        else this.openPause();
        return;
      default:
        if (a.startsWith('slot')) this.openItem(Number(a.slice(4)) - 1);
    }
  }

  private openList(title: string, items: { label: string; hint?: string; disabled?: boolean; run: () => void }[], note?: string, at?: { x: number; y: number }): void {
    this.menu = new ListMenu(
      title,
      items,
      (i) => {
        const it = items[i]!;
        this.setModal(null);
        it.run();
      },
      note ?? 'Number keys, or arrows and Enter · Esc to close',
    );
    // In play, a menu is a slip torn from the kid's notebook.
    this.menu.el.classList.add('slip');
    if (at) {
      // A small menu beside the cursor, kept on the screen.
      const el = this.menu.el;
      el.classList.add('context');
      el.style.left = `${Math.min(at.x + 6, SCREEN_W * this.scale * 0.62)}px`;
      el.style.top = `${Math.min(at.y + 6, SCREEN_H * this.scale * 0.55)}px`;
    }
    this.setModal('menu', this.menu.el);
  }

  private queueAct(o: { action: string; tile: number; label: string }): void {
    this.taskLabel = o.label;
    this.session!.queue({ c: 'act', action: o.action, tile: o.tile });
  }

  // ---- The mouse ----

  private pointAt(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / this.scale + this.camera.x) / TILE);
    const y = Math.floor(((e.clientY - r.top) / this.scale + this.camera.y) / TILE);
    this.hover = { x, y };
    const sr = this.stage.getBoundingClientRect();
    this.mouse = { x: e.clientX - sr.left, y: e.clientY - sr.top };
  }

  /** What's under the mouse, worked out again only when the tile or the moment changes. */
  private updateLook(st: GameState): void {
    const s = this.session;
    const hv = this.modal === null && s && !st.over ? this.hover : null;
    const key = hv ? `${hv.x},${hv.y},${st.tick},${st.inventory.length}` : '';
    if (key !== this.lookKey) {
      this.lookKey = key;
      this.look = hv && s ? lookAt(st, s.world, hv.x, hv.y) : null;
      const l = this.look;
      if (this.placing && hv && s) {
        const why = this.placeProblem(hv.x, hv.y);
        this.canvas.dataset.cursor = why ? 'none' : 'hand';
        this.tip.hidden = false;
        (this.tip.firstChild as HTMLElement).textContent = why ? `Not here: ${why}` : this.placing.id === 'fire' ? 'Lay the fire here' : `${this.placing.label} here`;
        (this.tip.lastChild as HTMLElement).textContent = 'click to choose · Esc to stop';
        return;
      }
      this.canvas.dataset.cursor = l ? l.cursor : 'none';
      this.tip.hidden = !l;
      if (l) {
        (this.tip.firstChild as HTMLElement).textContent = l.name;
        (this.tip.lastChild as HTMLElement).textContent = lookHint(l);
      }
    }
    if (this.look && this.mouse) {
      this.tip.style.left = `${this.mouse.x + 14}px`;
      this.tip.style.top = `${this.mouse.y + 10}px`;
    }
  }

  private send(l: Look, r: Reach | null): void {
    const s = this.session!;
    const p = s.state.player;
    this.taskLabel = r ? r.label : '';
    const here = l.x === p.x && l.y === p.y;
    if (!r) {
      if (l.walk) s.queue({ c: 'goto', x: l.x, y: l.y, onto: true, action: null, at: 'front' });
      return;
    }
    s.queue({ c: 'goto', x: l.x, y: l.y, onto: here, action: r.action, at: r.at });
  }

  private click(): void {
    const s = this.session;
    if (!s || this.modal !== null || s.state.over) return;
    if (s.state.sleep) {
      s.queue({ c: 'wake' });
      return;
    }
    if (this.placing) {
      if (this.hover) this.place(this.hover.x, this.hover.y);
      return;
    }
    this.lookKey = '';
    this.updateLook(s.state);
    const l = this.look;
    if (!l) return;
    if (l.primary) return this.send(l, l.primary);
    if (l.options.some((o) => !o.spent) || (l.options.length && !l.walk)) return this.contextMenu();
    this.send(l, null);
  }

  private contextMenu(): void {
    const s = this.session;
    if (!s || this.modal !== null || s.state.over || s.state.sleep) return;
    this.lookKey = '';
    this.updateLook(s.state);
    const l = this.look;
    if (!l || (!l.options.length && !l.walk)) return;
    const items = l.options.map((o) => ({ ...offered(o), run: () => this.send(l, o) }));
    if (l.walk) items.push({ label: 'Walk here', hint: '', run: () => this.send(l, null) });
    this.openList(l.name, items, 'Click, or a number key · Esc to close', this.mouse ?? undefined);
  }

  private openActions(): void {
    const s = this.session!;
    const opts = availableActions(s.state, s.world);
    if (opts.length === 0) {
      this.hud.say(['Nothing to do here.'], 1500);
      return;
    }
    if (opts.length === 1 && !opts[0]!.spent) return this.queueAct(opts[0]!);
    this.openList(
      'Do what?',
      opts.map((o) => ({ ...offered(o), run: () => this.queueAct(o) })),
    );
  }

  private openItem(slot: number): void {
    const s = this.session!;
    const it = s.state.inventory[slot];
    if (!it) return;
    const opts = itemActions(s.state, s.world, slot);
    this.openList(
      `${itemName(s.state, it)}${it.n > 1 ? ` ×${it.n}` : ''}`,
      opts.map((o) => ({
        label: o.label,
        hint: o.minutes > 2 ? `${o.minutes} min` : '',
        run: () => {
          this.taskLabel = o.label;
          s.queue({ c: 'use', action: o.action, slot });
        },
      })),
    );
  }

  private openInventory(): void {
    const s = this.session!;
    this.setModal(
      'pack',
      packPage(
        s.state,
        this.packTab,
        (slot) => this.openItem(slot),
        (t) => {
          this.packTab = t;
          this.openInventory();
        },
      ),
    );
  }

  private openMake(): void {
    const s = this.session!;
    const { el, entries } = makePage(s.state, s.world, (e) => this.chooseMake(e));
    this.makeEntries = entries;
    this.setModal('make', el);
  }

  private chooseMake(e: MakeEntry): void {
    const s = this.session!;
    this.setModal(null);
    if (e.where === 'placed') {
      this.placing = e;
      this.lookKey = '';
      this.hud.say([e.id === 'fire' ? 'Where should the fire go? Somewhere open, near where I sleep.' : buildDef(e.id.slice(6))!.ask], 4000);
      return;
    }
    this.taskLabel = e.label;
    s.queue({ c: 'craft', recipe: e.id });
  }

  private stopPlacing(): void {
    this.placing = null;
    this.lookKey = '';
  }

  /** Why what's being placed can't go at (x, y), or null. */
  private placeProblem(x: number, y: number): string | null {
    const s = this.session!;
    const e = this.placing!;
    const tile = idx(x, y);
    const why = e.id === 'fire' ? fireSiteProblem(s.state, s.world, tile) : buildSiteProblem(s.state, s.world, buildDef(e.id.slice(6))!, tile);
    if (why) return why;
    return standFor(s.state, s.world, x, y) ? null : "can't get beside it";
  }

  private ghost(st: GameState): { x: number; y: number; ok: boolean; kind: string } | null {
    if (!this.placing || this.modal !== null) return null;
    const at = this.hover ?? faced(st);
    return { ...at, ok: !this.placeProblem(at.x, at.y), kind: this.placing.id.replace(/^build:/, '') };
  }

  /** Place it at (x, y): walk beside the spot, set it out, and put in what's carried (building it, if that's everything). */
  private place(x: number, y: number): void {
    const e = this.placing!;
    const why = this.placeProblem(x, y);
    if (why) {
      this.hud.say([`Not there: ${why}.`], 2000);
      return;
    }
    this.stopPlacing();
    this.taskLabel = e.id === 'fire' ? 'Clearing a spot and laying a fire' : e.label;
    this.session!.queue({ c: 'goto', x, y, onto: false, action: e.id === 'fire' ? 'place:fire' : `place:${e.id.slice(6)}`, at: 'front' });
  }

  private openRest(): void {
    const s = this.session!;
    this.openList(
      'Rest',
      restOptions(s.state).map((o) => ({
        label: o.label,
        run: () => {
          this.taskLabel = '';
          s.queue({ c: 'sleep', minutes: o.minutes, awake: o.awake });
        },
      })),
    );
  }

  private openJournal(): void {
    const s = this.session!;
    this.setModal(
      'journal',
      journal(s.state, this.journalTab, (t) => {
        this.journalTab = t;
        this.openJournal();
      }),
    );
  }

  private turnPage(d: number): void {
    const tabs: JournalTab[] = ['notes', 'log', 'skills', 'body'];
    this.journalTab = tabs[(tabs.indexOf(this.journalTab) + d + tabs.length) % tabs.length]!;
    this.openJournal();
  }

  private openMap(): void {
    const s = this.session!;
    this.map.draw(s.state, s.world, {
      revealAll: this.debug?.revealMap ?? false,
      accurate: !!this.debug,
      onPick: this.debug
        ? (x, y) => {
            s.queue({ c: 'debug-teleport', x, y });
            this.setModal(null);
          }
        : undefined,
    });
    this.setModal('map', this.map.el);
  }

  private openPause(): void {
    const s = this.session!;
    const who = s.protagonist;
    this.setModal(
      'pause',
      h(
        'div',
        { class: 'screen pause' },
        h('h2', {}, 'Paused'),
        h('p', {}, `${who.name}, ${who.age}. Valley: ${s.seed}`),
        h(
          'div',
          { class: 'menu' },
          h('button', { onclick: () => this.setModal(null), autofocus: true }, 'Carry on'),
          h('button', { onclick: () => void saveRun(s.state).then(() => this.showTitle()) }, 'Save and leave'),
          h('button', { onclick: () => download(`snowline-save-${s.seed}-day${clock(s.state.tick).day}.json`, JSON.stringify(toRecord(s.state))) }, 'Save to a file'),
          h('button', { onclick: () => this.openSettings(() => this.openPause()) }, 'Settings'),
        ),
        h('p', { class: 'keys' }, 'The game saves itself whenever you sleep. Death is final.'),
      ),
    );
  }

  private makeDebug(): DebugPanel {
    return new DebugPanel({
      setSpeed: (speed) => {
        this.speed = speed;
        this.loop.paused = this.modal !== null || speed === 0;
      },
      fire: () => this.session?.queue({ c: 'debug-fire' }),
      give: (k, d, n) => this.session?.queue({ c: 'debug-give', k, d, n }),
      vital: (vital, value) => this.session?.queue({ c: 'debug-vital', vital, value }),
      toggleMap: () => (this.modal === 'map' ? this.setModal(null) : this.modal === null && this.session && this.openMap()),
      exportReplay: () => {
        const s = this.session;
        if (s) download(`snowline-${s.seed}-t${s.state.tick}.json`, JSON.stringify(toReplay(s)));
      },
      importReplay: (file) => {
        void file.text().then((text) => {
          try {
            const r = parseReplay(text);
            this.begin(r.seed, r.protagonist, (s) => {
              runTo(s.state, s.world, r.commands, r.tick);
              s.log.push(...r.commands);
              const match = stateHash(s.state) === r.stateHash;
              setTimeout(() => this.hud.say([match ? `Replay loaded at tick ${r.tick}; the state matches.` : `Replay loaded, but the state differs (${r.version}).`]), 50);
            });
          } catch (e) {
            this.hud.say([`Not a replay: ${(e as Error).message}`]);
          }
        });
      },
    });
  }
}

/** How fresh food is, in words. */
