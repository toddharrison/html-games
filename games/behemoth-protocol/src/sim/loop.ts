/** Fixed-timestep driver: turns variable frame time into a whole number of 60 Hz sim steps. */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/**
 * Slack for a timer counted down by `SIM_DT`: it's done once it's at or below this, not 0. Float
 * drift leaves 0.1 less six steps of 1/60 at 2e-17, which would fire a tick late.
 */
export const TIMER_SLACK = 1e-9;

export class FixedStepper {
  private acc = 0;

  /**
   * @param maxStepsPerFrame cap so a long stall (tab switch, breakpoint) doesn't trigger a
   *   spiral of catch-up steps; excess time is dropped.
   */
  constructor(private readonly maxStepsPerFrame = 5) {}

  /** Add elapsed real time (seconds); returns how many sim steps to run now. */
  advance(elapsedSec: number): number {
    this.acc += Math.max(0, elapsedSec);
    let steps = Math.floor(this.acc / SIM_DT + 1e-9);
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      this.acc = 0;
    } else {
      this.acc -= steps * SIM_DT;
      if (this.acc < 0) this.acc = 0;
    }
    return steps;
  }

  /** Fraction of a step left in the accumulator, for render interpolation. */
  get alpha(): number {
    return this.acc / SIM_DT;
  }

  reset(): void {
    this.acc = 0;
  }
}
