// Music (SPEC 12.3): a few short, quiet pieces that play once, at moments that matter: the first fire,
// the first wide view from high ground, the first snow, and rescue. Nothing loops under ordinary play,
// and the game works without them. Each is a slow line of soft notes over a held low note, played
// through a simple echo so it hangs in the air.

/** Pieces as [semitones above the root, beats] pairs; a negative step is a rest. */
const PIECES: Record<string, { root: number; beat: number; notes: [number, number][] }> = {
  // Warm, rising: something has changed.
  fire: { root: 196, beat: 0.55, notes: [[0, 1], [4, 1], [7, 2], [9, 1], [7, 1], [12, 3], [11, 1], [7, 3]] },
  // Open, wide intervals: the whole valley laid out.
  view: { root: 220, beat: 0.6, notes: [[0, 2], [7, 2], [12, 2], [14, 1], [16, 3], [14, 1], [9, 2], [12, 4]] },
  // Sparse and high, falling: the season is turning.
  snow: { root: 294, beat: 0.7, notes: [[12, 2], [-1, 1], [9, 2], [7, 2], [-1, 1], [4, 2], [2, 4]] },
  // Home.
  rescue: { root: 196, beat: 0.5, notes: [[0, 1], [4, 1], [7, 1], [12, 2], [11, 1], [12, 1], [16, 2], [14, 1], [12, 4]] },
};

export function playPiece(ctx: AudioContext, out: AudioNode, name: string): void {
  const p = PIECES[name];
  if (!p) return;
  // An echo: a feedback delay, quietly.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = p.beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(out);
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(out);
  bus.connect(delay);
  const t0 = ctx.currentTime + 0.1;
  let t = t0;
  for (const [step, beats] of p.notes) {
    const dur = beats * p.beat;
    if (step >= 0) {
      const f = p.root * 2 ** (step / 12);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.4);
      osc.connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + dur * 1.5);
    }
    t += dur;
  }
  // The held low note under it all.
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = p.root / 2;
  const dg = ctx.createGain();
  dg.gain.setValueAtTime(0, t0);
  dg.gain.linearRampToValueAtTime(0.03, t0 + 1.5);
  dg.gain.linearRampToValueAtTime(0, t + 1.5);
  drone.connect(dg).connect(out);
  drone.start(t0);
  drone.stop(t + 1.6);
}
