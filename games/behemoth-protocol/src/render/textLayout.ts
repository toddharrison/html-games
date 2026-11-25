/**
 * Text layout for the 3×5 pixel font (render/pixelFont.ts). The font is monospaced: every character
 * advances `CHAR_W` pixels and every line `LINE_H`, times the text's scale. So fitting text to a box
 * is a matter of counting characters, and it can be done before anything is drawn. These wrap,
 * clip, and measure strings; `render/uiText.ts` draws with them. Pure: no Phaser.
 */

/** A character's advance, a line's advance inside one block of text, and a glyph's height (pixels at scale 1). */
export const CHAR_W = 4;
export const LINE_H = 7;
export const GLYPH_H = 5;

/** What a clipped line ends in (the font has no ellipsis glyph). */
export const ELLIPSIS = '..';

/** Characters that fit across `width` pixels (the last one needs no gap after it). */
export function charsIn(width: number, scale = 1): number {
  return Math.max(0, Math.floor((width + scale) / (CHAR_W * scale)));
}

/** The width in pixels of `s` as drawn: its longest line, without the gap after the last character. */
export function textWidth(s: string, scale = 1): number {
  const longest = Math.max(0, ...s.split('\n').map((line) => line.length));
  return longest === 0 ? 0 : (longest * CHAR_W - 1) * scale;
}

/**
 * Greedy word wrap to lines of at most `max` characters. A line break in `s` is kept, a word longer
 * than a line is broken across lines, and runs of spaces inside a line are left alone (they're
 * dropped where a line breaks).
 */
export function wrapText(s: string, max: number): string[] {
  if (s === '') return [];
  const width = Math.max(1, Math.floor(max));
  const lines: string[] = [];
  for (const paragraph of s.split('\n')) {
    let cur = '';
    for (let word of paragraph.split(' ')) {
      if (cur && cur.length + 1 + word.length > width) {
        lines.push(cur.trimEnd());
        cur = '';
      }
      while (word.length > width) {
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      cur = cur ? `${cur} ${word}` : word;
    }
    lines.push(cur.trimEnd());
  }
  return lines;
}

/**
 * `parts` joined with `sep` into lines of at most `max` characters, breaking only between parts: a
 * stat line ("dmg 10  blast 14  reload 0.9s") never splits a figure from its name. A part longer
 * than a line wraps by words.
 */
export function wrapParts(parts: readonly string[], max: number, sep = '  '): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const part of parts) {
    if (!part) continue;
    if (cur && cur.length + sep.length + part.length <= max) {
      cur += sep + part;
      continue;
    }
    if (cur) lines.push(cur);
    const wrapped = wrapText(part, max);
    cur = wrapped.pop() ?? '';
    lines.push(...wrapped);
  }
  if (cur) lines.push(cur);
  return lines;
}

/** One line cut to `max` characters, ending in `..` if anything was cut. */
export function clipText(s: string, max: number): string {
  const width = Math.max(0, Math.floor(max));
  if (s.length <= width) return s;
  if (width <= ELLIPSIS.length) return s.slice(0, width);
  return `${s.slice(0, width - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/**
 * `s` fitted to a box `max` characters wide and `lines` lines tall: wrapped, and if that takes
 * more lines than there are, the last one is filled and clipped. With `wrap` off, the lines `s`
 * was written with are kept and each is clipped instead.
 */
export function fitText(s: string, max: number, lines = Infinity, wrap = true): string[] {
  const all = wrap ? wrapText(s, max) : s.split('\n').map((line) => clipText(line, max));
  if (all.length <= lines) return all;
  const keep = Math.max(1, Math.floor(lines));
  // Wrapped: what's left runs on along the last line. Written lines: the last one kept is marked as cut.
  const last = wrap ? all.slice(keep - 1).join(' ') : `${all[keep - 1]!}${ELLIPSIS}`;
  return [...all.slice(0, keep - 1), clipText(last, max)];
}

/** The first of `options` (longest first) that fits `max` characters, or the last one clipped. */
export function firstFit(options: readonly string[], max: number): string {
  return options.find((o) => o.length <= max) ?? clipText(options.at(-1) ?? '', max);
}

/**
 * A label and a value sharing one line of `max` characters, the value at the right. The value is
 * kept whole (it's the number) and the label is clipped to leave a space between them.
 */
export function fitRow(label: string, value: string, max: number): [label: string, value: string] {
  const v = clipText(value, max);
  const room = v ? max - v.length - 1 : max;
  return [room > 0 ? clipText(label, room) : '', v];
}

/**
 * A table's rows with every column padded to its widest cell, so the columns line up whatever
 * goes in them and every row is the same length (rows centered on a point stay in line). `right`
 * names the columns to right-align; two spaces go between columns.
 */
export function tableRows(rows: readonly (readonly string[])[], right: readonly number[] = []): string[] {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows.map((row) =>
    row
      .map((cell, i) => (right.includes(i) ? cell.padStart(widths[i]!) : cell.padEnd(widths[i]!)))
      .join('  '),
  );
}
