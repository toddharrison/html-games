/**
 * Scrolling a list one row at a time (the depot's For sale list): where the window can start, and
 * how far a mouse wheel or trackpad moves it.
 */

/** The first row shown, kept so the window never runs past either end of the list. */
export function clampScroll(scroll: number, total: number, visible: number): number {
  return Math.max(0, Math.min(scroll, total - visible));
}

/** Wheel travel, in pixels, that moves the list one row. */
const WHEEL_ROW = 40;

/**
 * Turns wheel events into whole rows. Trackpads send many small deltas and mouse wheels a few big
 * ones, so travel adds up until it's worth a row; turning back the other way starts over.
 */
export class WheelRows {
  private acc = 0;

  /** `deltaMode` is the WheelEvent's: 0 pixels, 1 lines, 2 pages. Returns rows to move (+ is down). */
  step(deltaY: number, deltaMode = 0): number {
    const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
    if (Math.sign(px) !== Math.sign(this.acc)) this.acc = 0;
    this.acc += px;
    const rows = Math.trunc(this.acc / WHEEL_ROW);
    this.acc -= rows * WHEEL_ROW;
    return rows;
  }
}
