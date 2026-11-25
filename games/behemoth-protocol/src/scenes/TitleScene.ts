import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { CHAR_W, LINE_H, tableRows, wrapText } from '../render/textLayout';
import { updateText, uiText, type TextStyle } from '../render/uiText';
import { hex, PAL } from '../render/palette';
import { BIOME_IDS } from '../content/biomes';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_IDS, difficultyBrief, type DifficultyId } from '../content/difficulties';
import { DIRECTIVES, DIRECTIVE_IDS } from '../content/directives';
import { loadRun } from '../save/runSave';
import { loadScores } from '../save/scores';
import { SCORE, SECTOR_MAP } from '../content/tuning';
import type { ScoreEntry } from '../sim/scores';
import { newRun, runWhere, type RunState } from '../sim/run';
import { checkpoint, enterNode, randomSeed, type RunContext } from './flow';
import { fitCamera } from './screen';
import { keyLabel } from '../input/gamepad';
import { padMenu } from '../input/padMenu';
import { VERSION } from '../version';

/** The gap the title's centered lines keep from the screen's sides. */
const MARGIN = 8;

/**
 * Title screen (SPEC §10): continue the saved run or start a new one. Starting over while a run is
 * saved asks for a second press, since it abandons that run. A new run starts with the run setup:
 * picking its Directive, its difficulty, and its length in sectors (SPEC §3). The setup is one list
 * with a cursor: up and down move through the Directives and then the two settings' rows, left and
 * right change the setting the cursor is on, and everything can be clicked. Behind it, the attract
 * mode (`DemoBattleScene`) plays short clips of the autopilot fighting in each biome.
 */
export class TitleScene extends Phaser.Scene {
  private saved: RunState | null = null;
  private confirmNew = false;
  private prompt!: Phaser.GameObjects.BitmapText;
  /** The title's own lines, hidden while the run setup is up. */
  private titleText: Phaser.GameObjects.GameObject[] = [];
  /** The run setup: the Directive picker (null while it's closed) and its lines. */
  private choosing: number | null = null;
  private picker: Phaser.GameObjects.BitmapText[] = [];
  private orders!: Phaser.GameObjects.BitmapText;
  private pickerHint!: Phaser.GameObjects.BitmapText;
  /** The row the cursor is on: a Directive's line, then the difficulty's row, then the length's. */
  private focus = 0;
  private cursor!: Phaser.GameObjects.BitmapText;
  /** The run setup's settings: each opens on its default (user's call, Nov 2026: Normal, three sectors). */
  private difficulty: DifficultyId = DEFAULT_DIFFICULTY;
  private sectors: number = SECTOR_MAP.sectors;
  /** The settings' rows: each one's label and options, and the line under them that sums up what's chosen. */
  private rowLabels: Phaser.GameObjects.BitmapText[] = [];
  private levels: Phaser.GameObjects.BitmapText[] = [];
  private lengths: Phaser.GameObjects.BitmapText[] = [];
  private settingsBrief!: Phaser.GameObjects.BitmapText;
  /** The menu band's extension under the run setup, where it runs longer than the band. */
  private pickerBack!: Phaser.GameObjects.Rectangle;

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
    this.rowLabels = [];
    this.levels = [];
    this.lengths = [];
    this.focus = 0;
    this.difficulty = DEFAULT_DIFFICULTY;
    this.sectors = SECTOR_MAP.sectors;
    // Centered lines, fitted to the screen: a long one wraps (or, with `lines`, is clipped).
    const text = (y: number, s: string, color: string, scale = 1, style: TextStyle = {}) =>
      uiText(this, cx, y, s, { color, scale, align: 'center', width: width - 2 * MARGIN, ...style });

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
    // The build's version, bottom right (the attract mode's caption takes the bottom left).
    uiText(this, width - 6, height - 6, VERSION, { color: PAL.hudDim, align: 'right', valign: 'bottom' }).setDepth(10);

    // The run setup (SPEC §10): choose the Directive, then the difficulty and the run's length under its orders.
    this.picker.push(text(top, 'Choose your Directive', PAL.glow, 2));
    DIRECTIVE_IDS.forEach((id, i) => {
      // One line each, with room at the left for the cursor.
      const line = text(top + 22 + i * 12, `${i + 1}  ${DIRECTIVES[id].name} - ${DIRECTIVES[id].brief}`, PAL.hudDim, 1, { lines: 1, width: width - 2 * MARGIN - 6 * CHAR_W });
      line.setInteractive({ useHandCursor: true }).on('pointerdown', () => (this.choosing === i && this.focus === i ? this.startRun() : this.choose(i)));
      this.picker.push(line);
    });
    const ordersY = top + 22 + DIRECTIVE_IDS.length * 12 + 8;
    this.orders = text(ordersY, '', PAL.hudText, 1, { width: this.ordersWidth() * CHAR_W });
    this.picker.push(this.orders);
    // The settings: two rows clear of the longest orders, their options in the same columns.
    const ordersLines = Math.max(...DIRECTIVE_IDS.map((id) => wrapText(DIRECTIVES[id].orders, this.ordersWidth()).length));
    const rowY = ordersY + ordersLines * LINE_H + 7;
    const gap = 3 * CHAR_W;
    const rows: { label: string; options: string[]; into: Phaser.GameObjects.BitmapText[]; pick: (i: number) => void }[] = [
      { label: 'Difficulty', options: DIFFICULTY_IDS.map((id) => DIFFICULTIES[id].name), into: this.levels, pick: (i) => this.setDifficulty(DIFFICULTY_IDS[i]!) },
      { label: 'Sectors', options: SECTOR_MAP.sectorChoices.map(String), into: this.lengths, pick: (i) => this.setSectors(SECTOR_MAP.sectorChoices[i]!) },
    ];
    const labelW = Math.max(...rows.map((r) => r.label.length)) * CHAR_W;
    const colW = Math.max(...rows.flatMap((r) => r.options.map((o) => o.length))) * CHAR_W;
    const cols = Math.max(...rows.map((r) => r.options.length));
    const rowX = cx - Math.round((labelW + cols * (gap + colW)) / 2);
    rows.forEach((row, r) => {
      const y = rowY + r * 9;
      const label = uiText(this, rowX, y, row.label, { color: PAL.hudDim });
      this.rowLabels.push(label);
      this.picker.push(label);
      row.options.forEach((option, i) => {
        const t = uiText(this, rowX + labelW + gap + i * (colW + gap), y, option, { color: PAL.hudDim });
        // The whole column is the target (a lone digit is four pixels wide).
        t.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-gap / 2, -2, colW + gap, 9), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
        t.on('pointerdown', () => {
          row.pick(i);
          this.setFocus(DIRECTIVE_IDS.length + r);
        });
        row.into.push(t);
        this.picker.push(t);
      });
    });
    this.settingsBrief = text(rowY + rows.length * 9 + 2, '', PAL.hudDim, 1, { lines: 1 });
    this.picker.push(this.settingsBrief);
    this.cursor = uiText(this, 0, 0, '>', { color: PAL.glow });
    this.picker.push(this.cursor);
    const hintY = Math.max(Math.round(height * 0.66), rowY + rows.length * 9 + 13);
    this.pickerHint = text(hintY, '', PAL.hudText, 1, { lines: 1 });
    this.picker.push(this.pickerHint);
    // On a short screen the setup runs past the menu's band: more of it, behind the last lines.
    const bandEnd = Math.round(height * 0.25) + Math.round(height * 0.47);
    this.pickerBack = this.add.rectangle(0, bandEnd, width, Math.max(0, hintY + 12 - bandEnd), hex(PAL.hudBg), 0.5).setOrigin(0, 0).setDepth(-1).setVisible(false);
    this.setDifficulty(this.difficulty);
    this.setSectors(this.sectors);
    for (const p of this.picker) p.setVisible(false);
    this.refresh();

    const kb = this.input.keyboard!;
    const go = () => (this.choosing !== null ? this.startRun() : this.saved ? this.continueRun() : this.openPicker());
    kb.on('keydown-ENTER', go);
    kb.on('keydown-SPACE', go);
    kb.on('keydown-C', () => this.choosing === null && this.saved && this.continueRun());
    const fresh = () => {
      if (this.choosing !== null) return;
      if (!this.saved || this.confirmNew) this.openPicker();
      else {
        this.confirmNew = true;
        this.refresh();
      }
    };
    kb.on('keydown-N', fresh);
    const back = () => {
      this.confirmNew = false;
      this.choosing = null;
      this.refresh();
    };
    kb.on('keydown-ESC', back);
    // Up and down move the cursor: through the Directives (choosing each as it lands), then the settings' rows.
    const rowCount = DIRECTIVE_IDS.length + 2;
    const move = (d: number) => {
      if (this.choosing === null) return;
      const to = (this.focus + d + rowCount) % rowCount;
      if (to < DIRECTIVE_IDS.length) this.choose(to);
      else this.setFocus(to);
    };
    // Left and right change the setting the cursor is on.
    const step = <T,>(list: readonly T[], at: T, d: number): T => list[(list.indexOf(at) + d + list.length) % list.length]!;
    const change = (d: number) => {
      if (this.choosing === null) return;
      if (this.focus === DIRECTIVE_IDS.length) this.setDifficulty(step(DIFFICULTY_IDS, this.difficulty, d));
      else if (this.focus === DIRECTIVE_IDS.length + 1) this.setSectors(step<number>(SECTOR_MAP.sectorChoices, this.sectors, d));
    };
    for (const k of ['UP', 'W']) kb.on(`keydown-${k}`, () => move(-1));
    for (const k of ['DOWN', 'S']) kb.on(`keydown-${k}`, () => move(1));
    for (const k of ['LEFT', 'A']) kb.on(`keydown-${k}`, () => change(-1));
    for (const k of ['RIGHT', 'D']) kb.on(`keydown-${k}`, () => change(1));
    // The pad: A (or Start) as Enter, B as Esc, Y as N, the D-pad or left stick to choose.
    padMenu(
      this,
      { a: go, start: go, b: back, y: fresh, up: () => move(-1), down: () => move(1), left: () => change(-1), right: () => change(1) },
      () => this.refresh(),
    );
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
    // Columns as wide as what's in them (the place and the score right-aligned), so any callsign or score lines up.
    const lines = tableRows(
      [
        ['#', 'Behemoth', 'Score', 'Level', 'Result', 'Reached', 'Date'],
        ...scores.map((e, i) => [String(i + 1), e.callsign, e.score.toLocaleString('en-US'), DIFFICULTIES[e.difficulty].name, result[e.outcome], `Sector ${e.reached}/${e.sectors}`, e.date]),
      ],
      [0, 2],
    );
    const top = Math.round(height * 0.74);
    const rowH = 8;
    // Part of the title: it makes way for the run setup, which runs down into its space.
    this.titleText.push(
      this.add.rectangle(0, top - 4, width, (lines.length + 1) * rowH + 6, hex(PAL.hudBg), 0.6).setOrigin(0, 0),
      uiText(this, width / 2, top, 'Top runs', { color: PAL.glow, align: 'center' }),
    );
    lines.forEach((line, i) => {
      // The header dim, the best run bright.
      const color = i === 0 ? PAL.hudDim : i === 1 ? PAL.amber : PAL.hudText;
      this.titleText.push(uiText(this, width / 2, top + (i + 1) * rowH + 2, line, { color, align: 'center' }));
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
    updateText(this.orders, DIRECTIVES[DIRECTIVE_IDS[i]!].orders);
    this.setFocus(i);
    this.refresh();
  }

  /** Puts the cursor on a row: beside a Directive's line, or a setting's label (which lights up). */
  private setFocus(row: number): void {
    this.focus = row;
    const setting = row - DIRECTIVE_IDS.length;
    this.rowLabels.forEach((label, r) => label.setTint(hex(r === setting ? PAL.hudText : PAL.hudDim)));
    const line = setting >= 0 ? this.rowLabels[setting]! : this.picker[1 + row]!;
    // A setting's label is drawn from its left edge; a Directive's line is centered.
    const left = setting >= 0 ? line.x : line.x - line.width / 2;
    this.cursor.setPosition(Math.round(left) - 2 * CHAR_W, line.y);
  }

  /** Characters across the orders' lines. */
  private ordersWidth(): number {
    return Math.min(72, Math.floor((RESOLUTION.width - 48) / CHAR_W));
  }

  private setDifficulty(id: DifficultyId): void {
    this.difficulty = id;
    this.levels.forEach((t, i) => t.setTint(hex(DIFFICULTY_IDS[i] === id ? PAL.glow : PAL.hudDim)));
    this.describeSettings();
  }

  private setSectors(n: number): void {
    this.sectors = n;
    this.lengths.forEach((t, i) => t.setTint(hex(SECTOR_MAP.sectorChoices[i] === n ? PAL.glow : PAL.hudDim)));
    this.describeSettings();
  }

  /** The line under the settings: the difficulty's rules, and what the length means. */
  private describeSettings(): void {
    const n = this.sectors;
    const length = n === 1 ? '1 sector: a short run' : n >= BIOME_IDS.length ? `${n} sectors: every biome, a long run` : `${n} sectors: the standard run`;
    updateText(this.settingsBrief, `${DIFFICULTIES[this.difficulty].name}: ${difficultyBrief(this.difficulty)}.  ${length}.`);
  }

  private refresh(): void {
    const picking = this.choosing !== null;
    for (const o of this.titleText) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!picking);
    for (const p of this.picker) p.setVisible(picking);
    this.pickerBack.setVisible(picking);
    this.prompt.setVisible(!picking);
    const s = this.saved;
    let lines: string[];
    const enter = keyLabel('Enter', 'A');
    const n = keyLabel('N', 'Y');
    const esc = keyLabel('Esc', 'B');
    updateText(this.pickerHint, `${enter} - roll out    Up/Down - select    Left/Right - change    ${esc} - back`);
    if (!s) lines = [`${enter} - new run`];
    else if (this.confirmNew) lines = ['Abandon the saved run?', '', `${n} - yes, start over`, `${esc} - keep it`];
    else {
      lines = [`${enter} - continue ${s.callsign} (${runWhere(s)}, ${DIFFICULTIES[s.difficulty].name}, ${s.salvage} salvage)`, `${n} - new run`];
    }
    updateText(this.prompt, lines.join('\n'));
  }

  private continueRun(): void {
    if (!this.saved) return;
    const ctx: RunContext = { run: this.saved, persist: true };
    enterNode(this, ctx);
  }

  private startRun(): void {
    const seed = randomSeed();
    const directive = DIRECTIVE_IDS[this.choosing ?? 0]!;
    const ctx: RunContext = { run: newRun(seed, 'class2', [], {}, [], undefined, directive, this.difficulty, this.sectors), persist: true };
    // Saved straight away, so the run exists from its first battle (and a stale save is replaced).
    checkpoint(ctx);
    enterNode(this, ctx);
  }
}
