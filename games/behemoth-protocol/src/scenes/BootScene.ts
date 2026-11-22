import Phaser from 'phaser';
import {
  addonsFromUrl,
  depotFromUrl,
  directiveFromUrl,
  eventFromUrl,
  gradesFromUrl,
  mapFromUrl,
  modsFromUrl,
  objectiveFromUrl,
  PRACTICE,
  recipeFromUrl,
  seedFromUrl,
  shellsFromUrl,
  summaryFromUrl,
  trailerFromUrl,
  weaponsFromUrl,
} from '../config';
import { ADDONS, type AddonId } from '../content/addons';
import { ARMOR_ARCS } from '../content/chassis';
import { DEPOT } from '../content/tuning';
import { TRAILER_MODULES, type ModuleId } from '../content/trailer';
import { GRADES, TRACKS, type Upgrades } from '../content/upgrades';
import { SHELL_TYPES, shellsOf, WEAPONS, type ShellType, type WeaponId } from '../content/weapons';
import { applySavedMute } from '../audio/mute';
import { generatePlaceholderArt } from '../render/placeholder';
import { generatePixelFont } from '../render/pixelFont';
import { openDepot } from '../sim/depot';
import { enterMapNode, newRun, summarizeRun, type RunState } from '../sim/run';
import { objectiveNode, reachable } from '../sim/sectorMap';
import { hashSeed } from '../sim/rng';
import { MAP_EVENT_IDS } from '../content/mapEvents';
import { enterNode, randomSeed, showSummary, type RunContext } from './flow';

/**
 * Generates all placeholder textures in code, then opens the title screen (or, for a URL-parameter
 * playtest, goes straight into a throwaway run's opening battle, or its depot with `?depot`).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    generatePlaceholderArt(this);
    generatePixelFont(this);
    applySavedMute(this.sound);
    if (PRACTICE) {
      // Practice mounts come with a gun each: an autocannon left, a rotary gun right, a heavy
      // cannon on the dorsal ring, and a flak cannon on the coax.
      const addons = addonsFromUrl().filter((id): id is AddonId => id in ADDONS);
      const bays = trailerFromUrl()?.map((id) => (id !== null && id in TRAILER_MODULES ? (id as ModuleId) : null)) ?? [];
      if (trailerFromUrl() && !addons.includes('trailer')) addons.push('trailer');
      const weapons = Object.fromEntries(Object.entries(weaponsFromUrl()).filter(([, id]) => id in WEAPONS)) as Record<string, WeaponId>;
      const guns: Record<string, WeaponId> = { sponsonL: 'autocannon', sponsonR: 'rotaryGun', dorsalRing: 'heavyCannon', coax: 'flakCannon', ...weapons };
      const seed = seedFromUrl() ?? randomSeed();
      let run: RunState = newRun(seed, 'class2', addons, guns, bays, upgradesFromUrl(), directiveFromUrl());
      const summary = summaryFromUrl();
      if (summary) {
        showSummary(this, previewSummary(run, summary));
        return;
      }
      const objective = objectiveFromUrl();
      if (objective !== null) {
        // Straight into sector N's objective battle (the Directive's battle).
        const s = Math.min(objective, run.map.sectors.length) - 1;
        const biome = recipeFromUrl().biome;
        if (biome) run.map.sectors[s]!.biome = biome;
        const at = { sector: s, node: objectiveNode(run.map, s)!.id };
        run = { ...run, at, path: [at], next: 'battle', objectives: Array<boolean>(s).fill(true) };
        enterNode(this, { run, persist: false });
        return;
      }
      const event = eventFromUrl();
      if (event !== null) {
        // An event node of the first sector, turned into the one asked for, entered from the opening
        // battle. The Behemoth comes worn, so the repairs and the rearm show what they do.
        const b = structuredClone(run.behemoth);
        b.treads *= 0.6;
        b.sensors *= 0.8;
        for (const arc of ARMOR_ARCS) b.armor[arc] *= 0.5;
        for (const h of b.hardpoints) if (h.ammo !== null) h.ammo = Math.floor(h.ammo / 2);
        run = { ...run, salvage: PRACTICE_EVENT_SALVAGE, behemoth: b };
        const start = reachable(run.map, null)[0]!;
        run = { ...run, at: start, path: [start] };
        const pos = reachable(run.map, start)[0]!;
        const node = run.map.sectors[pos.sector]!.nodes[pos.node]!;
        const id = event === 'random' ? MAP_EVENT_IDS[run.seed % MAP_EVENT_IDS.length]! : event;
        node.kind = 'event';
        node.battle = null;
        node.event = { id, seed: hashSeed(run.seed, 0xe7e8, pos.sector, pos.node), fog: false };
        enterNode(this, { run: enterMapNode(run, pos), persist: false });
        return;
      }
      const map = mapFromUrl();
      if (map !== null) {
        // The map, at the start of sector N (just past the objective before it).
        const s = Math.min(map, run.map.sectors.length) - 1;
        const biome = recipeFromUrl().biome;
        if (biome) run.map.sectors[s]!.biome = biome;
        if (s > 0) {
          const prev = run.map.sectors[s - 1]!;
          const at = { sector: s - 1, node: prev.nodes.length - 1 };
          run = { ...run, at, path: [at] };
        }
        enterNode(this, { run, persist: false });
        return;
      }
      // Straight into the run's opening battle (the map comes after it).
      run = enterMapNode(run, reachable(run.map, null)[0]!);
      const depot = depotFromUrl();
      if (depot !== null) run = { ...run, battle: depot, next: 'depot', salvage: PRACTICE_DEPOT_SALVAGE, depot: openDepot({ seed: run.seed, battle: depot }, run.behemoth) };
      for (const [slot, shell] of Object.entries(shellsFromUrl())) {
        const h = run.behemoth.hardpoints.find((hp) => hp.slot === slot);
        if (h?.weapon && shell in SHELL_TYPES && shellsOf(WEAPONS[h.weapon]).includes(shell as ShellType)) h.shell = shell as ShellType;
      }
      const ctx: RunContext = { run, persist: false };
      enterNode(this, ctx);
    } else {
      this.scene.start('title');
    }
  }
}

/** A made-up run summary for `?summary` (practice): a run that got to the last sector. */
function previewSummary(run: RunState, outcome: 'won' | 'failed' | 'destroyed') {
  const last = run.map.sectors.length - 1;
  const at = { sector: outcome === 'destroyed' ? 1 : last, node: 0 };
  const objectives = outcome === 'won' ? [true, false, true] : outcome === 'failed' ? [true, true, false] : [true];
  const played: RunState = { ...run, at, battle: 9, kills: 212, earned: 1480, time: 1534, objectives, next: outcome === 'destroyed' ? 'map' : outcome };
  const final =
    outcome === 'destroyed'
      ? { stats: { kills: 17, blastKills: 9, salvage: 64, blastBest: 'heavyTank' as const }, time: 141, stand: { time: 23, wave: 2 } }
      : null;
  return { summary: summarizeRun(played, final), shot: null };
}

/** Salvage a `?depot` practice run starts with. */
const PRACTICE_DEPOT_SALVAGE = 1000;
/** Salvage an `?event` practice run starts with (enough to buy from the scavengers). */
const PRACTICE_EVENT_SALVAGE = 120;

/** Grades and mods from the practice URL; unknown components, tracks, and levels are dropped. */
function upgradesFromUrl(): Upgrades {
  const u: Upgrades = { grades: {}, mods: {} };
  for (const [component, gen] of Object.entries(gradesFromUrl())) {
    if (component in GRADES && (gen === '2' || gen === '3')) u.grades[component as keyof typeof GRADES] = Number(gen) as 2 | 3;
  }
  for (const [key, level] of Object.entries(modsFromUrl())) {
    const dot = key.lastIndexOf('.');
    const part = key.slice(0, dot);
    const track = key.slice(dot + 1);
    const n = Math.min(DEPOT.maxModLevel, Math.floor(Number(level)));
    if (dot > 0 && track in TRACKS && n > 0) u.mods[part] = { ...u.mods[part], [track]: n };
  }
  return u;
}
