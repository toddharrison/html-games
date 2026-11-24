import type { SalvageSource } from './events';
import type { World } from './world';

/**
 * Banks salvage earned in battle (SPEC §8.1) and tells the renderer where it came from, so it can
 * fly the pickup to the hull (the HUD counts it when it lands). `amount` is its worth on Hard: the
 * battle's difficulty bonus (`World.salvageScale`) is added here. Salvage is whole, so the fraction
 * left over is carried to the next payment: a battle's total is its Hard total times the scale,
 * rounded down, however small the payments were.
 */
export function paySalvage(w: World, x: number, y: number, amount: number, source: SalvageSource): void {
  if (amount <= 0) return;
  const exact = amount * w.salvageScale + w.salvageCarry;
  const paid = Math.floor(exact + 1e-9);
  w.salvageCarry = exact - paid;
  bankSalvage(w, x, y, paid, source);
}

/** Banks exactly `amount` (already scaled: an objective's share, `objectiveBonus`). */
export function bankSalvage(w: World, x: number, y: number, amount: number, source: SalvageSource): void {
  if (amount <= 0) return;
  w.stats.salvage += amount;
  w.events.push({ type: 'salvage', x, y, amount, source });
}

/** A whole salvage gain paid outside a battle (an extraction bonus, an event's find) with a difficulty bonus `scale` (×): to the nearest, halves up. */
export function salvageWorth(amount: number, scale: number): number {
  return Math.floor(amount * scale + 0.5 + 1e-9);
}
