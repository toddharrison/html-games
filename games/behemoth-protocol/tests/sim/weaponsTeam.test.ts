import { describe, expect, it } from 'vitest';
import { DOCTRINES } from '../../src/content/doctrines';
import { ENEMIES } from '../../src/content/enemies';
import { WEAPONS } from '../../src/content/weapons';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { concealed } from '../../src/sim/concealment';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { damageEnemy } from '../../src/sim/projectiles';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const DEF = ENEMIES.weaponsTeam;

function world(): World {
  const w = createWorld(OPTS);
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 120; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
  return w;
}

function steps(w: World, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    out.push(...w.events.splice(0));
  }
  return out;
}

/** A team dug in ahead and off to the side, ready to lock on, holding still. */
function team(w: World, dx = 170, dy = 60): Enemy {
  const b = w.behemoth;
  const e = spawnEnemy(w, 'weaponsTeam', b.x + dx, Math.min(w.terrain.height - 8, b.y + dy));
  e.def = { ...e.def, maxSpeed: 0, accel: 0 };
  e.cooldown = 0;
  e.turret = Math.atan2(b.y - e.y, b.x - e.x);
  return e;
}

describe('heavy weapons team', () => {
  it('out-ranges a rifle squad, hides in cover, and locks on for a long telegraph', () => {
    expect(DEF.fireRange).toBeGreaterThanOrEqual(2 * ENEMIES.infantry.fireRange);
    expect(DEF.aimTime).toBeGreaterThan(2 * ENEMIES.infantry.aimTime);
    expect(DEF.lockOn).toBeDefined();
    expect(DEF.mobility).toBe('foot');
    expect(DEF.canHide).toBe(true);
    expect(DEF.spawn).toBe('cover');
    const spec = WEAPONS.guidedMissile.projectile;
    expect(spec.kind === 'missile' && spec.sight).toBe(true);
    // In the doctrines that fight from cover and at range.
    expect(DOCTRINES.entrenched.mix.weaponsTeam).toBeGreaterThan(0);
    expect(DOCTRINES.longGuns.mix.weaponsTeam).toBeGreaterThan(0);
    expect(DOCTRINES.combined.mix.weaponsTeam).toBeGreaterThan(0);
  });

  it('announces the lock, then fires a guided missile when it completes', () => {
    const w = world();
    const e = team(w);
    const first = steps(w, 2);
    const lock = first.find((ev) => ev.type === 'lockOn');
    expect(lock).toMatchObject({ type: 'lockOn', id: e.id, time: DEF.aimTime });
    expect(e.windup).toBeGreaterThan(0);
    // Nothing flies while it paints the hull...
    const during = steps(w, Math.floor(DEF.aimTime * 60) - 10);
    expect(during.some((ev) => ev.type === 'fire' && ev.owner === 'enemy')).toBe(false);
    // ...then the missile goes.
    const after = steps(w, 20);
    expect(after.some((ev) => ev.type === 'fire' && ev.owner === 'enemy' && ev.weapon === 'guidedMissile')).toBe(true);
  });

  it('is in plain sight while it locks on, even in a wood', () => {
    const w = world();
    const e = team(w);
    const ts = w.terrain.tileSize;
    const t = w.terrain.tile(Math.floor(e.x / ts), Math.floor(e.y / ts))!;
    Object.assign(t, { mat: 'forest', state: 'intact', hp: 100 });
    e.cooldown = 99;
    steps(w, 1);
    expect(concealed(w, e)).toBe(true);
    e.cooldown = 0;
    steps(w, 2);
    expect(e.windup).toBeGreaterThan(0);
    expect(concealed(w, e)).toBe(false);
    expect(e.hidden).toBe(false);
  });

  it('a hit throws the lock off: no missile, and it relocks only after a pause', () => {
    const w = world();
    const e = team(w);
    steps(w, 30);
    expect(e.windup).toBeGreaterThan(0);
    damageEnemy(w, e, WEAPONS.autocannon.projectile as never, 1, 'splash');
    const broke = w.events.splice(0);
    expect(broke.some((ev) => ev.type === 'lockBroken' && ev.id === e.id)).toBe(true);
    expect(e.windup).toBe(0);
    expect(e.cooldown).toBeGreaterThanOrEqual(DEF.lockOn!.relock - 1e-9);
    const later = steps(w, Math.floor(DEF.aimTime * 60));
    expect(later.some((ev) => ev.type === 'fire' && ev.owner === 'enemy')).toBe(false);
  });

  it('needs a line of sight: a wall in the way stops the lock, and breaks one under way', () => {
    const w = world();
    const b = w.behemoth;
    const e = team(w, 170, 0);
    steps(w, 10);
    expect(e.windup).toBeGreaterThan(0);
    // A wall goes up between them mid-lock.
    const ts = w.terrain.tileSize;
    const col = Math.floor((b.x + 110) / ts);
    for (let r = 0; r < w.terrain.rows; r++) Object.assign(w.terrain.tile(col, r)!, { mat: 'wall', state: 'intact', hp: 400 });
    const events = steps(w, 2);
    expect(events.some((ev) => ev.type === 'lockBroken')).toBe(true);
    expect(e.windup).toBe(0);
    // While it's blind it never starts another.
    e.cooldown = 0;
    const blind = steps(w, 30);
    expect(blind.some((ev) => ev.type === 'lockOn')).toBe(false);
  });
});
