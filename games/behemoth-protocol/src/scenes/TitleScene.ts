import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { FONT_KEY, fontText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { loadRun } from '../save/runSave';
import { newRun, runWhere, type RunState } from '../sim/run';
import { checkpoint, enterNode, randomSeed, type RunContext } from './flow';
import { fitCamera } from './screen';

/**
 * Title screen (SPEC §10): continue the saved run or start a new one. Starting over while a run is
 * saved asks for a second press, since it abandons that run. Behind it, the attract mode
 * (`DemoBattleScene`) plays short clips of the autopilot fighting in each biome.
 */
export class TitleScene extends Phaser.Scene {
  private saved: RunState | null = null;
  private confirmNew = false;
  private prompt!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('title');
  }

  create(): void {
    fitCamera(this);
    const { width, height } = RESOLUTION;
    const cx = width / 2;
    this.saved = loadRun();
    this.confirmNew = false;
    const text = (y: number, s: string, color: string, scale = 1) =>
      this.add.bitmapText(cx, y, FONT_KEY, fontText(s)).setTint(hex(color)).setScale(scale).setOrigin(0.5, 0);

    // The attract mode runs underneath, dimmed, with a darker band so the menu reads over it.
    this.scene.launch('demo');
    this.scene.bringToTop();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop('demo'));
    this.add.rectangle(0, 0, width, height, hex(PAL.hudBg), 0.2).setOrigin(0, 0);
    this.add.rectangle(0, Math.round(height * 0.25), width, Math.round(height * 0.47), hex(PAL.hudBg), 0.5).setOrigin(0, 0);
    text(Math.round(height * 0.28), 'Behemoth', PAL.hudText, 5);
    text(Math.round(height * 0.28) + 36, 'Protocol', PAL.glow, 3);
    this.add.rectangle(cx - 70, Math.round(height * 0.28) + 62, 140, 1, hex(PAL.hudLine)).setOrigin(0, 0);
    this.prompt = text(Math.round(height * 0.62), '', PAL.hudText);
    this.refresh();

    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', () => (this.saved ? this.continueRun() : this.startRun()));
    kb.on('keydown-SPACE', () => (this.saved ? this.continueRun() : this.startRun()));
    kb.on('keydown-C', () => this.saved && this.continueRun());
    kb.on('keydown-N', () => {
      if (!this.saved || this.confirmNew) this.startRun();
      else {
        this.confirmNew = true;
        this.refresh();
      }
    });
    kb.on('keydown-ESC', () => {
      this.confirmNew = false;
      this.refresh();
    });
  }

  private refresh(): void {
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
    const ctx: RunContext = { run: newRun(randomSeed()), persist: true };
    // Saved straight away, so the run exists from its first battle (and a stale save is replaced).
    checkpoint(ctx);
    enterNode(this, ctx);
  }
}
