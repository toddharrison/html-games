// The opening scene (SPEC 12.2): the crash in the dark, then waking by the wreck.

import { describe, expect, it } from 'vitest';
import { who } from '../src/content/messages.ts';
import { BACKGROUNDS } from '../src/content/protagonists.ts';
import { wakingPages } from '../src/content/waking.ts';

describe('the opening', () => {
  const kid = who({ name: 'Ash', gender: 'boy' });

  it('starts in the dark, then wakes by the wreck, and ends saying what the game is', () => {
    const pages = wakingPages(kid, 'city');
    expect(pages[0]!.dark).toBe(true);
    const lit = pages.findIndex((p) => !p.dark);
    expect(lit).toBeGreaterThan(0);
    expect(pages.slice(lit).every((p) => !p.dark), 'once lit, it stays lit').toBe(true);
    expect(pages.at(-1)!.hint).toMatch(/alive/);
    expect(pages.flatMap((p) => p.lines).join(' ')).toContain('Ash');
  });

  it('says where each background was flying to, each its own', () => {
    const first = BACKGROUNDS.map((b) => wakingPages(kid, b.id)[0]!.lines[0]!);
    expect(new Set(first).size).toBe(BACKGROUNDS.length);
  });
});
