import type { SalvageSource } from './events';
import type { World } from './world';

/**
 * Banks salvage earned in battle (SPEC §8.1) and tells the renderer where it came from, so it can
 * fly the pickup to the hull (the HUD counts it when it lands).
 */
export function paySalvage(w: World, x: number, y: number, amount: number, source: SalvageSource): void {
  if (amount <= 0) return;
  w.stats.salvage += amount;
  w.events.push({ type: 'salvage', x, y, amount, source });
}
