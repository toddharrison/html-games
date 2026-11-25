import { describe, expect, it } from 'vitest';
import { charsIn, clipText, firstFit, fitRow, fitText, tableRows, textWidth, wrapParts, wrapText } from '../../src/render/textLayout';

describe('measuring', () => {
  it('counts the characters that fit a width', () => {
    // Four pixels a character, and the last needs no gap after it.
    expect(charsIn(202)).toBe(50);
    expect(charsIn(203)).toBe(51);
    expect(charsIn(3)).toBe(1);
    expect(charsIn(2)).toBe(0);
    expect(charsIn(-10)).toBe(0);
    // A scaled font fits fewer.
    expect(charsIn(160, 2)).toBe(20);
    expect(charsIn(159, 2)).toBe(20);
    expect(charsIn(157, 2)).toBe(19);
  });

  it('measures the longest line', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('abc')).toBe(11);
    expect(textWidth('ab\nabcd\na')).toBe(15);
    expect(textWidth('abc', 2)).toBe(22);
  });

  it('agrees with itself: a string fits the width it measures', () => {
    for (const s of ['a', 'depot', 'a longer line of text']) {
      for (const scale of [1, 2, 3]) expect(charsIn(textWidth(s, scale), scale)).toBe(s.length);
    }
  });
});

describe('wrapText', () => {
  it('wraps at spaces, never past the width', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 10);
    expect(lines).toEqual(['the quick', 'brown fox', 'jumps over', 'the lazy', 'dog']);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(10);
  });

  it('leaves text that fits alone', () => {
    expect(wrapText('short', 10)).toEqual(['short']);
    expect(wrapText('', 10)).toEqual([]);
  });

  it('keeps line breaks, and a blank line between paragraphs', () => {
    expect(wrapText('one two\nthree', 20)).toEqual(['one two', 'three']);
    expect(wrapText('one\n\ntwo', 20)).toEqual(['one', '', 'two']);
  });

  it('breaks a word longer than a line', () => {
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('go abcdefghij now', 4)).toEqual(['go', 'abcd', 'efgh', 'ij', 'now']);
  });

  it('keeps a wider gap inside a line and drops it at a break', () => {
    expect(wrapText('one.  two', 20)).toEqual(['one.  two']);
    expect(wrapText('one.  two', 5)).toEqual(['one.', 'two']);
  });

  it('never loops or overruns on a width of nothing', () => {
    expect(wrapText('ab', 0)).toEqual(['a', 'b']);
  });
});

describe('wrapParts', () => {
  const stats = ['dmg 10', 'blast 14', 'reload 0.9s', 'range 170', 'burns 8/s 3s', 'power 9'];

  it('joins parts on one line when they fit', () => {
    expect(wrapParts(stats, 80)).toEqual(['dmg 10  blast 14  reload 0.9s  range 170  burns 8/s 3s  power 9']);
  });

  it('breaks between parts, never inside one', () => {
    const lines = wrapParts(stats, 50);
    expect(lines).toEqual(['dmg 10  blast 14  reload 0.9s  range 170', 'burns 8/s 3s  power 9']);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(50);
  });

  it('wraps a part longer than a line by words, and skips empty parts', () => {
    expect(wrapParts(['spares the hull from a cook-off once', '', 'ram 60%'], 20)).toEqual(['spares the hull from', 'a cook-off once', 'ram 60%']);
  });

  it('takes another separator', () => {
    expect(wrapParts(['a level: +16% traverse 1t', '+20% integrity 2t', '+8% load capacity 3t'], 50, ', ')).toEqual(['a level: +16% traverse 1t, +20% integrity 2t', '+8% load capacity 3t']);
  });
});

describe('clipText', () => {
  it('cuts a long line and marks the cut', () => {
    expect(clipText('ballistic missile launcher', 12)).toBe('ballistic..');
    expect(clipText('ballistic missile launcher', 14)).toBe('ballistic mi..');
    expect(clipText('ballistic missile launcher', 14).length).toBeLessThanOrEqual(14);
  });

  it('leaves a line that fits alone', () => {
    expect(clipText('twin cannon', 11)).toBe('twin cannon');
  });

  it('has no room for the mark in a tiny box', () => {
    expect(clipText('cannon', 2)).toBe('ca');
    expect(clipText('cannon', 0)).toBe('');
  });
});

describe('fitText', () => {
  it('wraps, and clips the last line it has room for', () => {
    expect(fitText('the quick brown fox jumps over the lazy dog', 10)).toHaveLength(5);
    expect(fitText('the quick brown fox jumps over the lazy dog', 10, 2)).toEqual(['the quick', 'brown fo..']);
    expect(fitText('the quick brown fox', 10, 1)).toEqual(['the quic..']);
  });

  it('leaves text with room to spare alone', () => {
    expect(fitText('the quick brown fox', 10, 3)).toEqual(['the quick', 'brown fox']);
  });

  it('keeps written lines when not wrapping, clipping each', () => {
    expect(fitText('battle 3\nblasted wasteland\nkills 12', 10, Infinity, false)).toEqual(['battle 3', 'blasted..', 'kills 12']);
    expect(fitText('one\ntwo\nthree', 10, 2, false)).toEqual(['one', 'two..']);
  });

  it('always fits the box', () => {
    const s = 'A pulse that stops vehicles dead for a few seconds and kills mines.';
    for (let max = 1; max < 80; max++) {
      for (const lines of [1, 2, 3, Infinity]) {
        const out = fitText(s, max, lines);
        expect(out.length).toBeLessThanOrEqual(lines);
        for (const l of out) expect(l.length).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe('firstFit', () => {
  it('takes the longest wording that fits', () => {
    const options = ['3/4 engines 75% -1', '3/4 75% -1', '3/4'];
    expect(firstFit(options, 20)).toBe('3/4 engines 75% -1');
    expect(firstFit(options, 12)).toBe('3/4 75% -1');
    expect(firstFit(options, 2)).toBe('3/');
  });
});

describe('fitRow', () => {
  it('leaves a label and value that fit alone', () => {
    expect(fitRow('Salvage', '120', 30)).toEqual(['Salvage', '120']);
    expect(fitRow('Salvage', '120', 11)).toEqual(['Salvage', '120']);
  });

  it('clips the label to keep clear of the value', () => {
    const [label, value] = fitRow('Dorsal turret (replaces Twin cannon)', 'Not enough salvage', 49);
    expect(value).toBe('Not enough salvage');
    expect(label).toBe('Dorsal turret (replaces Twin..');
    expect(label.length + 1 + value.length).toBeLessThanOrEqual(49);
  });

  it('gives the whole row to a label with no value', () => {
    expect(fitRow('Undo (Z)', '', 8)).toEqual(['Undo (Z)', '']);
  });

  it('drops the label when the value takes the row', () => {
    expect(fitRow('Salvage', '1234567890', 10)).toEqual(['', '1234567890']);
    expect(fitRow('Salvage', '12345678901234', 10)).toEqual(['', '12345678..']);
  });
});

describe('tableRows', () => {
  it('pads each column to its widest cell', () => {
    const rows = tableRows(
      [
        ['#', 'Behemoth', 'Score'],
        ['1', 'Glasya-Labolas', '1,234,567'],
        ['10', 'Bael', '900'],
      ],
      [0, 2],
    );
    expect(rows).toEqual([' #  Behemoth            Score', ' 1  Glasya-Labolas  1,234,567', '10  Bael                  900']);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
  });
});
