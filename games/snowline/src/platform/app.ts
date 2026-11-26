// The browser app: screens, the loop, input, and the run. URL parameters (SPEC 11.5):
//   ?seed=...       start straight into that valley
//   ?candidate=N    play the seed's candidate N (default 0) until the selection screen arrives (M2)
//   ?debug=1        the debug overlay; backquote hides and shows it
//   ?ff=HH:MM       with debug, fast-forward (by running ticks, never skipping) to that time on day 1
//   ?at=X,Y         with debug, start at that tile (a logged teleport, so replays still hold)
//   ?check=1        the golden replay check page (platform/check.ts)

import { SCREEN_H, SCREEN_W, TILE } from '../content/balance.ts';
import { TEXT } from '../content/text.ts';
import { Renderer } from '../render/renderer.ts';
import { candidate, type Protagonist } from '../sim/protagonist.ts';
import type { SimEvent } from '../sim/state.ts';
import { clock } from '../sim/time.ts';
import { runTo, stateHash, valley } from '../tools/runner.ts';
import { DebugPanel } from '../ui/debug.ts';
import { h } from '../ui/dom.ts';
import { Hud } from '../ui/hud.ts';
import { MapScreen } from '../ui/mapScreen.ts';
import { titleScreen } from '../ui/title.ts';
import { playEvents } from './audio.ts';
import { Input, type Action } from './input.ts';
import { download, parseReplay, toReplay } from './replay.ts';
import { Loop, Session } from './session.ts';

type Modal = 'title' | 'loading' | 'map' | 'pause' | null;

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
  private session: Session | null = null;
  private modal: Modal = null;
  private speed = 1;
  private scale = 1;
  private hover: { x: number; y: number } | null = null;
  private camera = { x: 0, y: 0 };

  private readonly params: URLSearchParams;

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
    this.stage.append(this.canvas, this.hud.el, this.overlay);
    root.append(this.stage);
    if (this.debug) root.append(this.debug.el);
    addEventListener('resize', () => this.fit());
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / this.scale + this.camera.x) / TILE);
      const y = Math.floor(((e.clientY - r.top) / this.scale + this.camera.y) / TILE);
      this.hover = { x, y };
    });
    this.canvas.addEventListener('mouseleave', () => (this.hover = null));
    this.fit();
  }

  start(): void {
    const seed = this.params.get('seed');
    if (seed) this.begin(seed);
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
    this.overlay.replaceChildren(...(content ? [content] : []));
    this.overlay.hidden = !content;
    this.input.playing = m === null;
    if (m !== null) this.input.release();
    this.loop.paused = m !== null || this.speed === 0;
  }

  private showTitle(): void {
    this.loop.stop();
    this.session = null;
    this.hud.el.hidden = true;
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = '#14161a';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this.setModal('title', titleScreen((seed) => this.begin(seed)));
  }

  /** Build the valley (a moment's work) and start a run in it. `then` runs before play starts. */
  private begin(seed: string, who?: Protagonist, then?: (s: Session) => void): void {
    this.setModal('loading', h('div', { class: 'screen loading' }, h('p', {}, 'Finding the valley…')));
    setTimeout(() => {
      const { rules, world } = valley(seed);
      const protagonist = who ?? candidate(seed, Number(this.params.get('candidate') ?? 0));
      const s = new Session(seed, protagonist, world, rules);
      this.session = s;
      this.renderer.setWorld(world);
      then?.(s);
      const at = this.debug ? /^(\d+),(\d+)$/.exec(this.params.get('at') ?? '') : null;
      if (at) s.queue({ c: 'debug-teleport', x: Number(at[1]), y: Number(at[2]) });
      this.fastForward(s);
      this.hud.el.hidden = false;
      this.setModal(null);
      this.loop.stop();
      this.loop.start();
      if (s.state.tick === 0) this.hud.say(TEXT.opening(protagonist.name), 9000);
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

  private onTick(): void {
    const s = this.session;
    if (!s) return;
    const events = s.tick();
    if (events.length) this.onEvents(events);
  }

  private onEvents(events: SimEvent[]): void {
    playEvents(events);
    for (const e of events) {
      if (e.type === 'viewpoint') {
        this.hud.say([e.index === 0 ? TEXT.viewpointKnoll : e.index === 1 ? TEXT.viewpointWreck : TEXT.viewpoint]);
      }
    }
  }

  private onFrame(alpha: number, now: number): void {
    const s = this.session;
    if (!s) return;
    this.camera = this.renderer.draw(s.state, alpha, now, this.debug && !this.debug.el.hidden ? this.hover : null);
    this.hud.update(s.state);
    this.debug?.update(s, this.hover, now);
  }

  private onAction(a: Action): void {
    switch (a) {
      case 'map':
        if (this.modal === 'map') this.setModal(null);
        else if (this.modal === null && this.session) this.openMap();
        break;
      case 'pause':
        if (this.modal === 'map' || this.modal === 'pause') this.setModal(null);
        else if (this.modal === null && this.session) this.openPause();
        break;
      case 'debug':
        if (this.debug) this.debug.el.hidden = !this.debug.el.hidden;
        break;
    }
  }

  private openMap(): void {
    const s = this.session!;
    this.map.draw(s.state, s.world, {
      revealAll: this.debug?.revealMap ?? false,
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
          h('button', { onclick: () => this.showTitle() }, 'Leave the valley'),
        ),
        h('p', { class: 'keys' }, 'Nothing is saved yet: leaving ends this run.'),
      ),
    );
  }

  private makeDebug(): DebugPanel {
    return new DebugPanel({
      setSpeed: (speed) => {
        this.speed = speed;
        this.loop.speed = speed || 1;
        this.loop.paused = this.modal !== null || speed === 0;
      },
      fire: () => this.session?.queue({ c: 'debug-fire' }),
      toggleMap: () => (this.modal === 'map' ? this.setModal(null) : this.modal === null && this.session && this.openMap()),
      exportReplay: () => {
        const s = this.session;
        if (s) download(`snowline-${s.seed}-t${s.state.tick}.json`, JSON.stringify(toReplay(s)));
      },
      importReplay: (file) => {
        file.text().then((text) => {
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
