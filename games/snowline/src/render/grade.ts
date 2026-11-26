// The time-of-day colour grade (SPEC 12.1): cool dawn, flat noon, amber dusk, blue night. One tint
// multiplied over the whole scene, and a loss of colour towards night. How dark it is comes from the
// simulation's daylight, so the picture never shows more than the survivor can see.

export interface Grade {
  /** Multiplied over the scene; white is no change. */
  tint: [number, number, number];
  /** 0 keeps the colour, 1 takes it all out. */
  desat: number;
  /** The colour darkness fades to. */
  dark: [number, number, number];
}

/** Keyframes by minute of the day, joined by straight lines; the last wraps to the first. */
const KEYS: [minute: number, grade: Grade][] = [
  [0, { tint: [120, 140, 200], desat: 0.85, dark: [6, 9, 20] }],
  [4 * 60 + 30, { tint: [120, 140, 200], desat: 0.85, dark: [6, 9, 20] }],
  [5 * 60 + 40, { tint: [150, 160, 210], desat: 0.6, dark: [14, 16, 32] }],
  [6 * 60 + 30, { tint: [196, 206, 232], desat: 0.3, dark: [20, 24, 40] }],
  [8 * 60, { tint: [236, 240, 246], desat: 0.08, dark: [20, 24, 40] }],
  [12 * 60, { tint: [255, 255, 255], desat: 0, dark: [20, 24, 40] }],
  [16 * 60, { tint: [255, 248, 236], desat: 0, dark: [20, 24, 40] }],
  [18 * 60 + 30, { tint: [255, 214, 160], desat: 0.04, dark: [30, 20, 28] }],
  [19 * 60 + 40, { tint: [236, 160, 118], desat: 0.12, dark: [30, 16, 30] }],
  [20 * 60 + 30, { tint: [150, 120, 170], desat: 0.45, dark: [12, 10, 26] }],
  [21 * 60 + 30, { tint: [120, 140, 200], desat: 0.8, dark: [6, 9, 20] }],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function gradeAt(minuteOfDay: number): Grade {
  let i = KEYS.length - 1;
  while (i > 0 && KEYS[i]![0] > minuteOfDay) i--;
  const [m0, a] = KEYS[i]!;
  const [m1raw, b] = KEYS[(i + 1) % KEYS.length]!;
  const m1 = m1raw <= m0 ? m1raw + 1440 : m1raw;
  const t = m1 === m0 ? 0 : (minuteOfDay - m0) / (m1 - m0);
  const mix3 = (x: number[], y: number[]) => [0, 1, 2].map((k) => Math.round(lerp(x[k]!, y[k]!, t))) as [number, number, number];
  return { tint: mix3(a.tint, b.tint), desat: lerp(a.desat, b.desat, t), dark: mix3(a.dark, b.dark) };
}
