import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { hex, PAL } from './palette';
import { FONT_KEY, fontText } from './pixelFont';
import { charsIn, fitRow, fitText, LINE_H } from './textLayout';

/**
 * Screen text that can't leave its box. Every menu, panel, and HUD string is drawn through
 * `uiText`, which fits it (render/textLayout.ts) before it's shown:
 *
 * - With a `width`, the text wraps to it. `lines` caps how tall it gets; what's past that is
 *   clipped with `..`.
 * - Without one, the box runs from `x` to the screen's edge and each line is clipped to it, so a
 *   string that outgrows its place is cut short and never runs off the screen.
 *
 * `updateText` changes a text's string and fits it to the same box; `below` is where the next
 * line goes under a text, however many lines it wrapped to; `uiRow` is a label with a value at
 * the right of the same line. Positions are screen pixels, so this is for text fixed to the
 * screen, not text out on the battlefield.
 */

export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface TextStyle {
  color?: string;
  scale?: number;
  /** What `x` is: the box's left edge (the default), its center, or its right edge. */
  align?: Align;
  /** What `y` is: the box's top (the default), its middle, or its bottom (the text grows upward). */
  valign?: VAlign;
  /** The box's width in pixels. Without one it runs to the screen's edge, and the text is clipped, not wrapped. */
  width?: number;
  /** The most lines it may take; the last one ends in `..` if there was more. */
  lines?: number;
  /** Whether to wrap (the default with a `width`) or keep the lines as written and clip each. */
  wrap?: boolean;
  /** Pixels from one line's top to the next (default `LINE_H` × scale). */
  pitch?: number;
}

/** The gap text keeps from the screen's edge when it's given no box of its own. */
const SCREEN_MARGIN = 2;

const ORIGIN_X: Record<Align, number> = { left: 0, center: 0.5, right: 1 };
const ORIGIN_Y: Record<VAlign, number> = { top: 0, middle: 0.5, bottom: 1 };

/** A text's box: what `updateText` fits a new string to (and what the dev text audit checks it against). */
export interface TextBox {
  /** Screen x of the box's left and right edges. */
  left: number;
  right: number;
  /** Characters across, and the most lines. */
  chars: number;
  lines: number;
  wrap: boolean;
  /** The string as last given, before fitting. */
  raw: string | null;
}

const boxes = new WeakMap<Phaser.GameObjects.BitmapText, TextBox>();

/** The box a text was made with, or undefined for one not made by `uiText`. */
export function textBox(t: Phaser.GameObjects.BitmapText): TextBox | undefined {
  return boxes.get(t);
}

export function uiText(scene: Phaser.Scene, x: number, y: number, s: string, style: TextStyle = {}): Phaser.GameObjects.BitmapText {
  const scale = style.scale ?? 1;
  const align = style.align ?? 'left';
  // The room on screen either side of `x`, whatever width was asked for.
  const before = x - SCREEN_MARGIN;
  const after = RESOLUTION.width - SCREEN_MARGIN - x;
  const room = align === 'left' ? after : align === 'right' ? before : 2 * Math.min(before, after);
  const width = Math.max(0, Math.min(style.width ?? Infinity, room));
  const left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
  const t = scene.add
    .bitmapText(x, y, FONT_KEY, '')
    .setTint(hex(style.color ?? PAL.hudText))
    .setScale(scale)
    .setOrigin(ORIGIN_X[align], ORIGIN_Y[style.valign ?? 'top']);
  if (align === 'center') t.setCenterAlign();
  else if (align === 'right') t.setRightAlign();
  if (style.pitch !== undefined) t.setLineSpacing(style.pitch / scale - LINE_H);
  boxes.set(t, { left, right: left + width, chars: charsIn(width, scale), lines: style.lines ?? Infinity, wrap: style.wrap ?? style.width !== undefined, raw: null });
  return updateText(t, s);
}

/** Sets a text's string, fitted to the box it was made with. Cheap to call every frame with the same string. */
export function updateText(t: Phaser.GameObjects.BitmapText, s: string): Phaser.GameObjects.BitmapText {
  const box = boxes.get(t);
  if (!box) return t.setText(fontText(s));
  if (box.raw === s) return t;
  box.raw = s;
  return t.setText(fitText(fontText(s), box.chars, box.lines, box.wrap).join('\n'));
}

/** The y for whatever goes under a text (top-aligned), `gap` pixels clear of its last line. */
export function below(t: Phaser.GameObjects.BitmapText, gap = 2): number {
  if (t.text === '') return t.y;
  const lines = t.text.split('\n').length;
  return t.y + ((lines - 1) * (LINE_H + t.lineSpacing) + LINE_H) * t.scaleY + gap;
}

/** A label and its value on one line; see `uiRow`. */
export interface TextRow {
  label: Phaser.GameObjects.BitmapText;
  value: Phaser.GameObjects.BitmapText;
  /** Characters across the row. */
  chars: number;
}

/**
 * One line `width` pixels wide with a label at its left and a value at its right. If the two
 * would meet, the label is clipped (`fitRow`): the value is the part that changes and matters.
 */
export function uiRow(scene: Phaser.Scene, x: number, y: number, width: number, label: string, value: string, color: string = PAL.hudText, labelColor: string = PAL.hudDim): TextRow {
  const row: TextRow = {
    label: uiText(scene, x, y, '', { color: labelColor, width, lines: 1 }),
    value: uiText(scene, x + width, y, '', { color, align: 'right', width, lines: 1 }),
    chars: charsIn(width),
  };
  return updateRow(row, label, value);
}

/** Sets a row's label and value, fitted to each other. */
export function updateRow(row: TextRow, label: string, value: string): TextRow {
  const [l, v] = fitRow(label, value, row.chars);
  updateText(row.label, l);
  updateText(row.value, v);
  return row;
}
