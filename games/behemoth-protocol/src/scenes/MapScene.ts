import { MODES } from '../content/modes';
import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { APPROACHES } from '../content/approaches';
import { BIOMES } from '../content/biomes';
import { ARMOR_ARCS } from '../content/chassis';
import { DOCTRINES } from '../content/doctrines';
import { DEPOT, DIRECTIVE } from '../content/tuning';
import { WEAPONS } from '../content/weapons';
import { CALLSIGNS } from '../content/callsigns';
import { DIRECTIVES } from '../content/directives';
import { integrityColor } from '../render/cutaway';
import { makeMapBackground, MAP_ICON, mapIconSheet, type MapIcon } from '../render/mapArt';
import { FONT_KEY, fontText, wrapText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { openDepot } from '../sim/depot';
import { hashSeed } from '../sim/rng';
import { directiveAsk, enterMapNode, restoreBehemoth, type RunState } from '../sim/run';
import { lastEventOutcome } from '../sim/mapEvents';
import { CONDITIONS, conditionName } from '../content/conditions';
import { MAP_EVENTS } from '../content/mapEvents';
import {
  depotKey,
  hiddenEvent,
  hiddenIntel,
  isFinalNode,
  nodeAt,
  onRouteFrom,
  reachable,
  samePos,
  type BattleIntel,
  type IntelField,
  type MapNode,
  type MapPos,
} from '../sim/sectorMap';
import { checkpoint, enterNode, type RunContext } from './flow';
import { fitCamera } from './screen';

/**
 * The sector map (SPEC §3, §3.1, §10): the current sector's routes drawn bottom to top (the way the
 * Behemoth drives), the run's condition on the left, and the intel for the node under the pointer
 * (or the one selected) on the right. Click a node the route reaches, or press its number, then
 * click it again or press Enter to roll out. The run's Directive and its sector objectives so far
 * head the left panel.
 */
export class MapScene extends Phaser.Scene {
  private ctx!: RunContext;
  private ui: Phaser.GameObjects.GameObject[] = [];
  private intel: Phaser.GameObjects.GameObject[] = [];
  private options: MapPos[] = [];
  private selected = 0;
  private hover: MapPos | null = null;
  private sector = 0;
  private gone = false;
  private rings: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('map');
  }

  init(data: RunContext): void {
    this.ctx = data;
    this.gone = false;
    this.hover = null;
    this.selected = 0;
  }

  private get run(): RunState {
    return this.ctx.run;
  }

  create(): void {
    fitCamera(this);
    const { width, height } = RESOLUTION;
    this.ui = [];
    this.intel = [];
    this.rings = [];
    this.add.rectangle(0, 0, width, height, hex(PAL.hudBg)).setOrigin(0, 0);
    const kb = this.input.keyboard!;

    if (this.run.next === 'won' || this.run.next === 'failed') {
      // The run is over: on to its summary.
      enterNode(this, this.ctx);
      return;
    }

    this.options = reachable(this.run.map, this.run.at);
    this.sector = this.options[0]?.sector ?? this.run.at?.sector ?? 0;
    this.drawStatus();
    this.drawMap();
    this.drawIntel();

    kb.on('keydown-ENTER', () => this.go());
    kb.on('keydown-SPACE', () => this.go());
    kb.on('keydown-LEFT', () => this.cycle(-1));
    kb.on('keydown-A', () => this.cycle(-1));
    kb.on('keydown-RIGHT', () => this.cycle(1));
    kb.on('keydown-D', () => this.cycle(1));
    kb.on('keydown-ESC', () => this.scene.start('title'));
    for (let i = 0; i < 9; i++) kb.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][i]}`, () => this.pick(i));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const at = this.nodeUnder(p.worldX, p.worldY);
      if (!samePos(at, this.hover) && (at || this.hover)) {
        this.hover = at;
        this.drawIntel();
      }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const at = this.nodeUnder(p.worldX, p.worldY);
      const i = this.options.findIndex((o) => samePos(o, at));
      if (i < 0) return;
      if (i === this.selected) this.go();
      else this.pick(i);
    });
  }

  // ── Choosing ──────────────────────────────────────────────────────────────────────────────────

  private pick(i: number): void {
    if (i >= this.options.length) return;
    this.selected = i;
    this.drawRings();
    this.drawIntel();
  }

  private cycle(d: number): void {
    if (this.options.length > 0) this.pick((this.selected + d + this.options.length) % this.options.length);
  }

  private go(): void {
    const pos = this.options[this.selected];
    if (this.gone || !pos) return;
    this.gone = true;
    this.ctx = { ...this.ctx, run: enterMapNode(this.run, pos) };
    checkpoint(this.ctx);
    enterNode(this, this.ctx);
  }

  // ── Layout ────────────────────────────────────────────────────────────────────────────────────

  /** Screen position of a node in the sector shown (a little jitter so the lanes don't read as a grid). */
  private nodeXY(n: MapNode): { x: number; y: number } {
    const sector = this.run.map.sectors[this.sector]!;
    const layers = sector.layers;
    const { left, right, top, bottom } = mapRect();
    const cols = Math.max(1, ...sector.nodes.map((m) => m.col)) + 1;
    const lane = Math.min(MAX_LANE, (right - left - 2 * MAP_ICON) / Math.max(1, cols - 1));
    const lo = top + MAP_ICON / 2 + 8;
    const hi = bottom - MAP_ICON / 2 - 6;
    const h = hashSeed(this.run.seed, this.sector, n.id);
    const ends = n.layer === 0 || n.layer === layers - 1;
    const jx = ends ? 0 : ((h & 0xff) / 255 - 0.5) * 12;
    const jy = ends ? 0 : (((h >>> 8) & 0xff) / 255 - 0.5) * 6;
    return {
      x: Math.round((left + right) / 2 + (n.col - (cols - 1) / 2) * lane + jx),
      y: Math.round(hi - (n.layer * (hi - lo)) / (layers - 1) + jy),
    };
  }

  private nodeUnder(x: number, y: number): MapPos | null {
    const r = MAP_ICON / 2;
    for (const n of this.run.map.sectors[this.sector]!.nodes) {
      const p = this.nodeXY(n);
      if (Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r) return { sector: this.sector, node: n.id };
    }
    return null;
  }

  private visited(pos: MapPos): boolean {
    return this.run.path.some((p) => samePos(p, pos));
  }

  // ── Drawing ───────────────────────────────────────────────────────────────────────────────────

  private text(x: number, y: number, s: string, color: string = PAL.hudText, scale = 1, list = this.ui): Phaser.GameObjects.BitmapText {
    const t = this.add.bitmapText(x, y, FONT_KEY, fontText(s)).setTint(hex(color)).setScale(scale);
    list.push(t);
    return t;
  }

  private drawMap(): void {
    const sector = this.run.map.sectors[this.sector]!;
    const { left, right, top, bottom } = mapRect();
    const w = right - left;
    const h = bottom - top;
    const on = (id: number) => this.visited({ sector: this.sector, node: id });
    const xy = sector.nodes.map((n) => this.nodeXY(n));
    const routes: [number, number, number, number][] = [];
    for (const n of sector.nodes) for (const id of n.next) routes.push([xy[n.id]!.x - left, xy[n.id]!.y - top, xy[id]!.x - left, xy[id]!.y - top]);

    // The sheet: this sector's ground as a field map, a grid with its references, a north arrow.
    makeMapBackground(this, MAP_SHEET, {
      w,
      h,
      biome: sector.biome,
      seed: hashSeed(this.run.seed, 0x3a95, this.sector),
      clear: xy.map((p) => ({ x: p.x - left, y: p.y - top, r: MAP_ICON / 2 })),
      routes,
      grid: GRID,
    });
    this.add.image(left, top, MAP_SHEET).setOrigin(0, 0);
    const frame = this.add.graphics();
    frame.lineStyle(1, hex(PAL.outline), 1).strokeRect(left - 1.5, top - 1.5, w + 3, h + 3);
    frame.lineStyle(1, hex(PAL.hudLine), 1).strokeRect(left - 2.5, top - 2.5, w + 5, h + 5);
    for (let gx = GRID, i = 0; gx < w; gx += GRID, i++) this.text(left + gx + 2, top + 2, String.fromCharCode(65 + i), INK_TEXT).setAlpha(0.7);
    for (let gy = GRID, i = 1; gy < h; gy += GRID, i++) this.text(left + 2, top + gy + 2, String(i), INK_TEXT).setAlpha(0.7);
    this.text(right - 16, top + 26, 'N', INK_TEXT).setOrigin(0.5, 0);

    // Routes: inked dashes; the way taken in the player's cyan over a dark edge; the roads out of
    // the node the Behemoth is at, bolder.
    const g = this.add.graphics();
    for (const n of sector.nodes) {
      for (const id of n.next) {
        const a = xy[n.id]!;
        const b = xy[id]!;
        if (on(n.id) && on(id)) {
          g.lineStyle(4, hex(PAL.outline), 1).lineBetween(a.x, a.y, b.x, b.y);
          g.lineStyle(2, hex(PAL.glow), 1).lineBetween(a.x, a.y, b.x, b.y);
        } else {
          const ahead = samePos(this.run.at, { sector: this.sector, node: n.id }) || (!this.run.at && n.layer === 0);
          dashed(g, a.x, a.y, b.x, b.y, ahead ? 2 : 1, hex(INK_TEXT), ahead ? 0.9 : 0.55);
        }
      }
    }
    for (const n of sector.nodes) this.drawNode(n, xy[n.id]!);
    this.drawRings();

    this.text((left + right) / 2, RESOLUTION.height - 12, 'Click a node or 1-9, then Enter    Esc - title', PAL.hudDim).setOrigin(0.5, 0);
  }

  /** What a node's icon shows: its ground (fogged ground shows as fog), a depot, or an event. */
  private iconFor(n: MapNode, hidden: readonly IntelField[]): MapIcon {
    if (n.kind === 'depot') return 'depot';
    if (n.kind === 'event') return 'event';
    if (hidden.includes('approach')) return 'fog';
    return n.battle!.approach ?? 'mix';
  }

  private drawNode(n: MapNode, { x, y }: { x: number; y: number }): void {
    const pos = { sector: this.sector, node: n.id };
    const done = this.visited(pos) && !samePos(pos, this.run.at);
    const reach = this.options.some((o) => samePos(o, pos));
    const hidden = n.kind === 'battle' && !this.visited(pos) ? hiddenIntel(n.battle!, reach, this.run.behemoth.grades.sensors ?? 1) : [];
    const biome = this.run.map.sectors[this.sector]!.biome;
    const alpha = done ? 0.5 : 1;
    this.add.image(x, y, mapIconSheet(biome), this.iconFor(n, hidden)).setAlpha(alpha);
    if (n.kind !== 'battle') return;
    const g = this.add.graphics().setAlpha(alpha);
    const by = y - MAP_ICON / 2 + 3;

    // The condition (SPEC §4.6) under the icon's left shoulder: a moon and a star for night, a
    // raincloud for a storm (shapes, not letters, so they never read as a mode's initial).
    const cond = n.battle!.condition;
    if (cond) {
      const cx = x - MAP_ICON / 2 + 3;
      const cy = y + MAP_ICON / 2 - 4;
      g.fillStyle(hex(PAL.outline), 1).fillRect(cx - 4, cy - 4, 9, 9);
      g.fillStyle(hex(cond === 'night' ? '#1c2440' : '#3a4654'), 1).fillRect(cx - 3, cy - 3, 7, 7);
      const px = (color: string, cells: readonly (readonly [number, number, number?])[]) => {
        g.fillStyle(hex(color), 1);
        for (const [dx, dy, w = 1] of cells) g.fillRect(cx + dx, cy + dy, w, 1);
      };
      if (cond === 'night') {
        px('#e8e2b0', [[-2, -1, 2], [-3, 0, 4], [-3, 1, 4], [-2, 2, 2]]);
        px('#fff6d0', [[2, -2], [3, -1]]);
      } else {
        px('#e4e9ee', [[-1, -3, 3], [-3, -2, 7], [-3, -1, 7]]);
        px('#8fb4d8', [[-2, 1], [0, 1], [2, 1], [-1, 3], [1, 3]]);
      }
    }

    // The defenders' marker on the icon's shoulder: red, or amber for strong defenses; an objective
    // gets a bigger one. Strength only shows when it isn't fogged.
    const strength = hidden.includes('strength') ? 'normal' : n.battle!.strength;
    const r = strength === 'objective' ? 5 : 3;
    const bx = x + MAP_ICON / 2 - 3;
    g.fillStyle(hex(PAL.outline), 1).fillRect(bx - r - 1, by - r - 1, 2 * r + 3, 2 * r + 3);
    g.fillStyle(hex(strength === 'normal' ? PAL.enemy : PAL.amber), 1).fillRect(bx - r, by - r, 2 * r + 1, 2 * r + 1);
    g.lineStyle(1, hex(strength === 'normal' ? PAL.enemyHi : PAL.amberHot), 1);
    g.lineBetween(bx - r + 1, by - r + 1, bx + r, by + r).lineBetween(bx + r, by - r + 1, bx - r + 1, by + r);

    // A Breach or Chase battle: its mode's initial on the other shoulder (SPEC §4.4). Never fogged.
    const mode = n.battle!.mode;
    if (mode !== 'assault') {
      const mx = x - MAP_ICON / 2 + 3;
      g.fillStyle(hex(PAL.outline), 1).fillRect(mx - 4, by - 4, 9, 9);
      g.fillStyle(hex(PAL.hudBg), 1).fillRect(mx - 3, by - 3, 7, 7);
      this.text(mx - 1, by - 2, MODES[mode].name[0]!, PAL.amber).setAlpha(alpha);
    }
  }

  /** The node the Behemoth is at, and pulsing frames on the choices (the selected one brightest), numbered. */
  private drawRings(): void {
    for (const r of this.rings) r.destroy();
    this.rings = [];
    const sector = this.run.map.sectors[this.sector]!;
    const at = this.run.at && this.run.at.sector === this.sector ? sector.nodes[this.run.at.node] : null;
    const R = MAP_ICON / 2 + 2;
    if (at) {
      const p = this.nodeXY(at);
      const ring = this.add.graphics();
      ring.lineStyle(3, hex(PAL.outline), 1).strokeCircle(p.x, p.y, R + 1);
      ring.lineStyle(1, hex(PAL.glowHot), 1).strokeCircle(p.x, p.y, R + 1);
      this.rings.push(ring);
    }
    this.options.forEach((o, i) => {
      const p = this.nodeXY(sector.nodes[o.node]!);
      const ring = this.add.graphics();
      const sel = i === this.selected;
      ring.lineStyle(sel ? 4 : 3, hex(PAL.outline), 1).strokeRect(p.x - R, p.y - R, 2 * R, 2 * R);
      ring.lineStyle(sel ? 2 : 1, hex(sel ? PAL.glow : PAL.glowDim), 1).strokeRect(p.x - R, p.y - R, 2 * R, 2 * R);
      this.tweens.add({ targets: ring, alpha: { from: 1, to: 0.35 }, duration: 500, yoyo: true, repeat: -1 });
      this.rings.push(ring);
      // The choice's number on a dark tag at the frame's corner.
      const tag = this.add.rectangle(p.x - R - 1, p.y - R - 1, 7, 9, hex(PAL.outline)).setOrigin(0, 0);
      this.rings.push(tag);
      this.rings.push(this.add.bitmapText(p.x - R + 1, p.y - R + 1, FONT_KEY, String(i + 1)).setTint(hex(sel ? PAL.glow : PAL.glowDim)));
    });
  }

  private drawStatus(): void {
    const run = this.run;
    const map = run.map;
    const x = 12;
    this.text(x, 10, `Sector ${this.sector + 1}`, PAL.glow, 2);
    this.text(x + 76, 17, `of ${map.sectors.length}`, PAL.hudDim);
    this.text(x, 28, BIOMES[map.sectors[this.sector]!.biome].name, PAL.hudText);
    const later = map.sectors.slice(this.sector + 1).map((s) => BIOMES[s.biome].name);
    let y = 37;
    if (later.length > 0) {
      for (const l of wrapText(`Then: ${later.join(', ')}`, PANEL_CHARS)) {
        this.text(x, y, l, PAL.hudDim);
        y += 9;
      }
    }

    y += 8;
    const row = (label: string, value: string, color: string = PAL.hudText) => {
      this.text(x, y, label, PAL.hudDim);
      this.text(x + 120, y, value, color).setOrigin(1, 0);
      y += 9;
    };
    // The run's orders, and each sector's objective so far: + taken, x missed, - ahead.
    const def = DIRECTIVES[run.directive];
    row('Directive', def.name, PAL.glow);
    const marks = map.sectors.map((_, i) => (run.objectives[i] === true ? '+' : run.objectives[i] === false ? 'x' : '-')).join(' ');
    row('Objectives', marks, run.objectives.includes(false) ? PAL.amber : PAL.hudText);
    y += 4;
    row('Salvage', String(run.salvage), PAL.amber);
    row('Battles won', String(run.battle));
    row('Kills', String(run.kills));
    if (run.cache > 0) row('Supply caches', `+${run.cache} action${run.cache === 1 ? '' : 's'}`, PAL.glow);

    // The Behemoth's condition: what the next fight starts with.
    y += 6;
    // The Behemoth, under its callsign, and who the name belonged to.
    this.text(x, y, run.callsign, PAL.glow);
    const sign = CALLSIGNS.find((c) => c.name === run.callsign);
    if (sign) {
      this.text(x, y + 9, sign.note, PAL.hudDim);
      y += 9;
    }
    y += 10;
    const b = restoreBehemoth(run.behemoth, 0, 0);
    const frac = (i: { hp: number; max: number }) => (i.max > 0 ? i.hp / i.max : 0);
    const pct = (f: number) => (f > 0 ? `${Math.round(f * 100)}%` : 'Offline');
    const armorHp = ARMOR_ARCS.reduce((s, a) => s + b.armor[a].hp, 0);
    const armorMax = ARMOR_ARCS.reduce((s, a) => s + b.armor[a].max, 0);
    const parts: [string, number][] = [
      ['Treads', frac(b.treads)],
      ['Armor', armorMax > 0 ? armorHp / armorMax : 0],
      ['Reactor', frac(b.reactor)],
      ['Sensors', frac(b.sensors)],
      ['Fire control', frac(b.fireControl)],
      ['Magazine', frac(b.magazine)],
    ];
    for (const [label, f] of parts) row(label, pct(f), integrityColor(f));
    const down = b.hardpoints.filter((h) => h.weapon && h.integrity.hp <= 0).length;
    if (down > 0) row('Weapons down', String(down), PAL.bad);

    const ev = lastEventOutcome(run);
    if (ev && this.run.at && nodeAt(map, this.run.at)?.kind === 'event') {
      y += 6;
      this.text(x, y, ev.title, PAL.glow);
      y += 9;
      for (const l of ev.lines) {
        for (const w of wrapText(l, PANEL_CHARS)) {
          this.text(x, y, w, PAL.hudDim);
          y += 9;
        }
      }
    }
    const r = run.lastBattle;
    if (r && this.run.at && nodeAt(map, this.run.at)?.kind === 'battle') {
      y += 6;
      const time = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
      this.text(x, y, `Battle ${r.battle} won in ${time}`, PAL.glow);
      this.text(x, y + 9, `${r.kills} kills, +${r.salvage + r.bonus} salvage`, PAL.hudDim);
      const o = r.objective;
      const names = o && MODES[o.mode].target;
      if (o && names) {
        y += 9;
        this.text(x, y + 9, `${MODES[o.mode].name}: ${o.destroyed}/${o.total} ${names[1]}`, o.destroyed === o.total ? PAL.glow : PAL.amber);
      }
      if (r.taken !== undefined) {
        y += 9;
        this.text(x, y + 9, r.taken ? `Objective taken: +${DIRECTIVE.sectorReward} action` : 'Objective missed', r.taken ? PAL.glow : PAL.amber);
      }
    }
  }

  /** The intel panel: the node under the pointer, else the selected choice. */
  private drawIntel(): void {
    for (const o of this.intel) o.destroy();
    this.intel = [];
    const pos = this.hover ?? this.options[this.selected] ?? null;
    const node = pos && nodeAt(this.run.map, pos);
    if (!pos || !node) return;
    const x = RESOLUTION.width - INTEL_W;
    let y = 12;
    // Every line wraps to the panel, so no string runs off the right edge.
    const t = (s: string, color: string = PAL.hudText, dx = 0) => {
      for (const l of wrapText(s, Math.floor((INTEL_W - INTEL_MARGIN - dx) / CHAR_W))) {
        this.text(x + dx, y, l, color, 1, this.intel);
        y += 9;
      }
    };
    const near = this.visited(pos) || this.options.some((o) => samePos(o, pos));
    const done = this.visited(pos);
    const choice = this.options.findIndex((o) => samePos(o, pos));

    if (node.kind === 'event') {
      const ev = node.event!;
      const hiddenKind = !done && hiddenEvent(ev, near, this.run.behemoth.grades.sensors ?? 1);
      t(hiddenKind ? 'Event: unknown contact' : `Event: ${MAP_EVENTS[ev.id].title}`, PAL.glow);
      y += 2;
      t(hiddenKind ? 'Something out there. Closer, or better sensors, shows what.' : MAP_EVENTS[ev.id].teaser, PAL.hudDim);
      y += 4;
      t('No battle: a choice', PAL.hudText);
    } else if (node.kind === 'depot') {
      t('Depot', PAL.glow);
      y += 2;
      t('Repair, rearm, and refit.', PAL.hudDim);
      const extra = choice >= 0 ? this.run.cache : 0;
      t(`${DEPOT.actions + extra} actions${extra > 0 ? ` (+${extra} from caches)` : ''}`);
      y += 4;
      if (near && !done) {
        // Weapons are drawn on a stream of their own, so this is what the depot will sell.
        const stock = openDepot(this.run, this.run.behemoth, depotKey(pos)).stock;
        t('Weapons for sale', PAL.hudDim);
        for (const item of stock) t(WEAPONS[item.weapon].name, PAL.hudText, 4);
      } else if (!done) t('Stock unknown at this range', PAL.hudDim);
    } else {
      const intel = node.battle!;
      const hidden = done ? [] : hiddenIntel(intel, near, this.run.behemoth.grades.sensors ?? 1);
      this.drawBattleIntel(t, intel, hidden, () => (y += 4), isFinalNode(this.run.map, pos));
      if (hidden.length > 0) {
        y += 6;
        t(near ? 'Deep fog. Better sensors' : 'Fogged: closer, or better', PAL.hudDim);
        t(near ? 'would see through it.' : 'sensors, shows more.', PAL.hudDim);
      }
    }
    y += 8;
    if (done && !samePos(pos, this.run.at)) t('Done', PAL.hudDim);
    else if (samePos(pos, this.run.at)) t('You are here', PAL.glowHot);
    else if (choice >= 0) t(choice === this.selected ? 'Enter or click: roll out' : `${choice + 1} or click: select`, PAL.glow);
    else t(onRouteFrom(this.run.map, this.run.at, pos) ? 'Further along this route' : 'Off your route', PAL.hudDim);
  }

  private drawBattleIntel(t: (s: string, color?: string, dx?: number) => void, intel: BattleIntel, hidden: IntelField[], gap: () => void, final: boolean): void {
    const fog = (f: IntelField) => hidden.includes(f);
    const objective = intel.strength === 'objective';
    const def = DIRECTIVES[this.run.directive];
    const title = objective ? `Objective: ${final ? def.final : def.objective}` : intel.strength === 'strong' ? 'Battle: strong defenses' : 'Battle';
    t(title, intel.strength === 'normal' ? PAL.enemyHi : PAL.amber);
    gap();
    const field = (label: string, value: string, color: string = PAL.hudText) => {
      t(label, PAL.hudDim);
      t(value, color, 4);
    };
    const mode = MODES[intel.mode];
    if (objective) {
      // The Directive's ask, and what rides on it (SPEC §3).
      field('Directive', `${mode.name}: ${directiveAsk(this.run.directive, this.run.behemoth.chassis).toLowerCase()}`, PAL.amber);
      t(final ? 'Decides the Directive' : `Taken: +${DIRECTIVE.sectorReward} depot action`, final ? PAL.glowHot : PAL.glow, 4);
    } else field('Mode', `${mode.name}: ${mode.goal.toLowerCase()}`, intel.mode === 'assault' ? PAL.hudText : PAL.amber);
    field('Ground', fog('approach') ? '?' : intel.approach ? APPROACHES[intel.approach].name : `${BIOMES[this.run.map.sectors[this.sector]!.biome].name} mix`);
    field('Defenders', fog('doctrine') ? '?' : `${DOCTRINES[intel.doctrine].name}: ${DOCTRINES[intel.doctrine].intel.toLowerCase()}`);
    const strength = intel.strength === 'objective' ? 'Objective: heavy' : intel.strength === 'strong' ? 'Strong' : 'Normal';
    field('Strength', fog('strength') ? '?' : strength, intel.strength === 'normal' ? PAL.hudText : PAL.amber);
    // An event moved the defenders (SPEC §8.3); shown with the strength.
    if (!fog('strength') && intel.shift) t(intel.shift > 0 ? `Alerted: +${intel.shift} threat` : `Weakened: ${intel.shift} threat`, intel.shift > 0 ? PAL.amber : PAL.glow, 4);
    // The weather is never fogged (SPEC §4.6).
    const biome = this.run.map.sectors[this.sector]!.biome;
    field('Conditions', intel.condition ? conditionName(intel.condition, biome) : 'Clear', intel.condition ? PAL.amber : PAL.hudText);
    if (intel.condition) t(CONDITIONS[intel.condition].intel, PAL.hudDim, 4);
    field('Reward', fog('reward') ? '?' : `+${intel.salvage} salvage on extraction`, PAL.amber);
    if (!fog('reward') && mode.bonus > 0) t(`+${mode.bonus} for destroying all ${mode.target?.[1] ?? 'targets'}`, PAL.amber, 4);
    if (!fog('reward') && intel.cache) t('Supply cache: +1 depot action', PAL.glow, 4);
  }
}

/** The map sheet's area: between the side panels, above the key hints. */
function mapRect(): { left: number; right: number; top: number; bottom: number } {
  return { left: 136, right: RESOLUTION.width - 166, top: 6, bottom: RESOLUTION.height - 18 };
}

/** Widest spacing between lanes, the map grid's spacing, and the sheet's texture key. */
const MAX_LANE = 56;
const GRID = 40;
const MAP_SHEET = 'map_sheet';
/** Ink on the map sheet (grid references, the routes). */
const INK_TEXT = '#1d1a16';

/** Characters that fit across the left panel (the 3×5 font is 4 pixels a character). */
const PANEL_CHARS = 30;
/** The 3×5 font's advance per character, in pixels. */
const CHAR_W = 4;
/** The intel panel's width at the right edge, and the gap its text keeps from the screen edge. */
const INTEL_W = 160;
const INTEL_MARGIN = 4;


function dashed(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const dash = 3;
  const gap = 2;
  g.lineStyle(width, color, alpha);
  for (let d = 0; d < len; d += dash + gap) {
    const a = d / len;
    const b = Math.min(1, (d + dash) / len);
    g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
  }
}
