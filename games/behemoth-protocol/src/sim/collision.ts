import { OBSTACLE_CLASSES, type ObstacleClass } from '../content/obstacles';
import { DEFLECT, RAM } from '../content/tuning';
import {
  damageArmor,
  damageTreads,
  frontHalf,
  groundFootprint,
  hullBox,
  hullSide,
  hullWidth,
  lateralLimit,
  mobile,
  ramRating,
  wearPlow,
  type ArmorArc,
  type BehemothState,
} from './behemoth';
import { destroyEnemy } from './enemies';
import type { Enemy } from './entities';
import type { SimEvent } from './events';
import { boxBounds, circleIntersectsBox, clamp, rectIntersectsBox, type Box, type Rect } from './math';
import type { Terrain } from './terrain';
import type { World } from './world';

/**
 * Behemoth vs. the battlefield (SPEC §4.2). Nothing stops it: obstacles are crushed or plowed
 * through, and immovable rock deflects it into a glancing slide. The class decides the speed dip
 * and the damage, scaled by impact speed and reduced by ram gear.
 *
 * @param steer the player's steering this tick, which picks the slide direction off a rock face.
 */
export function resolveBehemothCollisions(w: World, dt: number, steer: -1 | 0 | 1): void {
  deflectOffRock(w, dt, steer);

  const b = w.behemoth;
  // The turned hull (it follows the machine's shape as it steers): only tiles it really covers are crushed.
  const box = hullBox(b);
  const ts = w.terrain.tileSize;
  for (const [c, r] of tilesUnder(w.terrain, boxBounds(box))) {
    if (!rectIntersectsBox(box, { x0: c * ts, y0: r * ts, x1: (c + 1) * ts, y1: (r + 1) * ts })) continue;
    const cls = w.terrain.crush(c, r, w.events);
    if (cls !== 'none') applyObstacle(b, cls, w.events, (c + 0.5) * ts, (r + 0.5) * ts);
  }

  for (const e of w.enemies) {
    if (!e.alive || !circleIntersectsBox(box, e.x, e.y, e.def.radius * RAM.crushRadius)) continue;
    if (e.def.ramDamage) {
      ramBig(w, e, box, dt);
      continue;
    }
    applyObstacle(b, e.def.obstacle, w.events, e.x, e.y);
    destroyEnemy(w, e, 'crushed');
  }

  ford(w, dt);
}

/**
 * A unit too big to crush (SPEC §7 siege tank, `EnemyDef.ramDamage`): the first contact costs the
 * Behemoth a ram of the unit's class and deals the unit damage by impact speed, more with ram gear
 * (the gear "adds damage to whatever you hit", SPEC §4.2). A survivor slides off the prow, shoved
 * to the nearer side, and can't be rammed again until `RAM.again` has passed.
 */
function ramBig(w: World, e: Enemy, box: Box, dt: number): void {
  const b = w.behemoth;
  if (!e.ai.ramIn) {
    const impact = b.vx / b.chassis.speed.cruise;
    const damage = e.def.ramDamage! * impact * (1 + RAM.gearDamage * ramRating(b));
    applyObstacle(b, e.def.obstacle, w.events, e.x, e.y);
    e.ai.ramIn = RAM.again;
    e.hp -= damage;
    if (e.hp <= 0) {
      destroyEnemy(w, e, 'crushed');
      return;
    }
  }
  const mid = box.y;
  // Off the nearer side, or (dead center) away from the field's nearer edge.
  const side = e.y !== mid ? Math.sign(e.y - mid) : mid < w.terrain.height / 2 ? 1 : -1;
  e.y = clamp(e.y + side * RAM.shove * dt, e.def.radius, w.terrain.height - e.def.radius);
  e.vy = side * RAM.shove * 0.25;
}

/**
 * Water (SPEC §4.5), measured under the ground box: the treads wear for every unit driven through
 * deep water (by distance, so a slow, crippled hull isn't worn down faster), and what the hull is
 * in (water, drifts, ice) is refreshed for the next step's speed cap and traction.
 */
function ford(w: World, dt: number): void {
  const b = w.behemoth;
  const wear = (b.wading.wear / 100) * Math.hypot(b.vx, b.vy) * dt;
  if (wear > 0) damageTreads(b, wear, w.events);
  b.wading = w.terrain.groundAt(groundFootprint(b));
}

export function applyObstacle(b: BehemothState, cls: ObstacleClass, events: SimEvent[], x: number, y: number): void {
  if (cls === 'none') return;
  const def = OBSTACLE_CLASSES[cls];
  const impact = b.vx / b.chassis.speed.cruise;
  const ram = ramRating(b);
  b.vx *= 1 - def.speedDip * (1 - RAM.speedDipCut * ram);
  const dmg = impact * (1 - ram);
  // Ramming wears the plow, then the front plate on the side that struck; once they're gone, the
  // hull takes it as tread strain.
  const through = damageFront(b, x, y, def.armorDamage * dmg, events);
  damageTreads(b, def.treadDamage * dmg + through, events);
  if (cls !== 'trivial' && cls !== 'soft') events.push({ type: 'collision', obstacle: cls, x, y });
}

/** Off-center distance (hull units) within which a nose contact counts as dead center. */
const DEAD_CENTER = 0.5;

/**
 * Damage from a contact at the nose (x, y): a plow takes it first, and what it can't take goes to
 * the front armor half on the side of the centerline it struck (both evenly when it's dead
 * center). Returns what gets through.
 */
function damageFront(b: BehemothState, x: number, y: number, amount: number, events: SimEvent[]): number {
  const left = wearPlow(b, amount, events);
  const side = hullSide(b, x, y);
  if (Math.abs(side) > DEAD_CENTER) return damageArmor(b, frontHalf(side), left);
  return damageArmor(b, 'frontLeft', left / 2) + damageArmor(b, 'frontRight', left / 2);
}

/** Forward overlap (units) up to which a rock tile at the nose counts as the face: over a tick of travel. */
const FACE_DEPTH = 2;

/** Grid cells overlapped by a rect, clipped to the field. */
function tilesUnder(t: Terrain, fp: Rect): [number, number][] {
  const ts = t.tileSize;
  const out: [number, number][] = [];
  const c0 = Math.floor(fp.x0 / ts);
  const c1 = Math.floor((fp.x1 - 0.001) / ts);
  const r0 = Math.max(0, Math.floor(fp.y0 / ts));
  const r1 = Math.min(t.rows - 1, Math.floor((fp.y1 - 0.001) / ts));
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) out.push([c, r]);
  return out;
}

/**
 * Immovable terrain (SPEC §4.2): the Behemoth is pushed out of any rock it overlaps along the
 * shallower axis. A side contact slides it along the rock. A head-on contact holds it against the
 * face and shoves it sideways (its forward momentum turned into a slide) until it clears, scraping
 * armor the whole time. It never stops for good: boxed in both ways, it grinds through the face.
 */
function deflectOffRock(w: World, dt: number, steer: -1 | 0 | 1): void {
  const b = w.behemoth;
  const t = w.terrain;
  const ts = t.tileSize;
  const d = b.deflect;
  const faceCols = new Set<number>();
  // Where the nose is held at the face (its x), if it is.
  let faceX: number | null = null;
  let side: { arc: ArmorArc; x: number; y: number } | null = null;

  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (const [c, r] of tilesUnder(t, groundFootprint(b))) {
      if (t.obstacleAt(c, r) !== 'immovable') continue;
      const fp = groundFootprint(b);
      const tx = c * ts;
      const ty = r * ts;
      const ox = Math.min(fp.x1, tx + ts) - Math.max(fp.x0, tx);
      const oy = Math.min(fp.y1, ty + ts) - Math.max(fp.y0, ty);
      if (ox <= 0 || oy <= 0) continue;
      pushed = true;
      // A tile at the nose that the hull has only just reached is part of the face, even if it came
      // in from the side while sliding along the face.
      if (tx + ts / 2 > b.x && (ox < oy || ox <= FACE_DEPTH)) {
        // Head-on: held at the face. This only undoes this tick's advance; it never reverses.
        b.x -= ox;
        faceCols.add(c);
        faceX = fp.x1 - ox;
      } else {
        // Alongside: slide along it, losing any sideways speed into it.
        const away = ty + ts / 2 < b.y ? 1 : -1;
        b.y += away * oy;
        if (b.vy * away < 0) b.vy = 0;
        side = { arc: away > 0 ? 'left' : 'right', x: clamp(tx + ts / 2, fp.x0, fp.x1), y: away > 0 ? fp.y0 + oy : fp.y1 - oy };
      }
    }
    if (!pushed) break;
  }

  const facePoint = faceX === null ? null : faceContact(t, faceCols, groundFootprint(b), faceX);
  if (facePoint) {
    if (d.dir === 0) {
      applyObstacle(b, 'immovable', w.events, facePoint.x, facePoint.y);
      d.flips = 0;
      d.dir = slideDirection(w, faceCols, steer);
    }
    // Blocked the way it's sliding (rock alongside on that side, or the field edge): go the other way.
    const halfW = hullWidth(b) / 2;
    const blocked =
      d.dir < 0 ? side?.arc === 'left' || b.y <= halfW + 0.5 : side?.arc === 'right' || b.y >= t.height - halfW - 0.5;
    if (blocked) {
      d.dir = d.dir < 0 ? 1 : -1;
      d.flips++;
    }
    if (d.dir === 0 || d.flips >= 2) {
      // Boxed in both ways: grind through the face instead (nothing stops the Behemoth for good).
      const fp = groundFootprint(b);
      for (const [c, r] of tilesUnder(t, { ...fp, x1: fp.x1 + 1 })) if (faceCols.has(c)) t.crumble(c, r, w.events);
      d.flips = 0;
    } else if (mobile(b)) {
      b.vy = d.dir * Math.max(DEFLECT.minSlideSpeed, b.vx * DEFLECT.slideSpeedScale);
    }
  } else if (d.dir !== 0) {
    // Clear of the face: keep drifting with the shove, but no faster than steering allows.
    d.dir = 0;
    const maxLat = lateralLimit(b);
    b.vy = clamp(b.vy, -maxLat, maxLat);
  }

  const contact = facePoint ?? side;
  d.spark = Math.max(0, d.spark - dt);
  if (!contact) return;
  // Scraping: armor ground off the contact side (at the face, the half it's on); once it's gone,
  // the tread pods take it.
  const speed = Math.max(b.vx, Math.abs(b.vy)) / b.chassis.speed.cruise;
  const scrape = DEFLECT.scrapePerSec * dt * speed * (1 - ramRating(b));
  const through = facePoint ? damageFront(b, facePoint.x, facePoint.y, scrape, w.events) : damageArmor(b, side!.arc, scrape);
  damageTreads(b, through, w.events);
  if (d.spark === 0) {
    d.spark = DEFLECT.sparkInterval;
    w.events.push({ type: 'scrape', x: contact.x, y: contact.y });
  }
}

/**
 * Where the nose meets a rock face: at `x`, across the middle of the rock it covers (which picks
 * the front armor half). Measured over every rock tile at the nose, since the first one pushed back
 * stops the rest from overlapping.
 */
function faceContact(t: Terrain, faceCols: Set<number>, fp: Rect, x: number): { x: number; y: number } {
  const ts = t.tileSize;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [c, r] of tilesUnder(t, { ...fp, x1: fp.x1 + 1 })) {
    if (!faceCols.has(c) || t.obstacleAt(c, r) !== 'immovable') continue;
    y0 = Math.min(y0, Math.max(fp.y0, r * ts));
    y1 = Math.max(y1, Math.min(fp.y1, (r + 1) * ts));
  }
  return { x, y: y0 <= y1 ? (y0 + y1) / 2 : (fp.y0 + fp.y1) / 2 };
}

/**
 * Which way to slide off a rock face, chosen once at contact: the way the player is steering, or
 * else toward the nearer end of the face, as long as there's room for the hull between that end
 * and the field edge; 0 if there's no room either way. (Steering can't flip it mid-slide:
 * steering into rock alongside would make it flip-flop in place.)
 */
function slideDirection(w: World, faceCols: Set<number>, steer: -1 | 0 | 1): -1 | 0 | 1 {
  const b = w.behemoth;
  const t = w.terrain;
  const ts = t.tileSize;
  const fp = groundFootprint(b);
  const rock = (c: number, r: number) => t.obstacleAt(c, r) === 'immovable';
  let top = Infinity;
  let bottom = -Infinity;
  for (const [c, r] of tilesUnder(t, { ...fp, x1: fp.x1 + 1 })) {
    if (!faceCols.has(c) || !rock(c, r)) continue;
    let a = r;
    while (a > 0 && rock(c, a - 1)) a--;
    let z = r;
    while (z < t.rows - 1 && rock(c, z + 1)) z++;
    top = Math.min(top, a * ts);
    bottom = Math.max(bottom, (z + 1) * ts);
  }
  // Room for the hull: it keeps its full half-width off the field edge, but only its ground box
  // has to clear the rock.
  const width = (hullWidth(b) * (1 + b.chassis.ground.width)) / 2;
  const up = top >= width ? fp.y1 - top : Infinity;
  const down = t.height - bottom >= width ? bottom - fp.y0 : Infinity;
  if (up === Infinity && down === Infinity) return 0;
  if (steer !== 0 && (steer < 0 ? up : down) < Infinity) return steer;
  if (up === down) return b.y < t.height / 2 ? 1 : -1;
  return up < down ? -1 : 1;
}
