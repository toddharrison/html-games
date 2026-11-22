/**
 * Battles scroll vertically (SPEC §4.1): sim +x (forward) is screen-up and sim +y (the
 * Behemoth's right) is screen-right. That's a rotation, not a mirror, so sprites drawn facing +x
 * just rotate by -90°. The sim never sees this; only render code and input use these helpers.
 */

export function viewX(_simX: number, simY: number): number {
  return simY;
}

export function viewY(simX: number): number {
  return -simX;
}

export function viewAngle(simAngle: number): number {
  return simAngle - Math.PI / 2;
}

/** Inverse mapping, for turning a pointer position into a sim aim point. */
export function simPoint(vx: number, vy: number): { x: number; y: number } {
  return { x: -vy, y: vx };
}
