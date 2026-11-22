import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { FONT_KEY, fontText, wrapText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { DIRECTIVES, DIRECTIVE_IDS } from '../content/directives';
import { loadRun } from '../save/runSave';
import { loadScores } from '../save/scores';
import { SCORE } from '../content/tuning';
import type { ScoreEntry } from '../sim/scores';
import { newRun, runWhere, type RunState } from '../sim/run';
import { checkpoint, enterNode, randomSeed, type RunContext } from './flow';
import { fitCamera } from './screen';

/**
 * Title screen (SPEC §10): continue the saved run or start a new one. Starting over while a run is
 * saved asks for a second press, since it abandons that run. A new run starts with the run setup:
 * picking its Directive (SPEC §3). Behind it, the attract mode (`DemoBattleScene`) plays short clips
 * of the autopilot fighting in each biome.
 */
export class TitleScene extends Phaser.Scene {
  private saved: RunState | null = null;
  private confirmNew = false;
  private prompt!: Phaser.GameObjects.BitmapText;
  /** The title's own lines, hidden while the Directive picker is up. */
  private titleText: Phaser.GameObjects.GameObject[] = [];
  /** The run setup: the Directive picker (null while it's closed) and its lines. */
  private choosing: number | null = null;
  private picker: Phaser.GameObjects.BitmapText[] = [];
  private orders!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('title');
  }

  create(): void {
    fitCamera(this);
    const { width, height } = RESOLUTION;
    const cx = width / 2;
    this.saved = loadRun();
    this.confirmNew = false;
    this.choosing = null;
    this.picker = [];
    const text = (y: number, s: string, color: string, scale = 1) =>
      this.add.bitmapText(cx, y, FONT_KEY, fontText(s)).setTint(hex(color)).setScale(scale).setOrigin(0.5, 0);

    // The attract mode runs underneath, dimmed, with a darker band so the menu reads over it.
    this.scene.launch('demo');
    this.scene.bringToTop();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop('demo'));
    this.add.rectangle(0, 0, width, height, hex(PAL.hudBg), 0.2).setOrigin(0, 0);
    this.add.rectangle(0, Math.round(height * 0.25), width, Math.round(height * 0.47), hex(PAL.hudBg), 0.5).setOrigin(0, 0);
    const top = Math.round(height * 0.28);
    this.titleText = [
      text(top, 'Behemoth', PAL.hudText, 5),
      text(top + 36, 'Protocol', PAL.glow, 3),
      this.add.rectangle(cx - 70, top + 62, 140, 1, hex(PAL.hudLine)).setOrigin(0, 0),
    ];
    this.prompt = text(Math.round(height * 0.62), '', PAL.hudText);
    this.scoreList(loadScores().slice(0, SCORE.shown));

    // The run setup (SPEC §10): choose the Directive.
    this.picker.push(text(top, 'Choose your Directive', PAL.glow, 2));
    DIRECTIVE_IDS.forEach((id, i) => {
      const line = text(top + 22 + i * 12, `${i + 1}  ${DIRECTIVES[id].name} - ${DIRECTIVES[id].brief}`, PAL.hudDim);
      line.setInteractive({ useHandCursor: true }).on('pointerdown', () => (this.choosing === i ? this.startRun() : this.choose(i)));
      this.picker.push(line);
    });
    this.orders = text(top + 22 + DIRECTIVE_IDS.length * 12 + 8, '', PAL.hudText);
    this.picker.push(this.orders);
    this.picker.push(text(Math.round(height * 0.66), 'Enter - roll out    Esc - back', PAL.hudText));
    for (const p of this.picker) p.setVisible(false);
    this.refresh();

    const kb = this.input.keyboard!;
    const go = () => (this.choosing !== null ? this.startRun() : this.saved ? this.continueRun() : this.openPicker());
    kb.on('keydown-ENTER', go);
    kb.on('keydown-SPACE', go);
    kb.on('keydown-C', () => this.choosing === null && this.saved && this.continueRun());
    kb.on('keydown-N', () => {
      if (this.choosing !== null) return;
      if (!this.saved || this.confirmNew) this.openPicker();
      else {
        this.confirmNew = true;
        this.refresh();
      }
    });
    kb.on('keydown-ESC', () => {
      this.confirmNew = false;
      this.choosing = null;
      this.refresh();
    });
    const pick = (d: number) => this.choosing !== null && this.choose((this.choosing + d + DIRECTIVE_IDS.length) % DIRECTIVE_IDS.length);
    for (const k of ['UP', 'W', 'LEFT', 'A']) kb.on(`keydown-${k}`, () => pick(-1));
    for (const k of ['DOWN', 'S', 'RIGHT', 'D']) kb.on(`keydown-${k}`, () => pick(1));
    DIRECTIVE_IDS.forEach((_, i) => kb.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][i]}`, () => this.choosing !== null && this.choose(i)));
  }

  /**
   * The score list (user request, Nov 2026): the best finished runs under the menu, each by its
   * Behemoth's callsign, with how it ended and how far it got. Nothing until a run has ended.
   */
  private scoreList(scores: readonly ScoreEntry[]): void {
    if (scores.length === 0) return;
    const { width, height } = RESOLUTION;
    const result: Record<ScoreEntry['outcome'], string> = { won: 'Complete', failed: 'Failed', destroyed: 'Destroyed' };
    const row = (cells: string[]) =>
      `${cells[0]!.padStart(2)}  ${cells[1]!.padEnd(14)} ${cells[2]!.padStart(7)}  ${cells[3]!.padEnd(9)}  ${cells[4]!.padEnd(10)}  ${cells[5]}`;
    const lines = [
      row(['#', 'Behemoth', 'Score', 'Result', 'Reached', 'Date']),
      ...scores.map((e, i) => [String(i + 1), e.callsign, e.score.toLocaleString('en-US'), result[e.outcome], `Sector ${e.reached}/${e.sectors}`, e.date]).map(row),
    ];
    const top = Math.round(height * 0.74);
    const rowH = 8;
    this.add.rectangle(0, top - 4, width, (lines.length + 1) * rowH + 6, hex(PAL.hudBg), 0.6).setOrigin(0, 0);
    this.add.bitmapText(width / 2, top, FONT_KEY, fontText('Top runs')).setTint(hex(PAL.glow)).setOrigin(0.5, 0);
    lines.forEach((line, i) => {
      // The header dim, the best run bright.
      const color = i === 0 ? PAL.hudDim : i === 1 ? PAL.amber : PAL.hudText;
      this.add.bitmapText(width / 2, top + (i + 1) * rowH + 2, FONT_KEY, fontText(line)).setTint(hex(color)).setOrigin(0.5, 0);
    });
  }

  private openPicker(): void {
    this.confirmNew = false;
    this.choose(0);
  }

  private choose(i: number): void {
    this.choosing = i;
    this.picker.forEach((line, k) => {
      if (k >= 1 && k <= DIRECTIVE_IDS.length) line.setTint(hex(k - 1 === i ? PAL.glow : PAL.hudDim));
    });
    const width = RESOLUTION.width;
    this.orders.setText(fontText(wrapText(DIRECTIVES[DIRECTIVE_IDS[i]!].orders, Math.min(72, Math.floor((width - 48) / 4))).join('\n'))).setCenterAlign();
    this.refresh();
  }

  private refresh(): void {
    const picking = this.choosing !== null;
    for (const o of this.titleText) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!picking);
    for (const p of this.picker) p.setVisible(picking);
    this.prompt.setVisible(!picking);
    const s = this.saved;
    let lines: string[];
    if (!s) lines = ['Enter - new run'];
    else if (this.confirmNew) lines = ['Abandon the saved run?', '', 'N - yes, start over', 'Esc - keep it'];
    else {
      lines = [`Enter - continue ${s.callsign} (${runWhere(s)}, ${s.salvage} salvage)`, 'N - new run'];
    }
    this.prompt.setText(fontText(lines.join('\n'))).setCenterAlign();
  }

  private continueRun(): void {
    if (!this.saved) return;
    const ctx: RunContext = { run: this.saved, persist: true };
    enterNode(this, ctx);
  }

  private startRun(): void {
    const seed = randomSeed();
    const directive = DIRECTIVE_IDS[this.choosing ?? 0]!;
    const ctx: RunContext = { run: newRun(seed, 'class2', [], {}, [], undefined, directive), persist: true };
    // Saved straight away, so the run exists from its first battle (and a stale save is replaced).
    checkpoint(ctx);
    enterNode(this, ctx);
  }
}
