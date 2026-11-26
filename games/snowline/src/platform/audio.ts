// Sound hooks (SPEC 12.3): every sim event passes through here from the start, so sound can be added
// without touching the simulation. Ambient loops arrive with the weather in M4; effects and music in
// M6. Until then this is deliberately silent.

import type { SimEvent } from '../sim/state.ts';

export function playEvents(events: readonly SimEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'step': // footsteps by terrain (M6)
      case 'bump':
      case 'viewpoint': // a first wide view: one of the few short pieces of music (M6)
      case 'hour': // ambient changes with the time of day (M4)
      case 'fire-lit':
      case 'teleport':
        break;
    }
  }
}
