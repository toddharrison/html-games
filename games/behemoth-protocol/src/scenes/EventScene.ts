import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { ARMOR_ARCS } from '../content/chassis';
import { MAP_EVENTS } from '../content/mapEvents';
import { integrityColor } from '../render/cutaway';
import { MAP_ICON, mapIconSheet } from '../render/mapArt';
import { FONT_KEY, fontText, wrapText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { canChoose, chooseEventOption, currentEvent, lastEventOutcome } from '../sim/mapEvents';
import { treadIntegrity } from '../sim/behemoth';
import { restoreBehemoth } from '../sim/run';
import { checkpoint, enterNode, type RunContext } from './flow';
import { fitCamera } from './screen';

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

  private text(x: number, y: number, s: string, color: string = PAL.hudText, scale = 1): Phaser.GameObjects.BitmapText {
    const t = this.add.bitmapText(x, y, FONT_KEY, fontText(s)).setTint(hex(color)).setScale(scale);
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

    // The scene: the icon, the title, the text.
    const x = 150;
    const cols = Math.floor((width - x - 16) / 4);
    const biome = run.map.sectors[at.sector]!.biome;
    this.ui.push(this.add.image(x + MAP_ICON / 2, 12 + MAP_ICON / 2, mapIconSheet(biome), 'event'));
    this.text(x + MAP_ICON + 8, 14, def.title, PAL.glow, 2);
    this.text(x + MAP_ICON + 8, 30, `Sector ${at.sector + 1} event`, PAL.hudDim);
    let y = 48;
    for (const line of wrapText(def.text, cols)) {
      this.text(x, y, line);
      y += 9;
    }
    y += 10;

    if (this.decided) {
      const out = lastEventOutcome(run)!;
      this.text(x, y, out.option, PAL.glowHot);
      y += 13;
      for (const line of wrapText(out.text, cols)) {
        this.text(x, y, line);
        y += 9;
      }
      y += 6;
      for (const line of out.lines) {
        this.text(x + 4, y, line, line.startsWith('-') || line.includes(' -') || line.includes('alerted') ? PAL.amber : PAL.glow);
        y += 9;
      }
      this.text(x, height - 16, 'Enter or click - continue', PAL.hudText);
      // Armed a moment later, so the click that chose can't also skip the result.
      this.time.delayedCall(250, () => this.input.once('pointerdown', () => this.confirm()));
      return;
    }

    // The options: numbered rows, the selected one framed.
    def.options.forEach((opt, i) => {
      const ok = canChoose(run, i);
      const sel = i === this.selected;
      const rowH = 22;
      const top = y - 3;
      const frame = this.add.rectangle(x - 4, top, width - x - 12, rowH - 2).setOrigin(0, 0).setStrokeStyle(1, hex(sel ? PAL.glow : PAL.hudLine), sel ? 1 : 0.6);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => this.selected !== i && this.pick(i));
      frame.on('pointerdown', () => (this.selected === i ? this.confirm() : this.pick(i)));
      this.ui.push(frame);
      const cost = opt.cost ? `  (${opt.cost} salvage)` : '';
      this.text(x, y, `${i + 1}  ${opt.label}${cost}`, !ok ? PAL.hudDim : sel ? PAL.glow : PAL.hudText);
      this.text(x + 12, y + 9, ok ? opt.hint : `Not enough salvage. ${opt.hint}`, PAL.hudDim);
      y += rowH;
    });
    this.text(x, height - 16, `1-${def.options.length} or click to choose, Enter to decide    Esc - title`, PAL.hudDim);
  }

  /** The left panel: salvage and the Behemoth's condition, what an option would risk or mend. */
  private drawStatus(): void {
    const run = this.ctx.run;
    const x = 12;
    let y = 14;
    this.text(x, y, run.callsign, PAL.glow);
    y += 14;
    const row = (label: string, value: string, color: string = PAL.hudText) => {
      this.text(x, y, label, PAL.hudDim);
      this.text(x + 120, y, value, color).setOrigin(1, 0);
      y += 9;
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
