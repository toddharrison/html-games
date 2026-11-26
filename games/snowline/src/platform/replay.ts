// Replay files (SPEC 11.5): the seed, the protagonist, and every command, saved to a file and loaded
// back. A replay runs headless to its last tick, then play carries on from there.

import { protagonistProblems, type Protagonist } from '../sim/protagonist.ts';
import type { Command } from '../sim/state.ts';
import { stateHash } from '../tools/runner.ts';
import type { Session } from './session.ts';
import { VERSION } from './version.ts';

export interface ReplayFile {
  game: 'snowline';
  schema: 1;
  version: string;
  seed: string;
  protagonist: Protagonist;
  tick: number;
  commands: Command[];
  stateHash: string;
}

export function toReplay(s: Session): ReplayFile {
  return {
    game: 'snowline',
    schema: 1,
    version: VERSION,
    seed: s.seed,
    protagonist: s.protagonist,
    tick: s.state.tick,
    commands: s.log,
    stateHash: stateHash(s.state),
  };
}

/** Offer a file to the player to save. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a replay file, or explain why it isn't one. */
export function parseReplay(text: string): ReplayFile {
  const r = JSON.parse(text) as ReplayFile;
  if (r.game !== 'snowline' || r.schema !== 1) throw new Error('not a Snowline replay');
  const problems = protagonistProblems(r.protagonist);
  if (problems.length) throw new Error(`bad protagonist: ${problems.join(', ')}`);
  if (!Array.isArray(r.commands) || typeof r.tick !== 'number') throw new Error('no commands');
  return r;
}
