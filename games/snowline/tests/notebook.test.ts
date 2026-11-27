// The kid's notebook: the diary in their words, water damage, and the logs that keep it dry.

import { describe, expect, it } from 'vitest';
import { diaryLine, firstPerson } from '../src/content/diary.ts';
import { FLAG, T } from '../src/content/terrain.ts';
import { notebookMinute, notebookWear } from '../src/sim/notebook.ts';
import { newGame } from '../src/sim/newGame.ts';
import { candidate } from '../src/sim/protagonist.ts';
import { dealRules } from '../src/sim/rules.ts';
import { idx } from '../src/sim/world.ts';
import { runTo, valley } from '../src/tools/runner.ts';
import { DEFAULT_SEED } from '../src/sim/newGame.ts';
import { flatWorld } from './sample.ts';

describe('the diary, in the first person and the kid\'s words', () => {
  it('turns the narration into "I", "me", and "my"', () => {
    expect(firstPerson('Mira put a little of the glossy red berries on her tongue, and waited.', 'Mira', 'girl')).toBe('I put a little of the glossy red berries on my tongue, and waited.');
    expect(firstPerson('The cold took Mira in the night.', 'Mira', 'girl')).toBe('The cold took me in the night.');
    expect(firstPerson('Something was following Mira. She never quite saw it.', 'Mira', 'girl')).toBe('Something was following me. I never quite saw it.');
    expect(firstPerson('A foot went wrong on the wet log, and Eli went into the stream.', 'Eli', 'boy')).toBe('A foot went wrong on the wet log, and I went into the stream.');
    expect(firstPerson('Her stomach turned over.', 'Mira', 'girl')).toBe('My stomach turned over.');
    expect(firstPerson('The berries had done her no harm.', 'Mira', 'girl')).toBe('The berries had done me no harm.');
    expect(firstPerson("Cramps knotted Tomas's stomach. Something he drank days ago.", 'Tomas', 'boy')).toBe('Cramps knotted my stomach. Something I drank days ago.');
    expect(firstPerson('Too tired to be careful, Eli let the blade glance off and cut himself.', 'Eli', 'boy')).toBe('Too tired to be careful, I let the blade glance off and cut myself.');
  });

  it('writes common lines as a kid would, and thoughts without quotes', () => {
    expect(diaryLine('It began to rain.', 'Mira', 'girl')).toBe('Started raining.');
    expect(diaryLine('Mira woke shivering.', 'Mira', 'girl')).toBe('Woke up freezing.');
    expect(diaryLine('Her stomach turned over. The glossy red berries were not good to eat.', 'Mira', 'girl')).toBe("Felt sick. DON'T eat the glossy red berries.");
    expect(diaryLine('“My mouth is so dry. First thing: a drink.”', 'Mira', 'girl')).toBe('My mouth is so dry. First thing: a drink.');
    expect(diaryLine('Eli found 3 sticks.', 'Eli', 'boy')).toBe('Found 3 sticks.');
  });
});

describe('water damage to the notebook', () => {
  const start = () => {
    const world = flatWorld();
    return { state: newGame('flat', candidate('flat', 0), world, dealRules('flat')), world };
  };

  it('stays dry, and leaves no trace in the state, while the kid is dry', () => {
    const { state } = start();
    for (let k = 0; k < 60; k++) notebookMinute(state);
    expect(state.memory['notebook-damp']).toBeUndefined();
    expect(notebookWear(state)).toEqual({ damp: 0, soakings: 0, damage: 0, soakedAt: -1 });
  });

  it('soaks through with the kid, leaves a tide mark and lasting damage, and dries slowly', () => {
    const { state } = start();
    state.player.wet = 100;
    for (let k = 0; k < 60; k++) notebookMinute(state);
    const soaked = notebookWear(state);
    expect(soaked.damp).toBeGreaterThan(90);
    expect(soaked.soakings).toBe(1);
    expect(soaked.damage).toBeGreaterThan(1);
    state.player.wet = 0;
    // Still soaked for a while as it dries, and harmed while it is; then only damp, and no worse.
    for (let k = 0; k < 300; k++) notebookMinute(state);
    const dried = notebookWear(state);
    expect(dried.damp).toBeLessThan(50);
    expect(dried.damage).toBeGreaterThanOrEqual(soaked.damage);
    for (let k = 0; k < 300; k++) notebookMinute(state);
    expect(notebookWear(state).damage, 'damage never mends').toBe(dried.damage);
    expect(notebookWear(state).soakings).toBe(1);
  });
});

describe('fallen trees across the streams', () => {
  it('keep the feet dry where wading would wet them', () => {
    const cross = (bridge: boolean) => {
      const world = flatWorld();
      for (let y = 100; y < 160; y++) {
        world.terrain[idx(130, y)] = T.stream;
        if (bridge) world.flags[idx(130, y)] = world.flags[idx(130, y)]! | FLAG.bridge;
      }
      const state = newGame('flat', candidate('flat', 0), world, dealRules('flat'));
      runTo(state, world, [{ t: 0, c: 'move', dir: 1 }], 30);
      expect(state.player.x, 'crossed').toBeGreaterThan(130);
      return state.player.wet;
    };
    expect(cross(false)).toBeGreaterThan(0);
    expect(cross(true)).toBe(0);
  });

  it('lie across streams in a real valley, one within reach of the start', () => {
    const { world } = valley(DEFAULT_SEED);
    expect(world.bridges.length).toBeGreaterThan(3);
    for (const b of world.bridges) {
      for (let k = 0; k < b.len; k++) {
        const i = idx(b.x + b.dx * k, b.y + b.dy * k);
        expect(world.flags[i]! & FLAG.bridge).toBeTruthy();
        expect([T.stream, T.gravel]).toContain(world.terrain[i]);
      }
    }
    const nearest = Math.min(...world.bridges.map((b) => Math.hypot(b.x - world.start.x, b.y - world.start.y)));
    expect(nearest).toBeLessThan(40);
  });
});
