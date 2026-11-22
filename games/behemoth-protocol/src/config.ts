/**
 * Display configuration. Internal resolution is still being decided (SPEC §16 Q8): 576×324 by
 * default; `?res=480` or `?res=640` in the URL to compare 480×270 or 640×360.
 * `?seed=N` fixes the battle seed. `?immobilize=N` (playtesting) wrecks the treads N seconds in,
 * to get straight to the last stand. Either one skips the title screen and plays a throwaway run
 * that never touches the run save (`PRACTICE`). `?exit=N` (playtesting) puts the extraction line N
 * meters from the start, to run the battle → depot loop quickly; it keeps the title and the save.
 * `?addons=all` or `?addons=ramPlow,outerTreads,sponsonL` (playtesting, also a practice run)
 * starts with those add-ons bolted on. `?trailer=missilePod,ammoBunker` (also a practice run) adds a
 * trailer with those modules in its bays, front first (`-` leaves a bay empty).
 * `?weapons=turret:heavyLaser,prow:plasmaThrower,flankL:pulseLaser` (also a practice run) fits
 * those weapons by slot id over the starting loadout (and the practice add-on guns).
 * `?shells=turret:ap,dorsalRing:canister` (also a practice run) loads main guns with those shells.
 * `?cookoff=N` (also a practice run) destroys the magazine N seconds in, so it cooks off.
 * `?grades=reactor:3,fireControl:2` (also a practice run) fits higher-grade core components, and
 * `?mods=turret.traverse:3,armor.frontLeft.plate:2,reactor.capacitor:1` buys mod levels (part id,
 * then the track after the last dot). `?depot=N` (also a practice run) opens the depot after N
 * battles won, with salvage to spend, to try the depot without playing a battle.
 * `?biome=arctic&approach=pass` (also a practice run) fights every battle over that biome and
 * approach (see `recipeFromUrl`). `?condition=night|storm|none` (also a practice run) fights every
 * battle in that condition; `?event=convoy` (also a practice run) opens that event (or a random one).
 * `?doctrine=longGuns` (also a practice run) has every battle's defenders fight that doctrine;
 * `?mix=siegeTank:1,lightTank:2` (also a practice run) sets the units they field and their odds.
 */

import { MODES, type BattleModeId } from './content/modes';
import { ADDONS } from './content/addons';
import { APPROACHES, type ApproachId } from './content/approaches';
import { BIOMES, type BiomeId } from './content/biomes';
import { DIRECTIVES, type DirectiveId } from './content/directives';
import { CONDITIONS, type ConditionId } from './content/conditions';
import { DOCTRINES, type DoctrineId } from './content/doctrines';
import { ENEMIES, type EnemyId } from './content/enemies';
import { MAP_EVENTS, type MapEventId } from './content/mapEvents';

export interface Resolution {
  width: number;
  height: number;
}

const params = new URLSearchParams(window.location.search);

const RESOLUTIONS: Record<string, Resolution> = {
  '480': { width: 480, height: 270 },
  '576': { width: 576, height: 324 },
  '640': { width: 640, height: 360 },
};

export const RESOLUTION: Resolution = RESOLUTIONS[params.get('res') ?? ''] ?? RESOLUTIONS['576']!;

/** Playtest run from a URL parameter: straight into battle, nothing saved or deleted. */
export const PRACTICE = ['seed', 'immobilize', 'addons', 'trailer', 'weapons', 'shells', 'cookoff', 'grades', 'mods', 'depot', 'biome', 'approach', 'map', 'mode', 'directive', 'objective', 'summary', 'condition', 'event', 'doctrine', 'mix'].some((k) => params.has(k));

/**
 * Playtest shortcut: the biome and approach every battle is fought over (`?biome=arctic`,
 * `?approach=pass`; `?approach=none` for the biome's own mix). Unknown ids are ignored.
 */
export function recipeFromUrl(): { biome?: BiomeId; approach?: ApproachId | null } {
  const out: { biome?: BiomeId; approach?: ApproachId | null } = {};
  const biome = params.get('biome');
  if (biome && biome in BIOMES) out.biome = biome as BiomeId;
  const approach = params.get('approach');
  if (approach === 'none') out.approach = null;
  else if (approach && approach in APPROACHES) out.approach = approach as ApproachId;
  return out;
}

/** Playtest shortcut: the run's Directive (`?directive=decapitation`, `interdiction`, `breakthrough`); unknown ids are ignored. */
export function directiveFromUrl(): DirectiveId | undefined {
  const d = params.get('directive');
  return d && d in DIRECTIVES ? (d as DirectiveId) : undefined;
}

/** Playtest shortcut: straight into sector N's objective battle (`?objective` = sector 1, `?objective=3` the last). */
export function objectiveFromUrl(): number | null {
  if (!params.has('objective')) return null;
  const n = Math.floor(Number(params.get('objective') || 1));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Playtest shortcut: preview the run summary (`?summary=won`, `failed`, or `destroyed`). */
export function summaryFromUrl(): 'won' | 'failed' | 'destroyed' | null {
  const s = params.get('summary');
  if (s === null) return null;
  return s === 'failed' || s === 'destroyed' ? s : 'won';
}

/** Playtest shortcut: every battle in this condition (`?condition=night`, `storm`; `none` for clear); undefined = the node's own. */
export function conditionFromUrl(): ConditionId | null | undefined {
  const c = params.get('condition');
  if (c === 'none') return null;
  return c && c in CONDITIONS ? (c as ConditionId) : undefined;
}

/** Playtest shortcut: open an event (`?event=convoy`; `?event` alone, a random one); null when not asked for. */
export function eventFromUrl(): MapEventId | 'random' | null {
  if (!params.has('event')) return null;
  const e = params.get('event');
  return e && e in MAP_EVENTS ? (e as MapEventId) : 'random';
}

/** Playtest shortcut: every battle's defenders fight this doctrine (`?doctrine=longGuns`, `entrenched`, …); unknown ids are ignored. */
export function doctrineFromUrl(): DoctrineId | undefined {
  const d = params.get('doctrine');
  return d && d in DOCTRINES ? (d as DoctrineId) : undefined;
}

/**
 * Playtest shortcut: every battle's enemy mix, as `unit:weight` pairs (`?mix=siegeTank:1,lightTank:2`);
 * unknown units and bad weights are dropped. Undefined when not given (or nothing valid is left).
 */
export function mixFromUrl(): Partial<Record<EnemyId, number>> | undefined {
  const mix: Partial<Record<EnemyId, number>> = {};
  for (const [id, weight] of Object.entries(pairsFromUrl('mix'))) {
    const n = Number(weight);
    if (id in ENEMIES && ENEMIES[id as EnemyId].spawn !== 'objective' && n > 0) mix[id as EnemyId] = n;
  }
  return Object.keys(mix).length > 0 ? mix : undefined;
}

/** Playtest shortcut: every battle in this mode (`?mode=breach`, `chase`, `assault`). */
export function modeFromUrl(): BattleModeId | undefined {
  const m = params.get('mode');
  return m && m in MODES ? (m as BattleModeId) : undefined;
}

/** Playtest shortcut: add-on ids to start with ('all' = every one); unknown ids are dropped later. */
export function addonsFromUrl(): string[] {
  const s = params.get('addons');
  if (!s) return [];
  return s === 'all' ? Object.keys(ADDONS) : s.split(',').map((x) => x.trim());
}

/** Playtest shortcut: trailer modules by bay (null = empty; unknown ids too), or null for no trailer. */
export function trailerFromUrl(): (string | null)[] | null {
  const s = params.get('trailer');
  if (s === null) return null;
  return s.split(',').map((x) => (x.trim() === '-' || x.trim() === '' ? null : x.trim()));
}

/** Playtest shortcut: weapon ids by slot id (`slot:weapon` pairs); unknown ids are dropped later. */
export function weaponsFromUrl(): Record<string, string> {
  return pairsFromUrl('weapons');
}

/** Playtest shortcut: shell types by slot id (`slot:shell` pairs); ones a gun can't take are ignored later. */
export function shellsFromUrl(): Record<string, string> {
  return pairsFromUrl('shells');
}

/** Playtest shortcut: open the depot after this many battles won (at least 1), or null. */
export function depotFromUrl(): number | null {
  const s = params.get('depot');
  if (s === null) return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

/**
 * Playtest shortcut: open the sector map instead of a battle, on sector N (`?map=2`; `?map` alone
 * is sector 1). With `?biome`, that sector is drawn in that biome.
 */
export function mapFromUrl(): number | null {
  const s = params.get('map');
  if (s === null) return null;
  const n = Math.floor(Number(s || '1'));
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

/** Playtest shortcut: core component grades (`component:gen` pairs); unknown ones are dropped later. */
export function gradesFromUrl(): Record<string, string> {
  return pairsFromUrl('grades');
}

/** Playtest shortcut: mod levels (`part.track:level`, e.g. `turret.traverse:2`); unknown ones are dropped later. */
export function modsFromUrl(): Record<string, string> {
  return pairsFromUrl('mods');
}

function pairsFromUrl(key: string): Record<string, string> {
  const s = params.get(key);
  if (!s) return {};
  return Object.fromEntries(s.split(',').map((pair) => pair.split(':').map((x) => x.trim()) as [string, string]).filter(([slot, id]) => slot && id));
}

export function seedFromUrl(): number | null {
  const s = params.get('seed');
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n >>> 0 : null;
}

/** Playtest shortcut: battle length in world units (the HUD's meters × 10), or null for the default. */
export function battleLengthFromUrl(): number | null {
  const s = params.get('exit');
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n * 10 : null;
}

/** Playtest shortcut: seconds into the battle at which the treads are destroyed, or null. */
export function immobilizeAtFromUrl(): number | null {
  return secondsFromUrl('immobilize');
}

/** Playtest shortcut: seconds into the battle at which the magazine is destroyed, or null. */
export function cookOffAtFromUrl(): number | null {
  return secondsFromUrl('cookoff');
}

function secondsFromUrl(key: string): number | null {
  const s = params.get(key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Battle screen layout: the battlefield is a centered vertical column (about 60% of the width,
 * in whole tiles) with HUD panels on either side.
 */
export interface BattleLayout {
  width: number;
  height: number;
  /** Battlefield width in tiles (the sim's lateral rows). */
  fieldTiles: number;
  fieldW: number;
  /** Screen x of the battlefield's left edge (= left panel width). */
  fieldX: number;
}

export function battleLayout(res: Resolution, tile: number): BattleLayout {
  const fieldTiles = Math.floor((res.width * 0.6) / tile);
  const fieldW = fieldTiles * tile;
  return { width: res.width, height: res.height, fieldTiles, fieldW, fieldX: Math.floor((res.width - fieldW) / 2) };
}

/**
 * How the game is drawn on screen. The art lives at the low internal resolution, but the canvas
 * is backed by physical screen pixels: `scale` is the largest whole number of physical pixels
 * per game pixel that fits the window, and cameras zoom by it. Game pixels stay square and crisp,
 * while scrolling and movement step one *screen* pixel at a time instead of one chunky game
 * pixel (which made slow scrolling choppy). Counting physical pixels (not CSS pixels) gives finer
 * steps on high-DPI screens.
 */
export interface RenderScale {
  /** Physical pixels per game pixel (integer). Cameras zoom by this. */
  scale: number;
  /** Canvas backing size in physical pixels. */
  width: number;
  height: number;
  /** CSS zoom that shows the canvas at one backing pixel per physical pixel. */
  cssZoom: number;
}

export function renderScale(res: Resolution): RenderScale {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min((window.innerWidth * dpr) / res.width, (window.innerHeight * dpr) / res.height);
  const scale = Math.max(1, Math.floor(fit));
  return { scale, width: res.width * scale, height: res.height * scale, cssZoom: 1 / dpr };
}

