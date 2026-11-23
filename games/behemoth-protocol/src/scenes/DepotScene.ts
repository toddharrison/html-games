import { DEPOT, MASS } from '../content/tuning';
import Phaser from 'phaser';
import { RESOLUTION } from '../config';
import { BIOMES } from '../content/biomes';
import { ADDONS, type AddonDef } from '../content/addons';
import { ARC_NAMES, CHASSIS, type ChassisDef, type CoreComponent, type HardpointSlotDef } from '../content/chassis';
import { DEPOT_ADDONS, DEPOT_GRADES, DEPOT_MODULES, DEPOT_WEAPONS } from '../content/depot';
import { moduleLoads, TRAILER_MODULES, type ModuleDef } from '../content/trailer';
import { ARMOR_PARTS, armorArcsOf, GRADES, gradeName, TRACKS, type TrackId } from '../content/upgrades';
import { BINDINGS, defaultBinding, SHELL_TYPES, shellsOf, WEAPONS, withShell, type Binding, type WeaponDef } from '../content/weapons';
import { cutawayRear, cutawaySize, drawCutaway, integrityColor, onHull, type CutawayPart } from '../render/cutaway';
import { FONT_KEY, fontText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { allowedBindings, bayIndex, bayName, defaultBindingFor, usesChannel } from '../sim/behemoth';
import {
  ammoMissing,
  applyAction,
  armorMissing,
  bayPart,
  bindingOf,
  channelsOf,
  damageOf,
  fits,
  fittedChassis,
  loadOf,
  quote,
  shellOf,
  slotsOf,
  tracksOf,
  type DepotAction,
} from '../sim/depot';
import { currentBiome, leaveDepot, type BehemothSnapshot, type RunState } from '../sim/run';
import { checkpoint, enterNode, type RunContext } from './flow';
import { fitCamera } from './screen';
import { keyLabel, usingPad } from '../input/gamepad';
import { PadCursor } from '../input/padCursor';
import { padMenu } from '../input/padMenu';

/**
 * The depot between battles (SPEC §8.2): the side-on cutaway of the Behemoth with every part
 * clickable. Selecting a part shows what can be done to it (repair, rearm, remove, install from
 * the stock); selecting a stock item shows where it fits. Each action is saved straight away and
 * can be undone until the Behemoth rolls out.
 */

type Selection =
  | { kind: 'part'; id: string }
  | { kind: 'stock'; index: number }
  | { kind: 'addon'; index: number }
  | { kind: 'module'; index: number }
  | { kind: 'grade'; index: number }
  | null;

const CORE_INFO: Record<CoreComponent, [string, string]> = {
  treads: ['Treads', 'Speed and agility. All sets at zero: Immobilized.'],
  sensors: ['Sensors', 'Auto-weapon reach and the hidden-unit reveal radius.'],
  fireControl: ['Fire control', 'Accuracy on Auto, and a channel for each weapon\nyou put on Auto. Destroyed: those go back to\ntheir trigger; built-in autos fire wilder.'],
  reactor: ['Reactor', 'Power output. Destroyed: the reactor detonates.'],
  magazine: ['Magazine', 'Holds the hull\'s missiles and shells. Destroyed\nwith rounds in it: it cooks off inside the hull,\nand every round is lost.'],
};

const ROLE_NAME: Record<WeaponDef['role'], string> = { main: 'Main', secondary: 'Secondary', missile: 'Missile', auto: 'Auto' };
const ROLE_BINDING: Record<WeaponDef['role'], Binding> = { main: 'lmb', secondary: 'rmb', missile: 'space', auto: 'auto' };
const KEY_BINDING_NAME: Record<Binding, string> = { lmb: 'LMB', rmb: 'RMB', space: 'SPC', auto: 'Auto' };
const PAD_BINDING_NAME: Record<Binding, string> = { lmb: 'RT', rmb: 'LT', space: 'RB', auto: 'Auto' };

/** A trigger's name: its mouse button or key, or its pad trigger once the pad is in use. */
function bindingName(b: Binding): string {
  return (usingPad() ? PAD_BINDING_NAME : KEY_BINDING_NAME)[b];
}

/** A weapon's role, with its default trigger: "Main (LMB)". */
function roleName(role: WeaponDef['role']): string {
  const b = ROLE_BINDING[role];
  if (b === 'auto') return ROLE_NAME[role];
  return `${ROLE_NAME[role]} (${b === 'space' && !usingPad() ? 'Space' : bindingName(b)})`;
}

export class DepotScene extends Phaser.Scene {
  private ctx!: RunContext;
  private history: RunState[] = [];
  private selection: Selection = null;
  private hover: string | null = null;
  private confirmLeave = false;
  private gone = false;
  private g!: Phaser.GameObjects.Graphics;
  private parts: CutawayPart[] = [];
  /** Panel text and buttons, rebuilt on every change. */
  private ui: Phaser.GameObjects.GameObject[] = [];
  /** Mass and cruise readout; buttons that change the load preview their effect on it. */
  private loadText: Phaser.GameObjects.BitmapText | null = null;
  /** The cutaway's origin: room behind the hull for a trailer, and above for the header. */
  private readonly cut = { x: 12 + cutawayRear('class2'), y: 30 };
  private readonly panel = { x: 362, w: 202 };

  constructor() {
    super('depot');
  }

  init(data: RunContext): void {
    this.ctx = data;
    this.history = [];
    this.selection = null;
    this.hover = null;
    this.confirmLeave = false;
    this.gone = false;
  }

  create(): void {
    fitCamera(this);
    const { width, height } = RESOLUTION;
    this.add.rectangle(0, 0, width, height, hex(PAL.hudBg)).setOrigin(0, 0);
    this.add.rectangle(this.panel.x - 6, 40, 1, height - 48, hex(PAL.hudLine)).setOrigin(0, 0);
    this.g = this.add.graphics();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const id = this.partAt(p.worldX, p.worldY);
      if (id !== this.hover) {
        this.hover = id;
        this.drawMachine();
      }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return;
      const id = this.partAt(p.worldX, p.worldY);
      if (id) this.select({ kind: 'part', id });
    });
    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', () => this.leave());
    kb.on('keydown-Z', () => this.undo());
    kb.on('keydown-BACKSPACE', () => this.undo());
    kb.on('keydown-ESC', () => this.select(null));
    // The pad: a cursor (left stick, D-pad jumps between buttons and parts, A clicks), B clears
    // the selection, Y undoes, Start rolls out.
    new PadCursor(this, () => this.clickTargets());
    padMenu(this, { b: () => this.select(null), y: () => this.undo(), start: () => this.leave() }, () => this.refresh());
    this.refresh();
  }

  private get run(): RunState {
    return this.ctx.run;
  }

  private partAt(x: number, y: number): string | null {
    for (const p of this.parts) {
      const bx = this.cut.x + p.box.x;
      const by = this.cut.y + p.box.y;
      if (x >= bx - 2 && x <= bx + p.box.w + 2 && y >= by - 2 && y <= by + p.box.h + 2) return p.id;
    }
    return onHull(this.run.behemoth.chassis, x - this.cut.x, y - this.cut.y) ? 'armor' : null;
  }

  /** Centers of everything the pad cursor can jump to: the panel's buttons and the cutaway's parts. */
  private clickTargets(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const o of this.ui) {
      if (!(o instanceof Phaser.GameObjects.Rectangle) || !o.input?.enabled) continue;
      const b = o.getBounds();
      out.push({ x: b.centerX, y: b.centerY });
    }
    for (const p of this.parts) out.push({ x: this.cut.x + p.box.x + p.box.w / 2, y: this.cut.y + p.box.y + p.box.h / 2 });
    return out;
  }

  private select(sel: Selection): void {
    this.selection = sel;
    this.confirmLeave = false;
    this.refresh();
  }

  private act(action: DepotAction): void {
    const next = applyAction(this.run, action);
    if (next === this.run) return;
    this.history.push(this.run);
    this.ctx = { ...this.ctx, run: next };
    checkpoint(this.ctx);
    // After an install the stock item is gone; follow it onto the Behemoth.
    if (action.kind === 'install') this.selection = { kind: 'part', id: action.slot };
    if (action.kind === 'installAddon') this.selection = { kind: 'part', id: next.behemoth.addons.at(-1)!.id };
    if (action.kind === 'installModule') this.selection = { kind: 'part', id: `bay${action.bay}` };
    if (action.kind === 'installGrade') this.selection = { kind: 'part', id: this.run.depot!.grades[action.stock]!.component };
    if (action.kind === 'removeAddon') this.selection = null;
    this.confirmLeave = false;
    this.refresh();
  }

  private undo(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.ctx = { ...this.ctx, run: prev };
    checkpoint(this.ctx);
    this.confirmLeave = false;
    this.refresh();
  }

  private leave(): void {
    if (this.gone) return;
    if ((this.run.depot?.actions ?? 0) > 0 && !this.confirmLeave) {
      this.confirmLeave = true;
      this.refresh();
      return;
    }
    this.gone = true;
    this.ctx = { ...this.ctx, run: leaveDepot(this.run) };
    checkpoint(this.ctx);
    enterNode(this, this.ctx);
  }

  // -------------------------------------------------------------------------------------------

  private refresh(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.loadText = null;
    this.drawMachine();
    this.drawHeader();
    this.drawStock();
    this.drawPanel();
    this.drawFooter();
  }

  /** Slots the selected stock weapon fits (or the bays, for a module). */
  private fitting(): Set<string> {
    const sel = this.selection;
    if (sel?.kind === 'grade') {
      const item = this.run.depot?.grades[sel.index];
      return new Set(item && !item.sold ? [item.component] : []);
    }
    if (sel?.kind === 'module') {
      const bays = this.run.behemoth.trailer?.bays ?? [];
      return new Set(bays.map((_, i) => `bay${i}`));
    }
    if (sel?.kind !== 'stock') return new Set<string>();
    const item = this.run.depot?.stock[sel.index];
    if (!item || item.sold) return new Set();
    return new Set(this.run.behemoth.hardpoints.filter((h) => fits(this.run.behemoth, h.slot, item.weapon)).map((h) => h.slot));
  }

  private drawMachine(): void {
    this.g.clear();
    const sel = this.selection?.kind === 'part' ? this.selection.id : null;
    this.parts = drawCutaway(this.g, this.run.behemoth, this.cut.x, this.cut.y, { selected: sel, hover: this.hover, fits: this.fitting() });
  }

  private text(x: number, y: number, s: string, color: string = PAL.hudText, scale = 1): Phaser.GameObjects.BitmapText {
    const t = this.add.bitmapText(x, y, FONT_KEY, fontText(s)).setTint(hex(color)).setScale(scale);
    this.ui.push(t);
    return t;
  }

  /**
   * A clickable row: label on the left, `right` (a price or a reason) on the right. `preview` shows
   * that Behemoth's load in the readout while the pointer is over it.
   */
  private button(
    x: number,
    y: number,
    w: number,
    label: string,
    right: string,
    enabled: boolean,
    onClick: () => void,
    preview?: BehemothSnapshot,
  ): number {
    const bg = this.add.rectangle(x, y, w, 11, hex(PAL.hudLine), enabled ? 1 : 0.4).setOrigin(0, 0);
    this.ui.push(bg);
    this.text(x + 3, y + 3, label, enabled ? PAL.hudText : PAL.hudDim);
    this.text(x + w - 3, y + 3, right, enabled ? PAL.amber : PAL.hudDim).setOrigin(1, 0);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        bg.setFillStyle(hex(PAL.hudDim));
        if (preview) this.showLoad(preview);
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(hex(PAL.hudLine));
        if (preview) this.showLoad();
      });
      // Deferred a tick: the click rebuilds the panel, and this button with it.
      bg.on('pointerdown', () => this.time.delayedCall(0, onClick));
    }
    return y + 13;
  }

  /**
   * A button for a depot action, priced (or greyed out with the reason it can't be done). Actions
   * that change the load add the change in mass to the label and preview the new load on hover.
   */
  private actionButton(x: number, y: number, w: number, label: string, action: DepotAction): number {
    const q = quote(this.run, action);
    if (q.ok && q.partial !== undefined) label = this.partialLabel(label, action, q.partial);
    const right = q.ok ? (q.salvage > 0 ? String(q.salvage) : q.salvage < 0 ? `+${-q.salvage}` : 'free') : q.reason;
    let preview: BehemothSnapshot | undefined;
    if (LOAD_ACTIONS.has(action.kind)) {
      // Preview with salvage and actions to spare, so a refit you can't afford yet still shows.
      const after = applyAction({ ...this.run, salvage: Infinity, depot: this.run.depot && { ...this.run.depot, actions: Infinity } }, action);
      if (after.behemoth !== this.run.behemoth) {
        preview = after.behemoth;
        // Towed mass counts at a share, so tons can come out fractional: show whole ones.
        const delta = Math.round(loadOf(preview).mass) - Math.round(loadOf(this.run.behemoth).mass);
        if (delta !== 0) label += ` ${delta > 0 ? '+' : ''}${delta}t`;
      }
    }
    return this.button(x, y, w, label, right, q.ok, () => this.act(action), q.ok ? preview : undefined);
  }

  /** A tread or armor repair the salvage only covers partway: say how far it gets. */
  private partialLabel(label: string, action: DepotAction, points: number): string {
    if (action.kind === 'repairArmor') return `Re-plate ${Math.floor((points / armorMissing(this.run.behemoth)) * 100)}% of the damage`;
    if (action.kind !== 'repair') return label;
    const d = damageOf(applyAction(this.run, action).behemoth, action.component);
    return d ? `${label} to ${Math.floor((1 - d.missing / d.max) * 100)}%` : label;
  }

  /** Load against capacity and the cruise speed it gives; with `preview`, before and after. */
  private showLoad(preview?: BehemothSnapshot): void {
    const t = this.loadText;
    if (!t) return;
    const now = loadOf(this.run.behemoth);
    const next = preview ? loadOf(preview) : now;
    const arrow = (a: number, b: number) => (Math.round(a) === Math.round(b) ? String(Math.round(a)) : `${Math.round(a)}>${Math.round(b)}`);
    t.setText(fontText(`Load ${arrow(now.mass, next.mass)}/${arrow(now.capacity, next.capacity)}t  Cruise ${arrow(now.cruise, next.cruise)}`));
    t.setTint(hex(next.mass > next.capacity ? PAL.warn : PAL.hudDim));
  }

  private drawHeader(): void {
    const run = this.run;
    this.text(14, 10, 'Depot', PAL.glow, 2);
    this.text(60, 17, run.callsign, PAL.hudText);
    const r = run.lastBattle;
    if (r) {
      const time = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
      this.text(14, 28, `Battle ${r.battle} won in ${time}   ${r.kills} kills   +${r.salvage} salvage, +${r.bonus} for extraction`, PAL.hudDim);
    }
    const cache = (run.depot?.total ?? DEPOT.actions) - DEPOT.actions;
    const cacheNote = cache > 0 ? `   Supply ${cache === 1 ? 'cache' : 'caches'}: +${cache} ${cache === 1 ? 'action' : 'actions'}` : '';
    this.text(14, 37, `Sector ${(run.at?.sector ?? 0) + 1}: ${BIOMES[currentBiome(run)].name}${cacheNote}`, PAL.hudDim);
    const right = RESOLUTION.width - 12;
    this.text(right, 10, `Salvage ${run.salvage}`, PAL.amber).setOrigin(1, 0);
    const left = run.depot?.actions ?? 0;
    // Pips end at the right edge, so a depot with more actions (or caches) grows leftward.
    const total = run.depot?.total ?? DEPOT.actions;
    const pipsX = right - (total * 8 - 2);
    this.text(pipsX - 4, 19, 'Actions', PAL.hudText).setOrigin(1, 0);
    for (let i = 0; i < total; i++) {
      const pip = this.add.rectangle(pipsX + i * 8, 19, 6, 6, hex(i < left ? PAL.glow : PAL.hudLine)).setOrigin(0, 0);
      this.ui.push(pip);
    }
    for (const p of this.parts) if (p.label) this.text(this.cut.x + p.box.x + p.box.w / 2, this.cut.y + p.box.y + p.box.h + 2, p.label, PAL.hudDim).setOrigin(0.5, 0);
  }

  private drawStock(): void {
    const depot = this.run.depot;
    if (!depot) return;
    const y0 = this.cut.y + cutawaySize(this.run.behemoth.chassis).h + 4;
    this.text(14, y0, 'For sale', PAL.hudDim);
    this.loadText = this.text(314, y0, '').setOrigin(1, 0);
    this.showLoad();
    let y = y0 + 9;
    const row = (label: string, price: number, sold: boolean, onClick: () => void) => {
      this.button(14, y, 300, label, sold ? 'Sold' : String(price), !sold, onClick);
      y += STOCK_ROW;
    };
    depot.stock.forEach((item, i) => {
      const w = WEAPONS[item.weapon];
      const selected = this.selection?.kind === 'stock' && this.selection.index === i;
      const name = `${selected ? '> ' : ''}${w.name}`;
      const label = `${name.padEnd(24)}${w.size}  ${`${w.mass ?? 0}t`.padStart(4)}  ${bindingName(defaultBinding(w))}`;
      row(label, DEPOT_WEAPONS[item.weapon]?.price ?? 0, item.sold, () => this.select({ kind: 'stock', index: i }));
    });
    depot.addons.forEach((item, i) => {
      const a = ADDONS[item.addon];
      const selected = this.selection?.kind === 'addon' && this.selection.index === i;
      const name = `${selected ? '> ' : ''}${a.name}`;
      const label = `${name.padEnd(27)}${`${a.mass}t`.padStart(4)}  add-on`;
      row(label, DEPOT_ADDONS[item.addon]?.price ?? 0, item.sold, () => this.select({ kind: 'addon', index: i }));
    });
    depot.modules.forEach((item, i) => {
      const m = TRAILER_MODULES[item.module];
      const selected = this.selection?.kind === 'module' && this.selection.index === i;
      const name = `${selected ? '> ' : ''}${m.name}`;
      const label = `${name.padEnd(27)}${`${m.mass}t`.padStart(4)}  module`;
      row(label, DEPOT_MODULES[item.module].price, item.sold, () => this.select({ kind: 'module', index: i }));
    });
    depot.grades.forEach((item, i) => {
      const g = GRADES[item.component][item.gen];
      const selected = this.selection?.kind === 'grade' && this.selection.index === i;
      const name = `${selected ? '> ' : ''}${gradeName(item.gen, CORE_INFO[item.component][0])}`;
      const label = `${name.padEnd(26)}${`+${g.mass}t`.padStart(5)}  upgrade`;
      row(label, DEPOT_GRADES[item.component][item.gen].price, item.sold, () => this.select({ kind: 'grade', index: i }));
    });
  }

  private drawPanel(): void {
    const { x, w } = this.panel;
    let y = 46;
    const sel = this.selection;
    const run = this.run;
    const s = run.behemoth;
    const c = fittedChassis(s);

    if (!sel) {
      this.text(x, y, 'Click a part of the Behemoth (the hull for\nits armor) to repair, rearm, or refit it,\nor a weapon for sale to see where it fits.', PAL.hudDim);
      y += 30;
      this.text(
        x,
        y,
        `Each repair, rearm, install, add-on, or upgrade\nuses one of the ${DEPOT.actions} depot actions. A repair restores\nthe part fully; treads and armor can be patched\npartway with what salvage is left. Parts sell\nfor up to ${Math.round(DEPOT.resale * 100)}%. Every part can be upgraded\nup to ${DEPOT.maxModLevel} times; better core parts turn up for sale.`,
        PAL.hudDim,
      );
      return;
    }

    if (sel.kind === 'addon') {
      const item = run.depot?.addons[sel.index];
      if (!item) return;
      const def = ADDONS[item.addon];
      y = this.addonInfo(x, y, def, `${DEPOT_ADDONS[item.addon]?.price ?? 0} salvage`);
      y += 4;
      this.actionButton(x, y, w, `Bolt on the ${def.name.toLowerCase()}`, { kind: 'installAddon', stock: sel.index });
      return;
    }

    if (sel.kind === 'module') {
      const item = run.depot?.modules[sel.index];
      if (!item) return;
      const def = TRAILER_MODULES[item.module];
      y = this.moduleInfo(x, y, def, `${DEPOT_MODULES[item.module].price} salvage`);
      y += 4;
      const bays = s.trailer?.bays;
      if (!bays) {
        this.text(x, y, 'Needs a trailer to go in.', PAL.hudDim);
        return;
      }
      this.text(x, y, 'Install in', PAL.hudDim);
      y += 10;
      bays.forEach((bay, i) => {
        const label = bay ? `${bayName(i)} (replaces ${TRAILER_MODULES[bay.module].short})` : `${bayName(i)} (empty)`;
        y = this.actionButton(x, y, w, label, { kind: 'installModule', stock: sel.index, bay: i });
      });
      return;
    }

    if (sel.kind === 'grade') {
      const item = run.depot?.grades[sel.index];
      if (!item) return;
      const g = GRADES[item.component][item.gen];
      const name = CORE_INFO[item.component][0];
      this.text(x, y, gradeName(item.gen, name), PAL.glow);
      y += 9;
      this.text(x, y, g.blurb, PAL.hudText);
      y += 9;
      this.text(x, y, `Core component, +${g.mass} t over Gen 1   ${DEPOT_GRADES[item.component][item.gen].price} salvage`, PAL.hudDim);
      y += 9;
      const after = fittedChassis({ ...s, grades: { ...s.grades, [item.component]: item.gen }, mods: { ...s.mods, [item.component]: {} } });
      this.text(x, y, coreStats(c, after, item.component), PAL.hudDim);
      y += 13;
      const fitted = s.grades[item.component] ?? 1;
      const mods = s.mods[item.component] && Object.keys(s.mods[item.component]!).length > 0 ? ' and its upgrades' : '';
      this.text(x, y, `Arrives whole. The ${gradeName(fitted, name)}${mods}\nsells back.`, PAL.hudDim);
      y += 20;
      this.actionButton(x, y, w, `Replace the ${gradeName(fitted, name)}`, { kind: 'installGrade', stock: sel.index });
      return;
    }

    if (sel.kind === 'stock') {
      const item = run.depot?.stock[sel.index];
      if (!item) return;
      const weapon = WEAPONS[item.weapon];
      y = this.weaponInfo(x, y, weapon, `${weapon.size} hardpoint   ${DEPOT_WEAPONS[item.weapon]?.price ?? 0} salvage`);
      y += 4;
      const slots = slotsOf(s).filter((slot) => fits(s, slot.id, item.weapon));
      if (slots.length === 0) {
        this.text(x, y, 'No hardpoint of this size.', PAL.hudDim);
        return;
      }
      this.text(x, y, 'Install on', PAL.hudDim);
      y += 10;
      for (const slot of slots) {
        const cur = s.hardpoints.find((h) => h.slot === slot.id)?.weapon;
        const label = cur ? `${slot.name} (replaces ${WEAPONS[cur].short})` : `${slot.name} (empty)`;
        y = this.actionButton(x, y, w, label, { kind: 'install', slot: slot.id, stock: sel.index });
      }
      return;
    }

    const id = sel.id;
    if (id === 'armor') {
      this.text(x, y, 'Armor', PAL.hudText, 2);
      y += 16;
      const together = s.trailer ? 'All zones and the trailer re-plate together.' : 'All zones re-plate together.';
      this.text(x, y, `Absorbs hits before they reach the parts\nbehind it. ${together}`, PAL.hudDim);
      y += 18;
      // Each zone can be plated thicker (an action a level); the two front halves take one plate.
      for (const part of ARMOR_PARTS) {
        const arcs = armorArcsOf(part);
        arcs.forEach((arc, i) => {
          const f = s.armor[arc] / c.armor[arc];
          this.text(x, y + 3 + i * 8, ARC_NAMES[arc], PAL.hudDim);
          this.text(x + 80, y + 3 + i * 8, `${Math.round(f * 100)}%`, integrityColor(f)).setOrigin(1, 0);
        });
        this.modButton(x + 86, y + ((arcs.length - 1) * 8) / 2, w - 86, part, 'plate');
        y += 13 + (arcs.length - 1) * 8;
      }
      const tdef = ADDONS.trailer;
      if (s.trailer && tdef.kind === 'trailer') {
        const f = s.trailer.armor / tdef.armor;
        this.text(x, y, 'trailer', PAL.hudDim);
        this.text(x + 80, y, `${Math.round(f * 100)}%`, integrityColor(f)).setOrigin(1, 0);
        y += 8;
      }
      this.text(x, y, `Plate: ${TRACKS.plate.blurb} a level, ${TRACKS.plate.mass} t`, PAL.hudDim);
      y += 12;
      this.actionButton(x, y, w, 'Re-plate all zones', { kind: 'repairArmor' });
      return;
    }

    if (id in CORE_INFO) {
      const comp = id as CoreComponent;
      const core = CORE_INFO[comp];
      const d = damageOf(s, id)!;
      this.text(x, y, core[0], PAL.hudText, 2);
      this.text(x + w, y + 4, `Gen ${s.grades[comp] ?? 1}`, PAL.glow).setOrigin(1, 0);
      y += 16;
      this.text(x, y, core[1], PAL.hudDim);
      y += 4 + 8 * core[1].split('\n').length;
      this.text(x, y, coreStats(c, c, comp), PAL.hudDim);
      y += 8;
      y = this.integrityLine(x, y, 1 - d.missing / d.max);
      y += 4;
      y = this.actionButton(x, y, w, `Repair ${core[0].toLowerCase()}`, { kind: 'repair', component: id });
      y = this.modRow(x, y, w, id);
      const grades = (run.depot?.grades ?? []).map((item, i) => ({ item, i })).filter(({ item }) => !item.sold && item.component === comp);
      if (grades.length > 0) {
        y += 4;
        this.text(x, y, 'Replace with', PAL.hudDim);
        y += 10;
        for (const { item, i } of grades) y = this.actionButton(x, y, w, gradeName(item.gen, core[0]), { kind: 'installGrade', stock: i });
      }
      return;
    }

    const bay = bayIndex(id);
    if (bay !== null && s.trailer) {
      this.bayPanel(x, y, w, bay);
      return;
    }

    const addon = s.addons.find((a) => a.id === id);
    if (addon && ADDONS[addon.id].kind !== 'mount') {
      const def = ADDONS[addon.id];
      const d = damageOf(s, id)!;
      this.text(x, y, def.name, PAL.hudText, 2);
      y += 16;
      y = this.addonInfo(x, y, def, null, false);
      y = this.integrityLine(x, y, 1 - d.missing / d.max, def.kind === 'trailer' ? 'Frame' : 'Integrity');
      if (def.kind === 'trailer' && s.trailer) {
        const f = s.trailer.armor / def.armor;
        this.text(x, y, 'Armor', PAL.hudDim);
        this.text(x + 80, y, `${Math.round(f * 100)}%`, integrityColor(f)).setOrigin(1, 0);
        y += 8;
        this.text(x, y, 'Re-plates with the hull (click the hull).', PAL.hudDim);
        y += 8;
      }
      y += 4;
      y = this.actionButton(x, y, w, `Repair ${def.kind === 'trailer' ? 'frame' : def.name.toLowerCase()}`, { kind: 'repair', component: id });
      const scraps = def.kind === 'trailer' && s.trailer?.bays.some((b) => b) ? ' (and modules)' : '';
      this.actionButton(x, y, w, `Remove ${def.name.toLowerCase()}${scraps}`, { kind: 'removeAddon', addon: addon.id });
      return;
    }

    const slot = slotsOf(s).find((h) => h.id === id);
    const h = s.hardpoints.find((hp) => hp.slot === id);
    if (!slot || !h) return;
    this.text(x, y, slot.name, PAL.hudText, 2);
    y += 16;
    this.text(x, y, `${slot.size} hardpoint, ${mountDesc(slot)}`, PAL.hudDim);
    y += 12;
    if (h.weapon) {
      const weapon = WEAPONS[h.weapon];
      // Stats are for the shell it's loaded with.
      y = this.weaponInfo(x, y, withShell(weapon, shellOf(s, id)), null);
      y = this.integrityLine(x, y, h.hp / slot.hp);
      if (h.ammo !== null && weapon.ammo !== undefined) {
        this.text(x, y, 'Shots', PAL.hudDim);
        this.text(x + 80, y, `${h.ammo}/${weapon.ammo}`, h.ammo === 0 ? PAL.bad : PAL.hudText).setOrigin(1, 0);
        y += 8;
      }
      y += 2;
      y = this.bindingRow(x, y, w, slot, weapon);
      y = this.shellRow(x, y, w, slot, weapon);
      y += 4;
      y = this.actionButton(x, y, w, `Repair ${weapon.short.toLowerCase()}`, { kind: 'repair', component: id });
      if (ammoMissing(s, id) !== null) y = this.actionButton(x, y, w, 'Rearm', { kind: 'rearm', slot: id });
      y = this.actionButton(x, y, w, 'Remove', { kind: 'remove', slot: id });
    } else {
      this.text(x, y, 'Empty', PAL.hudDim);
      y += 12;
    }
    // The mount's upgrades stay with it whatever weapon it carries.
    y = this.modRow(x, y, w, id);
    if (addon) {
      const loses = h.weapon ? ` (with ${WEAPONS[h.weapon].short.toLowerCase()})` : '';
      y = this.actionButton(x, y, w, `Remove ${ADDONS[addon.id].short.toLowerCase()}${loses}`, { kind: 'removeAddon', addon: addon.id });
    }

    const stock = run.depot?.stock ?? [];
    const options = stock.map((item, i) => ({ item, i })).filter(({ item }) => !item.sold && fits(s, id, item.weapon));
    if (options.length > 0) {
      y += 4;
      this.text(x, y, 'Install', PAL.hudDim);
      y += 10;
      for (const { item, i } of options) y = this.actionButton(x, y, w, WEAPONS[item.weapon].name, { kind: 'install', slot: id, stock: i });
    }
  }

  /**
   * A part's mod tracks (SPEC §5.6): two half-width buttons a row, each buying the next level, with
   * what a level does underneath. Nothing for a part that takes no mods.
   */
  private modRow(x: number, y: number, w: number, part: string): number {
    const tracks = tracksOf(this.run.behemoth, part);
    if (tracks.length === 0) return y;
    y += 4;
    const half = Math.floor((w - 2) / 2);
    tracks.forEach((track, i) => this.modButton(x + (i % 2) * (half + 2), y + Math.floor(i / 2) * 13, half, part, track));
    y += 13 * Math.ceil(tracks.length / 2);
    this.text(x, y, `A level: ${tracks.map((t) => `${TRACKS[t].blurb} ${TRACKS[t].mass}t`).join(', ')}`, PAL.hudDim);
    return y + 9;
  }

  /** The next level of one mod track; short reasons, so it fits half a row. Hover previews the load. */
  private modButton(x: number, y: number, w: number, part: string, track: TrackId): void {
    const action: DepotAction = { kind: 'mod', part, track };
    const q = quote(this.run, action);
    const level = this.run.behemoth.mods[part]?.[track] ?? 0;
    const label = `${TRACKS[track].name} ${level}/${DEPOT.maxModLevel}`;
    const right = q.ok ? String(q.salvage) : (SHORT_REASON[q.reason] ?? q.reason);
    const preview = q.ok ? applyAction(this.run, action).behemoth : undefined;
    this.button(x, y, w, label, right, q.ok, () => this.act(action), preview);
  }

  /**
   * What fires the weapon (SPEC §5.2): a button per binding it allows, the current one lit.
   * Free, no action. Putting a weapon on Auto that isn't Auto by default takes a fire-control channel.
   */
  private bindingRow(x: number, y: number, w: number, slot: HardpointSlotDef, weapon: WeaponDef): number {
    const s = this.run.behemoth;
    const current = bindingOf(s, slot.id);
    const allowed = allowedBindings(weapon, slot);
    this.text(x, y + 3, 'Fires on', PAL.hudDim);
    BINDINGS.forEach((binding, i) => {
      if (allowed.includes(binding)) this.choice(x, y, w, i, bindingName(binding), binding === current, { kind: 'bind', slot: slot.id, binding });
    });
    y += 13;
    // Channels matter only for weapons that can go on Auto without being Auto by default.
    if (allowed.includes('auto') && usesChannel(weapon, slot, 'auto')) {
      const ch = channelsOf(s);
      const offline = s.fireControl <= 0 && current === 'auto' ? '  fire ctrl offline' : '';
      const note = `Auto channels used ${ch.used}/${ch.max}${offline}`;
      this.text(x, y, note, ch.used >= ch.max && current !== 'auto' ? PAL.warn : PAL.hudDim);
      y += 8;
    } else if (current !== defaultBindingFor(weapon, slot)) {
      this.text(x, y, `Default ${bindingName(defaultBindingFor(weapon, slot))}`, PAL.hudDim);
      y += 8;
    }
    return y;
  }

  /**
   * The shell a main gun is loaded with (SPEC §6.2): a button per shell it takes, the current one
   * lit, and what that shell is for. Free, no action. Nothing for a gun with no choice.
   */
  private shellRow(x: number, y: number, w: number, slot: HardpointSlotDef, weapon: WeaponDef): number {
    const shells = shellsOf(weapon);
    if (shells.length < 2) return y;
    const current = shellOf(this.run.behemoth, slot.id);
    this.text(x, y + 3, 'Shell', PAL.hudDim);
    shells.forEach((shell, i) => this.choice(x, y, w, i, SHELL_TYPES[shell].short, shell === current, { kind: 'shell', slot: slot.id, shell }));
    y += 13;
    if (current) {
      this.text(x, y, SHELL_TYPES[current].blurb, PAL.hudDim);
      y += 8;
    }
    return y;
  }

  /**
   * Button `i` of a row of up to four free choices after a 40 px label (bindings, shells): the
   * current one lit, ones the depot won't take dimmed.
   */
  private choice(x: number, y: number, w: number, i: number, label: string, on: boolean, action: DepotAction): void {
    const q = quote(this.run, action);
    const bw = Math.floor((w - 40 - 3 * 2) / 4);
    const cx = x + 40 + i * (bw + 2);
    const bg = this.add.rectangle(cx, y, bw, 11, hex(on ? PAL.glowDim : PAL.hudLine), on || q.ok ? 1 : 0.4).setOrigin(0, 0);
    this.ui.push(bg);
    this.text(cx + bw / 2, y + 3, label, on ? PAL.hudBg : q.ok ? PAL.hudText : PAL.hudDim).setOrigin(0.5, 0);
    if (!q.ok) return;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(hex(PAL.hudDim)));
    bg.on('pointerout', () => bg.setFillStyle(hex(PAL.hudLine)));
    bg.on('pointerdown', () => this.time.delayedCall(0, () => this.act(action)));
  }

  /** Weapon name, what it's for, and its role and stats. */
  private weaponInfo(x: number, y: number, weapon: WeaponDef, sub: string | null): number {
    this.text(x, y, weapon.name, PAL.glow);
    y += 9;
    if (weapon.blurb) {
      this.text(x, y, weapon.blurb, PAL.hudText);
      y += 9;
    }
    this.text(x, y, `${roleName(weapon.role)}, ${weapon.category}, ${weapon.mass ?? 0} t${sub ? `\n${sub}` : ''}`, PAL.hudDim);
    y += sub ? 17 : 9;
    this.text(x, y, weaponStats(weapon), PAL.hudDim);
    return y + 11;
  }

  /** A trailer bay: its module (repair, rearm, take out), or what could go in it. */
  private bayPanel(x: number, y: number, w: number, bay: number): void {
    const s = this.run.behemoth;
    const id = `bay${bay}`;
    const part = bayPart(s, id);
    this.text(x, y, bayName(bay), PAL.hudText, 2);
    y += 16;
    if (part) {
      const def = TRAILER_MODULES[part.module];
      y = this.moduleInfo(x, y, def, null);
      const d = damageOf(s, id);
      if (d) y = this.integrityLine(x, y, 1 - d.missing / d.max);
      const pod = s.hardpoints.find((h) => h.slot === id);
      const full = pod?.weapon ? WEAPONS[pod.weapon].ammo : undefined;
      const loads = moduleLoads(def);
      const [stock, max] = loads !== null ? [part.loads ?? 0, loads] : [pod?.ammo ?? null, full ?? null];
      if (stock !== null && max !== null) {
        this.text(x, y, def.kind === 'bunker' ? 'Loads' : def.kind === 'drones' ? 'Drones' : 'Ammo', PAL.hudDim);
        this.text(x + 80, y, `${stock}/${max}`, stock === 0 ? PAL.bad : PAL.hudText).setOrigin(1, 0);
        y += 8;
      }
      const podSlot = pod?.weapon ? slotsOf(s).find((sl) => sl.id === id) : undefined;
      if (pod?.weapon && podSlot) {
        y += 2;
        y = this.bindingRow(x, y, w, podSlot, WEAPONS[pod.weapon]);
      }
      y += 4;
      y = this.actionButton(x, y, w, `Repair ${def.short.toLowerCase()}`, { kind: 'repair', component: id });
      if (ammoMissing(s, id) !== null) {
        y = this.actionButton(x, y, w, def.kind === 'drones' ? 'Replace drones' : 'Rearm', { kind: 'rearm', slot: id });
      }
      y = this.actionButton(x, y, w, `Take out ${def.short.toLowerCase()}`, { kind: 'removeModule', bay });
    } else {
      this.text(x, y, 'Empty. A module for sale goes in here.', PAL.hudDim);
      y += 12;
    }
    const modules = this.run.depot?.modules ?? [];
    const options = modules.map((item, i) => ({ item, i })).filter(({ item }) => !item.sold);
    if (options.length > 0) {
      y += 4;
      this.text(x, y, 'Install', PAL.hudDim);
      y += 10;
      for (const { item, i } of options) y = this.actionButton(x, y, w, TRAILER_MODULES[item.module].name, { kind: 'installModule', stock: i, bay });
    }
  }

  /** Module name (unless the panel's title already says it), what it's for, and what it does. */
  private moduleInfo(x: number, y: number, def: ModuleDef, sub: string | null): number {
    this.text(x, y, def.name, PAL.glow);
    y += 9;
    this.text(x, y, def.blurb, PAL.hudText);
    y += 9;
    this.text(x, y, `Trailer module, ${def.mass} t${sub ? `   ${sub}` : ''}`, PAL.hudDim);
    y += 9;
    this.text(x, y, moduleStats(def), PAL.hudDim);
    return y + 11;
  }

  /** Add-on name (unless the panel's title already says it), what it's for, and what it does. */
  private addonInfo(x: number, y: number, def: AddonDef, sub: string | null, named = true): number {
    if (named) {
      this.text(x, y, def.name, PAL.glow);
      y += 9;
    }
    this.text(x, y, def.blurb, PAL.hudText);
    y += 9;
    this.text(x, y, `Add-on, ${def.mass} t${sub ? `   ${sub}` : ''}`, PAL.hudDim);
    y += 9;
    this.text(x, y, addonStats(def, CHASSIS[this.run.behemoth.chassis].addonMounts[def.id]?.hardpoint), PAL.hudDim);
    return y + 11;
  }

  private integrityLine(x: number, y: number, f: number, label = 'Integrity'): number {
    this.text(x, y, label, PAL.hudDim);
    this.text(x + 80, y, f > 0 ? `${Math.round(f * 100)}%` : 'Offline', integrityColor(f)).setOrigin(1, 0);
    return y + 8;
  }

  private drawFooter(): void {
    const { x, w } = this.panel;
    const y = RESOLUTION.height - 30;
    const left = this.run.depot?.actions ?? 0;
    if (this.confirmLeave) this.text(x, y - 11, `${left} ${left === 1 ? 'action' : 'actions'} unused. ${keyLabel('Enter', 'Start')} again to roll out.`, PAL.warn);
    this.button(x, y, Math.floor(w / 2) - 2, `Undo (${keyLabel('Z', 'Y')})`, '', this.history.length > 0, () => this.undo());
    this.button(x + Math.floor(w / 2) + 2, y, Math.ceil(w / 2) - 2, `Roll out (${keyLabel('Enter', 'Start')})`, '', true, () => this.leave());
  }
}

/** Stock list row spacing. */
const STOCK_ROW = 12;

/** Actions whose buttons preview the change in load. */
const LOAD_ACTIONS = new Set<DepotAction['kind']>(['install', 'remove', 'installAddon', 'removeAddon', 'repair', 'installModule', 'removeModule', 'installGrade']);

/** Reasons a half-width mod button shortens to fit. */
const SHORT_REASON: Record<string, string> = { 'Not enough salvage': 'Salvage', 'No actions left': 'No actions', 'Fixed weapon': 'Fixed', Maxed: 'Max' };

/**
 * One line of what a core component does on chassis `now`, or how it changes on `next` (a
 * different grade): "output 10>16/s".
 */
function coreStats(now: ChassisDef, next: ChassisDef, comp: CoreComponent): string {
  const n = (a: number, b: number, unit = '') => {
    const f = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    return a === b ? `${f(a)}${unit}` : `${f(a)}>${f(b)}${unit}`;
  };
  const pct = (a: number | undefined, b: number | undefined) => n(Math.round((a ?? 1) * 100), Math.round((b ?? 1) * 100), '%');
  // The panel for the part itself shows its integrity on a line of its own.
  const hp = (a: number, b: number) => (now === next ? '' : `integrity ${n(a, b)}`);
  switch (comp) {
    case 'reactor':
      return `output ${n(now.reactor.output, next.reactor.output, '/s')}  cap ${n(now.reactor.capacitor, next.reactor.capacitor)}  ${hp(now.reactor.hp, next.reactor.hp)}`;
    case 'sensors':
      return `reveal ${n(Math.round(now.revealRadius), Math.round(next.revealRadius))}  reach ${pct(now.sensorReach, next.sensorReach)}  ${hp(now.sensorsHp, next.sensorsHp)}`;
    case 'fireControl':
      return `channels ${n(now.fireControl.channels, next.fireControl.channels)}  spread ${pct(now.fireControl.spread, next.fireControl.spread)}  ${hp(now.fireControl.hp, next.fireControl.hp)}`;
    case 'magazine':
      return `cook-off ${pct(now.magazine.cookOff, next.magazine.cookOff)}  ${hp(now.magazine.hp, next.magazine.hp)}`;
    case 'treads':
      return `capacity ${n(now.massCapacity, next.massCapacity, 't')}  ${hp(now.treadHp, next.treadHp)}`;
  }
}

/** One line of what an add-on does. */
function addonStats(def: AddonDef, slot: HardpointSlotDef | undefined): string {
  switch (def.kind) {
    case 'plow':
      return `Takes ${def.hp} ram damage (not fire)  ram ${Math.round(def.ram * 100)}%`;
    case 'panels':
      return 'Spares the hull from a cook-off once; repair to re-arm';
    case 'treads':
      return `+${def.capacity} t capacity  +${def.hp} tread hp  wider hull`;
    case 'mount':
      return slot ? `${slot.size} hardpoint, ${mountDesc(slot)}` : 'hardpoint';
    case 'trailer':
      return `${def.armor} armor  ${def.bays.length} bays  treads feel ${Math.round(MASS.towed * 100)}%`;
  }
}

/** One line of what a module does. */
function moduleStats(def: ModuleDef): string {
  switch (def.kind) {
    case 'pod': {
      const w = WEAPONS[def.weapon];
      return `salvos of ${w.salvo?.count ?? 1}  ${w.ammo ?? 0} shots  on Space by default`;
    }
    case 'bunker':
      return `${def.loads} full loads  ${def.reload}s to pass one forward`;
    case 'generator':
      return `+${def.output} power/s  +${def.capacitor} capacitor`;
    case 'drones':
      return `${def.drones} drones  ${def.pool} tread hp a battle  -${def.power} power/s each`;
  }
}

function mountDesc(slot: HardpointSlotDef): string {
  // A ring's main slot takes an L gun; any other slot on it is a coax.
  if (slot.ring !== undefined) return slot.size === 'L' ? 'turret, fires all round' : 'coax, fires where the turret points';
  if (slot.arc.half >= 180) return 'fires all round';
  if (slot.position === 'front') return `fires forward (+-${slot.arc.half} deg)`;
  return `fires to the ${slot.position}`;
}

/** One line of numbers: damage, rate, range, and ammo or power. */
function weaponStats(w: WeaponDef): string {
  const p = w.projectile;
  const parts: string[] = [];
  if (p.kind === 'intercept') {
    parts.push(`hit ${Math.round(p.chance.missile * 100)}% vs missiles`, `range ${p.range}`);
  } else {
    const pellets = p.kind === 'bullet' ? p.pellets : undefined;
    const n = w.salvo ? `${w.salvo.count}x` : pellets ? `${pellets}x` : '';
    parts.push(`dmg ${n}${p.damage}`);
    if ((p.kind === 'shell' || p.kind === 'missile') && p.blastRadius > 0) parts.push(`blast ${p.blastRadius}`);
    parts.push(`reload ${w.reload}s`, `range ${p.kind === 'shell' ? p.maxRange : p.range}`);
    if (p.kind === 'shell' && p.pool) parts.push(`burns ${p.pool.dps}/s ${p.pool.duration}s`);
  }
  if (w.ammo !== undefined) parts.push(`${w.ammo} shots`);
  if (w.power !== undefined) parts.push(`power ${w.power}`);
  return parts.join('  ');
}
