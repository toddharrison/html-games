import type { SimEvent } from '../../sim/events';
import { frameRight } from '../../sim/frame';
import type { World } from '../../sim/world';
import type { MusicInput } from './director';

/**
 * How hot the fight is, for the music (SPEC §11.4 "Music", §16 Q33). Pure, render-side: it reads
 * the world and its events, never changes them.
 *
 * - **Presence** (most of it): the threat of the enemies on screen, revealed and alive.
 * - **Bumps** on top, each fading over a few seconds: hits on the Behemoth (by damage), enemy
 *   shots, a component destroyed, an alert wave sent.
 * - The **last stand** is always full heat.
 *
 * A themed big enemy is on the field from its first sighting until it dies or is left behind
 * (despawned), so one backing in and out of the frame doesn't replay its stinger.
 */
export const HEAT = {
  /** Threat on screen that counts as a full fight (a heavy tank is 2, a siege tank 4). */
  presenceFull: 6,
  /** Presence's share of the heat; bumps fill the rest. */
  presenceShare: 0.75,
  /** Per point of damage to the Behemoth, up to `hitMax` a hit. */
  hit: 0.012,
  hitMax: 0.3,
  /** An enemy shot fired. */
  incoming: 0.03,
  componentLost: 0.3,
  alertWave: 0.25,
  /** The most the bumps can add up to. */
  bumpMax: 0.6,
  /** Seconds for the bumps to fall to about a third. */
  decay: 5,
};

export class HeatGauge {
  private bump = 0;
  private time: number | null = null;
  private downed: string[] = [];

  /** `themed`: whether a kind of enemy has a theme in the music. */
  constructor(private readonly themed: (enemy: string) => boolean) {}

  /** Takes in a frame's events. */
  observe(events: readonly SimEvent[], time: number): void {
    this.settle(time);
    for (const ev of events) {
      switch (ev.type) {
        case 'behemothHit':
          this.add(Math.min(HEAT.hitMax, ev.damage * HEAT.hit));
          break;
        case 'fire':
          if (ev.owner === 'enemy') this.add(HEAT.incoming);
          break;
        case 'componentDestroyed':
          this.add(HEAT.componentLost);
          break;
        case 'alert':
          this.add(HEAT.alertWave);
          break;
        case 'enemyDestroyed':
          if (this.themed(ev.enemy)) this.downed.push(ev.enemy);
          break;
      }
    }
  }

  /** The music's input for its next bar. Hands over (and clears) the kills since the last read. */
  read(w: World): MusicInput {
    this.settle(w.time);
    let threat = 0;
    const bosses = new Set<string>();
    const right = frameRight(w.frame);
    for (const e of w.enemies) {
      if (!e.alive || !e.ai.sighted) continue;
      if (this.themed(e.def.id)) bosses.add(e.def.id);
      if (!e.hidden && e.x >= w.frame.left && e.x <= right) threat += e.def.threat;
    }
    const presence = Math.min(1, threat / HEAT.presenceFull);
    const heat = w.lastStand ? 1 : Math.min(1, presence * HEAT.presenceShare + this.bump);
    const downed = this.downed;
    this.downed = [];
    return { heat, bosses: [...bosses], downed };
  }

  private add(v: number): void {
    this.bump = Math.min(HEAT.bumpMax, this.bump + v);
  }

  private settle(time: number): void {
    if (this.time !== null && time > this.time) this.bump *= Math.exp(-(time - this.time) / HEAT.decay);
    this.time = time;
  }
}
