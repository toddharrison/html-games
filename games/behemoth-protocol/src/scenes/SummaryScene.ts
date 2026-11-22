import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { BIOMES } from '../content/biomes';
import { CALLSIGNS } from '../content/callsigns';
import { DIRECTIVES } from '../content/directives';
import { ENEMIES } from '../content/enemies';
import { FONT_KEY, fontText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { clock, type RunSummary } from '../sim/run';
import type { SummaryData } from './flow';
import { fitCamera } from './screen';

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
    const text = (x: number, y: number, str: string, color: string = PAL.hudText, scale = 1) =>
      this.add.bitmapText(x, y, FONT_KEY, fontText(str)).setTint(hex(color)).setScale(scale);
    const cx = width / 2;

    // The verdict, and who it was.
    const [head, color] = headline(s);
    text(cx, 12, head, color, 3).setOrigin(0.5, 0);
    text(cx, 38, verdict(s), PAL.hudText).setOrigin(0.5, 0);
    const note = CALLSIGNS.find((c) => c.name === s.callsign)?.note;
    if (note) text(cx, 48, `${s.callsign}: ${note}`, PAL.hudDim).setOrigin(0.5, 0);
    this.add.rectangle(cx - 90, 60, 180, 1, hex(PAL.hudLine)).setOrigin(0, 0);

    const shot = this.summaryData.shot && this.textures.exists(this.summaryData.shot) ? this.summaryData.shot : null;
    const cols = shot ? 3 : 2;
    const pad = 16;
    const colW = Math.floor((width - pad * (cols + 1)) / cols);
    const colX = (i: number) => pad + i * (colW + pad);
    const top = 70;

    // The Directive and each sector's objective.
    let y = top;
    const lx = colX(0);
    text(lx, y, 'Directive', PAL.hudDim);
    text(lx + colW, y, def.name, PAL.glow).setOrigin(1, 0);
    y += 9;
    text(lx, y, def.brief, PAL.hudDim);
    y += 14;
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
      text(lx, y, `Sector ${i + 1}  ${BIOMES[biome].name}`, i < s.reached ? PAL.hudText : PAL.hudDim);
      text(lx + 8, y + 9, result, rc);
      y += 22;
    });

    // The run's totals, and the final blast.
    y = top;
    const mx = colX(1);
    const row = (label: string, value: string, c: string = PAL.hudText) => {
      text(mx, y, label, PAL.hudDim);
      text(mx + colW, y, value, c).setOrigin(1, 0);
      y += 9;
    };
    row('Sectors reached', `${s.reached} of ${s.sectors}`);
    row('Battles won', String(s.battles));
    row('Kills', String(s.kills));
    row('Salvage earned', String(s.earned), PAL.amber);
    row('Time in battle', clock(s.time));
    row('Seed', String(s.seed), PAL.hudDim);
    const b = s.blast;
    if (b) {
      y += 8;
      text(mx, y, 'The final blast', PAL.bad);
      y += 11;
      row('Destroyed in it', String(b.kills), b.kills > 0 ? PAL.amber : PAL.hudText);
      row('Biggest', b.best ? ENEMIES[b.best].name : 'Nothing');
      if (b.stand) row('Last stand', `${Math.floor(b.stand.time)}s, ${b.stand.waves} ${b.stand.waves === 1 ? 'wave' : 'waves'}`);
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
      text(rx, top + img.displayHeight + 4, `Detonation, sector ${s.reached}`, PAL.hudDim);
    }

    text(cx, height - 14, 'Enter - title', PAL.hudText).setOrigin(0.5, 0);
    const kb = this.input.keyboard!;
    const leave = () => this.scene.start('title');
    kb.once('keydown-ENTER', leave);
    kb.once('keydown-SPACE', leave);
    kb.once('keydown-ESC', leave);
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
