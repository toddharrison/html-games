import { ARMOR_ARCS, type AddonMount, type ChassisDef, type CoreComponent, type HardpointSlotDef, type TurretDef } from '../content/chassis';
import { armorPart, GRADES, TRACKS, type TrackId, type Upgrades } from '../content/upgrades';

/**
 * Component upgrades (SPEC §5.6) applied to a chassis: the Behemoth is built from the *fitted*
 * chassis, so everything that reads `b.chassis` (integrity maxima, reactor output, channels,
 * traverse) sees the upgraded numbers without knowing about upgrades.
 */

export const CORE_COMPONENTS = Object.keys(GRADES) as CoreComponent[];

export function modLevel(u: Upgrades, part: string, track: TrackId): number {
  return u.mods[part]?.[track] ?? 0;
}

/** The multiplier a part's mod track gives (1 with no levels). */
export function modScale(u: Upgrades, part: string, track: TrackId): number {
  return 1 + modLevel(u, part, track) * TRACKS[track].per;
}

/** Tons the upgrades add: each grade over Gen 1, and every mod level. */
export function upgradeMass(u: Upgrades): number {
  let mass = 0;
  for (const c of CORE_COMPONENTS) {
    const gen = u.grades[c];
    if (gen) mass += GRADES[c][gen].mass;
  }
  for (const tracks of Object.values(u.mods)) {
    for (const [track, level] of Object.entries(tracks)) mass += (level ?? 0) * TRACKS[track as TrackId].mass;
  }
  return mass;
}

/** The chassis with its upgrades applied. With none, the chassis itself. */
export function fitChassis(base: ChassisDef, u: Upgrades): ChassisDef {
  if (Object.keys(u.grades).length === 0 && Object.keys(u.mods).length === 0) return base;
  const grade = (c: CoreComponent) => {
    const gen = u.grades[c];
    return gen ? GRADES[c][gen] : null;
  };
  const hp = (c: CoreComponent, hp: number) => Math.round(hp * (grade(c)?.hp ?? 1) * modScale(u, c, 'harden'));
  const r = grade('reactor');
  const blast = r?.blast ?? 1;
  const s = grade('sensors');
  const f = grade('fireControl');
  const m = grade('magazine');
  const t = grade('treads');

  const slot = (def: HardpointSlotDef): HardpointSlotDef => {
    const out: HardpointSlotDef = { ...def, hp: Math.round(def.hp * modScale(u, def.id, 'harden')) };
    // A ring's slots turn with the ring: its traverse mod speeds the ring instead.
    if (!def.ring && modLevel(u, def.id, 'traverse') > 0) out.traverse = (def.traverse ?? 1) * modScale(u, def.id, 'traverse');
    return out;
  };
  const ring = (def: TurretDef): TurretDef => ({ ...def, traverseDegPerSec: def.traverseDegPerSec * modScale(u, def.slot, 'traverse') });
  const mount = (def: AddonMount): AddonMount => ({
    ...def,
    ...(def.hardpoint ? { hardpoint: slot(def.hardpoint) } : {}),
    ...(def.turret ? { turret: ring(def.turret) } : {}),
  });

  return {
    ...base,
    treadHp: hp('treads', base.treadHp),
    massCapacity: Math.round(base.massCapacity * (t?.capacity ?? 1) * modScale(u, 'treads', 'load')),
    sensorsHp: hp('sensors', base.sensorsHp),
    revealRadius: base.revealRadius * (s?.reveal ?? 1),
    sensorReach: (base.sensorReach ?? 1) * (s?.reach ?? 1),
    fireControl: {
      hp: hp('fireControl', base.fireControl.hp),
      channels: base.fireControl.channels + (f?.channels ?? 0),
      spread: (base.fireControl.spread ?? 1) * (f?.spread ?? 1),
    },
    magazine: { ...base.magazine, hp: hp('magazine', base.magazine.hp), cookOff: (base.magazine.cookOff ?? 1) * (m?.cookOff ?? 1) },
    reactor: {
      ...base.reactor,
      hp: hp('reactor', base.reactor.hp),
      output: base.reactor.output * (r?.output ?? 1),
      capacitor: Math.round(base.reactor.capacitor * (r?.capacitor ?? 1) * modScale(u, 'reactor', 'capacitor')),
      blastRadius: base.reactor.blastRadius * blast,
      blastDamage: base.reactor.blastDamage * blast,
    },
    armor: Object.fromEntries(ARMOR_ARCS.map((arc) => [arc, Math.round(base.armor[arc] * modScale(u, armorPart(arc), 'plate'))])) as ChassisDef['armor'],
    turrets: base.turrets.map(ring),
    hardpoints: base.hardpoints.map(slot),
    addonMounts: Object.fromEntries(Object.entries(base.addonMounts).map(([id, def]) => [id, def && mount(def)])),
  };
}
