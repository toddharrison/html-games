import Phaser from 'phaser';
import { canvasTexture } from './painter';
import { PAL } from './palette';

/** A 3×5 pixel font generated in code, registered as the bitmap font `pixel` (4×6 cells). */

export const FONT_KEY = 'pixel';

// Each glyph: 5 rows of 3 bits, top to bottom.
const GLYPHS: Record<string, string> = {
  ' ': '000000000000000',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001010010',
  '8': '111101111101111',
  '9': '111101111001111',
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '.': '000000000000010',
  ',': '000000000010100',
  ':': '000010000010000',
  ';': '000010000010100',
  "'": '010010000000000',
  '-': '000000111000000',
  '/': '001001010100100',
  '%': '101001010100101',
  '!': '010010010000010',
  '?': '110001010000010',
  '+': '000010111010000',
  '(': '010100100100010',
  ')': '010001001001010',
  '*': '000101010101000',
  '<': '001010100010001',
  '>': '100010001010100',
  '=': '000111000111000',
  '#': '101111101111101',
};

const CHARS = Object.keys(GLYPHS).join('');

export function generatePixelFont(scene: Phaser.Scene): void {
  const cw = 4;
  const chh = 6;
  canvasTexture(scene, 'font_pixel', cw * CHARS.length, chh, (p) => {
    [...CHARS].forEach((ch, i) => {
      const bits = GLYPHS[ch]!;
      for (let b = 0; b < 15; b++) if (bits[b] === '1') p.px(i * cw + (b % 3), Math.floor(b / 3), PAL.white);
    });
  });
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'font_pixel',
    'offset.x': 0,
    'offset.y': 0,
    width: cw,
    height: chh,
    chars: CHARS,
    charsPerRow: CHARS.length,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 1,
  });
  scene.cache.bitmapFont.add(FONT_KEY, data);
}

/** The font only has upper-case glyphs. */
export function fontText(s: string): string {
  return s.toUpperCase();
}

/** Greedy word wrap to lines of at most `max` characters. */
export function wrapText(s: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    if (cur && cur.length + 1 + word.length > max) {
      lines.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines;
}
