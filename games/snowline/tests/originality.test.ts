// The originality rule (SPEC 3): no text, names, or coined terms from the novel or the board game
// behind the valley's rules appear in the game, its data files, or its package.json. The README and the
// credits may name both as inspirations. This catches the obvious slips; it is not the review a person
// qualified to judge must still do before release (docs/ORIGINALITY.md).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

/** Names and coined terms that must not appear. Case-insensitive, whole words. */
const BANNED = [
  // The novel: its title and author belong only in the README's credit line.
  'Paulsen',
  'Robeson',
  'Brian',
  'Perpich',
  'foolbird',
  'foolbirds',
  'gut cherries',
  'gut cherry',
  // The board game, its maker and its creatures.
  'Awful Green',
  'Tom Wham',
  'Znutar',
  'Steve Jackson',
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|css|html|json)$/.test(p) ? [p] : [];
  });
}

describe('originality (SPEC 3)', () => {
  const targets = [...files(join(root, 'src')), join(root, 'package.json'), join(root, 'index.html')];

  it('looks at the game source, data, and package.json', () => {
    expect(targets.length).toBeGreaterThan(40);
  });

  for (const file of targets) {
    it(`${relative(root, file)} names nothing from the novel or the board game`, () => {
      const text = readFileSync(file, 'utf8');
      for (const term of BANNED) {
        const re = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'i');
        expect(re.test(text), `"${term}" in ${relative(root, file)}`).toBe(false);
      }
      // The novel's title, capitalised as a title. The tool is always "hatchet", lower case.
      expect(/\bHatchet\b/.test(text), `the novel's title in ${relative(root, file)}`).toBe(false);
    });
  }

  it('the roster has no names from the novel', () => {
    const roster = readFileSync(join(root, 'src/content/protagonists.ts'), 'utf8');
    expect(/\bBrian\b/i.test(roster)).toBe(false);
  });
});
