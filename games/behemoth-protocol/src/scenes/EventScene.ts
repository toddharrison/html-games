import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { ARMOR_ARCS } from '../content/chassis';
import { MAP_EVENTS } from '../content/mapEvents';
import { integrityColor } from '../render/cutaway';
import { MAP_ICON, mapIconSheet } from '../render/mapArt';
import { below, uiRow, uiText, type TextStyle } from '../render/uiText';
import { hex, PAL } from '../render/palette';
import { canChoose, chooseEventOption, currentEvent, lastEventOutcome } from '../sim/mapEvents';
import { treadIntegrity } from '../sim/behemoth';
import { restoreBehemoth } from '../sim/run';
import { checkpoint, enterNode, type RunContext } from './flow';
import { fitCamera } from './screen';
import { usingPad } from '../input/gamepad';
import { padMenu } from '../input/padMenu';

/**
 * An event node (SPEC §8.3): the scene, the options (1–3, arrows, or click; Enter or a second click
 * to choose), then what happened. Choosing saves the run at once with the outcome applied, so a
 * reload lands on the map, never back on the choice. The Behemoth's state sits on the left so the
 * choice is an informed one.
 */
export class EventScene extends Phaser.Scene {
  private ctx!: RunContext;
  private ui: Phaser.GameObjects.GameObject[] = [];
  private selected = 0;
  private decided = false;

  constructor() {
    super('event');
  }

  init(data: RunContext): void {
    this.ctx = data;
    this.selected = 0;
    this.decided = false;
  }

  create(): void {
    fitCamera(this);
    const ev = currentEvent(this.ctx.run);
    if (this.ctx.run.next !== 'event' || !ev) {
      enterNode(this, this.ctx);
      return;
    }
    const kb = this.input.keyboard!;
    const count = MAP_EVENTS[ev.id].options.length;
    const keys = ['ONE', 'TWO', 'THREE', 'FOUR'];
    for (let i = 0; i < count && i < keys.length; i++) kb.on(`keydown-${keys[i]}`, () => this.pick(i));
    kb.on('keydown-UP', () => this.pick((this.selected + count - 1) % count));
    kb.on('keydown-W', () => this.pick((this.selected + count - 1) % count));
    kb.on('keydown-DOWN', () => this.pick((this.selected + 1) % count));
    kb.on('keydown-S', () => this.pick((this.selected + 1) % count));
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-SPACE', () => this.confirm());
    // Back to the title: the run is saved at the event (undecided) or just past it.
    kb.on('keydown-ESC', () => this.scene.start('title'));
    // The pad: up/down to choose, A to decide (and carry on), B to the title.
    padMenu(
      this,
      {
        up: () => this.pick((this.selected + count - 1) % count),
        down: () => this.pick((this.selected + 1) % count),
        a: () => this.confirm(),
        b: () => this.scene.start('title'),
      },
      // The result screen arms a click when drawn, so only the choice screen redraws.
      () => !this.decided && this.draw(),
    );
    this.draw();
  }

  private pick(i: number): void {
    if (this.decided) return;
    this.selected = i;
    this.draw();
  }

  /** Takes the selected option, or after that, carries on to the map. */
  private confirm(): void {
    if (this.decided) {
      enterNode(this, this.ctx);
      return;
    }
    if (!canChoose(this.ctx.run, this.selected)) return;
    this.ctx = { ...this.ctx, run: chooseEventOption(this.ctx.run, this.selected) };
    this.decided = true;
    checkpoint(this.ctx);
    this.draw();
  }

  /** Text fitted to its box (render/uiText.ts): with a `width` it wraps, at the screen's line spacing. */
  private text(x: number, y: number, s: string, color: string = PAL.hudText, style: TextStyle = {}): Phaser.GameObjects.BitmapText {
    const t = uiText(this, x, y, s, { color, ...(style.scale ? {} : { pitch: LINE }), ...style });
    this.ui.push(t);
    return t;
  }

  private draw(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const { width, height } = RESOLUTION;
    this.ui.push(this.add.rectangle(0, 0, width, height, hex(PAL.hudBg)).setOrigin(0, 0));
    const run = this.ctx.run;
    const at = run.at!;
    const def = MAP_EVENTS[currentEvent(run)!.id];
    this.drawStatus();

    // The scene: the icon, the title, the text. Everything is fitted to the column right of the
    // status panel: a long line wraps, and what's under it moves down.
    const x = 150;
    const w = width - x - 16;
    const biome = run.map.sectors[at.sector]!.biome;
    this.ui.push(this.add.image(x + MAP_ICON / 2, 12 + MAP_ICON / 2, mapIconSheet(biome), 'event'));
    const headX = x + MAP_ICON + 8;
    const title = this.text(headX, 14, def.title, PAL.glow, { scale: 2, width: x + w - headX });
    const sub = this.text(headX, below(title), `Sector ${at.sector + 1} event`, PAL.hudDim, { width: x + w - headX });
    let y = Math.max(48, below(sub, 8));
    y = below(this.text(x, y, def.text, PAL.hudText, { width: w }), 12);

    if (this.decided) {
      const out = lastEventOutcome(run)!;
      y = below(this.text(x, y, out.option, PAL.glowHot, { width: w }), 6);
      y = below(this.text(x, y, out.text, PAL.hudText, { width: w }), 8);
      for (const line of out.lines) {
        y = below(this.text(x + 4, y, line, line.startsWith('-') || line.includes(' -') || line.includes('alerted') ? PAL.amber : PAL.glow, { width: w - 4 }));
      }
      this.text(x, height - 16, usingPad() ? 'A - continue' : 'Enter or click - continue', PAL.hudText, { width: w, lines: 1 });
      // Armed a moment later, so the click that chose can't also skip the result.
      this.time.delayedCall(250, () => this.input.once('pointerdown', () => this.confirm()));
      return;
    }

    // The options: numbered rows, the selected one framed. A row is as tall as its text.
    def.options.forEach((opt, i) => {
      const ok = canChoose(run, i);
      const sel = i === this.selected;
      const top = y - 3;
      const cost = opt.cost ? `  (${opt.cost} salvage)` : '';
      const label = this.text(x, y, `${i + 1}  ${opt.label}${cost}`, !ok ? PAL.hudDim : sel ? PAL.glow : PAL.hudText, { width: w });
      const hint = this.text(x + 12, below(label), ok ? opt.hint : `Not enough salvage. ${opt.hint}`, PAL.hudDim, { width: w - 12 });
      y = below(hint, 6);
      const frame = this.add.rectangle(x - 4, top, width - x - 12, y - top - 5).setOrigin(0, 0).setStrokeStyle(1, hex(sel ? PAL.glow : PAL.hudLine), sel ? 1 : 0.6);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => this.selected !== i && this.pick(i));
      frame.on('pointerdown', () => (this.selected === i ? this.confirm() : this.pick(i)));
      this.ui.push(frame);
    });
    this.text(
      x,
      height - 16,
      usingPad() ? 'D-pad to choose, A to decide    B - title' : `1-${def.options.length} or click to choose, Enter to decide    Esc - title`,
      PAL.hudDim,
      { width: w, lines: 1 },
    );
  }

  /** The left panel: salvage and the Behemoth's condition, what an option would risk or mend. */
  private drawStatus(): void {
    const run = this.ctx.run;
    const x = 12;
    let y = 14;
    this.text(x, y, run.callsign, PAL.glow, { width: STATUS_W, lines: 1 });
    y += 14;
    const row = (label: string, value: string, color: string = PAL.hudText) => {
      const r = uiRow(this, x, y, STATUS_W, label, value, color);
      this.ui.push(r.label, r.value);
      y += LINE;
    };
    row('Salvage', String(run.salvage), PAL.amber);
    if (run.cache > 0) row('Supply caches', `+${run.cache}`, PAL.glow);
    y += 6;
    const b = restoreBehemoth(run.behemoth, 0, 0);
    const frac = (i: { hp: number; max: number }) => (i.max > 0 ? i.hp / i.max : 0);
    const pct = (f: number) => (f > 0 ? `${Math.round(f * 100)}%` : 'Offline');
    const armorHp = ARMOR_ARCS.reduce((s, a) => s + b.armor[a].hp, 0);
    const armorMax = ARMOR_ARCS.reduce((s, a) => s + b.armor[a].max, 0);
    const parts: [string, number][] = [
      ['Treads', treadIntegrity(b)],
      ['Armor', armorMax > 0 ? armorHp / armorMax : 0],
      ['Sensors', frac(b.sensors)],
    ];
    for (const [label, f] of parts) row(label, pct(f), integrityColor(f));
    const racks = b.hardpoints.filter((h) => h.weapon?.ammo !== undefined && h.ammo !== null);
    if (racks.length > 0) {
      const left = racks.reduce((s, h) => s + (h.ammo ?? 0), 0);
      const full = racks.reduce((s, h) => s + (h.weapon?.ammo ?? 0), 0);
      row('Munitions', pct(full > 0 ? left / full : 1), integrityColor(full > 0 ? left / full : 1));
    }
  }
}

/** The status panel's width (from x = 12), and the screen's line spacing. */
const STATUS_W = 120;
const LINE = 9;
