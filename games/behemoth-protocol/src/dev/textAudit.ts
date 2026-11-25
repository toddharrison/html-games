import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { CHAR_W, GLYPH_H, LINE_H } from '../render/textLayout';
import { textBox } from '../render/uiText';

/**
 * Dev tool: finds screen text that has left the screen, left the box it was fitted to
 * (render/uiText.ts), or run into other text. `npm run audit:text` (scripts/text-audit.mjs) opens
 * every screen in a headless browser and runs this on each; in the dev server it's also
 * `__ui.audit()` in the browser's console, for whatever is on screen.
 */

export interface TextProblem {
  kind: 'off-screen' | 'outside-box' | 'overlap';
  scene: string;
  /** The line of text at fault, and for an overlap, the line it runs into. */
  text: string;
  other?: string;
  /** Where the line is, in game pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One line of a text as drawn: the pixels its glyphs cover (no padding, no trailing gap). */
interface Ink {
  scene: string;
  owner: Phaser.GameObjects.BitmapText;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each line of a text, where its glyphs are on screen. The font is monospaced, so it's arithmetic. */
function inkOf(scene: string, t: Phaser.GameObjects.BitmapText): Ink[] {
  const lines = t.text.split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  const cw = CHAR_W * t.scaleX;
  const pitch = (LINE_H + t.lineSpacing) * t.scaleY;
  const blockW = longest * cw;
  const blockH = ((lines.length - 1) * (LINE_H + t.lineSpacing) + LINE_H - 1) * t.scaleY;
  const left = t.x - t.originX * blockW;
  const top = t.y - t.originY * blockH;
  const out: Ink[] = [];
  lines.forEach((line, i) => {
    const text = line.trim();
    if (!text) return;
    // Shorter lines sit in the block by its alignment (0 left, 1 center, 2 right).
    const slack = ((longest - line.length) * cw * t.align) / 2;
    const lead = line.length - line.trimStart().length;
    out.push({ scene, owner: t, text, x: left + slack + lead * cw, y: top + i * pitch, w: text.length * cw - t.scaleX, h: GLYPH_H * t.scaleY });
  });
  return out;
}

function shown(o: Phaser.GameObjects.GameObject): boolean {
  const v = o as unknown as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Alpha;
  return v.visible !== false && (v.alpha ?? 1) > 0;
}

/** Whether a text's position is a screen position: it's fixed to the camera, or its scene's camera never moves. */
function onScreen(t: Phaser.GameObjects.BitmapText): boolean {
  const cam = t.scene.cameras.main;
  return (t.scrollFactorX === 0 && t.scrollFactorY === 0) || (cam.scrollX === 0 && cam.scrollY === 0);
}

function textsOf(list: readonly Phaser.GameObjects.GameObject[], out: Phaser.GameObjects.BitmapText[] = []): Phaser.GameObjects.BitmapText[] {
  for (const o of list) {
    if (!shown(o)) continue;
    if (o instanceof Phaser.GameObjects.Container) textsOf(o.list, out);
    // Screen text only: a scene that scrolls (the battle) has text out on the field too.
    else if (o instanceof Phaser.GameObjects.BitmapText && o.text.trim() !== '' && onScreen(o)) out.push(o);
  }
  return out;
}

/** Every problem with the text on screen now, across the scenes that are showing. */
export function auditText(game: Phaser.Game): TextProblem[] {
  const { width, height } = RESOLUTION;
  const ink: Ink[] = [];
  for (const scene of game.scene.getScenes(true)) {
    if (!scene.sys.settings.visible) continue;
    const key = scene.sys.settings.key;
    for (const t of textsOf(scene.children.list)) ink.push(...inkOf(key, t));
  }
  const problems: TextProblem[] = [];
  const at = (i: Ink) => ({ scene: i.scene, text: i.text, x: Math.round(i.x), y: Math.round(i.y), w: Math.round(i.w), h: Math.round(i.h) });
  for (const i of ink) {
    if (i.x < 0 || i.y < 0 || i.x + i.w > width || i.y + i.h > height) problems.push({ kind: 'off-screen', ...at(i) });
    const box = textBox(i.owner);
    if (box && (i.x < box.left - 0.5 || i.x + i.w > box.right + 0.5)) problems.push({ kind: 'outside-box', ...at(i) });
  }
  for (let a = 0; a < ink.length; a++) {
    for (let b = a + 1; b < ink.length; b++) {
      const p = ink[a]!;
      const q = ink[b]!;
      if (p.owner === q.owner) continue;
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) problems.push({ kind: 'overlap', ...at(p), other: q.text });
    }
  }
  return problems;
}

/** Puts the game and the audit where a script (or the browser's console) can reach them. */
export function exposeTextAudit(game: Phaser.Game): void {
  (window as unknown as { __ui: unknown }).__ui = { game, audit: () => auditText(game) };
}
