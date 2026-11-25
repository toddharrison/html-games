import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { BIOMES } from '../content/biomes';
import { CALLSIGNS } from '../content/callsigns';
import { DIFFICULTIES } from '../content/difficulties';
import { DIRECTIVES } from '../content/directives';
import { ENEMIES } from '../content/enemies';
import { below, updateText, uiRow, uiText, type TextStyle } from '../render/uiText';
import { hex, PAL } from '../render/palette';
import { clock, type RunSummary } from '../sim/run';
import { runScore } from '../sim/scores';
import type { SummaryData } from './flow';
import { fitCamera } from './screen';
import { keyLabel } from '../input/gamepad';
import { padMenu } from '../input/padMenu';

/**
 * The run summary (SPEC §5.1, §10): how the run ended (the Directive complete or failed, or the
 * reactor gone), each sector's objective, the run's totals, and for a destroyed run, the final
 * blast with a still frame of the moment. The run save is already gone; Enter returns to the title.
 */
export class SummaryScene extends Phaser.Scene {
  private summaryData!: SummaryData;

  constructor() {
    super('summary');
  }

  init(data: SummaryData): void {
    this.summaryData = data;
  }

  create(): void {
    fitCamera(this);
    const { width, height } = RESOLUTION;
    const s = this.summaryData.summary;
    const def = DIRECTIVES[s.directive];
    this.add.rectangle(0, 0, width, height, hex(PAL.hudBg)).setOrigin(0, 0);
    // Text fitted to its box (render/uiText.ts): with a `width` it wraps, and what's under it moves down.
    const text = (x: number, y: number, str: string, color: string = PAL.hudText, style: TextStyle = {}) => uiText(this, x, y, str, { color, ...style });
    const cx = width / 2;
    const pad = 16;
    const centered: TextStyle = { align: 'center', width: width - 2 * pad };

    // The verdict, and who it was.
    const [head, color] = headline(s);
    let y = below(text(cx, 12, head, color, { ...centered, scale: 3 }), 5);
    y = below(text(cx, y, verdict(s), PAL.hudText, centered), 3);
    const note = CALLSIGNS.find((c) => c.name === s.callsign)?.note;
    if (note) y = below(text(cx, y, `${s.callsign}: ${note}`, PAL.hudDim, centered), 3);
    const rule = Math.max(60, y + 2);
    this.add.rectangle(cx - 90, rule, 180, 1, hex(PAL.hudLine)).setOrigin(0, 0);

    const shot = this.summaryData.shot && this.textures.exists(this.summaryData.shot) ? this.summaryData.shot : null;
    const cols = shot ? 3 : 2;
    const colW = Math.floor((width - pad * (cols + 1)) / cols);
    const colX = (i: number) => pad + i * (colW + pad);
    const top = rule + 10;
    /** A label at the left of a column and its value at the right, on one line. */
    const row = (x: number, label: string, value: string, c: string = PAL.hudText) => {
      uiRow(this, x, y, colW, label, value, c);
      y += 9;
    };

    // The Directive and each sector's objective.
    y = top;
    const lx = colX(0);
    row(lx, 'Directive', def.name, PAL.glow);
    y = below(text(lx, y, def.brief, PAL.hudDim, { width: colW }), 7);
    s.biomes.forEach((biome, i) => {
      const name = i === s.sectors - 1 ? def.final : def.objective;
      const taken = s.objectives[i];
      const here = i === s.reached - 1 && taken === undefined;
      let result: string;
      let rc: string;
      if (taken === true) [result, rc] = [`${name}: taken`, PAL.glow];
      else if (taken === false) [result, rc] = [`${name}: missed`, PAL.amber];
      else if (here) [result, rc] = s.outcome === 'destroyed' ? ['Lost in this sector', PAL.bad] : [`${name}: missed`, PAL.amber];
      else [result, rc] = ['Not reached', PAL.hudDim];
      y = below(text(lx, y, `Sector ${i + 1}  ${BIOMES[biome].name}`, i < s.reached ? PAL.hudText : PAL.hudDim, { width: colW }));
      y = below(text(lx + 8, y, result, rc, { width: colW - 8 }), 6);
    });

    // The run's totals, and the final blast.
    y = top;
    const mx = colX(1);
    row(mx, 'Sectors reached', `${s.reached} of ${s.sectors}`);
    row(mx, 'Battles won', String(s.battles));
    row(mx, 'Kills', String(s.kills));
    row(mx, 'Salvage earned', String(s.earned), PAL.amber);
    row(mx, 'Time in battle', clock(s.time));
    row(mx, 'Difficulty', DIFFICULTIES[s.difficulty].name);
    row(mx, 'Seed', String(s.seed), PAL.hudDim);
    y += 4;
    // The score list (on the title): this run's score and its place, if it made it.
    const rank = this.summaryData.rank;
    row(mx, 'Score', runScore(s).toLocaleString('en-US'), PAL.glow);
    if (rank) row(mx, '', rank === 1 ? 'Best run yet' : `#${rank} on the list`, rank === 1 ? PAL.glowHot : PAL.amber);
    const b = s.blast;
    if (b) {
      y += 8;
      text(mx, y, 'The final blast', PAL.bad, { width: colW, lines: 1 });
      y += 11;
      row(mx, 'Destroyed in it', String(b.kills), b.kills > 0 ? PAL.amber : PAL.hudText);
      row(mx, 'Biggest', b.best ? ENEMIES[b.best].name : 'Nothing');
      if (b.stand) row(mx, 'Last stand', `${Math.floor(b.stand.time)}s, ${b.stand.waves} ${b.stand.waves === 1 ? 'wave' : 'waves'}`);
    }

    // The moment the reactor went, framed like a recon still.
    if (shot) {
      const rx = colX(2);
      const img = this.add.image(rx, top, shot).setOrigin(0, 0);
      const maxH = height - top - 28;
      const k = Math.min(colW / img.width, maxH / img.height);
      img.setDisplaySize(Math.floor(img.width * k), Math.floor(img.height * k));
      const g = this.add.graphics();
      g.lineStyle(1, hex(PAL.hudLine), 1).strokeRect(rx - 1.5, top - 1.5, img.displayWidth + 3, img.displayHeight + 3);
      text(rx, top + img.displayHeight + 4, `Detonation, sector ${s.reached}`, PAL.hudDim, { width: colW, lines: 1 });
    }

    const hint = text(cx, height - 14, `${keyLabel('Enter', 'A')} - title`, PAL.hudText, { align: 'center' });
    const kb = this.input.keyboard!;
    const leave = () => this.scene.start('title');
    kb.once('keydown-ENTER', leave);
    kb.once('keydown-SPACE', leave);
    kb.once('keydown-ESC', leave);
    padMenu(this, { a: leave, b: leave, start: leave }, () => updateText(hint, `${keyLabel('Enter', 'A')} - title`));
  }
}

function headline(s: RunSummary): [string, string] {
  switch (s.outcome) {
    case 'won':
      return ['Directive complete', PAL.glow];
    case 'failed':
      return ['Directive failed', PAL.amber];
    case 'destroyed':
      return ['Reactor detonated', PAL.bad];
  }
}

/** One line on how it ended, in the Directive's terms. */
function verdict(s: RunSummary): string {
  const def = DIRECTIVES[s.directive];
  switch (s.outcome) {
    case 'won':
      return `${s.callsign} carried out its orders: the ${def.final.toLowerCase()} is taken`;
    case 'failed':
      return `${s.callsign} survived, but the ${def.final.toLowerCase()} was not taken`;
    case 'destroyed':
      return `${s.callsign} is lost`;
  }
}
