# Features

The list of everything that's been built. When a task in [TODO.md](TODO.md) is done, its entry moves here (see CLAUDE.md, "Task tracking"). TODO.md holds only open work.

**How to search:** the entries are grouped by game system. Every entry starts with one tag line:

`M1` · `initial` · `playtest: pending` · SPEC §4.5

- **Milestone:** `M0`, `M1`, `M2`, `M3`, or `pre-M0`.
- **Commit:** the commit that landed it, `uncommitted`, or `initial` (landed before the history was flattened into the monorepo's first commit).
- **Playtest:** `approved` (the user played it and signed off), `pending` (built, still needs the user's eyes; the queue is in TODO.md), or `n/a`.
- **SPEC section(s)** where it applies.

Useful greps: `grep -n "playtest: pending" docs/FEATURES.md`, `grep -n "uncommitted" docs/FEATURES.md`, or grep for a code symbol (`firingBinding`) or a file (`sim/trailer.ts`).

## Contents
1. [Project and dev tools](#1-project-and-dev-tools)
2. [Movement and camera](#2-movement-and-camera)
3. [Terrain](#3-terrain)
4. [Collisions](#4-collisions)
5. [Weapons and firing](#5-weapons-and-firing)
6. [Damage, power, and the reactor](#6-damage-power-and-the-reactor)
7. [Enemies and AI](#7-enemies-and-ai)
8. [Last stand](#8-last-stand)
9. [Run loop and saves](#9-run-loop-and-saves)
10. [Depot](#10-depot)
11. [Add-ons, trailer, and drones](#11-add-ons-trailer-and-drones)
12. [Rendering, HUD, and effects](#12-rendering-hud-and-effects)
13. [Audio](#13-audio)

---

## 1. Project and dev tools

### Spec, README, CLAUDE.md
`pre-M0` · `initial` · `playtest: n/a` · SPEC (all)
Design spec draft v0, the public README, and the project instructions (2026-11-21).

### Scaffold
`M0` · `initial` · `playtest: n/a` · SPEC §2
Vite 8, TypeScript 7 (strict), Phaser 4.2, Vitest 5. npm scripts: `dev`, `build`, `test`, `typecheck`.

### Monorepo and GitHub Pages deploy
`M3` · `initial` · `playtest: pending` · SPEC §2, §15 "Hosting"
The game is the `behemoth-protocol` npm workspace in the html-games monorepo, at `games/behemoth-protocol/`. Every push to `main` runs typecheck, tests, and build, then deploys to https://toddharrison.github.io/html-games/behemoth-protocol/.
- Repo-level files: `package.json` (workspaces, one root lockfile), `scripts/build-site.mjs` (copies each `games/*/dist` to `dist/<slug>/` and fills the landing page `site/index.html` from each game's `title` and `description` in its package.json), `.github/workflows/deploy.yml`.
- **Gotcha:** the site is served from a subpath, so `vite.config.ts` must keep `base: './'`. Every game shares the github.io origin, so `localStorage` keys must stay prefixed with `behemoth-protocol`.
- **Gotcha:** `node_modules` is hoisted to the repo root. Run `npm install` there, not in this folder.

### Sim core
`M0` · `initial` · `playtest: n/a` · SPEC §12
Fixed 60 Hz stepper, a world/entity store, and the seeded RNG (`sim/rng.ts`), all with tests.

### Tuning constants in one file
`M2` · `initial` · `playtest: n/a` · CLAUDE.md "Content is data-driven"
`src/content/tuning.ts` holds every game-wide tuning knob. Per-unit tables stay in their own content files, and render/audio feel constants stay in their modules. No change in behavior; 317 tests.
- Moved here from content files: `MASS`, `WADING`, `DEFLECT`, `RIPPLE_GAP`, `FIRE_CONTROL`, `POOL`, `SPAWNER`, `CONCEALMENT`, `LAST_STAND`, `COVER`, `TERRAIN_GEN` (+ `riverMargin`, formerly `RIVER_MARGIN` in sim/terrain.ts), `TRAILER_MINE`, `RUN` (content/run.ts deleted), `DEPOT` (the stock tables stay in content/depot.ts).
- Renamed: `MAX_RAM` → `RAM.max`, `SELF_DESTRUCT_HOLD` → `DETONATION.selfDestructHold`, `DEFAULT_FRAME` (sim/frame.ts) → `CAMERA`.
- Newly named (they were inline numbers): `MOVEMENT` (accelFloor, edgeMargin), `RAM.speedDipCut`/`crushRadius`, `DEGRADE` (tread exponent; power/sensor/traverse floors via `degraded()` in behemoth.ts; reload penalty), `DETONATION.fringe`, `ENEMY` (first cooldown, reload jitter, aim tolerance, min terrain speed).
- Left inline on purpose: AI geometry and timings in `sim/ai/`, collision/tracing internals (`FACE_DEPTH`, `SUBSTEP`, beam step), `START_X`, `DESPAWN_BEHIND`.

### Practice URL parameters
`M0`–`M2` · various · `playtest: n/a`
Parsed in `src/config.ts`. A practice run (any of `seed`, `immobilize`, `addons`, `trailer`, `weapons`, `shells`, `cookoff`, `grades`, `mods`, `depot`, `biome`, `approach`, `map`, `mode`, `directive`, `objective`, `summary`, `condition`, `event`, `doctrine`, `mix`) skips the title screen and never saves.

| Param | Effect |
|---|---|
| `?seed=N` | Practice run on seed N, straight into its opening battle (which uses the run seed); winning goes to the map |
| `?immobilize=N` | Treads destroyed N s into the battle (fires once, so a drone revive sticks) |
| `?exit=N` | Extraction line N meters out; keeps the title and the save (for a quick trip to the depot) |
| `?addons=all` or `?addons=a,b` | Start with add-ons (sponsons get an autocannon and a rotary gun; `dorsalRing` a heavy cannon; `coax` a flak cannon) |
| `?trailer=missilePod,ammoBunker` | Start with a trailer; `-` = empty bay |
| `?weapons=turret:heavyLaser,prow:plasmaThrower` | Weapon per slot id (`slot:weapon` pairs) |
| `?shells=turret:ap,dorsalRing:canister` | Main-gun shell per slot id (`he`, `ap`, `canister`) |
| `?cookoff=N` | Magazine destroyed N s into the battle (it cooks off) |
| `?grades=reactor:3,sensors:2` | Core component grades (`component:gen`, gen 2 or 3) |
| `?mods=turret.traverse:3,armor.front.plate:2` | Mod levels (`part.track:level`; the track follows the last dot; `armor.front` is both front halves, `treads.load` the Load mod) |
| `?depot=N` | Opens the depot after N battles won, with 1000 salvage (Gen 3 grades show from N = 2) |
| `?biome=arctic` | Every battle in that biome, whatever the sector (`temperate`, `arctic`, `industrial`, `desert`, `wasteland`) |
| `?approach=pass` | Every battle on that approach (`plain`, `forest`, `urban`, `river`, `pass`; `none` = the biome's own mix) |
| `?mode=breach` | Every battle in that mode (`assault`, `breach`, `chase`); the node's strength still sets the target count. With `?exit=60` the fortress is close (Breach) |
| `?map` or `?map=N` | Opens the sector map at the start of sector N (default 1) instead of a battle; with `?biome`, that sector is drawn in that biome (for looking at the map art) |
| `?condition=night` | Every battle in that condition (`night`, `storm`; `none` = clear) |
| `?doctrine=longGuns` | Every battle's defenders fight that doctrine (`combined`, `armoredFist`, `entrenched`, `raiders`, `longGuns`; `longGuns` for field batteries) |
| `?mix=siegeTank:1,lightTank:2` | Every battle's enemy mix (`unit:weight` pairs, replacing the doctrine's; objective-only units are dropped). For trying a new unit: `?seed=3&mix=siegeTank:1` |
| `?event=convoy` | Opens that event (`convoy`, `orders`, `hulk`, `dump`, `drop`, `scavengers`; `?event` alone, one drawn from the seed) on the first layer of sector 1, with a worn Behemoth (treads 60%, armor 50%, sensors 80%, munitions half) and 120 salvage |
| `?res=480\|576\|640` | Internal resolution (default 576×324) |

### Headless screenshots
`M1` · n/a · `playtest: n/a`
- Clicking: no Playwright module is installed, but Node's built-in `WebSocket` can drive the headless shell over CDP (`--remote-debugging-port`, then `Input.dispatchMouseEvent` and `Page.captureScreenshot`). The canvas fills 1152×648 at 2× the 576×324 internal resolution. Combined with `?depot=N` this reaches every depot panel.
- Playwright's chromium headless shell is cached at `~/Library/Caches/ms-playwright/chromium_headless_shell-1247/`. Run `npx vite --port 5199`, then use `--screenshot --virtual-time-budget`.
- Add `--use-angle=swiftshader --enable-unsafe-swiftshader --enable-webgl --ignore-gpu-blocklist`, or Phaser falls back to Canvas and every text tint shows white.
- The game loop barely advances in virtual time, so to see units, spawn them temporarily in the scene's `create()`, then revert.
- To see terrain past the clear start, temporarily turn `START_X` in sim/world.ts into a function that reads a global set from a `?startCol=` param in main.ts (it must be read lazily: module constants are evaluated before main.ts runs), then revert. A scratch vitest that prints the first column of each material for a seed and recipe finds where to look; the battle's terrain seed is `hashSeed(seed, 0x7e44)`.

### Offline audio rendering
`M2` · n/a · `playtest: n/a`
The harness lived in a session scratchpad and is gone. To rebuild it: vite dev + `chrome-headless-shell --remote-debugging-port`, `import('/src/audio/synth.ts')`, then `new Synth(offlineCtx, offlineCtx.destination)` with `running` overridden to true. Render each recipe through an `OfflineAudioContext` over CDP.

### Sim bot
`M1` · n/a · `playtest: n/a`
An ad-hoc headless driver (not checked in) used for balance numbers: passive autos-only vs firing everything, over 8–40 seeds. The results are recorded in the matching entries below.

---

## 2. Movement and camera

### Behemoth movement
`M0` · `initial` · `playtest: pending` · SPEC §4.2
Cruise/min/top speeds, accel and brake, lateral steering capped by forward speed, heading follows velocity. Speeds scale with tread integrity: `floor + (1 − floor) × integrity^0.75` per working set (`DEGRADE.treadSpeedFloor` 0.5, `treadSpeedExponent` in tuning.ts; `treadSpeedScale` in behemoth.ts), so worn treads hold half speed and only a destroyed set gives zero (f4b61e9, user's call: it used to fall toward zero). The hull heading is clamped to atan(`lateral.maxRatio`) in `stepMovement`, up to ~41° (raised from ~31° so rock fields near river crossings stay passable).

### Eased steering
`M2` · `initial` · `playtest: pending` · SPEC §15 "Steering and front armor" (step 1 of 3)
Sideways acceleration is jerk-limited, and the Behemoth eases to a stop at the field edge.
- `easeToward(v, a, target, maxAccel, jerk, dt)` in `sim/math.ts`: an S-curve with a one-step look-ahead (without it, the fixed step arrives with ~12 units/s² left and snaps).
- `BehemothState.ay`; `stepMovement` steers through it. `edgeApproachSpeed` (behemoth.ts) caps the target near the field edge (`MOVEMENT.edgeMargin` = 0.6 of the room: the target shrinks as the hull closes in).
- Class II `lateral: { accel 45, jerk 142 }` (was accel 36, no jerk; jerk 150 until Nov 22, 2026, when the user asked for a little smoother turn-in and return, −5%, `7dfa568`): 10–90% turn-in ~0.58 s, full in ~0.77 s, release settles in ~1 s. Tune `accel`/`jerk` in content/chassis.ts.
- Deflection still writes `vy` directly (a shove).

### Mass and tread capacity
`M2` · `initial` · `playtest: pending` · SPEC §5.3
Weapon and add-on mass against tread capacity scales speed, acceleration, and agility. The depot shows load with install previews, and the HUD shows an OVERLOAD label.
- `WeaponDef.mass` (tons), `ChassisDef.massCapacity` (Class II 280; the starting loadout is 245), `MASS` in tuning.ts.
- `sim/behemoth.ts`: `massScale(mass, capacity)` (+15% empty, 1.0 at capacity, −2% per 1% over, floor 0.4), `loadMass` (wrecked weapons count), `massCapacity` (= working tread sets), `mobilityScale` = tread × mass, used by `speedLimits`, accel, and `lateralLimit` (also the deflect clamp in collision.ts).
- Chassis speeds mean "at rated capacity", so **tests compare against `speedLimits(b)`, not `chassis.speed`**. `createBehemoth` and `restoreBehemoth` start at the Behemoth's own cruise.
- Depot: `loadOf(snapshot, swap?)`; the "For sale" row shows `Load m/cap t  Cruise n` (amber when over), install/remove labels carry the mass change, and hovering previews `before>after`. HUD: the speed bar scales to the unloaded top speed.

### Camera-follow frame
`M0` · `initial` · `playtest: pending` · SPEC §4.2
Anchored ¼ from the bottom at cruise, with smoothing lag (a surge pulls ahead, braking drifts back). It never scrolls backward and has a hard cap at 55%. `CAMERA` in tuning.ts. `frameFocus(b)` (world.ts) follows a point behind the hull while towing a trailer. The one backward scroll is `centerFrame` in the last stand.

### Vertical scrolling
`M0` · `initial` · `playtest: pending` · SPEC §4.1
Battles scroll up the screen with HUD side panels. W/S = speed, A/D = steer. The sim stays camera-agnostic (+x = forward); only `src/render/` maps it to screen-up.

---

## 3. Terrain

### Terrain chunks
`M0` · `initial` · `playtest: pending` · SPEC §4.5
Generated ahead per (seed, chunk), independent of order. Forest, building, road, each with damaged/destroyed/flattened states. `speedAt(x, y, mobility)` gives per-mobility speed; `isCover` covers forest (intact/damaged) and buildings.

### Rock outcrops and ridges
`M1` · `initial` · `playtest: approved` · SPEC §4.2, §4.5
Rock capsules (outcrops and ridges) in `sim/terrain.ts`, drawn after forests/towns so existing seeds keep their layouts apart from the rock. `laneCenter` keeps a 5-tile lane rock-free. `generateChunk` paints one chunk ahead and `fillDeadEnds` fills dead ends right to left (merged 3-column lookahead). Rock covers ~3.5% of tiles, mostly blocky masses against the field edges.
- Bot, 40 seeds × 3 min driving blind: 193 contacts, held ~0.55 s on average, 2.7 s at worst, no crumbles (the regression test covers 6 seeds).

### Rivers (terrain type 6)
`M1` · `initial` · `playtest: pending` · SPEC §4.5
Shallows plus a deep channel with fords. The Behemoth fords at minimum speed with tread wear by distance; tracked enemies cross only at fords.
- Materials `shallows` and `water` (content/terrain.ts), with a `wading` field (Behemoth speed cap + tread wear per 100 units). `WADING` and `river*`/`ford*` in `TERRAIN_GEN` (tuning.ts).
- Generator: `chunkRiver(seed, ci, rows, recipe)` (internally `riverOf`, cached in `neighborOf`) on its own RNG stream, `riverCenter`, `riverPaint` (water/shallows/'approach'/'margin', mapped to the river's own `shallows`/`channel` materials, so arctic rivers are ice over thin ice). Rivers paint over forest/towns. Rock and dead-end filling stay off rivers plus a 2-tile margin (`nearRiver`). Ford approaches turn buildings to road.
- `Terrain.riversNear`, `Terrain.groundAt(rect)` (was `wadingAt`; now also returns `grip` and the HUD `label`). `b.wading` is refreshed at the end of `resolveBehemothCollisions` (`ford()` applies wear by distance); `wadingCap` limits the target speed in `stepMovement`, with `WADING.drag` decel.
- AI: `ai/crossing.ts` `viaFord` → `pursue()` in steer.ts (skirmisher, holdAhead); besiegers route through the flow field.
- Render: `water0/1`, `shallows0/1` tiles with per-tile ripple, `Effects.splash/wake`, no scorch or track marks on water; the HUD speed shows `WADE`/`FORD`.
- Bot, 20 seeds × 3 min: a river every ~50 s, ~4 tread HP and ~8 s per crossing (worst 13 HP). Seed 4 has a river ~17 s in.
- **Gotcha (M3):** spacing is now `hasRiver` (a chunk has a river if it rolled one and the chunk before doesn't *have* one), worked forward from `riverFirstChunk`. The old rule (didn't *roll* one) suppressed itself at high chances; the change moved some rivers on old seeds.

### Biome × approach recipes
`M3` · `initial` · `playtest: pending` · SPEC §3.1, §4.6, §15 "Biomes and terrain (M3)"
A battle's terrain is a `TerrainRecipe` `{ biome, approach }` (approach null = the biome's own mix). Five biomes (temperate, arctic, industrial, desert, blasted wasteland) and five approaches (open plain, forest line, urban district, river crossing, mountain pass).
- Content: `content/biomes.ts` (`BIOMES`, `FeatureMix` per-chunk counts/chances, river materials), `content/approaches.ts` (`APPROACHES`: `scale` multipliers on the mix, `townSize`, `forestSize`, `cliffs`, `laneAmplitude`, `avenue`). Shape knobs in `TERRAIN_GEN` (tuning.ts): `craterField`, `minefield`, `fortLine`, `trapLine`, `hedgerow`, `farm`, `lake`, `snowdrift`, `factory`, `tankFarm`, `rail*`, `cliffKnotCols`, `bridgeWidth`, `lightBridgeShare`, `firstDefenseChunk`, `riverMaxChance` (replaced `riverChance`; `forestBlobsPerChunk`/`townChance`/`rockPerChunk` moved into the biome mix).
- Generator (`sim/terrain.ts`): `chunkFeatures` keeps forests → towns → rock on the original stream and order (temperate keeps its old forest/town/rock layouts); every new kind draws on its own stream (`SALT`). `paintColumn` paints `PASSES` in order, each feature deciding what it claims (`featurePaint(..., cur)`), then rails, rivers, cliffs, rock. `besideLane` places factory compounds and tank farms clear of the lane. Urban `avenue` turns buildings within 1.5 rows of the lane center to road. `generateChunk(seed, ci, rows, recipe)`; `new Terrain(seed, rows, recipe)`; `createWorld({ recipe })`.
- Run (`sim/run.ts`): `battleRecipe(run, override)` (the sector's biome and the node's approach; see "Sector map") and `recipeName`. Scene passes `recipeFromUrl()` (config.ts). HUD stats name it, and the map's intel panel shows the approach; the debug line shows it.
- Tests: `tests/sim/biomes.test.ts` (determinism, order independence, start clear, lane free of rock/compounds, tracked units can drive every recipe end to end, biome-only materials, approach shares, cliffs, run recipes).
- **Gotcha:** `neighborOf` caches chunk features and rivers in a module-level `chunkCache` (96 entries, keyed by seed/rows/recipe/chunk); it's a pure function of those, so it never needs clearing. Painting checks only features whose `colSpan` reaches the column (`reaching`); a new feature kind needs a `colSpan` case or it never paints.
- **Gotcha:** rock paints over everything except `ROCK_SPARES` (building, road, factory, fuel tank). Rails and defenses must not punch holes in outcrops: holes left notches that boxed the hull in (seed 2 crumbled until this rule).
- **Gotcha:** a hidden mine is drawn as the plain ground frame, so minefields only claim `ground`.
- Bot (terrain only, 6 seeds, follows the lane, never fires): before biomes −46 treads / −40 front armor / 191 s / 6 of 6; now per recipe −47 to −70 treads, −10 to −76 front armor, 186–238 s, 3–6 of 6 within 5 min. Mines and traps are the new costs. Desert −35 to −54 treads; wasteland −62 to −76 (the harshest).

### Common terrain features
`M3` · `initial` · `playtest: pending` · SPEC §4.5, §4.6
Craters, tank traps, walls and bunkers (fortified lines), minefields, and bridges, in every biome. Materials in `content/terrain.ts`, with new `MaterialDef` fields: `bearing`, `breaksTo` (a material or `under`), `explodes`, `hidden`, `scars`, `debris`.
- **Craters:** `crater` material; `Terrain.damage` on open ground (`scars: 100`) turns it into one; mines and fuel tanks break to one.
- **Tank traps:** `tankTrap`, obstacle class `trap` (new in `OBSTACLE_CLASSES`, with `soft` for crops and rails). Checkerboard belts (`traps` feature) and in front of fortified lines.
- **Walls and bunkers:** `wall` (heavy, blocks everyone), `bunker` (heavy, garrisoned: protection 0.8). `fort` feature: a wall at a column with `gates`, bunkers `bunkerBehind` columns beyond it, a trap belt `trapsAhead` columns before it with its own gates; never near a river.
- **Minefields:** `mine` (1 HP, `hidden`, `explodes` 14/30, `breaksTo: 'crater'`, obstacle trivial so the treads set it off). `Terrain.reveal` marks swept tiles `seen` (called from `stepConcealment` with the sensor reveal radius × `CONCEALMENT.mineSweep` 1.15, user's call Nov 22, 2026, `7dfa568`: mines show a bit sooner on Gen 1 sensors; only re-sweeps when the hull moves to a new tile).
- **Bridges:** `bridge` (400 t, 120 HP) and `lightBridge` (300 t, 50 HP), `bearing.give: 'span'`; `Tile.under` holds the water. `River.bridge` (rows, kind) is drawn on its own stream clear of fords. `Terrain.crossings(rv)` = fords + the bridge while it stands; `ai/crossing.ts` `viaFord` routes through both and skips frozen rivers. A destroyed bridge tile (`damage`) or an overload (`bear`) brings down the whole span (`collapse`, flood fill) and emits `bridgeCollapse`.
- **Gotcha:** `tileChanged` now carries `mat`, the material that changed. Read it instead of the tile: a fallen bridge or a mine has already turned into water or a crater by the time the renderer sees the event.

### Biome terrain
`M3` · `initial` · `playtest: pending` · SPEC §4.6
- **Temperate:** `farmland` (soft: flattened by the treads), `hedgerow` (trivial; slows vehicles, conceals infantry). `farm` feature (hedged 60%) and lone `hedge` lines.
- **Arctic:** `ice` (`grip` 0.3), `thinIce` (`grip` 0.4, `bearing` 200 t `crack`, `breaksTo: 'water'`, 12 HP), `snowdrift` (`wading` cruise cap, label DRIFT). Rivers use `ice`/`thinIce`; `lake` feature (ice rim, thin-ice core) and `drift` feature. Movement: `stepMovement` scales forward accel, braking, lateral accel and jerk by `b.wading.grip` (floor `MOVEMENT.minGrip`), and the edge approach uses the scaled values. `BEARING.crackRate` 60 HP/s per 100% overload.
- **Industrial:** `factory` (260 HP, medium obstacle, 5 salvage, garrisonable), `fuelTank` (25 HP, `explodes` 40/50 with a 0.25 s fuse, `breaksTo: 'crater'`), `rail` (soft; torn when crushed). `factory` feature (road ring, 40% walled compounds with gates), `tanks` feature (grid 2 apart, so blasts chain), rails per `railStretch` chunks.
- **Desert**: `dune` (`wading` cruise cap, label SAND), `wadi` (river material for both banks and channel: passable, conceals and covers infantry), `derrick` (40 HP, shots pass through, `explodes` 44/60 with a 0.4 s fuse, 3 salvage, `breaksTo: 'crater'`). Features `dune` (oval, long across the field; `TERRAIN_GEN.dune`) and `oilfield` (square block placed with `besideLane`, derricks on a 3-tile grid that don't chain; `TERRAIN_GEN.oilfield`).
- **Blasted wasteland**: `wreck` (150 HP, medium, blocks fire, garrisonable cover 0.5, 4 salvage), `glass` (`grip` 0.5, `slipTag` GLASS). Features `wrecks` (patch; `TERRAIN_GEN.wreckField`) and `blast` (oval: glass inside `blastSite.core`, craters around; claims anything). `BiomeDef.ruins` sets `RUINABLE` tiles (building, factory, wall, bunker) damaged or destroyed when `generateChunk` creates them (cell noise salt `0x7a1d`). Rubble placed this way pays no salvage; a damaged ruin still pays when it's knocked down.
- **Gotcha:** the HUD speed tag comes from `b.wading.label` (FORD, WADE, DRIFT, SAND, or the `slipTag` of the slippery ground under it: ICE, GLASS), set by `groundAt`. `isWet(mat)` (content/terrain.ts) is the check for river water (splashes, pools fizzling); snowdrifts have `wading` but aren't wet.

### Terrain hazards
`M3` · `initial` · `playtest: pending` · SPEC §4.5, §4.6
`sim/hazards.ts` `stepHazards` (after pools in `stepWorld`): the Behemoth's weight on the ground (`Terrain.bear` with `loadMass`; a collapse costs `BEARING.collapseTreads`), explosive tiles queued by `Terrain.takeBlasts` waiting out their fuse in `w.blasts`, and units lost where the ground gave way (`Terrain.takeBroken`: a vehicle whose tile became impassable to it is destroyed, cause `hazard`).
- A terrain blast uses the trailer's `blast` (now exported, with an `edge` falloff) on units and tiles, then hits the treads (`TERRAIN_BLAST.under` 0.3) if its tile overlaps the hull's footprint, else the facing arc (`hullBlast`, `TERRAIN_BLAST.hull` 0.35), and a trailer in reach.
- New `KillCause` `hazard` (counts as a kill, not a final-blast kill).
- Tests in `tests/sim/biomes.test.ts`: bridges (limits, span, shot out, crossings, vehicles lost), thin ice (crack rate by mass, drowning), fuel-tank chains, plowing a tank, minefields (hidden, swept, blow under the treads, shot), craters, tank traps, ice steering, drifts.

---

## 4. Collisions

### Crush and plow
`M0` · `initial` · `playtest: pending` · SPEC §4.2
Trivial and light obstacles are crushed. Medium and heavy ones are plowed through, with a speed dip plus front armor/tread damage reduced by ram gear (`RAM` in tuning.ts).

### Deflect off rock
`M1` · `initial` · `playtest: approved` · SPEC §4.2
Rock is immovable, blocks fire, and enemies can't pass it. The hull glances off with a slide, or is held at the face and shoved, with scraping and sparks. A crumble failsafe breaks rock when the hull is boxed in.
- The `immovable` class in `content/obstacles.ts`; `DEFLECT` in tuning.ts. `deflectOffRock` (sim/collision.ts) runs before crushing: each overlapping rock tile pushes the hull out along the shallower axis, and a tile at the nose within `FACE_DEPTH` (2 units) always counts as the face (otherwise sliding along a face flip-flops).
- The face contact (ram damage, armor half, spark) is `faceContact`; see Split front armor.
- State: `b.deflect {dir, flips, spark}`. The slide direction is picked once at contact (`slideDirection`); steering mid-slide is ignored on purpose (it caused in-place flip-flopping against rock alongside).

### Ground box
`M2` · `initial` · `playtest: pending` · SPEC §15
Rock contact and fording use 80% of the hull's length and width. Crushing, rams, enemy crush, incoming fire, the stopped-hull obstacle, and the field-edge clamp keep the full hull (turned with it since Nov 2026, see below).

### Turned hit box
`M3` · `7dfa568` · `playtest: pending` · SPEC §15 "Feedback batch (Nov 22, 2026)"
User request: the hit box follows the hull's shape as it steers (up to ~41°). An oriented box replaces the axis-aligned footprint for incoming fire, crushing and rams, units under the hull, blasts, mines, and plasma pools.
- `sim/math.ts`: `Box`, `orientedBox`, `toBox` (u along the heading, v across: the same sign as `hullSide`), `pointInBox(box, x, y, pad)`, `closestInBox`, `distanceToBox`, `circleIntersectsBox`, `boxBounds`, `rectIntersectsBox` (separating axes; touching edges don't count).
- `sim/behemoth.ts`: `hullBox(b)`, `groundBox(b)`; `footprint(b)` is now the turned hull's bounds (the last stand's solid hull, wave placement). Users: `resolveBehemothCollisions` (crushes only tiles `rectIntersectsBox` says the hull covers, of those under its bounds; units by `circleIntersectsBox`), `stepPlayerRound`'s hull hit (`pointInBox`), `shellBurst` (`closestInBox`), `hullBlast` (`distanceToBox`), `terrainBlast`'s under-the-hull test, `poolUnder`/`burn` (`groundBox`; the trailer's pool test uses the same helpers now).
- **Gotcha:** rock deflection, fording, and bridge/ice loads still use the **unturned** `groundFootprint`: the deflection's push-out is axis-aligned by design (SPEC §4.2), and it's playtest-approved. The field-edge clamp uses the unturned half-width too, so at full lock a corner can poke past the edge.
- Tests: `tests/sim/hullBox.test.ts` (box math; a round past where the unturned corner was misses, one on the turned nose corner hits; crushing and running over units follow the turned hull).
- `ChassisDef.ground {length, width}` shares (0.8, 0.8), `groundFootprint(b)`; used by `deflectOffRock`, `slideDirection` (room = (hull + ground width)/2), and `ford`.

---

## 5. Weapons and firing

### Turret and main gun
`M0` · `initial` · `playtest: pending` · SPEC §4.3
The turret traverses at a limited rate; the main gun fires on LMB. Shells burst at the aim point, so you can clear forest.
- **Gotcha:** Phaser's `activePointer` is shared across scenes, so the click that leaves the depot (or the title menu) is still held when the battle starts. `Controls.mouseLatched` (src/input/controls.ts) ignores mouse fire until every button has been released once.

### Ammo counts shots
`M3` · `7dfa568` · `playtest: pending` · SPEC §6, §15 "Feedback batch (Nov 22, 2026)"
User request: ammo is shots, not missiles, and a launcher's shots are what its missile count was. A salvo weapon spends one round when the salvo starts (`stepMissiles`, sim/weapons.ts) and always finishes it; `WeaponDef.ammo` keeps its number (rack 24, pod 12, busters 10), so a rack now carries 24 salvos of 4. Depot stats read `24 shots` and `salvos of 4`, the hardpoint panel's row `Shots`. No save change (a half rack stays half).
- **Gotcha:** `magazineLoad` still counts one round's damage per shot, so the cook-off and the detonation's munitions radius kept their size (a full rack ≈ 190). Rearm prices are still per shot (`roundPrice`), so rearming a rack is now cheap per missile; feed into the economy tuning.

### Weapon roles and loadout
`M1` · `initial` · `playtest: pending` · SPEC §4.3, §6
Main cannon (LMB), autocannon (RMB), missile rack (Space; lock-on salvo, ammo), AP and PD autos (toggle 1–4). Weapon strip HUD; mount positions and firing arcs.
- `stepWeapons` (sim/weapons.ts) dispatches by binding and projectile kind. Rounds carry `vs` (a damage multiplier per `TargetClass`; `damageMultiplier` in projectiles.ts) and `strike`. Auto guns score targets by distance ÷ multiplier.
- Input: RMB or Ctrl/Shift+LMB = secondary, Space = missiles, 1–4 toggle auto groups (`cmd.toggleAuto` is one-shot; the scene nulls it after the first sim step of a frame).

### Projectile kinds
`M1` · `initial` · `playtest: pending` · SPEC §6
Bullet, homing missile, PD intercept. Lobbed shells and beams came later (see Depot weapons and Energy weapons).

### Main-gun shell types
`M2` · `initial` · `playtest: pending` · SPEC §6.2, §15 "Tank staples", §16 Q11
The heavy cannon takes high-explosive (the old round, still the default), armor-piercing, or canister, chosen per gun at the depot (free, no action, like a binding). No in-battle swap (user's call: depot only for now).
- Content: `ShellType`, `SHELL_TYPES` (name, short, blurb), `WeaponDef.shells` (first = default = `projectile`; `CANNON_HE/AP/CANISTER` in content/weapons.ts). AP: a fast bullet (720, 55 dmg, range 420, `vs` heavy 1.5 / infantry 0.4, `penetration` 0.5, tile 20). Canister: `BulletSpec.pellets` 10 × 6 dmg, spread ±0.2, range 120, `vs` infantry 2 / light 0.6 / heavy 0.15. The siege howitzer has no `shells` (no choice).
- `withShell(weapon, shell)` returns the gun loaded with that shell: the same `WeaponDef` with `projectile` swapped, cached so each pair is one object (the default returns the weapon itself). `HardpointState.shell` + `loadShell(h, shell)` (behemoth.ts): `h.weapon` is the loaded gun, so firing, flight, damage, and the HUD need no shell checks. `restoreBehemoth` loads it; a shell the gun can't take loads the default.
- `spawnProjectile` fires `pellets` rounds (each with its own spread) and pushes one `fire` event. `HitBase.penetration` lifts a front multiplier below 1 toward 1 in `facingMultiplier` (flank and rear bonuses unchanged).
- Depot: `{kind: 'shell', slot, shell}`; `shellOf(s, slot)` (the choice or the default; null for guns with no choice). Install and remove clear it. `DepotScene.shellRow` (buttons HE/AP/CAN and the shell's blurb); the stats line shows the loaded shell (`weaponStats` takes a `WeaponDef` now; pellets read `10x6`).
- HUD: rows group by weapon and shell, labeled `Cannon AP`. Render: an AP round from an L gun uses the `shell` sprite; canister pellets are bullets. Sounds are the cannon's for all three.
- Practice: `?shells=turret:ap` (slot:shell pairs; also a practice run).
- Bot (8 seeds, firing everything at the nearest unit), main gun on each shell all battle: HE 8/8 extractions, front armor ends at 52%; AP 8/8, 53%, a few more heavy-tank kills; canister 3/8, 6% (heavy tanks hold at 85–135, past its reach, and it barely scratches them).

### Depot weapons and lobbed shells
`M2` · `initial` · `playtest: pending` · SPEC §6
Six weapons sold at depots: siegeHowitzer (L), rotaryGun, flakCannon, bunkerBuster, mortar (M), pdGuns (S), each with `size` and `blurb`. `ShellSpec.lobbed`: player rounds skip collisions until the fuse. Auto shells fuse at the target. Render: mount art and the `TURRET_BARREL` table; lobbed shells swell mid-arc.

### Energy weapons
`M2` · `initial` · `playtest: pending` · SPEC §6, §15 "Energy weapons (M2)", §16 Q14
Lasers for S/M/L (pulse, beam, heavy) and the plasma thrower (splash plus burning pools that hurt the Behemoth too).
- Content: `pulseLaser` (S auto), `beamLaser` (M RMB), `heavyLaser` (L LMB), `plasmaThrower` (M RMB) in content/weapons.ts and `DEPOT_WEAPONS`. Laser power +10% (user's call, Nov 22, 2026, `7dfa568`): pulse 1.65, beam 1.76 (17.6/s), heavy 16.5, PD laser 4.4 a shot; the plasma thrower (not a laser) is unchanged. Types: `BeamSpec` (kind `beam`), `RoundSpec` = projectile | beam, `PoolSpec` on `ShellSpec.pool`, `POOL` in tuning.ts (tick 0.25, treads ×1.5, trailer ×1).
- **Gotcha:** `roundSpec` throws for beams; use `shotSpec` for anything that does damage.
- Sim: `fireBeam` (projectiles.ts: analytic unit hit + 2-unit steps for cover/mines), `shootBeam` (weapons.ts: spread, `fire` + `beam` events), used by `fireAimed` and `stepAutoGun` (no lead). `damageEnemy` is exported.
- `sim/pools.ts`: `spawnPool` (none in water), `stepPools` (counts ticks, not age: float drift lost the last tick), `poolUnder`. Pools burn units, tiles, the hull's treads (ground box), and a hitched trailer; `w.pools`. Events: `beam`, `plasmaBurn`, `explosion.plasma`.
- Render: `Effects.laser/plasmaBurst/plasmaSpark/plasmaBurn`, `render/poolView.ts` (`PoolViews`, depth 1.8), `plasma` glob + `plasma_pool0/1` textures, `PAL.plasma*`, laser/plasma mounts, `bh_barrel_laser`, heat glow for the heavy laser/beam/plasma, HUD Treads `BURN`, cutaway lens/chamber, depot stats `burns 8/s 3s`.

### Turret rings as data
`M2` · `initial` · `playtest: pending` · SPEC §5.2, §15 "Turrets and bindings (M2)"
- `TurretDef` (content/chassis.ts: id, hull-space pivot, traverse, main `slot`); `ChassisDef.turrets` (replaces `turret`); `HardpointSlotDef.ring` (a turret slot's `mount` = its hull position with the ring facing forward); `AddonMount.turret`.
- Sim: `b.turrets: TurretState[]` (replaces `turretAngle`), `turretRings`, `ringOf`, `turretPivot(b, t)`, `turretWorldAngle(b, t)`, `turretTraverseScale(b, t)`, `stepTurrets`; `mountPosition` turns a slot's offset with its ring.
- Render: one `Ring` rig per turret in `BehemothView` (recoil per ring), `muzzle(b, slot)`; the scene interpolates each `TurretState` by identity.

### Ripple fire
`M2` · `initial` · `playtest: pending` · SPEC §5.2
Two or more L guns sharing an aimed trigger fire in turn: the next ready one after `last`. `RIPPLE_GAP` (tuning.ts), `b.ripple: Record<Trigger, {gap, last}>` with `Trigger = 'lmb' | 'rmb' | 'space'`; `triggerOf`/`held`/`stepRipple`/`fireAimed` in sim/weapons.ts.

### Bindings and fire control
`M2` · `initial` · `playtest: pending` · SPEC §5.2, §15 "Turrets and bindings (M2)"
Each hardpoint is bound to LMB, RMB, Space, or Auto at the depot (free, no action used), limited to the bindings each weapon allows. Fire control is a core component: a spread multiplier, 2 auto channels, and local control when destroyed. The HUD strip is grouped by binding. Run save v4.
- Content: `Binding` / `BINDINGS` / `defaultBinding` / `FIRE_CONTROL` (tuning.ts); `ChassisDef.fireControl {hp, channels}`; `fireControl` is a `CoreComponent` (internals, anchors).
- `sim/behemoth.ts`: `HardpointState.binding`, `b.fireControl`, `allowedBindings(weapon, slot)` (PD = auto only; L and any ring slot never auto; empty = can't go there), `defaultBindingFor`, `usesChannel`, `channelsUsed`, `firingBinding`, `autoGroupOf` (player-bound autos = group 4), `fireControlSpread`.
- **Gotcha:** `firingBinding` falls back once fire control is destroyed. Use it, not `h.binding`, in sim and render.
- `sim/weapons.ts`: aimed / missile salvo via `cursorLock` or `autoLock` / auto gun / PD; `autoTarget` is shared by auto guns and auto missiles (on-screen only for missiles). The battle's lock bracket follows racks on a trigger only.
- Depot: `{kind: 'bind'}` action ("Not allowed", "Set", "No channel"), `bindingOf`, `channelsOf`, fire-control repair; autos are allowed in ring slots on a trigger. DepotScene: "Fires on" button row on hardpoint and pod panels + channel line; fire-control part in the cutaway (`L.fireControl`). HUD: schematic `FIRE_CONTROL_BOX`, `Fire ctrl` readout, hints `LMB RMB SPC  fire`.

---

## 6. Damage, power, and the reactor

### Component damage model
`M1` · `initial` · `playtest: pending` · SPEC §5.1
Armor arcs → a weighted internal pick (treads, sensors, reactor, hardpoints) on the seeded RNG; data in `content/chassis.ts`. Damaged hardpoints reload slower and spread more; a damaged turret traverses slower (floors in `DEGRADE`).
- `applyHit` (sim/behemoth.ts) → an optional `strike` focus sends a fraction straight to the treads or a hardpoint (`pickHardpoint`) → armor absorbs the rest → overflow hits one internal via `pickInternal`.
- **Gotcha:** use `damageTreads` (shared across tread sets), not `damageComponent(b, 'treads')`.

### Split front armor
`M2` · `initial` · `playtest: pending` · SPEC §5.1, §15 "Steering and front armor" (step 2 of 3)
The front zone is now front-left and front-right (80 each, as thick as a flank; the old front was 120). A front hit lands on the half on its side of the hull's centerline, so angling the hull puts fire from ahead on the leading corner. Rams and rock faces wear the half that struck.
- `ArmorArc` = `frontLeft | frontRight | rear | left | right`; `ARMOR_ARCS` and `ARC_NAMES` in content/chassis.ts. Use `ARMOR_ARCS` (or `mapArcs` in behemoth.ts) instead of listing arcs by hand. The event `Arc` is `ArmorArc | 'top'`.
- `hitArc(b, fromX, fromY, atX, atY)` (behemoth.ts): the source direction picks front/rear/flank (±45°); a front hit takes `frontHalf(hullSide(b, atX, atY))`, falling back to the source's side dead on the centerline. `hullSide` is the hull-space lateral offset (+ = right). Callers: `projectiles.ts` (the round's position) and the trailer mine blast.
- Rams: `damageFront` (collision.ts) is used by `applyObstacle` and the rock-face scrape. It wears the ram plow first (`wearPlow`), then the struck half. Within `DEAD_CENTER` (0.5 units) of the centerline it splits evenly.
- **Gotcha:** the rock-face contact point comes from `faceContact`, the middle of every rock tile in the face columns across the ground box. The first face tile pushes the hull back, so the others no longer overlap: the old code took that first tile alone (always the topmost, the hull's left), which skewed the face contact and its spark to the left.
- Content: per-half `internals` (fire control 1.25 left / 0.75 right), hardpoint `exposure` per half (pd 1.5 front-right / 0.5 front-left, sponsons 1 on their own side, centered mounts the same on both), outboard tread `exposure` 1 per half.
- Render: HUD `ARMOR_BOX` has two front boxes with a 2 px seam. `BehemothView` has `bh_plate_frontLeft/Right` + `bh_wear_frontLeft/Right` (placeholder.ts splits at the texture's middle row). The cutaway draws front-left on the near glacis and front-right as a far-side strip rising at the nose (x 276). The depot lists zones by `ARC_NAMES`.
- Run save v5: a v4 `front` gives each half the same share of integrity (`V4_FRONT` in runSave.ts holds the old size).

### Power
`M1` · `initial` · `playtest: pending` · SPEC §5.4
Reactor output fills a capacitor; reactor damage lowers output; power gauge on the HUD. `powerOutput`/`capacitorSize` also count auxiliary generators.

### Reactor detonation and self-destruct
`M1` · `initial` · `playtest: pending` · SPEC §5.1, §16 Q9
A destroyed reactor lights a fuse, then a detonation blast (blast kills are counted). Self-destruct: hold X for `DETONATION.selfDestructHold` (1.5 s) when Immobilized or with the reactor ≤25%. Not available after extraction.

### Ammo magazine and cook-off
`M2` · `initial` · `playtest: pending` · SPEC §5.1, §15 "Tank staples", §16 Q12
A core component deep in the hull (Class II: 40 integrity, aft of center) holding the hull's munitions. Destroyed with rounds in it, it cooks off: every hull munitions weapon's ammo goes to 0, and the blast (rounds' combined damage × `MAGAZINE.perDamage` 0.3; a full missile rack ≈ 190) tears 60% (`inside`) into its neighbors and spreads the rest over every armor zone from the inside. Only on destruction, never on hits (user's call). Rounds still in it add to the reactor detonation's radius.
- Content: `CoreComponent` includes `magazine`; `ChassisDef.magazine` `{hp, neighbors}` (Class II: spine 1.5, turret 1, reactor 1, fire control 1, treads 1.5; wrecked or empty ones are skipped and the rest re-weighted); `internals[arc].magazine` (0.3 front halves, 0.4 flanks, 0.6 rear); anchor (-8, 0). `MAGAZINE` and `DETONATION.radiusPerMunition` (0.02/point; full rack +12) in tuning.ts.
- Sim: `magazineRounds(b)` (hull hardpoints with ammo; trailer pods keep their own), `magazineLoad(b)`, `cookOff(b, events)` called from `damageComponent` on the magazine's destruction (after `componentDestroyed`). Event `cookOff {damage, vented}`. A cook-off can destroy the reactor and light the fuse. `detonationRadius` adds the load.
- A destroyed magazine doesn't stop anything else: a trailer ammo bunker still hands loads to hull weapons that ran dry, and the depot rearms as usual. It can only cook off once (it's at 0).
- Render: HUD readout row and `MAGAZINE_BOX` in the schematic; cutaway `L.magazine` (racks of rounds, dark when empty); status sparks/smoke via the core list in statusFx. On `cookOff`: two big explosions at the magazine and a heavy shake, or `Effects.vent` (a flame-and-smoke jet) when vented; sounds `vehicleKill` + `explosion`.
- Depot: repair (`CoreRepair` `magazine`, `DEPOT.perHp.magazine` 1) with its description in `CORE_INFO`. Run save v7 (v6 saves load it intact).
- Practice: `?cookoff=N` destroys the magazine N s in (pair with `?addons=blowoutPanels` to see it vent).
- Bot (8 seeds): firing everything, the magazine was never hit (armor holds); autos only (ground down), it was hit 4–9 times a battle and cooked off in 6 of 8, 2–3 s before the end, once the armor was gone. A late, death-spiral risk, as "deep in the hull" intends.

---

## 7. Enemies and AI

### Light tank (skirmisher)
`M0` · `initial` · `playtest: pending` · SPEC §7
Skirmisher orbit AI (keeps its orbit point on screen), leads its shots, respects line of fire, crushable.

### Fairness pass
`M0` · `initial` · `playtest: pending` · SPEC §7
No fire from off screen, an aim telegraph, rear attackers held in view, a threat-aware camera, bigger light tanks.

### Enemy roster to 4 and the spawner
`M1` · `initial` · `playtest: approved` ("feels perfect") · SPEC §7
Infantry squad (ambushes from cover; rockets bypass armor into the treads), heavy tank (holds ahead, hammers the front), missile launcher (long-lock volleys at hardpoints; PD fodder). Damage vs target class. (The M1 threat-budget spawner was replaced by encounters and the alert clock in M3, below.)
- `content/enemies.ts`: each unit has `targetClass`, `mobility` (tracked/foot), `behavior`, `engage` tuning, `spawn` placement, `threat`.
- Behaviors in `sim/ai/`: `skirmisher` (light tank), `holdAhead` (heavy tank: narrow arc, close; missile launcher: wide arc, far), `ambusher` (infantry → `findCover`, which wraps `bestCover(score)`). Shared steering in `ai/steer.ts`. Enemy weapons can fire salvos (`salvoLeft`); missiles skip the line-of-fire check.
- `threat` per unit: light tank 1, heavy tank 2, missile launcher 1.5, infantry 1 (0.75 until M3's encounters: budgeted posts bought too many cheap squads).
- Bot, 8 seeds: passive with autos is Immobilized at 104–191 s (heavy tanks are the main driver); firing everything survives 5–6+ min. The user was happy with the M1 spawner's density, which the M3 encounters are tuned to match at the opening threat.

### Encounters and the alert clock
`M3` · `initial` · `playtest: pending` · SPEC §4.2, §4.4, §7, §7.2, §10, §15 "Encounters and the alert clock (M3)", §16 Q1, Q22–23
Replaces the M1 spawner. **Defenders are placed by distance**: posts every 550–850 units along the strip, each a group sized from the battle's threat, met as the frame reaches it. **Reinforcements arrive by time**: the alert clock sends a wave at 30 s, then every 28 s shrinking 1.5 s a wave to 15 s, each bigger than the last, so a slow Behemoth meets far more of the enemy. The mix is the doctrine's, shaded by the biome and approach; the doctrine also splits the force between posts and waves. HUD: an Alert gauge in the left panel (next wave and countdown, amber bar, red under 5 s); a "Enemy reinforcements / Wave N" banner at the top of the field for 2.5 s; the attack siren at 0.6 size.
- `sim/encounter.ts`: `Forces { threat, mix, postScale, waveScale }`; `battleForces(threat, doctrine, biome, approach)`, `encounterMix` (doctrine mix × `BiomeDef.forces` × `ApproachDef.forces`); `planDefenders(seed, forces, startX, exitX)` (own stream `hashSeed(seed, 0xde7e)`, so a seed always has the same posts); `createEncounter`; `stepEncounter` (world step, not during the last stand or after extraction) → `stepDefenders` (a post whose x is within `spawnDistance` of the frame's leading edge spawns all its units: troops in cover between the leading edge and `coverDepth` past the post, everyone else on open ground just beyond the frame, stepping forward if a river or rock fills the line) and `stepAlert` (a wave adds `alertWaveBudget(T, n) × waveScale` to a queue capped at `T × cap`; one unit arrives every `trickle` s while live threat leaves room under the cap; troops drop into cover ahead or drive in, vehicles by `sides` weights, `spawn: 'ahead'` units never from behind). `alertInterval(n)`.
- `sim/spawner.ts` is now only placement shared with the last stand: `drawUnit(rng, mix, room)`, `cheapest`, `liveThreat`, `coverSpot(w, from, to)`, `openSpot`, `entryPoint` (moved from lastStand.ts).
- World: `World.encounter: EncounterState { off, waveScale, posts, alert: { wave, next, span, queue, trickle } }`; `WorldOptions.postScale/waveScale`; `spawnTimer` is gone. Event `{ type: 'alert', wave }`. Run: `battleEnemy(run, recipe)` → `Forces` (replaces `battleMix`); the scene spreads it into `createWorld`.
- Doctrine split (`DoctrineDef.posts/waves`): entrenched 1.1/0.5 (dug in, slow to reinforce), raiders 0.7/1.3, others 1/1. Forces: plain approach infantry 0.5, launchers 1.4, heavy 1.2; forest infantry 1.6, launchers 0.7; urban infantry 1.6, light 0.8; pass light 0.7, launchers 1.4; arctic infantry 0.7, heavy 1.2; industrial infantry 1.3; desert light 1.3, infantry 0.6.
- Last stand: its waves now draw from the battle's mix (the doctrine), not a fixed one (`LAST_STAND.mix` is gone); the alert clock pauses while it lasts and resumes after a revive.
- Tuning: `ENCOUNTER` in tuning.ts (`baseThreat` 7, `defenders`, `alert`); `SECTOR_MAP.threatPerLayer` 0.6 → 0.3 (threat now really scales a battle). Debug overlay (`` ` ``) shows `ALERT`, `POSTS`, `THREAT`.
- Bot (8 seeds, stock Class II, driving straight, firing everything at the nearest visible unit). Old spawner at T 7: 8/8 extractions, 220 s, 53 kills, 332 salvage, treads 29%; **the same at T 11** (its spawn interval, not its budget, was the limit). Now, combined arms: T 6 8/8, 200 s, 32 kills, 199 salvage; **T 7 7/8, 234 s, 45 kills, 259 salvage**; T 9 7/8, 228 s, 57 kills; T 12 3/8, 264 s, 89 kills. Doctrines at T 7: armored fist 8/8 (194 s, 30 kills), raiders 8/8 (192 s), long guns 8/8 (201 s), entrenched 6/8 (286 s, treads 14%: hidden squads the bot never targets). Braking all the way (T 7): 3/8 within 400 s, 99 units met (old spawner: 6/8). Autos only: 0/8, dead at ~160 s (as before).
- Tests: `tests/sim/encounter.test.ts` (mix shading and the doctrine split, post layout and determinism, posts appear only when reached and beyond the frame, wave schedule, the cap, entry sides, braking meets more, stops for the last stand and extraction).
- **Gotcha:** tests that want a quiet field set `w.encounter.off = true` (it doesn't stop the last stand's waves). To keep only the posts, push `w.encounter.alert.next` far out; to keep only the waves, empty `w.encounter.posts`.
- **Gotcha:** the cap only holds back wave units: posts spawn whatever is already on the field, and the hull crushing units or leaving them behind frees room.

### Fortress guns, convoy, and hovercraft
`M3` · `initial` · `playtest: pending` · SPEC §4.4, §7, §15 "Battle modes (M3)"
Six units, the first past M1's four (content/enemies.ts; weapons in content/weapons.ts; art in `makeObjectiveUnits`, render/placeholder.ts).
- **Gun emplacement** (110 HP, heavy class, front ×0.5, `emplacementGun`: 18 dmg, 280 range), **weapon tower** (90 HP, front ×0.5, `towerGuns`: 4-round bursts into the hardpoints), **rocket bunker** (120 HP, ×0.6/0.8/1, `bunkerRockets`: pairs at the treads, bypass armor). Behavior `fixed` (`ai/fixed.ts`; `moveEnemy` returns early for `maxSpeed` 0); obstacle `heavy`, so ramming one destroys it at a heavy ram's cost. `spawn: 'objective'`.
- **Armored hauler** (70 HP, medium obstacle, 25 salvage) and **mine layer** (40 HP, light): `weapon: null` (unarmed), behavior `convoy` (`ai/convoy.ts`: up `Terrain.laneY` at `objective.convoySpeed` × (hurt + (1 − hurt) × hp share), keeping `ai.laneOffset`, through `viaFord`). The last stand doesn't swap `convoy` for `besiege`.
- **Hovercraft** (22 HP, light, 90 speed, `hoverGun`, skirmisher behavior for now, threat 1.25): `UnitMobility = MobilityId | 'hover'` (content/terrain.ts). `Terrain.speedAt(…, 'hover')` = 1 over `hoverable` tiles (water, shallows, ice, thin ice), else the tracked speed. `viaFord` returns null for it; the last stand's flow field uses the tracked one. In the raiders' mix (weight 3 of 9) and the river approach's `forces` (×2.5), and Chase's escorts.
- **Gotcha:** `EnemyDef.weapon` and `Enemy.weapon` can be null (convoy). `aimAndFire`, `fireRound`, and the unit view's aim glint skip them.
- **Gotcha:** a unit with `turret: null` in `ENEMY_ART` is drawn as a hull (`unitViews.ts`) unless it's on foot (infantry's squad frames).
- **Gotcha:** `spawn: 'objective'` units never appear in a doctrine mix; `objective.ts` places them.
- Tests: `tests/sim/objective.test.ts` (hovercraft over water, no ford).
- The **command post** (Decapitation's target, unarmed) is in §9 "Directives and sector objectives".

### Field battery (placed artillery)
`M3` · `30a779b` · `playtest: pending` · SPEC §7, §15 "Field artillery (M3)", §16 Q29
A fixed battery dug in near a side of the field. After a 1.2 s aim glint it marks a target zone where the Behemoth is headed and fires four lobbed rounds into it, each landing 2.4 s after it's fired. Steering or a change of speed gets clear; inside 90 units it can't fire at all.
- **Unit** `artillery` (content/enemies.ts): 75 HP, light, `EMPLACEMENT_FACING`, behavior `fixed`, obstacle `medium` (crushable), threat 2, salvage 14, `spawn: 'edge'`. **Weapon** `batteryShells` (content/weapons.ts): reload 7.5, `salvo` 4 × 0.3 s, `barrage: { radius 30, flight 2.4 }`, lobbed shell 12 dmg / 14 blast / 40 tile, `minRange` 90, `maxRange` 330, `strike` hardpoints 0.25.
- **Area fire** (`WeaponDef.barrage`, a reusable targeting type): `aimAndFire` (sim/enemies.ts) leads the turret by `barrageLead` (flight + half the salvo spread) and skips the shot inside the shell's `minRange`. When the windup ends, `markBarrage` fixes the zone (Behemoth position + velocity × lead, clamped to the range band), stores it in `e.ai.zone`, pushes a `Barrage` onto `World.barrages` (`from`, `lands`, `until`) and a `barrage` event. `fireRound` then aims each round of the salvo at a random point in the zone, with `SpawnOptions.speed` = distance / flight so it lands on time.
- **Enemy lobbed rounds** (`stepEnemyRound` → `shellBurst`, sim/projectiles.ts): no collisions in flight, and a burst when spent. The burst hits the Behemoth when its footprint is within the blast radius (on `hitArc` from the shell's travel, falling off to half at the edge), the trailer the same way, and mines. It hits enemy units at `BARRAGE.friendlyFire` (0.5) as a `top` hit, so their rear armor counts; such a kill has cause `friendly`. Tiles take damage through the shared `burstTerrain` with no salvage credit. Point defense intercepts these rounds like any enemy shell.
- **Placement** (`edgeSpot`, sim/spawner.ts): open, dry, not shot-blocking ground within `SPAWNER.edgeBand` (0.28) of the field's width from either side. Posts use it in place of `openSpot`, and alert waves place a battery ahead of the frame (`arrival`). The last stand draws from `mobileMix(w.mix)`, which drops every `maxSpeed` 0 unit. **Breach**: `MODES.breach.fortress.batteries` (1/1/2 by strength) spawn `batteryDepth` (150) behind the wall when the guns are placed (`stepObjective`). They aren't targets.
- **Doctrines**: long guns `artillery: 2.5` (intel "Missiles and artillery"), entrenched 0.75, combined 0.5.
- **Render**: `battery_body`/`battery_turret`/`battery_wreck` (`makeObjectiveUnits`, render/placeholder.ts: an earth berm open at the back, crates, a howitzer with a split trail). `BarrageViews` (render/barrageView.ts): a dashed spinning ring and center tick at depth 5.9 (over the hull and the night veil), an inner ring closing in until `lands`, blinking in the last 0.5 s; the faint fill is a second Graphics at depth 4.4, under the hull. **Audio**: the guns use `cannon` at size 1; the `barrage` event cues `incoming` (synth.ts: a falling whistle over the last 1.6 s of the flight, placed at the zone).
- Extraction clears `World.barrages` with the enemy rounds; `stepWorld` drops zones past `until`.
- **Gotcha:** a zone stays up until `until` even if the battery dies or leaves the frame mid-volley (the rest of the salvo is cancelled, so fewer rounds land than the ring promised).
- **Gotcha:** the zone leads with the Behemoth's *lateral* velocity too, so steering steadily doesn't dodge; a *change* of steering or speed does.
- Bot (8 seeds, T 7, firing at the nearest enemy): long guns ~5.7 batteries and ~4.5 volleys a battle (most die before a second); armor left ~240 holding course vs ~290 steering out of zones. Combined arms: ~0.7 batteries a battle.
- Tests: `tests/sim/artillery.test.ts` (telegraph and zone placement, rounds in the zone and on time, cover doesn't stop them, a dodge misses, minimum range, friendly fire, extraction, edge placement, posts, `mobileMix`, Breach batteries).

### Siege tank (two turrets, survives a ram)
`M3` · `4dff8a5` · `playtest: pending` · SPEC §7, §15 "Siege tank (M3)", §16 Q30
A slow superheavy mini-boss that holds the line ahead. Its main turret is a huge cannon; a twin autocannon on the rear deck picks its own target (a repair drone that's out, then the trailer, then the hull). Too big to crush: a ram hurts it and shoves it aside. A banner and a radio call announce it the first time it's in view.
- **Unit** `siegeTank` (content/enemies.ts): 360 HP, heavy, `SUPERHEAVY_FACING` (0.5 / 1 / 1.6), radius 13, obstacle `heavy`, max speed 30 (reverse 30), `holdAhead` (arc 20, 100–150), threat 4, salvage 45, `ramDamage` 90, `callout`. **Weapons**: `siegeCannon` (26 dmg, blast 8, 280 range, reload 5) on the main turret, `siegeAutocannon` (3 × 3 dmg bursts, 220 range, reload 2.6) on `turrets[0]` (pivot x −9, 140°/s, aim 0.5 s, target `support`). Doctrines: armored fist 0.8, combined 0.2.
- **Multiple turrets** (general, `EnemyDef.turrets: EnemyTurretDef[]`): `EnemyGun` (entities.ts) is a gun's state (weapon, turret, cooldown, windup, salvo, zone). `Enemy` *is* its main gun (it extends `EnemyGun`; it turns on the unit's center), and extra turrets are `Enemy.guns: TurretGun[]` (built in `spawnEnemy`). `aimAndFire` runs `aimGun` for the main gun (a `GunMount` from the def's fields) and for each extra gun. Each has its own traverse, telegraph, reload, line-of-fire check from its pivot (`gunPivot`), and target (`gunTarget`: `behemoth`, or `support` = nearest live drone, then the hitched trailer, then the hull).
- **Survives a ram** (`EnemyDef.ramDamage`; `ramBig` in sim/collision.ts): on first contact it deals `ramDamage × impact × (1 + RAM.gearDamage × ramRating)`, applies the unit's obstacle class to the Behemoth (speed dip, front armor, treads), and sets `ai.ramIn = RAM.again` (0.8 s). While overlapping, it's shoved to the nearer side of the hull at `RAM.shove` (120/s). A ram that finishes it kills it as `crushed`.
- **Callout**: `stepEnemies` pushes `sighted` once (`ai.sighted`) when a unit with `callout` is in the frame and not hidden. The scene shows the callout through the objective banner slot; the audio cues `radio`.
- **Render**: `makeSiegeTank` (placeholder.ts: `siege_body` 32×24 on doubled tracks, `siege_turret` 32×13, `siege_aux` 12×7, `siege_wreck`); `EnemyArt.extra` lists extra turret textures. `EnemyView` positions each at its pivot (rotated by the interpolated heading; its angle isn't interpolated) with its own glint (`showGlint`).
- **Gotcha:** code that needs every gun of a unit must walk `[e, ...e.guns]`: `e.windup`, `e.cooldown`, `e.turret`, and `e.salvoLeft` are only the main gun's. `beyondSight` (conditions.ts) still looks only at the main gun's windup and salvo (firing any gun sets `exposed`, which covers it).
- Bot (armored fist, 8 seeds, firing everything at the nearest unit): T 7 one shows up in 2 battles of 8, T 10 in 6 of 8; it lasts ~14 s from first sight (5–24) and lands 1–3 main-gun hits.
- Tests: `tests/sim/siegeTank.test.ts` (two guns firing on their own cycles, the rear pivot, `support` targeting, a ram at cruise and its damage, a finishing ram, the callout once, doctrines and facing).

### Heavy weapons team (lock-on, guided missile)
`M3` · `7dfa568` · `playtest: pending` · SPEC §7, §15 "Feedback batch (Nov 22, 2026)"
User request: a heavy weapon infantry unit with a longer range, that looks different, with an indicator and a lock-on phase. Two soldiers and a guided missile on a tripod: they dig into cover well off the path like a squad, but fire from 240 (a squad's 115), and paint the hull for 2.2 s before the missile goes.
- **Unit** `weaponsTeam` (content/enemies.ts): 12 HP, infantry class, foot, `canHide`, `ambusher` (walks up to 100 to cover; its lane is 0.7 × fire range off the path, so it sits farther out than squads), turret 120°/s, threat 1.5, salvage 6, `spawn: 'cover'`, `lockOn: { relock: 1.5 }`. **Weapon** `guidedMissile`: one missile, speed 150, turn 3.2, 22 damage, no blast, range 320, reload 8, `sight: true`.
- **Lock-on** (`EnemyDef.lockOn`, general): its aim telegraph is a lock. `aimGun` pushes `lockOn {id, x, y, time}` when it starts; while it runs, a lost line of sight breaks it (`breakLock`, sim/enemies.ts: windup 0, cooldown at least `relock`, event `lockBroken`), and so does any damage (`damageEnemy` calls `breakLock` on a survivor). `MissileSpec.sight`: `blocked` no longer waves a missile through, so a guided missile needs the line to lock and to launch. The windup reveals a concealed team (as for any unit).
- **Mixes**: combined 1, entrenched 2, long guns 1.5; approach `forces` plain 0.6, forest 1.4, urban 1.4, pass 1.3.
- **Render**: `hwt_1`/`hwt_2` (`makeWeaponsTeam`, placeholder.ts: a pale two-tone tube with a lit lens, a sight box, tripod legs, the soldiers); `EnemyArt.squad {prefix, soldiers}` generalizes the squad frames (`unitViews.ts`). `LockViews` (render/lockView.ts, depth 6.3, over the night veil): a red designator line from the muzzle to the hull flickering faster as the lock firms, a pulsing ring on the team, and corner brackets closing from 26 to 12 units on the hull, blinking in the last quarter. **Audio**: `lockOn` (a rising triangle trill, cues.ts/synth.ts) at the team; the launch uses the missile report and the usual missile warning.
- Tests: `tests/sim/weaponsTeam.test.ts` (range, telegraph, doctrines; the lock event and the launch after it; revealed in a wood while locking; a hit breaks it; a wall breaks it and stops a new one).

### Concealment
`M1` · `initial` · `playtest: approved` · SPEC §4.5, §7, §15 "Concealment"
Infantry in forest stay hidden outside the sensor reveal radius (sensor damage shrinks it). Telegraphing, firing, getting hit, and clearing the trees reveal them.
- `sim/concealment.ts` sets `Enemy.hidden` each step (after projectiles) from `def.canHide`, the material's `conceals` flag (`terrain.concealsAt`), `revealRadius(b)` (chassis `revealRadius` × `sensorRangeScale`), and the reveal triggers (windup, salvo, the `exposed` timer set by `fireRound` and `damageEnemy`; durations in `CONCEALMENT`).
- Autos and `missileLockTarget` skip hidden units. The renderer fades them out (0.5 s), flashes white when spotted, and hides threat arrows and the lock bracket.

### Conditions: night and storm
`M3` · `75a116f` · `playtest: pending` · SPEC §3.1, §4.6, §15 "Conditions and events (M3)", §16 Q27
A battle can be fought at night or in a storm (30% of battle nodes, never the opening one). Both work through **sight**: past it a unit is hidden like a concealed squad (not drawn, no auto-target, no lock, no threat arrow) unless it's giving itself away; objective targets always show. The enemy can't open fire from past its own sight either. **Night:** sight 140 both ways, but for 2 s after the Behemoth fires anything but point defense every enemy in range can see it. **Storm** (rainstorm, blizzard, sandstorm, ash storm by biome): squalls close sight in to 110 for both sides, widen everyone's spread up to ×1.6, and slow hovercraft to 55%.
- Content: `content/conditions.ts` (`ConditionId`, `CONDITION_IDS`, `CONDITIONS`: name, intel, banner, per-biome `weight`; `STORM_NAMES`, `conditionName(id, biome)`). Tuning: `CONDITION` in tuning.ts (`chance` 0.3; night `sight` 140, `enemySight` 140, `flashMark` 2; storm `first` [12, 22], `gap` [16, 28], `length` [8, 12], `ramp` 2.5, `sight` 110, `clearSight` 500, `spread` 1.6, `hover` 0.55).
- Sim: `sim/conditions.ts`: `ConditionState {id, flashAt, squall, gust, rng}` (`World.condition`, `WorldOptions.condition`), `createCondition(id, seed)` (squall schedule on its own stream `hashSeed(seed, 0x57a4)`), `stepCondition` (first thing in `stepWorld`; events `squall {rising}`), `sightRadius(w)` (× `autoReach`; null = no limit), `beyondSight(w, e)`, `enemyCanSee(w, e)` (distance less half the hull's length; checked before an aim starts in `aimAndFire`), `behemothMarked`, `markFlash` (in `spawnProjectile` for player rounds and `shootBeam`), `conditionSpread(w)` (storm only), `hoverScale(w)` (in `moveEnemy`). `concealment.ts`: `hiddenNow(w, e)` = `concealed || beyondSight`, used by `stepConcealment` and `spawnEnemy`.
- Map and run: `BattleIntel.condition` (own stream `hashSeed(seed, 0xc0d1, s, node)`, weighted by the sector's biome); `battleCondition(run, override?)`.
- Render: `render/weatherView.ts` `WeatherView` (null when clear): a screen-fixed `RenderTexture` over the field column at depth 5.8 (over units and the hull, under rounds and effects), filled each frame (night 0x04060d at 0.8; storm per-biome color, haze 0.1–0.14 plus up to 0.55–0.72 in a squall) with soft light holes erased in it: the sight (×1.3 radius), night glows on units with `exposed` (fading), plasma pools, and brief glows from `fire`, `beam`, `explosion`, `enemyDestroyed`, `trailerBlast`, `detonation` events. Storm motes (rain streaks, snow, sand, ash) on a Graphics at 5.9, more and faster in a squall. Map badges (moon, raincloud) under the icon's left shoulder; intel "Conditions" field; HUD right panel line under the ground ("Sandstorm - squall"); banners at the start (after the objective's) and per squall; debug line `NIGHT/STORM SIGHT … SQUALL …`.
- Audio: `WeatherLoop` in `audio/synth.ts` (`WEATHER` levels: a wandering band-passed pink-noise wind and a high-passed hiss, both swelling with the squall; a faint wind at night), driven by `Synth.setWeather` from `BattleAudio.update`.
- Bot (8 seeds, stock Class II, the attract-mode autopilot, T 7): clear 8/8, treads 47%, armor 73%, 34 enemy shots; night 8/8, 42%/63%, 50 shots; night with autos off 6/8, 23%/24% (the AP guns are missed more than the dark helps); storm 8/8, 46%/71%. T 10: clear 8/8 39%/55%; night 7/8 34%/35%; storm 7/8 39%/44%. A first cut (enemy spread ×2.5 at a dark Behemoth) barely changed anything: 87 of 88 shots still hit with the autos off.
- Tests: `tests/sim/conditions.test.ts` (content, sight and sensors, hidden past sight and given away, enemy sight and the flash mark, never lining up a shot unseen, the squall cycle and its events, its own stream, a squall blinding both sides, map draw rate and determinism, `battleCondition`), `tests/input/demoBot.test.ts` (clips with conditions).
- **Gotcha:** the veil's `RenderTexture` buffers its commands until `render()`, so every light needs its own `Image` (a pool, `WeatherView.lights`), never one image moved between erases.
- **Gotcha:** objective targets (`e.objective`) are never hidden by a condition, but the enemy-sight rule applies to every unit (fortress guns too).

### Structures pay salvage
`M3` · `7dfa568` · `playtest: pending` · SPEC §8.1, §15 "Feedback batch (Nov 22, 2026)"
User request: bunkers and other buildings pay salvage. `MATERIALS[...].salvage`: bunker 4 → 8, wall 1 → 2, fuel tank 2 (new), tank trap 1 (new); buildings 2, factories 5, wrecks 4, derricks 3 as before.

### Cover and garrisons
`M2` · `initial` · `playtest: pending` · SPEC §4.5, §8.1, §15 "Cover and garrisons"
Infantry garrison buildings: 60% protection (forest 30%), walls stop direct fire, and they fire out of their own tile. Buildings pay 2 salvage each.
- `MaterialDef.protection` + `salvage`, `COVER.preference` (tuning.ts). Buildings are foot-passable cover that conceals. `damageEnemy` scales by `coverProtection(w, e)` (foot only).
- `Terrain.protectionAt/protection/blocksShot`; `lineBlocked` ignores the shooter's own tile; `Projectile.shelter` (+ `SpawnOptions.shelter`, set in `fireRound`) lets a garrison's round leave its building.
- `bestCover` subtracts `COVER.preference × protection` and skips building tiles with no open neighbor toward the hull (`hasWindow`).
- Salvage: `Terrain.damage(..., credit = true)` (enemy `hitCover` passes false), `crush` pays, `takeSalvage()` is banked in `stepWorld`.
- To try it: a town seed with infantry (e.g. `?seed=1`). A garrisoned building usually takes two main-gun shells (24 × 0.4 survives the first). Revealed garrisons draw on top of the roof (placeholder).

### Facing armor on enemy vehicles
`M2` · `initial` · `playtest: pending` · SPEC §7 "Facing armor", §15 "Tank staples", §16 Q13
Vehicles take ×0.75 from the front, ×1 on a flank, ×1.5 from behind (provisional). Infantry have no facing. A flank or rear hit throws extra sparks (a white-hot flash from behind) and a bright "pierce" ring. Vehicles that fall back slowly enough back up, keeping their front toward the Behemoth.
- Content: `EnemyDef.facing?: FacingArmor` (`Record<Facing, number>`, `VEHICLE_FACING` in content/enemies.ts) and `reverseSpeed` (light tank 20, heavy 45 = always backs up, launcher 30, infantry 0).
- `hitFacing(e, dx, dy)` (sim/enemies.ts): from the round's travel direction against `e.heading`, front/rear within ±45°, flank between. `damageEnemy` now takes a `HitFrom`: a direct hit `{dx, dy, x, y}`, `'splash'` (bursts, pools → flank), or `'top'` (a lobbed shell's splash → rear). `facingMultiplier` applies it and emits `facingHit` (flank/rear only). The reactor detonation and trailer blasts don't go through `damageEnemy` (raw damage, like a flank).
- Hull: `Enemy.heading` is now the hull, not the course. `steerHull` swings it at `ENEMY.hullTurnRate` (4 rad/s; infantry snap as before). `Enemy.reversing` keeps hysteresis on both the angle (`ENEMY.reverse.start/stop`, 60°/95° off straight away) and the speed (`speedSlack` 1.25 × `reverseSpeed`).
- Render/audio: `Effects.weakSpot(x, y, rear)`; the `pierce` recipe in synth.ts (`LEVEL`, `MIN_GAP`, `PITCH_SPREAD` entries).
- Hit sounds (f4b61e9, user feedback: hits sounded too high, like plinking): a bullet's `impact` event on a vehicle carries `armor` (the face it struck, from `hitFacing` in `stepPlayerRound`). Cues: front = `ricochet` (a dull clank, and in `RICOCHET_WHINE` 30% of them a falling whine, the one bright hit sound), flank/rear = nothing of its own (the `facingHit`'s `pierce` covers it), no armor (infantry, ground, cover) = `impact` as before. `pierce` is now a gritty crunch, a low plate clang (`PLATE` at ~170 Hz), and a driven thump; no highpass crack or `BAR` ring.
- Bot (8 seeds, firing everything at the nearest unit, battle-0 threat 7), off → on: 8/8 extractions both ways, kills 47.6 → 46.5, salvage 307 → 300, front armor at the end 57% → 52%, treads 43% → 45%. About 39 flank hits a battle and only 0.3 rear: everything chases the Behemoth nose first, and light tanks show their tail mostly while orbiting ahead, right at the edge of the 45° rear arc. Overall a slight nerf (heavy tanks backing up show their front).
- **Gotcha:** test dummies built with `spawnEnemy` face the Behemoth (×0.75). The dummy helpers in weapons/energy/roster tests set `heading = π/2` (broadside, ×1), so damage numbers stay about what they test.

---

## 8. Last stand

### Immobilized last stand
`M1` · `initial` · `playtest: pending` · SPEC §5.1, §15 "Last stand"
Zero treads freeze the frame, stop the defenders and the alert clock (the M1 spawner, at the time), and send escalating waves (drawn from the battle's doctrine mix since M3); every unit besieges the hull. HUD wave/next/held readout; the center message moves to the top of the field; the death message adds time held + waves.
- `sim/lastStand.ts` starts when `b.immobilized` (world step, before the frame); `LAST_STAND` in tuning.ts. `wavePlacement`: infantry infiltrate concealing forest on screen beyond the reveal radius; vehicles come in from the frame's ends.
- `enemies.ts` swaps every behavior for `ai/besiege.ts` (per-unit `siege` ring; `joinSiege` on start and on spawn). `ai/flow.ts`: a BFS field toward the tiles around the hull footprint, rebuilt every 0.5 s; units follow it only while `pathBlocked`. `aroundHull` keeps targets off the hull, and `moveEnemy` treats the stopped hull as solid (`stoppedHull`), which took crush kills from ~10/min to 0.
- Pacing (bot, healthy except treads): autos only 49–65 s; all triggers 78–95 s.

### Last stand from all sides
`M1` · `initial` · `playtest: pending` · SPEC §5.1, §15 "Last stand"
The camera eases back to center the hull (`centerFrame` in sim/frame.ts, `centerRate`): the one backward scroll. `entryPoint(w, def, side)` places wave units by `LAST_STAND.sides` weights; flank units start `flankDistance` beyond the field edge, `moveEnemy`'s clamp lets them move only inward until they're on the field, and the fire gate also needs the center on the field. Threat arrows show on the left/right edges. Autos-only bot: 59–74 s (waves 5–7).

---

## 9. Run loop and saves

### Run loop
`M2` · `initial` · `playtest: pending` · SPEC §3, §15 "Run loop (M2)", §16 Q10
An extraction line ends a battle. Component damage, weapons, ammo, salvage, and kills carry over. Death ends the run. (The linear battle → depot → battle chain, with threat rising per battle, was replaced by the sector map in M3; see below.) Title screen (new run / continue, with a confirm before abandoning).
- `sim/run.ts`: `RunState`, `BehemothSnapshot` ↔ `restoreBehemoth`, `completeBattle`, `leaveDepot`. `RUN` in tuning.ts (battleLength 5000, extractionBonus 25 for a plain battle node).
- World: `exitX`, `extractedAt`, `threat`; `checkExtraction` in stepWorld (enemy rounds in the air die, enemies drop their aims, the spawner stops, no self-destruct afterward).
- Scenes: `TitleScene`, `DepotScene`, `flow.ts` (`RunContext {run, persist}`, `checkpoint`, `endRun`, `enterNode`), `screen.ts` (`fitCamera`, shared by all scenes). The battle scene takes the RunContext via `init`, saves on `extracted`, and clears the save on `detonation`. R = retry battle (after a death in a real run, R or Enter opens the run summary; see "Directives and sector objectives").

### Battle modes: Breach and Chase
`M3` · `initial` · `playtest: pending` · SPEC §3.1, §4.4, §10, §15 "Battle modes (M3)", §16 Q24
Every battle still ends at the extraction line; **Breach** (destroy the fortress guns) and **Chase** (run down a convoy) add targets. Each target destroyed pays a share of the mode's +60 bonus **as it falls** (since Nov 22, 2026, below); a target left behind the frame, or a hauler past the extraction line, is lost.
- **Objective as a percentage** (`7dfa568`, `playtest: pending`; user request: the objective should be a percentage destroyed, more destroyed paying more): `objectiveTaken` banks each share at once through `paySalvage` (source `objective`, so it flies to the hull), and `completeBattle`'s `bonus` is the node's extraction reward alone; `BattleReport.objective.salvage` holds the shares (optional: older saves lack it). `objectivePercent` (sim/objective.ts). HUD `2/4 guns 50%`; banners `Gun destroyed - 50% / +30 salvage - 2 guns left`, `Fortress 75% destroyed / +45 salvage` (or `Fortress breached - 100% / Every gun silenced: +60`); the extraction message `3 of 4 guns destroyed (75%): +45`; map intel `+15 a gun destroyed (4), up to +60` (`objectiveReward` in MapScene, the per-target share once the strength is known); the battle report `Breach: 3/4 guns 75% +45`. Modes are drawn per battle node (Assault 2 : Breach 1 : Chase 1; the opening battle is Assault).
- Content: `content/modes.ts` (`BattleModeId`, `MODE_IDS`, `MODES`: name, goal, weight, bonus, `posts` (multiplier on the doctrine's post size: breach 0.8, chase 0.6), `target` names, `fortress` {at, guns by strength 3/4/5, units, gates, gateWidth}, `convoy` {haulers 3/4/5, layers 1/1/2, escorts 2/3/3, escortMix, speed 1.15, hurt 0.5, spacing, lead 170, mineEvery 2.4, mines 6}). `OBJECTIVE` in tuning.ts (lostBehind 40, escapeBeyond 16, spawnSearch 5).
- Sim: `sim/objective.ts`: `ObjectiveSpec {mode, strength}`, `ObjectiveState {mode, total, destroyed, lost, fortress, convoySpeed}`, `planFortress` (own stream `0xb7e4`; a column whose wall, trap belt, and bunkers clear every river's banks, nearest the wanted chunk), `createObjective`, `startObjective` (the convoy column on the lane via `laneSpot`, escorts from `escortMix`), `stepObjective` (fortress guns spawn when the wall is within `spawnDistance` of the frame's leading edge, facing π; losses; mine laying via `Terrain.layMine`), `objectiveTaken` (called from `destroyEnemy` for `e.objective`), `objectiveSettled`, `objectiveComplete`, `objectiveBonus`. `World.objective`; `WorldOptions.objective`; `createWorld` adds `recipe.fortress` for a Breach. Not stepped after extraction. Events `objective {what, enemy, x, y, done}` and `mineLaid`.
- Terrain: `TerrainRecipe.fortress?: FortressSpec {col, guns, gates, gateWidth}`; `fortressFeature` lays the wall out as a sequence of guns (two-row gaps, `embrasures`) and gates with wall between (gates narrow to 3, then guns drop, only if the field is too narrow); a `fort` `Defense` with `embrasures`. `Terrain.fortress()` → `FortressPlan`, `Terrain.laneY(x)`, `Terrain.layMine(col, row, events)` (bare `ground` only, drawn swept).
- Run and map: `BattleIntel.mode` is a `BattleModeId` (own stream `hashSeed(seed, 0x30de, s, node)`, so other intel fields are unchanged); `battleObjective(run, override)`; `completeBattle` adds `objectiveBonus` to `bonus` and sets `BattleReport.objective {mode, destroyed, total}` (optional; no save bump). The save accepts any `MODES` id.
- UI: HUD left panel `Breach 1/3 guns -1` (amber while open, cyan when all destroyed) above the alert gauge; banners for the goal at the start, each target, and the outcome; amber threat arrows for targets at any distance (`ThreatIndicators`); the extraction message adds "N of M destroyed"; debug line `MODE`. Map: the mode's initial on the icon's left shoulder (never fogged), intel "Mode: Breach: …" and "+60 for destroying all guns", the battle report's objective line. A `mineLaid` puff.
- Practice: `?mode=breach|chase|assault`.
- Bot (stock Class II, T 7, combined, a crude lane-following bot firing at the nearest target): Assault 6/8 extractions; Breach braking for the guns 5/8 (all guns in 5), cruising 4/8; Chase surging 3/8 out, all haulers down by ~15 s every time; cruising, mostly escaped (3 runs got none). Mines cost the blind bot ~36% treads (it drives over them).
- Tests: `tests/sim/objective.test.ts` (map draw and opening, save, objective spec, fortress placement clear of rivers, wall layout incl. a narrow field, guns spawn/face/hold/fire, bonus shares and events, ramming, lost when passed, battle report; convoy layout, pace and slowing, escape, mines, running a hauler down).
- **Gotcha:** `recipe.fortress` is part of `neighborOf`'s cache key; a fortress chunk's features depend on it.
- **Gotcha:** `w.objective.total` for a Chase is the haulers that actually spawned (a lane walled in by buildings can drop one).

### Directives and sector objectives
`M3` · `3471074` · `playtest: pending` · SPEC §3, §3.1, §4.4, §10, §15 "Directives and the run summary (M3)", §16 Q24–26
Three Directives, picked on the title when starting a run, each setting every sector's objective battle: **Decapitation** (Breach plus a command post; destroying it cuts the alert clock), **Interdiction** (Chase: stop 3 of 5 haulers), **Breakthrough** (Assault ×1.3 long, alert ×1.25 fast, extract within par). Taking a sector's objective gives +1 depot action; the last one decides the run: Directive complete (won) or failed (the run ends, the Behemoth alive).
- Content: `content/directives.ts` (`DirectiveId`, `DIRECTIVE_IDS`, `DIRECTIVES`: name, brief, orders, mode, `goal` (`command` | `share {share 0.6}` | `par {slack 1.2}`), objective/final names, `length`, `alertPace`). `DIRECTIVE` in tuning.ts (`sectorReward` 1, `keep {behind 3, cols 3, rows 3}`). Enemy `commandPost` (220 HP, heavy, bunker facing, radius 12, unarmed, `fixed`, threat 4, salvage 40; sprite `post_body`/`post_wreck`, `POST` in placeholder.ts).
- Map: `generateMap(seed, directive)` → `setObjectiveModes` (only objective nodes' `mode` changes; everything else matches `generateMap(seed)`); `objectiveNode(map, sector)`.
- Run (`sim/run.ts`): `RunState.directive/objectives/earned/time`; `newRun(..., directive = directiveFor(seed))` (own stream `0xd1ec`); `isObjectiveBattle`, `battleObjective` (adds `command: true` for a Decapitation objective), `battleLength`, `battleAlertPace`, `battlePar(run, length)` / `parFor(directive, chassis, length)` (length ÷ rated cruise × slack, rounded: 217 s on the Class II), `requiredTargets(share, total)`, `objectiveTakenBy(def, objective, time, par)`, `directiveAsk(directive, chassis)`, `clock(s)`. `completeBattle` records `BattleReport.taken`, appends to `objectives`, adds `sectorReward` to `cache` when taken (not on the last), and sets `next` `won`/`failed` on the final node; it also adds to `earned` and `time`.
- Sim: `ObjectiveSpec.command`, `ObjectiveState.command {x, y, state: waiting|standing|destroyed|lost}` (tallied apart from `total/destroyed/lost`, so the guns' bonus share is unchanged); the post spawns with the guns (`objective: true`, facing π); `objectiveTaken`/`lose` branch on `commandPost`; destroying it calls `cutAlert` (`AlertClock.cut`, queue emptied; `stepAlert` returns early). `AlertClock.pace` (intervals ÷ pace; `Forces.alertPace`, `WorldOptions.alertPace`). Terrain: `FortressSpec.keep`, `Defense.keep {col, rows}` in the lane (`laneCenter`), painted `road` and kept clear of rails (`inKeep`); `colSpan` and `planFortress` (river check, last chunk) reach to the pad; the cache key includes it. `START_X` exported from world.ts.
- UI: title picker (Enter/N opens it; 1–3, arrows, or click to choose, Enter or a second click to roll out, Esc back; the orders wrap below). Map: left panel `Directive` and `Objectives + x -`; objective intel "Objective: <name>", "Directive: <mode>: <ask>", and the reward or "Decides the Directive"; the battle report's "Objective taken: +1 action" / "Objective missed". Battle: opening banner "Sector N objective / <ask>" ("Final objective" on the last); HUD row above the mode's (or in its place): `Command post ahead/standing/destroyed/bypassed`, `Stopped 2/3 needed`, `Par 1:23 left` (warn under 30 s, red over); Alert reads `Cut off`; banners "Command post destroyed / Reinforcements cut off", "Convoy stopped / Objective taken"; the extraction message says the objective was taken or missed, or the Directive complete or failed. `wrapText` moved to pixelFont.ts (title and map).
- Practice: `?directive=…`, `?objective=N` (sector N's objective battle, earlier sectors counted taken), `?summary=won|failed|destroyed`.
- Tests: `tests/sim/directives.test.ts` (draw and naming, map modes, objective-only shaping and asks, the command post's pad/spawn/tally/clock cut/loss, fortress fits before the exit, share and par rules, alert pace, sector reward, the last objective deciding the run, plain battles, summaries, blast's biggest kill, save round trip and v10 migration).
- **Gotcha:** the command post is `e.objective` (amber arrows, lost when left behind) but isn't in `ObjectiveState.total`; check `o.command` for it.
- **Gotcha:** par uses the battle's actual length (`w.exitX - START_X`), so a practice `?exit=` shortens it too.

### Run summary
`M3` · `3471074` · `playtest: pending` · SPEC §3, §5.1, §10
The screen a run ends on: won (Directive complete), failed, or destroyed. Verdict and callsign; the Directive and each sector's objective (taken, missed, lost in this sector, not reached); totals (sectors reached, battles won, kills, salvage earned, time in battle, seed); for a destroyed run, the final blast (kills, the biggest by threat, the last stand) and a still of the battlefield column.
- `sim/run.ts`: `RunSummary`, `RunOutcome`, `FinalBattle`, `summarizeRun(run, final?)` (a destroyed run adds its last battle's kills, salvage, and time). `BattleStats.blastBest` (set in `destroyEnemy` for blast kills).
- `scenes/SummaryScene.ts` (key `summary`, data `SummaryData {summary, shot}` in flow.ts): two columns, three with a still. `flow.enterNode` sends `won`/`failed` here (clearing the save); `showSummary`. MapScene's placeholder win screen is gone (a won or failed run at the map is forwarded).
- Battle scene: on `detonation`, hides the reticle and takes the still `SHOT_DELAY_MS` (450) later with `renderer.snapshotArea` over the field column (texture `summary_shot`; skipped if it fails); the death message waits until then. Then "Enter - run summary" (`Controls.summaryPressed`; R too in a real run, R restarts a practice one).
- **Gotcha:** CDP key presses need a short hold (~250 ms) between keyDown and keyUp, or `JustDown` misses them.

### Title attract mode
`M3` · `initial` · `playtest: pending` · SPEC §10
User request (Nov 2026): the title screen plays short battles in the background.
- `scenes/demo.ts`: `DemoClip` {seed, biome, approach, mode, preroll, length, battleLength, threat, condition}, `DEMO` {length 10, threat 10, fade 0.4, conditionEvery 4: every fourth clip at night or in a storm, by turns, captioned}, `demoClip(i, seed)` (biomes in `BIOME_IDS` order; biome b on pass k gets mode b + k of assault/chase/breach; approach from the seed; preroll 16 s Assault, 5 s Chase, 7 s Breach on a 1100-unit strip so the fortress is near).
- `input/demoBot.ts` `demoCommand(w)`: pure autopilot. Holds the lane (`Terrain.laneY`, 8-unit deadband), aims at the nearest visible target (a mode's targets first), fires main and missiles at anything, the autocannon within 200; surges after a convoy, brakes for fortress guns in sight.
- `DemoBattleScene` (key `demo`, in TopDownBattleScene.ts) extends the battle scene: `init` builds the next clip (a static counter) on a throwaway `newRun`, `persist: false`. Demo mode (`this.demo`): full-width layout (`fullWidthLayout`, no HUD panels), no Controls, HUD, audio, threat arrows, reticle, or cursor change; `prerollDemo` steps the sim ahead (first wave pulled to 3 s after the preroll); `startDemo` sends the scene to the back, captions it, fades in; `updateDemo` steps with the autopilot and fades out then `scene.restart()` after `length` s (sooner after an extraction). Extraction and detonation never touch the run or the save.
- `TitleScene` launches `demo` under itself, stops it on shutdown, and dims it (a 0.2 overlay, a 0.5 band behind the title and menu).
- Tests: `tests/input/demoBot.test.ts` (lane, firing, target priority, surge/brake, clip schedule).
- **Gotcha:** the battle scene's `hud`, `threats` (and `controls`, `audio`) don't exist in demo mode; use `this.hud?.`.
- **Gotcha:** a headless screenshot catches the clip's fade-in partway (the loop barely advances in virtual time), so it looks dark.

### Run save
`M2` · `34a2e0a` (v1) → `18f3b7b` (v4) → `e49aca3` (v5) → `be2d0d4` (v6, v7) → `2764b71` (v8) → `5383dc3` (v9, v10, M3) → `3471074` (v11) → `75a116f` (v12) → `7dfa568` (v13) · `playtest: pending` · SPEC §2
`src/save/runSave.ts`: versioned JSON in localStorage, structural validation, `StorageLike` for tests. Older versions migrate forward.

| Version | Added |
|---|---|
| v1 | Run state, Behemoth snapshot, depot |
| v2 | Add-ons (`addons: {id, hp}[]`) |
| v3 | Trailer (`trailer: {armor, bays}`; drone `loads` needed no bump) |
| v4 | Bindings (`binding: Binding \| null`, null = default) + `fireControl` |
| v5 | Front armor split (`frontLeft`/`frontRight`; a v4 `front` splits evenly) |
| v6 | Main-gun shells (`shell: ShellType \| null`, null = default) |
| v7 | Ammo magazine (`magazine: number`; a v6 save starts it intact) |
| v8 | Component grades and mods (`grades`, `mods`; depot `grades` for sale) |
| v9 | Sector map (`map`, `at`, `path`, `cache`; `next` is `map/battle/depot/won`; depot `total`). A v8 run goes to the foot of a fresh map from its seed (a run at a depot keeps it) |
| v10 | Callsign (`callsign: string`); a v9 run gets the one its seed draws (`callsignFor`) |
| v11 | Directive (`directive`, `objectives: boolean[]`, `earned`, `time`; `next` adds `failed`). A v10 run takes the Directive its last objective's mode matches (breach → decapitation, chase → interdiction, assault → breakthrough; a valid `directive` already in the file wins), every objective is set to that mode, and the sectors behind it count as taken (`fromV10`) |
| v12 | Conditions and events (`BattleIntel.condition`, optional `shift`; `MapNode.event`; `next: 'event'`; `lastEvent`). A v11 run keeps its map as drawn: every battle clear (`condition: null`), no events (`event: null`), `lastEvent: null` |
| v13 | One front Plate mod (`armor.front`) and the treads' `load` track. `fromV12` merges `armor.frontLeft`/`armor.frontRight` Plate levels into `armor.front` at the higher one (no refund) |

### Score list
`M3` · `7dfa568` · `playtest: pending` · SPEC §10, §15 "Feedback batch (Nov 22, 2026)"
User request: a score list with the Behemoth's (demon) callsign on the title screen.
- `sim/scores.ts`: `ScoreEntry {callsign, score, outcome, reached, sectors, directive, seed, date}`, `runScore(summary)` (`SCORE` in tuning.ts: kill 10, salvage 1, battle 100, objective taken 250, Directive complete 1000), `scoreEntry`, `addScore(list, entry, keep)` (best first; a tie goes below; `rank` or null).
- `save/scores.ts`: key `behemoth-protocol/scores`, `{version: 1, scores}` (`SCORE.keep` 10), `parseScores` (drops entries that don't validate), `loadScores`, `recordScore(summary, storage, date)`. `browserStorage` and `safe` are exported from runSave.ts for it.
- Recorded once per real run as it ends (`flow.recordRun`, never for practice runs): in `enterNode` for won/failed, and at the `detonation` event in the battle scene (`final`, so closing the tab during the blast still counts; `toSummary` reuses it). `SummaryData.rank`.
- UI: the title's "Top runs" block under the menu (`TitleScene.scoreList`, `SCORE.shown` 5; fixed-width columns: rank, callsign (the longest is 14), score, Complete/Failed/Destroyed, `Sector n/3`, date; the best in amber; nothing until a run has ended). The summary's totals add `Score` and `Best run yet` / `#n on the list`.
- Tests: `tests/save/scores.test.ts` (the formula, ranking and the cut, save round trip, bad files, no storage).

### Sector map
`M3` · `initial` · `playtest: pending` · SPEC §3, §3.1, §7.2, §15 "Sector map (M3)", §16 Q19–21
3 sectors × 6–8 layers of battle and depot nodes, a biome per sector, branching routes with intel (ground, defenders, strength, mode, reward) and fog. Replaced M2's linear battle → depot chain and `battleRecipe`'s every-two-battles rotation. Flow: title → map → battle or depot → map …; the last sector's objective decides the run by the Directive (see "Directives and sector objectives").
- `sim/sectorMap.ts`: `generateMap(seed)` → `SectorMap { sectors: Sector[] }`; `Sector { biome, layers, nodes }`; `MapNode { id, layer, col, kind, next, battle }`; `BattleIntel { seed, approach, doctrine, mode, strength, threat, salvage, cache, fog, deep }`. `reachable(map, at)`, `isFinalNode`, `onRouteFrom`, `hiddenIntel(intel, near, sensorsGen)`, `depotKey(pos)`, `samePos`, `nodeAt`. Generation: `sectorBiomes` (`SECTOR_MAP.firstBiome`, `BiomeDef.earliestSector`), random walks (`walks` 3 over `columns` 4, a walk turning onto another's crossing edge goes straight), `assignKinds` (greedy, then **redrawn up to 40 times** until `brokenRoutes` is 0), `battleIntel` (per layer, approaches drawn without replacement).
- `sim/run.ts`: `RunState.map/at/path/cache`, `RunNext`; `enterMapNode(run, pos)` (refuses unreachable nodes; a depot opens with `depotKey` stock and the caches added to `actions` and `total`); `currentNode`, `currentBattle` (falls back to the opening battle when `at` is null, e.g. a bare `newRun` in tests), `currentBiome`, `battleSeed`, `battleRecipe`, `battleThreat`, `battleEnemy` (see "Encounters and the alert clock"); `completeBattle` pays `intel.salvage` (in `BattleReport.bonus`), adds the cache, and sets `next` to `map`, `won`, or `failed`; `runWhere` for the title.
- `content/doctrines.ts`: `DOCTRINES` (combined, armoredFist, entrenched, raiders, longGuns): `mix` and map `weight`. `World.mix` (`createWorld({ mix })`, default combined) drives the defenders and waves (see "Encounters and the alert clock").
- `sim/depot.ts`: `openDepot(run, s, key = run.battle)` (stock streams seeded by `key`; Gen 3 gating still by battles won); `DepotState.total` (pips).
- `scenes/MapScene.ts`: status panel (salvage, battles, kills, caches, the Behemoth's callsign and its note, its condition from `restoreBehemoth`, last battle; the "Then:" biome list wraps), the sector drawn as a field map (see "Sector map art"; taken edges cyan over a dark edge, other routes inked dashes, bolder out of the current node; choices in pulsing numbered frames, the current node ringed), the intel panel for the hovered or selected node (depots one step away list their weapons; every line wraps to the panel width, `INTEL_W`/`CHAR_W`, since a Chase or Breach goal ran off the screen's edge). Click or 1–9 to select, click again or Enter/Space to go, A/D or arrows to cycle, Esc to the title. `flow.enterNode` routes `map` here (`won`/`failed` go to the summary).
- Depot header: sector and biome, and the supply-cache bonus; the leave button reads "Roll out". `TitleScene` shows `runWhere`.
- Tuning: `SECTOR_MAP` in tuning.ts (sectors 3, layers [6, 8], depotChance 0.3, maxBattleRun 2, threatPerLayer 0.3 (0.6 before the alert clock), strong {0.3, +2, +40}, objective {+3, +100}, cacheChance 0.2, fog far {approach 0.25, doctrine 0.6, strength 0.4, reward 0.5}, deep 0.12).
- Route stats (500 maps, random routes): 21 nodes a run, 12.5 battles, 8.5 depots, 2.5 strong battles.
- Tests: `tests/sim/sectorMap.test.ts` (determinism, biomes, structure, no crossings, kind rules on every route, intel, reachability, fog), `tests/sim/run.test.ts` (entering nodes, depot caches, sibling stock, rewards, the win, doctrine mix), `tests/save/runSave.test.ts` (v9 round trip, v8 migration, broken maps).
- **Gotcha:** practice runs (`BootScene`) call `enterMapNode` on the opening battle before going in, so a practice battle has a node; `?depot=N` opens its depot at that node (leaving it goes to the map).
- **Gotcha:** the save rejects `next: 'battle'` with `at: null`; `next: 'depot'` with no node is allowed (a practice or migrated depot).
- **Gotcha:** the map is drawn for the sector of the reachable nodes, so after an objective it already shows the next sector.

### Events
`M3` · `75a116f` · `playtest: pending` · SPEC §3.1, §8.3, §15 "Conditions and events (M3)", §16 Q28
Map nodes that are a short text choice instead of a battle: about 22% of battles that aren't an entry or an objective (about 2 on a route through a run). The event screen shows the scene, the Behemoth's state, and 2–3 options with hints; the drawn outcome is applied and saved at once, then shown. Six events: abandoned convoy, intercepted orders, derelict war machine, ammunition dump, stray supply drop, scavengers (details in SPEC §8.3).
- Content: `content/mapEvents.ts` (`MapEventId`, `MAP_EVENT_IDS`, `MAP_EVENTS`: title, text, teaser, options {label, hint, cost?, outcomes {weight, text, effects}}; `EventEffect`: `salvage`, `damage`/`repair` {part treads/armor/sensors, share}, `rearm`, `cache`, `reveal`, `threat` {amount, scope next/sector}). Tuning: `SECTOR_MAP.eventChance` 0.22, `eventFog` 0.5.
- Map: `NodeKind` adds `'event'`; `MapNode.event: EventIntel {id, seed, fog} | null` (null for every other kind); `placeEvents` in `generateMap` (own stream `hashSeed(seed, 0xe7e7)`, after every sector's intel, so other nodes are unchanged; a shuffled bag, siblings never the same); `hiddenEvent(intel, near, sensors)`, `revealSector(map, s)`; `BattleIntel.shift?` (threat an event moved).
- Sim: `sim/mapEvents.ts`: `currentEvent`, `canChoose`, `drawOutcome(seed, id, option)` (`hashSeed(seed, 0x0e7c, option)`), `chooseEventOption(run, option)` (pays the cost, applies the effects to cloned snapshot and map, `next: 'map'`, sets `lastEvent`), `changePart`, `rearmAll` (hardpoints and bunkers, not drones), `shiftThreat` + `nextBattles` (the first battle on every route, past depots and events), `effectLines`, `lastEventOutcome`. Run: `RunNext` adds `'event'`; `RunState.lastEvent: EventReport {id, option, outcome} | null`; `enterMapNode` opens an event; `runWhere` "at an event".
- Scenes: `scenes/EventScene.ts` (key `event`; 1–3, arrows/W/S, or click; Enter or a second click to decide; Enter or click to continue (armed 250 ms after the choice); Esc to the title). `flow.enterNode` routes `event` there. Map: the `event` icon (`mapArt.ts`: an amber hazard diamond on a post over the biome's ground), intel "Event: <title>" and its teaser ("unknown contact" while fogged), the last event's lines in the left panel, *Alerted +N* / *Weakened -N* under a battle's strength.
- Practice: `?event=<id>` (see the table in §1).
- Tests: `tests/sim/mapEvents.test.ts` (content and font glyphs, placement rules and rates, no sibling repeats, fog, entering, choosing and determinism, cost, driving on, a mined convoy, each effect, `nextBattles`, effect lines, save round trip and rejection, v11 migration).
- **Gotcha:** a test or practice run can make any node an event by setting `kind`, `battle: null`, and `event`; the save requires `event: null` on every non-event node.

### Sector map art
`M3` · `initial` · `playtest: pending` · SPEC §10, §15 "Callsigns and the map's look (M3)"
User request (Nov 2026): large terrain icons on the nodes and a map that looks like a real one. Render-only, placeholder art in code.
- `render/mapArt.ts`: `makeMapIcons` (called from `generatePlaceholderArt`) builds `mapicons_<biome>` sheets of 26×26 frames (`MAP_ICON`) named by `MapIcon`: the five approaches (`plain`, `forest`, `urban`, `river`, `pass`), `mix` (the biome's own: farmhouse, snowfield, factory, dunes and derrick, crater and wreck), `depot` (workshop, hazard-striped door, cyan light, crane), `fog` (cloud with a question mark), `event` (an amber hazard diamond on a post over the biome's ground, tire tracks). Drawn in the biome's tile palette (`biomePalette` from tileArt.ts) on a ground oval, then a 1-pixel ink `outline` pass.
- `makeMapBackground(scene, key, { w, h, biome, seed, clear, routes, grid })`: the sector's sheet as a canvas texture: paper per biome (`LOOK`), value-noise elevation (`fbm`) with contour lines (every fourth bolder) and lakes, a vegetation noise for woods, a river across the sheet (a dotted dry wash in the desert), faint grid lines, paper grain, darkened edges, then map symbols (trees in the woods, hill marks up high, the biome's scatter, a few settlements) kept off the nodes and routes, and a north arrow.
- `MapScene`: the sheet fills `mapRect()` (x 136 to width − 166, y 6 to height − 18), framed, with grid references (letters across, numbers down) and the arrow's N as text; lanes are spaced up to `MAX_LANE` 56. A node shows `iconFor(node, hidden)`: its approach, `mix` for none, `fog` while the approach is fogged, `depot`. Battles carry a defenders badge on the icon's shoulder (red; amber when strong; bigger for the objective; normal while strength is fogged). Visited nodes are drawn at half alpha.
- Seeded from `hashSeed(run seed, 0x3a95, sector)`, so a sector's sheet is the same every visit.
- **Gotcha:** the sheet texture (`map_sheet`) is rebuilt on every `create()` (`canvasTexture` replaces it); it's about 270×300 pixels, value noise uses precomputed lattices, so it's quick.
- **Gotcha:** at `?res=480` the lanes squeeze to fit (about 42 apart) and the map is narrow; tuned at 576.

### Callsigns
`M3` · `initial` · `playtest: pending` · SPEC §3, §15 "Callsigns and the map's look (M3)"
User request (Nov 2026): every run's Behemoth gets a callsign, a true historical name of a devil or demon.
- `content/callsigns.ts`: `CALLSIGNS` (74: the *Ars Goetia*'s spirits, scripture and Jewish and Christian lore, the *Dictionnaire Infernal*, Mesopotamian, Zoroastrian, Egyptian, and Japanese names), each with `source` and a short `note` (at most 30 characters, so it fits a line of the map panel; tested).
- `sim/run.ts`: `callsignFor(seed)` (its own RNG stream, `hashSeed(seed, 0xca11)`); `RunState.callsign`, set by `newRun`. Save v10.
- Shown on the map's status panel (with the note), the battle HUD's schematic header (was "Systems"), the depot header, the title's continue line, and the death message ("<name> is lost").
- Tests: `tests/sim/run.test.ts` "callsigns", `tests/save/runSave.test.ts` (v9 migration).

---

## 10. Depot

### Depot
`M2` · `initial` · `playtest: pending` · SPEC §8.2, §15 "Depot (M2)"
Actions (repair, rearm, install/remove from a seeded stock of 4–5) cost salvage plus one of 5 actions (`DEPOT.actions`; was 3 until Nov 2026, 0591825, playtest: pending). Full repair per action, priced by damage; armor is one action for every zone; install costs an action, remove is free. A side-on cutaway with clickable parts.
- `content/depot.ts` (`DEPOT_WEAPONS` pool with price/weight/roundPrice; `DEPOT` tuning in tuning.ts). `sim/depot.ts`: `openDepot` (seeded per depot), `quote` → cost or reason, `applyAction` (pure), `fits` = exact size match. `RunState.depot` is opened by `completeBattle`, cleared by `leaveDepot`, and validated in the save.
- `render/cutaway.ts` draws the cutaway (per-chassis `LAYOUTS`, `onHull` → armor). `DepotScene`: priced buttons with reasons, undo (Z), Enter twice to leave with actions unused, saves after every action.

### Resale
`M2` · `initial` · `playtest: pending` · SPEC §8.2
Taking a part off pays back 65% of its depot price × condition (`DEPOT.resale`, floored; a wreck pays 0; mounts use their hardpoint's, pods their launcher's). Add-ons sell together with their mount weapon or trailer modules. An install or module swap credits the displaced part (net price; affordability uses the net). A `quote` with `salvage` < 0 is a payout (`payout` helper); buttons show `+N`.

### Partial repair
`M2` · `initial` · `playtest: pending` · SPEC §8.2
When the salvage left can't cover a full tread (any set) or armor repair, it patches as many whole points as it can buy (still one action). Armor gives every zone the same share of its damage. `Quote.partial`; labels "Repair treads to N%" / "Re-plate N% of the damage".

### Component upgrades (grades and mods)
`M2` · `initial` · `playtest: pending` · SPEC §5.6, §8.2, §15 "Component upgrades (M2)", §16 Q15
Core components come in Gen 1/2/3: a higher grade, found in the depot's stock, replaces the part (whole; the old one sells back) and is better but heavier. Parts take leveled mods (harden, traverse, plate, cap bank, load; up to 3, an action a level), always on offer. Run save v8.
- **Nov 22, 2026** (`7dfa568`, `playtest: pending`; user requests): a treads **Load** track (`TRACKS.load`: +8% capacity a level, 3 t; `DEPOT_TRACKS.load` 40/60/90; `PartKind` `treads`, which also takes Harden; `fitChassis` multiplies `massCapacity` by it), and **one Plate for both front halves**: `armorPart(arc)` files both under `armor.front`, `armorArcsOf(part)`, `ARMOR_PARTS` (content/upgrades.ts); `partMax`/`scaleHp` (sim/depot.ts) cover every arc of a part; the depot's armor panel shows the two halves on one Plate button. Save v13. Tests in `tests/sim/upgrades.test.ts`.
- Content: `content/upgrades.ts` (`GRADES` multipliers per core component and gen, `TRACKS` with `on: PartKind[]`, `Upgrades {grades, mods}`, `NO_UPGRADES`, `armorPart(arc)` = `armor.<arc>`, `gradeName`); prices in `DEPOT_GRADES` (with `minBattle`: Gen 3 from the second depot) and `DEPOT_TRACKS` (per level) in content/depot.ts; `DEPOT.gradeStock`, `DEPOT.maxModLevel` in tuning.ts. New optional chassis fields set only by grades and mods: `sensorReach`, `fireControl.spread`, `magazine.cookOff`, `HardpointSlotDef.traverse`.
- Sim: `sim/upgrades.ts` `fitChassis(base, upgrades)` returns the chassis with everything applied (returns `base` itself with no upgrades); `upgradeMass`, `modLevel`, `modScale`, `CORE_COMPONENTS`. `createBehemoth(..., upgrades)` builds from the fitted chassis and keeps `b.upgrades`; `loadMass` adds `upgradeMass`; `autoReach(b)` (sensor damage × grade reach) replaces `sensorRangeScale` for auto weapons; `fireControlSpread` and `cookOff` apply their grade; `mountTraverse` applies `slot.traverse`. A ring's traverse mod is filed under its main slot id and speeds the `TurretDef`.
- **Gotcha:** `b.chassis` is the *fitted* chassis. In depot and render code use `fittedChassis(s)` (sim/depot.ts), not `CHASSIS[s.chassis]`, for any maximum or rating; `CHASSIS[...]` is still right for geometry and for which add-ons fit.
- Snapshot: `BehemothSnapshot.grades` / `.mods`; `DepotState.grades: DepotGradeItem[]` (own RNG stream `0x9e4d`, so the other stock is unchanged). Depot: actions `installGrade` (reason `Gen N fitted` for a grade at or below) and `mod` (`Doesn't apply`, `Maxed`, `Fixed weapon`); `tracksOf(s, part)` / `partKind`; `coreMax`; resale of a core part = its grade's price + its mods (`modsSpent`); a mount add-on resells and drops its slot's mods. A mod keeps the part's share of integrity (`partMax`/`scaleHp`).
- UI: stock rows (`Gen 2 reactor  +15t  upgrade`); a grade panel with before>after stats (`coreStats`) and a Replace button; core panels show `Gen N`, their stats, mod buttons, and "Replace with" grades for sale; hardpoint panels a mod row (half-width `modButton`s, short reasons via `SHORT_REASON`); the armor panel a Plate button per zone. The cutaway draws a glow pip per grade over Gen 1 on core parts and frames the part a selected grade replaces.
- Practice: `?grades=reactor:3,fireControl:2`, `?mods=turret.traverse:3,armor.frontLeft.plate:2`, and `?depot=N` (opens the depot after N battles with 1000 salvage).

---

## 11. Add-ons, trailer, and drones

### Add-ons: plow, outboard treads, sponsons
`M2` · `initial` · `playtest: pending` · SPEC §5.5, §15 "Add-ons (M2)"
Armored prow (now the ram plow, below), outboard treads (a second tread set: more capacity, wider hull), left/right sponsons (an M hardpoint each). Shown on the sprite, schematic, and cutaway; 1–2 offered per depot.
- `content/addons.ts` (`ADDONS`: plow / treads / mount kinds), `ChassisDef.addonMounts` (slot, `widen`, anchors).
- `sim/behemoth.ts`: `b.addons`, `hardpointSlots` (chassis + add-on slots), `treadSets` / `treadDrive` (hp-weighted speed scale) / `treadIntegrity` (total, for the HUD), `hullWidth` (footprint, AI, deflect), `ramRating`, `pickTreadSet` / `damageTreads`. Immobilized only when every tread set is gone.
- Depot: `DepotState.addons`, `installAddon` / `removeAddon`, add-on repairs (`perHp.plow`), `slotsOf`; `loadOf` restores a Behemoth (previews go through `applyAction`).
- Render: outboard pods, the plow (charred stub), and sponson housings in `BehemothView`; schematic 48×60 with per-slot boxes (`SLOT_BOX`, `ADDON_BOX`); cutaway belt/prow/sponson boxes.
- Includes a 56-wide-hull rock regression test (no crumbles).

### Ram plow
`M2` · `initial` · `playtest: pending` · SPEC §5.5, §15 "Steering and front armor" (step 3 of 3)
The armored prow, renamed (it clashed with the Prow hardpoint) and made ram-only. Fire skips it; rams, plowing, and rock-face scraping wear it first, then spill into the struck front half. 80 integrity, ram gear 0.6, 35 t, 120 salvage (was 40 t, 150).
- `PlowAddon` (`kind: 'plow'`, id `ramPlow`) replaces `PlateAddon`. `wearPlow(b, amount, events)` (behemoth.ts) emits `componentDamaged` (HUD flash, alarm check) and `componentDestroyed`; `damageArmor(b, arc, amount)` is now the zone alone (no events argument).
- Render: `BH.plow`, `bh_plow`/`bh_plow_stub`, cutaway `L.plow`; `BehemothView.onRam()` (on `collision` events) shakes and flashes `plowPlate`. Depot stats: "Takes 80 ram damage (not fire)". `DEPOT.perHp.plow`.
- Run save v5 renames `armoredProw` to `ramPlow` on the Behemoth and in the depot stock.
- Bot numbers are in SPEC §15 "Steering and front armor": it still lifts end-of-battle front armor from ~48% to ~82% (rams hit hard), and it loses only 15–30 integrity a battle.

### Blowout panels
`M2` · `initial` · `playtest: pending` · SPEC §5.1, §5.5
An add-on (10 t, 100 salvage, 30 integrity): while intact, a magazine cook-off vents up through the deck. The rounds are still lost, but nothing inside or in the armor is hurt; the panels blow off (destroyed) and protect nothing until repaired at a depot. Incoming fire never picks them.
- `PanelsAddon` (`kind: 'panels'`), `DEPOT_ADDONS.blowoutPanels`, `DEPOT.perHp.panels`, `addonMounts.blowoutPanels` anchors (-8, ±8).
- The spec's "only the top armor takes a share": the hull has no top zone, so the panels themselves take it (they're spent).
- Render: `bh_panel`/`bh_panel_open` (BH.panel) either side of the spine in `BehemothView`; schematic boxes beside the magazine; cutaway `L.panels` (a plate in the deck between the spine and the turret; open hatch when blown).

### Dorsal turret ring
`M2` · `initial` · `playtest: pending` · SPEC §5.2, §5.5
`ADDONS.dorsalRing` (25 t; the slot id = the add-on id), `addonMounts.dorsalRing { turret: ring 'dorsal' at x −14, 90°/s; hardpoint 'dorsalRing' L }`, `DEPOT_ADDONS` 180. A smaller `bh_turret_dorsal` (+ stub) via `TURRET_ART`, drawn raised over the main ring. HUD schematic box between the flanks; cutaway box on a pillar (`deck`) over the spine.

### Coaxial mount
`M2` · `initial` · `playtest: pending` · SPEC §5.2, §5.5
`ADDONS.coax` (mount, 5 t), `addonMounts.coax` (slot 'coax' M, ring 'main', hull [10, 5]), `DEPOT_ADDONS` 60; fires where the turret points. Non-main ring slots are drawn inside their ring's rig (`Mount.onRing`). Add-on slot parts are picked before built-in ones in the cutaway.

### Trailer
`M2` · `initial` · `playtest: pending` · SPEC §5.5, §15 "Trailer (M2)"
A frame (armor, mass) with 2 module bays; modules install like weapons. It's a physical target behind the hull. Hold Q to jettison it: it becomes a proximity mine in the track. Wrecked in tow, it cooks off (the hull's rear takes a share); the blast grows with its contents. Modules: missile pod, ammo bunker, auxiliary generator (and the drone bay below).
- Content: `content/trailer.ts` (`TRAILER_MODULES`: pod / bunker / generator / droneBay kinds; `DEPOT_MODULES`), the `trailer` add-on (`TrailerAddon`; hitch in `addonMounts.trailer`), `podMissiles` weapon (not sold), `MASS.towed` 0.5, `TRAILER_MINE` in tuning.ts.
- `sim/behemoth.ts`: `b.trailer: TrailerState` (pose, armor, `frame` = the add-on's integrity object, `bays: BayState[]`, status hitched/jettisoned/wrecked), `hitched(b)`, `placeTrailer`/`hitchPoint`/`trailerToWorld`/`inTrailer`. Pods are hardpoints `bay0`/`bay1` (position `'trailer'`; a pod bay's integrity IS its hardpoint's). `loadMass` counts the towed share.
- `sim/trailer.ts`: `stepTrailer` (follow, bunkers, jettison, wreck), `hitTrailer`, `trailerBlast`, `stepMines` (`w.mines`), `triggerMine`/`mineAt` (projectiles.ts checks them; splash triggers too).
- Jettisoned/wrecked trailers drop out of the snapshot. Depot: `installModule`/`removeModule`, `bayPart`, trailer armor in `repairArmor`, bunker rearm per load; `fits` refuses pod slots.
- Render: `render/trailerView.ts`, `TR` + `tr_*` textures, `trailerPartAt` + trailer components in `ComponentFx`, HUD schematic trailer box + readout + LOST/RELOAD/DROPPED, cutaway trailer at negative x (`cutawayRear`).

### Drone bay
`M2` · `initial` · `playtest: pending` · SPEC §5.1, §15 "Drone bay (M2)"
A trailer module with 2 repair drones. They patch the most worn tread set from a 45 HP per-battle pool, draining 1 power/s each while out. Stray rounds and trailer blasts kill them; depots replace them. Once a battle they can revive an Immobilized Behemoth (~6 s of work under fire), which ends the last stand.
- `DroneBayModule` (content/trailer.ts: drones, pool, repairRate, launchBelow, power, droneHp/speed/radius, revive {work, fraction}); `moduleLoads(def)` = a bunker's loads or a bay's drones. `BayState.loads` = drones left, `BayState.pool` = per-battle repair HP (full at every `createBehemoth`/restore).
- `sim/drones.ts`: `stepDrones` (runs after the weapons, outside the `!destroyed` block), `Drone` entities in `w.drones` (docked drones aren't entities), `w.revive {work}` / `w.revived`, `droneAt`/`damageDrone` (enemy rounds check drones first), `blastDrones`. Drones hover `OUTBOARD` 4 units outside the pod anchors, or the hull edge would shield them.
- Revive → `endLastStand(w)` (lastStand.ts) → `leaveSiege` (ai/besiege.ts) resets every unit's AI memory. `hullToWorld(b, p)` is exported from behemoth.ts.
- Render: `render/droneView.ts` (`DroneViews`: sprite + shadow, sparks while working), `drone` + `drone_shadow` + `tr_droneBay` textures, HUD `drones` row (`2/2 45HP`, or `REV n%`), revive bar and messages, `droneLost` puff, cyan flash on revive.

---

## 12. Rendering, HUD, and effects

### Placeholder art and font
`M0` · `initial` · `playtest: n/a` · SPEC §11.1, §11.2
Pixel art generated in code (`render/placeholder.ts`); a modular Behemoth (treads, hull, reactor glow, turret, barrel); a 3×5 pixel font. `ENEMY_ART` maps unit → textures; infantry has one image per soldiers left (`inf_1..4`).

### Biome tile sheets
`M3` · `initial` · `playtest: pending` · SPEC §4.6, §11.1
Terrain art moved from placeholder.ts to `render/tileArt.ts`: a tile sheet and a raised-overlay sheet per biome (`tileSheet(biome)`, `clumpSheet(biome)`, keys `tiles_<biome>`, `clumps_<biome>`), drawn from the same recipes with `BIOME_PAL` overrides (snow and snowy pines, cinders and scrub, sand and sandstone, ash and dead trees). Frames for every new material (craters, teeth, wall, bunker, swept mine, girder/plank decks, crops, ice, thin ice with cracks, drift ridges, sawtooth factory roofs, tank pads, rails, dune ridges, wadi beds, derrick pads, wrecks, glass) and overlays `hedge0/1`, `tank0`, `tank_damaged`, `derrick0`, `derrick_damaged`. `TerrainView` picks the sheets by `terrain.recipe.biome`. Scene effects key on `MATERIALS[ev.mat].debris`; `bridgeCollapse` is a collapse plus a big splash; sounds the same way in `audio/cues.ts` (`CueContext.tile` is gone).

### Juice
`M0` · `initial` · `playtest: pending` · SPEC §11.3
Muzzle flash, recoil, screen shake, explosions, scorch/wreck decals, tread marks, dust, damage smoke, hit flash. Infantry die with a puff, no fireball.
- **Gotcha:** Phaser's `cam.shake` intensity scales with camera size × zoom², so always shake via the scene's `shake(ms, gamePx)` helper.

### Salvage pickups
`M3` · `7dfa568` · `playtest: pending` · SPEC §8.1, §15 "Feedback batch (Nov 22, 2026)"
User request: salvage travels from what was destroyed to the Behemoth, to show when it's gathered.
- Sim: every payout goes through `paySalvage(w, x, y, amount, source)` (sim/salvage.ts), which banks it and pushes `salvage {x, y, amount, source: unit | tile | objective}`. `destroyEnemy` pays the unit's salvage; the world banks `Terrain.takeSalvageDrops()` (each razed tile at its center; `takeSalvage()` still sums them, for tests); `objectiveTaken` pays the objective share.
- Render: `SalvageMotes` (render/salvageView.ts, ADD-blended Graphics at depth 6.4): one mote per ~4 salvage (1–8), a short scatter, then homing on the hull's interpolated center at up to 420 units/s; a `+N` tag rises over pickups of 5 or more (objective shares in hot amber). `inFlight()` is held back from the HUD's Salvage line until it lands (`Hud.update(w, dt, pending)`); landing plays `pickup` (a small bright tink; `BattleAudio.pickup`). With the hull gone they drift and fade. The attract mode shows them too.

### Off-screen threat indicators
`M0` · `initial` · `playtest: pending` · SPEC §7, §10
Arrows at the field edges for off-screen enemies (left/right edges too during the last stand); hidden for concealed units.

### Smooth rendering
`M1` · `initial` · `playtest: pending` · SPEC §11.1
A physical-pixel canvas, integer camera zoom, render interpolation (`render/interp.ts`), trees on whole pixels. Still needs the user's eyes on a real display.

### Schematic HUD
`M1` · `initial` · `playtest: pending` · SPEC §10
Components colored by integrity (`damageLevel`, shared with statusFx), hit flashes, component readout, power gauge, weapon strip.

### Status visuals
`M1` · `initial` · `playtest: pending` · SPEC §11.3
Per component: sparks/smoke/fire by integrity, charred stubs, barrel heat glow (cosmetic), per-arc plate shake + flash, dents/scorch per armor arc, the reactor glow follows the capacitor.
- `render/statusFx.ts` is Phaser-free and tested: `damageLevel`, `armorStage`, `BarrelHeat`/`heatColor`, `ComponentFx` emitting through the `StatusEmitter` interface that `Effects` implements. Chassis `anchors` place core components in hull space; `componentDestroyed` explodes at the part.
- Placeholder art derives the status textures from the part textures (`makeStatusArt`): `<key>_stub`, `<key>_heat` (white mask tinted by heat, ADD blend), `bh_plate_front/rear`, `bh_wear_front/rear/side` (4-frame sheets). `BehemothView` keeps a `Plate` per arc (flanks = tread pods), `onHit(arc)` and `onFire(slot, weapon, main)`.

### Damage particles pass
`M2` · `initial` · `playtest: pending` · SPEC §11.3
Denser Behemoth damage particles (black smoke, embers, bigger hit bursts) and damage particles on enemy vehicles. `StatusEmitter` gained `heavySmoke` + `ember`; `EMISSIONS` denser; shared `EmissionTimers`; `UnitFx` + `UNIT_EMISSIONS` for vehicles (the scene skips hidden units and infantry); `Effects.hullHit(x, y, damage)` on `behemothHit`/`trailerHit`.

### Mouse cursor outside battle
`M2` · `initial` · `playtest: n/a`
The cursor shows on the title and depot screens.

---

## 13. Audio

### Sound effects
`M2` · `initial` · `playtest: pending` · SPEC §11.4, §15 "Sound (M2)"
Procedural Web Audio: every weapon, blasts, hits, terrain, engine/tread/reactor loops, cab alarms, a lock tone at enemy missile launch, the enemy attack siren per last-stand wave, per-play pitch/level variation. M = mute.
- `src/audio/cues.ts` (pure, tested in `tests/audio/cues.test.ts`): `cuesFor(event)`, `WEAPON_SOUNDS` per weapon, `place` (falloff/pan from the Behemoth), `CueLimiter` + `MIN_GAP`, `AlarmWatch`, `PITCH_SPREAD`/`pitchFactor`/`levelFactor`, `engineState`/`reactorState`.
- `synth.ts`: shared noise/crackle/tread/impulse buffers per context, the `Voice` builder (one pitch factor per play), `RECIPES` per `SoundId`, `Hold` loops for beam/scrape/burn, `EngineLoop`, `ReactorLoop` with the meltdown siren. Mix levels in `LEVEL`/`ENGINE`/`REACTOR`/`HOLD_LEVEL`. Tune by ear here.
- `battleAudio.ts` (scene glue on Phaser's context; torn down on scene shutdown), `mute.ts` (own state, since Phaser's `mute` getter lags its setter). Sim change: the `intercept` event carries `weapon`.
- Verified headless (no page errors; pause/mute/restart OK; offline renders show no NaNs, peaks under 0 dB, engine bed ≈ −28 dB RMS, reactor ≈ −32). After the user's first listen (drive too high and whiny): saturation before the engine's low-pass, a lower firing pitch, duller track links, a darker reactor hum, the capacitor whine only in a meltdown.
