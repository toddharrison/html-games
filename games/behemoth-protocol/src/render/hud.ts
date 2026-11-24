import { MODES } from '../content/modes';
import { MASS } from '../content/tuning';
import Phaser from 'phaser';
import type { BattleLayout } from '../config';
import type { AddonId } from '../content/addons';
import { ARMOR_ARCS, type ArmorArc, type MountPosition } from '../content/chassis';
import { SHELL_TYPES, type Binding } from '../content/weapons';
import {
  autoGroupOf,
  firingBinding,
  fraction,
  hitched,
  loadMass,
  massCapacity,
  powerOutput,
  reloadScale,
  speedLimits,
  treadIntegrity,
  type BehemothState,
  type ComponentId,
  type HardpointState,
} from '../sim/behemoth';
import { poolUnder } from '../sim/pools';
import { feedingInto } from '../sim/trailer';
import { clock } from '../sim/run';
import type { World } from '../sim/world';
import type { DirectiveGoal } from '../content/directives';
import { FONT_KEY, fontText } from './pixelFont';
import { hex, PAL } from './palette';
import { damageLevel } from './statusFx';
import { usingPad } from '../input/gamepad';
import { objectivePercent } from '../sim/objective';
import { TrainStrip } from './trainStrip';

/**
 * Battle HUD in the side panels (SPEC §10). Left: speed, treads, reactor, power, the weapon strip
 * (grouped by binding, with reload, ammo, and on/off state), and control hints.
 * Right: the systems schematic (front up, every component colored by integrity), a component
 * readout, kills and distance, and the debug readout. Fixed to the screen.
 */

function integrityColor(f: number): number {
  const level = damageLevel(f);
  if (level === 'destroyed') return hex(PAL.hudLine);
  if (level === 'ok') return hex(PAL.good);
  if (level === 'amber') return hex(PAL.warn);
  return hex(PAL.bad);
}

type Fixed = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Schematic size and component placement (local pixels, front up). Boxes are laid out around the
 * bare hull; `SCH.at` is where the hull's corner sits, leaving room for the add-ons around it and
 * the trailer below.
 */
const SCH = { w: 48, h: 88, at: { x: 6, y: 4 } };
const ARMOR_BOX: Record<ArmorArc, Box> = {
  // The front halves meet at the centerline, with a 2 px seam between them.
  frontLeft: { x: 4, y: 0, w: 13, h: 2 },
  frontRight: { x: 19, y: 0, w: 13, h: 2 },
  rear: { x: 4, y: 54, w: 28, h: 2 },
  left: { x: 0, y: 4, w: 2, h: 48 },
  right: { x: 34, y: 4, w: 2, h: 48 },
};
const TREAD_BOXES: Box[] = [
  { x: 3, y: 5, w: 5, h: 46 },
  { x: 28, y: 5, w: 5, h: 46 },
];
const SENSORS_BOX: Box = { x: 15, y: 4, w: 6, h: 3 };
/** Fire control, amidships between the prow mount and the turret. */
const FIRE_CONTROL_BOX: Box = { x: 15, y: 13, w: 6, h: 2 };
const REACTOR_BOX: Box = { x: 13, y: 44, w: 10, h: 7 };
/** The ammo magazine, deep in the hull between the spine mount and the reactor. */
const MAGAZINE_BOX: Box = { x: 14, y: 41, w: 8, h: 2 };
const MOUNT_BOX: Record<MountPosition, Box> = {
  front: { x: 12, y: 9, w: 12, h: 3 },
  turret: { x: 12, y: 16, w: 12, h: 10 },
  left: { x: 9, y: 29, w: 3, h: 7 },
  right: { x: 24, y: 29, w: 3, h: 7 },
  rear: { x: 15, y: 36, w: 6, h: 5 },
  // Pods have their own boxes per bay (SLOT_BOX); this is only a fallback.
  trailer: { x: 11, y: 63, w: 14, h: 7 },
};
/** The trailer, towed below the hull: tow bar, body (the armor is its rim), and one box per bay. */
const TRAILER_BOX = {
  bar: { x: 17, y: 57, w: 2, h: 3 },
  body: { x: 8, y: 60, w: 20, h: 22 },
  bays: [
    { x: 11, y: 63, w: 14, h: 7 },
    { x: 11, y: 72, w: 14, h: 7 },
  ],
};
/** Slots that don't sit where their position's box is (several share a position). */
const SLOT_BOX: Record<string, Box> = {
  pd: { x: 25, y: 9, w: 3, h: 3 },
  sponsonL: { x: 3, y: 14, w: 5, h: 7 },
  sponsonR: { x: 28, y: 14, w: 5, h: 7 },
  // Between the flank mounts, behind the main turret.
  dorsalRing: { x: 13, y: 28, w: 10, h: 6 },
  // On the turret's right cheek.
  coax: { x: 24, y: 17, w: 3, h: 4 },
  bay0: TRAILER_BOX.bays[0]!,
  bay1: TRAILER_BOX.bays[1]!,
};
/** Add-ons' own parts: the ram plow ahead of the front armor, the outboard pods outside the hull. */
const ADDON_BOX: Partial<Record<AddonId, Box[]>> = {
  ramPlow: [{ x: 2, y: -4, w: 32, h: 3 }],
  // Either side of the magazine.
  blowoutPanels: [
    { x: 11, y: 41, w: 2, h: 2 },
    { x: 23, y: 41, w: 2, h: 2 },
  ],
  outerTreads: [
    { x: -6, y: 5, w: 4, h: 46 },
    { x: 38, y: 5, w: 4, h: 46 },
  ],
};

const FLASH_TIME = 0.15;

const BINDING_ORDER: Binding[] = ['lmb', 'rmb', 'space', 'auto'];
const TRIGGER_KEY: Record<Exclude<Binding, 'auto'>, string> = { lmb: 'LMB', rmb: 'RMB', space: 'SPC' };
/** The pad's triggers for the same bindings, and its D-pad arrows for the auto groups 1–4. */
const PAD_TRIGGER: Record<Exclude<Binding, 'auto'>, string> = { lmb: 'RT', rmb: 'LT', space: 'RB' };
const PAD_AUTO = ['', 'D^', 'D>', 'DV', 'D<'];

/** The strip's key for a mount: its trigger, or its toggle group on Auto (as the pad names it, if in use). */
function stripKey(b: BehemothState, h: HardpointState): string {
  const binding = firingBinding(b, h);
  const pad = usingPad();
  if (binding === 'auto') {
    const group = autoGroupOf(h.weapon!);
    return pad ? PAD_AUTO[group]! : String(group);
  }
  return (pad ? PAD_TRIGGER : TRIGGER_KEY)[binding];
}

/** One row of the weapon strip: identical weapons on the same binding are grouped. */
interface WeaponRow {
  mounts: HardpointState[];
  /** Weapon name and count; the key in front can change (fire control lost: back to a trigger). */
  name: string;
  label: Phaser.GameObjects.BitmapText;
  status: Phaser.GameObjects.BitmapText;
  y: number;
}

/** Top of the weapon strip in the left panel, and the spacing between rows. */
const STRIP_Y = 96;
const ROW_H = 17;

export class Hud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly speedText: Phaser.GameObjects.BitmapText;
  private readonly treadText: Phaser.GameObjects.BitmapText;
  private readonly reactorText: Phaser.GameObjects.BitmapText;
  private readonly powerText: Phaser.GameObjects.BitmapText;
  private readonly rows: WeaponRow[] = [];
  private readonly components: Phaser.GameObjects.BitmapText;
  private readonly componentValues: Phaser.GameObjects.BitmapText;
  private readonly stats: Phaser.GameObjects.BitmapText;
  /** The key hints at the bottom left: keyboard and mouse, or the pad's. */
  private readonly keyHints: Phaser.GameObjects.BitmapText;
  private readonly padHints: Phaser.GameObjects.BitmapText;
  /** The alert clock's readout in the left panel, above the key hints. */
  private readonly alertLabel: Phaser.GameObjects.BitmapText;
  private readonly alertText: Phaser.GameObjects.BitmapText;
  private readonly alertY: number;
  /** The battle mode's objective (SPEC §4.4): targets destroyed out of all, and lost, above the alert clock. */
  private readonly objectiveLabel: Phaser.GameObjects.BitmapText;
  private readonly objectiveText: Phaser.GameObjects.BitmapText;
  /** A sector's objective battle (SPEC §3): the Directive's ask, above the mode's objective. */
  private readonly directiveLabel: Phaser.GameObjects.BitmapText;
  private readonly directiveText: Phaser.GameObjects.BitmapText;
  private readonly center: Phaser.GameObjects.BitmapText;
  private readonly centerBg: Phaser.GameObjects.Rectangle;
  private readonly debug: Phaser.GameObjects.BitmapText;
  private readonly midMessageY: number;
  private readonly topMessageY = 28;
  /** Left panel content box. */
  private readonly lx: number;
  private readonly lw: number;
  /** Right panel content box. */
  private readonly rx: number;
  private readonly rw: number;
  /** Schematic origin. */
  private readonly sx: number;
  private readonly sy = 16;
  /** Remaining highlight time per component id or armor arc, after a hit. */
  private readonly flashes = new Map<string, number>();

  /** The run so far: this battle's number, salvage banked before it, and where it's fought (biome, approach). */
  private readonly run: HudRun;
  private readonly scene: Phaser.Scene;
  private readonly layout: BattleLayout;
  /** An Intercept's train strip (SPEC-armored-train.md §T13), made once the train exists. */
  private strip: TrainStrip | null = null;

  constructor(scene: Phaser.Scene, layout: BattleLayout, b: BehemothState, run: HudRun) {
    this.run = run;
    this.scene = scene;
    this.layout = layout;
    const { width, height, fieldX, fieldW } = layout;
    const fixed = <T extends Fixed>(o: T) => o.setScrollFactor(0).setDepth(100);
    const text = (x: number, y: number, s: string, color: string = PAL.hudText) =>
      fixed(scene.add.bitmapText(x, y, FONT_KEY, fontText(s)).setTint(hex(color)));

    const rightX = fieldX + fieldW;
    this.lx = 6;
    this.lw = fieldX - 12;
    this.rx = rightX + 6;
    this.rw = width - rightX - 12;
    this.sx = this.rx + Math.floor((this.rw - SCH.w) / 2);

    // Panel backgrounds cover anything that spills past the battlefield's sides.
    fixed(scene.add.rectangle(0, 0, fieldX, height, hex(PAL.hudBg)).setOrigin(0, 0));
    fixed(scene.add.rectangle(rightX, 0, width - rightX, height, hex(PAL.hudBg)).setOrigin(0, 0));
    fixed(scene.add.rectangle(fieldX - 1, 0, 1, height, hex(PAL.hudLine)).setOrigin(0, 0));
    fixed(scene.add.rectangle(rightX, 0, 1, height, hex(PAL.hudLine)).setOrigin(0, 0));
    this.g = fixed(scene.add.graphics());

    // Over the tread capacity the label turns into a warning: that's why it's slow (SPEC §5.3).
    const over = loadMass(b) > massCapacity(b);
    text(this.lx, 6, over ? 'Overload' : 'Speed', over ? PAL.warn : PAL.hudDim);
    text(this.lx, 26, 'Treads', PAL.hudDim);
    text(this.lx, 46, 'Reactor', PAL.hudDim);
    text(this.lx, 66, 'Power', PAL.hudDim);
    this.speedText = text(this.lx + this.lw, 6, '').setOrigin(1, 0);
    this.treadText = text(this.lx + this.lw, 26, '').setOrigin(1, 0);
    this.reactorText = text(this.lx + this.lw, 46, '').setOrigin(1, 0);
    this.powerText = text(this.lx + this.lw, 66, '').setOrigin(1, 0);

    // Weapon strip: one row per trigger or auto group, identical weapons grouped together.
    text(this.lx, STRIP_Y - 10, 'Weapons', PAL.hudDim);
    for (const binding of BINDING_ORDER) {
      const groups = new Map<string, HardpointState[]>();
      for (const h of b.hardpoints) {
        if (!h.weapon || h.binding !== binding) continue;
        // A gun's shell is part of what it is: different shells get their own rows.
        const key = `${h.weapon.id}:${h.shell ?? ''}`;
        groups.set(key, [...(groups.get(key) ?? []), h]);
      }
      // Autos list in toggle-key order.
      const ordered = [...groups.values()].sort((x, y) => autoGroupOf(x[0]!.weapon!) - autoGroupOf(y[0]!.weapon!));
      for (const mounts of ordered) {
        const w = mounts[0]!.weapon!;
        const shell = mounts[0]!.shell;
        const name = `${w.short}${shell ? ` ${SHELL_TYPES[shell].short}` : ''}${mounts.length > 1 ? ` x${mounts.length}` : ''}`;
        const y = STRIP_Y + this.rows.length * ROW_H;
        this.rows.push({
          mounts,
          name,
          label: text(this.lx, y, `${stripKey(b, mounts[0]!).padEnd(4)}${name}`),
          status: text(this.lx + this.lw, y, '').setOrigin(1, 0),
          y,
        });
      }
    }

    // Key hints for the keyboard and mouse, or the pad's (the same number of lines), whichever
    // was used last.
    const hints = ['W/S  speed', 'A/D  steer', 'LMB RMB SPC  fire', '1-4  autos on/off', 'X    final protocol'];
    const padHints = ['LS   speed, steer', 'RS   aim  R3 recenter', 'RT LT RB  fire', 'D-pad autos on/off', 'X    final protocol'];
    if (b.trailer) {
      hints.push('Q    jettison trailer');
      padHints.push('LB   jettison trailer');
    }
    hints.push('ESC pause  R retry');
    padHints.push('START pause BACK mute');
    const hintsY = height - 5 - hints.length * 7;
    this.keyHints = text(this.lx, hintsY, hints.join('\n'), PAL.hudDim);
    this.padHints = text(this.lx, hintsY, padHints.join('\n'), PAL.hudDim).setVisible(false);
    this.alertY = hintsY - 22;
    this.alertLabel = text(this.lx, this.alertY, 'Alert', PAL.hudDim);
    this.alertText = text(this.lx + this.lw, this.alertY, '').setOrigin(1, 0);
    this.objectiveLabel = text(this.lx, this.alertY - 14, '', PAL.hudDim).setVisible(false);
    this.objectiveText = text(this.lx + this.lw, this.alertY - 14, '').setOrigin(1, 0).setVisible(false);
    this.directiveLabel = text(this.lx, this.alertY - 23, '', PAL.hudDim).setVisible(false);
    this.directiveText = text(this.lx + this.lw, this.alertY - 23, '').setOrigin(1, 0).setVisible(false);

    // The schematic is headed with the Behemoth's callsign.
    text(this.rx, 6, run.callsign, PAL.glow);
    const listY = this.sy + SCH.h + 8;
    this.components = text(this.rx, listY, '', PAL.hudDim);
    this.componentValues = text(this.rx + this.rw, listY, '').setOrigin(1, 0);
    const own = b.hardpoints.filter((h) => h.weapon && h.slot.position !== 'trailer').length;
    const addons = b.addons.filter((a) => a.integrity && a.def.kind !== 'trailer').length;
    // Each bay has a row; a drone bay a second one for its drones.
    const trailer = b.trailer ? 2 + b.trailer.bays.reduce((n, bay) => n + (bay ? (bay.def.kind === 'drones' ? 2 : 1) : 0), 0) : 0;
    const readoutRows = 4 + own + addons + trailer;
    this.stats = text(this.rx, listY + readoutRows * 7 + 10, '');
    this.debug = text(this.rx, height - 4, '', PAL.hudDim).setOrigin(0, 1).setVisible(false);

    const cx = fieldX + fieldW / 2;
    this.midMessageY = height / 2;
    this.centerBg = fixed(scene.add.rectangle(cx, height / 2, 10, 13, hex(PAL.hudBg), 0.85)).setVisible(false);
    this.center = text(cx, height / 2, '').setOrigin(0.5, 0.5);
  }

  /** Highlight a component (id) or armor arc on the schematic after a hit. */
  flash(id: ComponentId | ArmorArc): void {
    this.flashes.set(id, FLASH_TIME);
  }

  /** `pending`: salvage earned but still flying to the hull (counted once it lands). */
  update(w: World, dt: number, pending = 0): void {
    const b = w.behemoth;
    const g = this.g;
    g.clear();
    const pad = usingPad();
    this.keyHints.setVisible(!pad);
    this.padHints.setVisible(pad);
    for (const [id, t] of this.flashes) {
      if (t - dt <= 0) this.flashes.delete(id);
      else this.flashes.set(id, t - dt);
    }

    const bar = (y: number, frac: number, color: number) => {
      g.fillStyle(hex(PAL.hudLine)).fillRect(this.lx, y, this.lw, 3);
      g.fillStyle(color).fillRect(this.lx, y, Math.round(this.lw * Math.max(0, Math.min(1, frac))), 3);
    };

    // Speed: bar scaled to the fastest top speed (healthy, unloaded); ticks at the current
    // (tread- and mass-scaled) min/cruise/top.
    const full = b.chassis.speed.top * (1 + MASS.underload);
    const lim = speedLimits(b);
    bar(14, b.vx / full, hex(PAL.amber));
    g.fillStyle(hex(PAL.hudText));
    for (const v of [lim.min, lim.cruise, lim.top]) g.fillRect(this.lx + Math.round((this.lw * v) / full), 13, 1, 5);
    // What's underfoot: WADE in the shallows or DRIFT in snow (held to cruise), FORD in deep water
    // (min speed, tread wear), ICE when the treads are sliding.
    const label = b.wading.label;
    const deep = b.wading.min > 0.05;
    this.speedText
      .setText(`${label ? `${label} ` : ''}${Math.round(b.vx)}`)
      .setTint(hex(deep || label === 'ICE' ? PAL.warn : PAL.hudText));

    const ti = treadIntegrity(b);
    bar(34, ti, integrityColor(ti));
    // BURN while plasma is eating at the treads (the hull hides the pool under it).
    const burning = w.pools.some((p) => poolUnder(b, p));
    this.treadText.setText(`${burning ? 'BURN ' : ''}${Math.round(ti * 100)}%`).setTint(hex(burning ? PAL.bad : PAL.hudText));

    const ri = fraction(b.reactor);
    bar(54, ri, integrityColor(ri));
    this.reactorText.setText(`${Math.round(ri * 100)}%`);

    bar(74, b.power.stored / b.power.max, hex(PAL.glow));
    this.powerText.setText(`${Math.floor(b.power.stored)} +${powerOutput(b).toFixed(0)}/S`);

    for (const row of this.rows) this.drawWeaponRow(b, row, bar);

    this.drawSchematic(b, w.revive);
    const toGo = Math.max(0, Math.ceil((w.exitX - b.x) / 10));
    const exit = w.extractedAt !== null ? 'Extracted' : `Exit ${toGo}m`;
    // The condition under where it's fought; a storm says when a squall is on.
    const squall = (w.condition?.squall ?? 0) > 0.3 ? ' - squall' : '';
    const weather = this.run.condition ? `\n${this.run.condition}${squall}` : '';
    let stats = `Battle ${this.run.battle}\n${this.run.where}${weather}\nKills ${w.stats.kills}\nSalvage ${this.run.salvage + w.stats.salvage - pending}\n${exit}`;
    const ls = w.lastStand;
    if (ls && !b.destroyed) stats += `\n\nLast stand\nWave ${ls.wave}  next ${Math.ceil(ls.nextWave)}s\nHeld ${Math.floor(ls.time)}s`;
    this.stats.setText(fontText(stats));

    // The objective (SPEC §4.4): the targets destroyed, amber while some are still out there.
    const o = w.objective;
    const names = MODES[o.mode].target;
    const showObjective = o.total > 0 && !!names && !b.destroyed;
    this.objectiveLabel.setVisible(showObjective);
    this.objectiveText.setVisible(showObjective);
    if (showObjective) {
      const open = o.total - o.destroyed - o.lost;
      this.objectiveLabel.setText(fontText(MODES[o.mode].name));
      this.objectiveText
        .setText(fontText(`${o.destroyed}/${o.total} ${names[1]} ${objectivePercent(o)}%${o.lost > 0 ? ` -${o.lost}` : ''}`))
        .setTint(hex(open === 0 ? (o.destroyed === o.total ? PAL.glow : PAL.hudDim) : PAL.amber));
    }

    this.updateDirective(w);

    if (w.train && !this.strip) this.strip = new TrainStrip(this.scene, this.layout, w.train, w.terrain.lineSide);
    this.strip?.update(w, w.time);

    // The alert clock (SPEC §10): the next reinforcement wave, a bar filling toward it.
    const alert = w.encounter.alert;
    const clock = !ls && !b.destroyed && w.extractedAt === null && !w.encounter.off;
    this.alertLabel.setVisible(clock);
    this.alertText.setVisible(clock);
    if (clock && alert.cut) {
      // A command post destroyed: no more waves this battle.
      this.alertText.setText(fontText('Cut off')).setTint(hex(PAL.glow));
    } else if (clock) {
      this.alertText.setText(fontText(`Wave ${alert.wave + 1} ${Math.ceil(alert.next)}s`)).setTint(hex(alert.next < 5 ? PAL.warn : PAL.hudText));
      bar(this.alertY + 8, 1 - alert.next / alert.span, hex(alert.next < 5 ? PAL.warn : PAL.amber));
    }
  }

  /** The Directive's ask in a sector's objective battle (SPEC §3): the command post, haulers stopped, or par. */
  private updateDirective(w: World): void {
    const d = this.run.directive;
    const show = !!d && !w.behemoth.destroyed;
    this.directiveLabel.setVisible(show);
    this.directiveText.setVisible(show);
    if (!d || !show) return;
    const o = w.objective;
    // Above the mode's target count, or in its place when there's none (Breakthrough).
    const y = this.objectiveLabel.visible ? this.alertY - 23 : this.alertY - 14;
    this.directiveLabel.setY(y);
    this.directiveText.setY(y);
    let label: string;
    let value: string;
    let color: string;
    switch (d.goal.kind) {
      case 'command': {
        const state = o.command?.state ?? 'waiting';
        label = 'Command post';
        value = { waiting: 'ahead', standing: 'standing', destroyed: 'destroyed', lost: 'bypassed' }[state];
        color = state === 'destroyed' ? PAL.glow : state === 'lost' ? PAL.bad : PAL.amber;
        break;
      }
      case 'share': {
        const need = d.need ?? o.total;
        label = 'Stopped';
        value = `${o.destroyed}/${need} needed`;
        color = o.destroyed >= need ? PAL.glow : PAL.amber;
        break;
      }
      case 'par': {
        const par = d.par ?? 0;
        const left = par - (w.extractedAt ?? w.time);
        label = 'Par';
        value = left >= 0 ? `${clock(left)} left` : 'over par';
        color = left < 0 ? PAL.bad : left < 30 ? PAL.warn : PAL.amber;
        if (w.extractedAt !== null && left >= 0) color = PAL.glow;
        break;
      }
    }
    this.directiveLabel.setText(fontText(label));
    this.directiveText.setText(fontText(value)).setTint(hex(color));
  }

  private drawWeaponRow(b: BehemothState, row: WeaponRow, bar: (y: number, frac: number, color: number) => void): void {
    const weapon = row.mounts[0]!.weapon!;
    const auto = firingBinding(b, row.mounts[0]!) === 'auto';
    // A pod goes with its trailer.
    const attached = (h: HardpointState) => h.slot.position !== 'trailer' || hitched(b) !== null;
    const live = row.mounts.filter((h) => h.integrity.hp > 0 && attached(h));
    const enabled = !auto || b.autoEnabled[autoGroupOf(weapon) - 1]!;
    const ammo = row.mounts.reduce((n, h) => n + (h.ammo ?? 0), 0);
    const hasAmmo = row.mounts.every((h) => h.ammo === null) || ammo > 0;
    const reloading = live.some((h) => feedingInto(b, h.slot.id) !== null);

    let status = '';
    let tint: string = PAL.hudText;
    if (live.length === 0) [status, tint] = row.mounts.every((h) => !attached(h)) ? ['LOST', PAL.hudDim] : ['DOWN', PAL.bad];
    else if (!hasAmmo && reloading) [status, tint] = ['RELOAD', PAL.amber];
    else if (!enabled) [status, tint] = ['OFF', PAL.hudDim];
    else if (!hasAmmo) [status, tint] = ['EMPTY', PAL.warn];
    else if (weapon.power && b.power.stored < weapon.power) [status, tint] = ['NO PWR', PAL.warn];
    else if (weapon.ammo !== undefined) status = String(ammo);
    else if (auto) status = 'ON';
    row.status.setText(status).setTint(hex(tint));
    row.label.setText(fontText(`${stripKey(b, row.mounts[0]!).padEnd(4)}${row.name}`));
    row.label.setTint(hex(live.length === 0 || !enabled ? PAL.hudDim : PAL.hudText));

    // Reload bar: the readiest live mount in the group.
    let ready = 0;
    for (const h of live) {
      const reload = weapon.reload * reloadScale(h);
      ready = Math.max(ready, h.salvo ? 0 : 1 - h.cooldown / reload);
    }
    const usable = live.length > 0 && enabled && hasAmmo;
    bar(row.y + 8, usable ? ready : 0, ready >= 1 ? hex(PAL.good) : hex(PAL.hudDim));
  }

  private drawSchematic(b: BehemothState, revive: World['revive']): void {
    const g = this.g;
    const ox = this.sx + SCH.at.x;
    const oy = this.sy + SCH.at.y;
    const fill = (box: Box, color: number) => g.fillStyle(color).fillRect(ox + box.x, oy + box.y, box.w, box.h);
    const outline = (box: Box, color: number) => {
      const x = ox + box.x;
      const y = oy + box.y;
      g.fillStyle(color);
      g.fillRect(x, y, box.w, 1).fillRect(x, y + box.h - 1, box.w, 1);
      g.fillRect(x, y, 1, box.h).fillRect(x + box.w - 1, y, 1, box.h);
    };
    const color = (id: string, frac: number) => (this.flashes.has(id) ? 0xffffff : integrityColor(frac));

    // Hull body, then the armor edges around it.
    fill({ x: 2, y: 2, w: 32, h: 52 }, hex(PAL.hudLine));
    for (const arc of ARMOR_ARCS) fill(ARMOR_BOX[arc], color(arc, fraction(b.armor[arc])));

    const ti = fraction(b.treads);
    for (const box of TREAD_BOXES) fill(box, color('treads', ti));
    fill(SENSORS_BOX, color('sensors', fraction(b.sensors)));
    fill(FIRE_CONTROL_BOX, color('fireControl', fraction(b.fireControl)));
    fill(MAGAZINE_BOX, color('magazine', fraction(b.magazine)));
    // The reactor blinks white while the fuse burns.
    const blinking = b.reactorFuse !== null && Math.floor(b.reactorFuse * 8) % 2 === 0;
    fill(REACTOR_BOX, blinking ? 0xffffff : color('reactor', fraction(b.reactor)));

    // Add-on parts (the plow flashes as rams wear it).
    for (const a of b.addons) {
      if (!a.integrity) continue;
      for (const box of ADDON_BOX[a.def.id] ?? []) fill(box, color(a.def.id, fraction(a.integrity)));
    }

    for (const h of b.hardpoints) {
      if (h.slot.position === 'trailer') continue;
      const box = SLOT_BOX[h.slot.id] ?? MOUNT_BOX[h.slot.position];
      if (h.weapon) fill(box, color(h.slot.id, fraction(h.integrity)));
      else outline(box, hex(PAL.hudDim));
    }

    // The trailer: its rim is the armor, its body the frame, and a box per bay. Once it's gone,
    // only a dim outline is left.
    const t = b.trailer;
    const towed = hitched(b);
    if (t && towed) {
      fill(TRAILER_BOX.bar, color('trailer', fraction(t.frame)));
      fill(TRAILER_BOX.body, color('trailerArmor', fraction(t.armor)));
      const { x, y, w, h } = TRAILER_BOX.body;
      g.fillStyle(hex(PAL.hudBg)).fillRect(ox + x + 1, oy + y + 1, w - 2, h - 2);
      g.fillStyle(this.flashes.has('trailer') ? 0xffffff : integrityColor(fraction(t.frame)), 0.45).fillRect(ox + x + 1, oy + y + 1, w - 2, h - 2);
      t.bays.forEach((bay, i) => {
        const box = TRAILER_BOX.bays[i];
        if (!box) return;
        if (bay) fill(box, color(`bay${i}`, fraction(bay.integrity)));
        else outline(box, hex(PAL.hudDim));
      });
    } else if (t) {
      outline(TRAILER_BOX.body, hex(PAL.hudLine));
    }

    // Readout: core components, installed hardpoints, add-ons with parts of their own, the trailer.
    const pct = (f: number) => (f > 0 ? `${Math.round(f * 100)}%` : 'OFF');
    const rows: [string, string][] = [
      ['Reactor', pct(fraction(b.reactor))],
      ['Treads', pct(ti)],
      ['Sensors', pct(fraction(b.sensors))],
      ['Fire ctrl', pct(fraction(b.fireControl))],
      ['Magazine', pct(fraction(b.magazine))],
    ];
    for (const h of b.hardpoints) if (h.weapon && h.slot.position !== 'trailer') rows.push([h.slot.name, pct(fraction(h.integrity))]);
    for (const a of b.addons) if (a.integrity && a.def.kind !== 'trailer') rows.push([a.def.short, pct(fraction(a.integrity))]);
    if (t && towed) {
      rows.push(['Trailer', pct(fraction(t.frame))], ['Tr armor', pct(fraction(t.armor))]);
      for (const bay of t.bays) {
        if (!bay) continue;
        rows.push([bay.def.short, pct(fraction(bay.integrity))]);
        if (bay.def.kind !== 'drones') continue;
        // Drones left and the repair pool, or the revive's progress while it's under way.
        const rev = revive && bay.integrity.hp > 0 ? `REV ${Math.floor((100 * revive.work) / bay.def.revive.work)}%` : null;
        rows.push([' drones', rev ?? `${bay.loads}/${bay.def.drones} ${Math.ceil(bay.pool)}HP`]);
      }
    } else if (t) {
      rows.push(['Trailer', t.status === 'jettisoned' ? 'DROPPED' : 'LOST']);
    }
    this.components.setText(fontText(rows.map((r) => r[0]).join('\n')));
    this.componentValues.setText(rows.map((r) => r[1]).join('\n'));
  }

  /**
   * The message over the battlefield, or null for none. `top` places it near the top of the
   * field instead of the middle (the last stand: the stopped Behemoth sits mid-screen).
   */
  message(text: string | null, top = false): void {
    if (!text) {
      this.center.setVisible(false);
      this.centerBg.setVisible(false);
      return;
    }
    const y = top ? this.topMessageY : this.midMessageY;
    this.center.setY(y);
    this.centerBg.setY(y);
    this.center.setText(fontText(text)).setVisible(true);
    const bounds = this.center.getTextBounds().local;
    this.centerBg.setSize(bounds.width + 10, bounds.height + 8).setOrigin(0.5, 0.5).setVisible(true);
  }

  /** Short lines only: the panel is about 20 characters wide. */
  setDebug(lines: string[] | null): void {
    this.debug.setVisible(lines !== null);
    if (lines) this.debug.setText(fontText(lines.join('\n')));
  }
}

/** What the HUD knows about the run: this battle's number, salvage banked, where it's fought, the callsign, and a sector objective's Directive ask. */
export interface HudRun {
  battle: number;
  salvage: number;
  where: string;
  callsign: string;
  /** Set only in a sector's objective battle (SPEC §3): the goal, its par (seconds), and targets it needs. */
  directive?: { goal: DirectiveGoal; par: number | null; need: number | null };
  /** The battle's condition as named for its biome (SPEC §4.6: Night, Sandstorm, …); absent when clear. */
  condition?: string;
}
