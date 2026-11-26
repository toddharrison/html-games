// Sound effects for sim events (SPEC 12.3). Silent until M6 fills them in.

import type { SimEvent } from '../sim/state.ts';

export function effect(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, e: SimEvent): void {
  void ctx;
  void out;
  void noise;
  void e;
}
