# Features

The list of everything that's been built. When a task in [TODO.md](TODO.md) is done, its entry moves here (see CLAUDE.md, "Task tracking"). TODO.md holds only open work.

**How to search:** the entries are grouped by game system. Every entry starts with one tag line:

`M1` · `uncommitted` · `playtest: pending` · SPEC §6.3

- **Milestone:** `M0`, `M1`, ... (SPEC §14).
- **Commit:** the commit that landed it, or `uncommitted`.
- **Playtest:** `approved` (the user played it and signed off), `pending` (built, still needs the user's eyes; the queue is in TODO.md), or `n/a`.
- **SPEC section(s)** where it applies.

Useful greps: `grep -n "playtest: pending" docs/FEATURES.md`, `grep -n "uncommitted" docs/FEATURES.md`, or grep for a symbol (`dealRules`) or a file (`sim/step.ts`).

## Contents
1. [Project and dev tools](#1-project-and-dev-tools)
2. [Determinism](#2-determinism)
3. [The valley's rules](#3-the-valleys-rules)
4. [World generation](#4-world-generation)
5. [Protagonists](#5-protagonists)
6. [Movement, time, and sight](#6-movement-time-and-sight)
7. [Rendering](#7-rendering)
8. [Screens and HUD](#8-screens-and-hud)
9. [Sound](#9-sound)

## 1. Project and dev tools

### Workspace and builds
`M0` · `uncommitted` · `playtest: n/a` · SPEC §11.1, §11.2

The `snowline` npm workspace: `build` (typecheck, `vite build`, then `scripts/standalone.mjs`), `test`, `typecheck`, `dev`, plus the by-hand scripts below. The root build copies `dist/` to the site and lists the game on the landing page from `package.json`'s `title` and `description`.
- **Single file:** `scripts/standalone.mjs` inlines the one script and one stylesheet into `dist/standalone.html` (about 75 KB), which runs from disk. The title screen links to it as a download (hidden on the dev server and when already running from disk). It fails the build if anything still points at `./assets/`.
- **Version stamp:** `src/platform/version.ts` (`VERSION`), injected by `vite.config.ts` as in the other game; shown on the title screen, the debug overlay, the check page, and in replay files.
- **Gotcha:** `vite.config.ts` turns off the module-preload polyfill so the build stays one script. Don't add dynamic `import()` without updating the standalone step.
- **Gotcha:** tests use Node APIs, so `tsconfig.node.json` type-checks `tests/` (with the scripts and configs); `tsconfig.json` covers `src/` only.

### Debug overlay and URL parameters
`M1` · `uncommitted` · `playtest: pending` · SPEC §11.5

`?debug=1` adds a panel (backquote hides and shows it): seed (and the retry seed if the valley needed one), tick, day and time, daylight, sight, position and facing, the tile under the survivor and under the mouse (terrain, band, elevation, feature and its data byte, water body, flags), viewpoints reached, stream counters, and the command count. Buttons: speed (pause, 1×, 4×, 16×, 64×, 120×), reveal map (the map screen shows everything and the set pieces), reveal rules (the deal as a table), map with click-to-teleport, test fire here, export replay, import replay.
- URL: `?seed=S` starts straight into a valley, `?candidate=N` plays that candidate, and with debug `?ff=HH:MM` fast-forwards by running ticks and `?at=X,Y` starts with a teleport there.
- Key files: `src/ui/debug.ts` (`DebugPanel`), `src/platform/app.ts`, `src/platform/replay.ts` (`toReplay`, `parseReplay`; the file carries the seed, protagonist, every command, the tick, and the state hash, and loading one says whether the state matches).
- **Gotcha:** teleport and the test fire are sim commands (`debug-teleport`, `debug-fire`), so they go into the command log and replays stay exact. The console for spawning items and setting vitals waits for M2, when there are items and vitals.

### Seed inspector, screenshots, browser check, sweep
`M1` · `uncommitted` · `playtest: n/a` · SPEC §11.4

- `npm run inspect -- <seed ...> [--scale N]`: `scripts/inspect.ts` generates valleys in Node and writes PNGs to `renders/inspect/` (markers: red start, orange overhang, white wreckage, yellow viewpoints, pink signal knoll, cyan territories, magenta rockslide gap), with timing and any failed tries. The picture is `src/tools/mapImage.ts`.
- `npm run shots -- [--seed S] [--at X,Y] [HH:MM ...]`: `scripts/shots.mjs` runs the dev server and headless Chromium and saves screenshots at each time, plus a night shot with a test fire and the map, to `renders/shots/`.
- `npm run check:browser [-- --no-build]`: `scripts/check-browser.mjs` builds, then runs the golden replays in headless Chromium against the served build and `dist/standalone.html` from disk. `scripts/browser.mjs` is the shared Chromium driver (Playwright's cached headless shell or `CHROME_HEADLESS`; nothing in the lockfile). Last run: both pass.
- `npm run sweep`: `tests/worldgen.sweep.ts` (via `vitest.sweep.config.ts`) generates 1,000 seeds and runs `tests/worldChecks.ts` on each, printing tries per valley and why any try failed. `SWEEP_COUNT=n` changes the count.

## 2. Determinism

### Seeded streams, hashing, and the guard
`M0` · `uncommitted` · `playtest: n/a` · SPEC §11.3

- `src/sim/rng.ts`: `hashString` (cyrb128) seeds `sfc32`; `makeRng(seed, name)` gives a named stream; `STREAMS` lists them (`worldgen`, `rules`, `protagonist`, `weather`, `animals`, `skill-checks`). Each `RngState` counts its draws (`n`, shown in the debug overlay). `hash2(seed, x, y, salt)` is the position hash for per-tile choices.
- `src/sim/hash.ts`: `canonicalJson` (sorted keys) and `fnv1a`; `hashValue` hashes any plain data.
- `src/sim/worldgen/noise.ts`: gradient noise and `fbm` from `+ − ×` and `Math.floor` only.
- `tests/determinism-guard.test.ts` reads every file under `src/sim/` and `src/content/` (comments and strings blanked) and fails on `Math.random`, `Date`, `performance`, engine-dependent `Math` functions, `**`, browser APIs, or an import from outside those folders.
- **Gotcha:** the guard is a regex over code with comments and quoted strings blanked. Template strings are checked as code (their `${...}` parts are code), so a banned word in a template string's text is a false alarm: reword it.

### Golden replays and property tests
`M0` · `uncommitted` · `playtest: n/a` · SPEC §11.4

- `src/tools/goldens.ts`: two replays (`first steps` on the default seed into dusk; `night walk` on `golden-2` with a test fire, a night walk, and a teleport), each with a world hash and a state hash. `src/tools/runner.ts` runs scenarios headless (`runScenario`, `runTo`, `stateHash`, `worldHash`, and a per-seed `valley` cache).
- `tests/golden.test.ts` checks them in Node; the `?check=1` page (`src/platform/check.ts`) checks them in a browser and sets `window.__snowlineCheck`.
- `tests/property.test.ts` (fast-check, fixed seed): after any presses, releases, and teleports the survivor stands on open ground with a sane step; the same input always gives the same state; a state round-tripped through JSON halfway carries on identically.
- **Gotcha:** a deliberate change to the sim or world generation moves the hashes. The test prints the new ones; paste them in only once the change is meant.

## 3. The valley's rules

### Dealing the rules
`M1` · `uncommitted` · `playtest: pending` · SPEC §6.6

`dealRules(seed)` (`src/sim/rules.ts`) deals every row from the seed's `rules` stream: plants (11, with one lookalike pair), remedies (5), stones (5), woods (5), tinders (5), water (lake and two streams, one foul, with a cause), tempers (bear, elk, cougar: boldness, warning, deterrent), and weather signs (7). `dealDeck` deals the whole core and fills with shuffled spares. The decks and the things' names are in `src/content/decks.ts`.
- Fairness: `dealProblems` checks exactly one deadly plant, at least two nourishing, a real lookalike pair (a nourishing and a bad berry of one family), one spark-stone, one foul water, a tinder that catches, a drill wood, all three remedies, and fire turning some animal. The plant deck is reshuffled (same stream) until a lookalike pair exists; it takes about two deals on average.
- `describeRules` renders the deal for the debug overlay.
- **Gotcha:** the deal isn't saved; it is re-dealt from the seed. It lives in `GameState.rules` so systems read it from state.
- Not yet: the starting valley fact for each background (the field is in `content/protagonists.ts`, `mods.fact`), `GameState.known`, and the valley notes chart: M2.

## 4. World generation

### The pipeline and validation
`M1` · `uncommitted` · `playtest: pending` · SPEC §6.1–6.3

`generateWorld(seed, rules)` (`src/sim/worldgen/index.ts`) runs the stages in order, retrying on `seed~1`, `seed~2`, ... until a valley validates (40 tries at most; the 25-seed sample and the 1,000-seed sweep have needed none so far). About 75 ms a valley in Node.
1. `shape.ts` `shapeBasin`: height from a bowl round the lake, a tilt up toward one of eight high sides, and layered noise with crags higher up; a headwall rim 3–7 tiles deep; the lake as the lowest 8.5% of the interior that joins up (at least 600 tiles).
2. `cutBands`: four elevation bands by quantile (floor, montane, subalpine, alpine), smoothed twice, with patches under 40 tiles merged away.
3. `carveStreams`: two streams from high sources on either side of the valley's axis, cheapest-path down to the lake (climbing is expensive; the far stream may not touch or run beside the near one). Lake shallows along the shore.
4. `raiseCliffs`: a cliff wherever a subalpine or alpine tile meets a lower band (a waterfall where a stream crosses), then scramble routes (scree): 4 into the subalpine band and 3 into the alpine, at least 26 tiles apart. Floor to forest is an open slope.
5. `wreck.ts` `chooseStart`: the start on dry valley floor 1–2 tiles from the lake and 3–9 from the near stream's mouth, with the forward section of the aircraft beside it. `sealWreck`: the tail wreckage in open alpine ground at least 90 tiles away, inside a cliff ring (radius 5); the ring's lowest point is the rockslide gap (`FLAG.slideGap`), and a 10-tile talus path runs downhill from it (`FLAG.slidePath`).
6. `cover.ts` `coverGround`: moisture from noise and distance to water; ground by band and moisture (sand, reeds, marsh, meadow; forest with clearings; high meadow, scrub, boulder fields; talus, bare rock, late snow at the very top). Trees, aspens, stunted trees, boulders, deadfall, and wild rose scattered with position-hashed spacing.
7. `setpieces.ts` `placeSetPieces`: see below. `finish.ts` `layTrails`: game trails from each territory and the high berries to the nearest water, clearing trees and boulders. `validate`: below.
- **Validation** (`finish.ts` `validate`; `tests/worldChecks.ts` repeats it from outside on the finished World): start walkable; lake shallows and the near stream both close by on foot (so the foul source is never the only one); overhang reachable within 90 steps; spark-stone and the near safe berries reachable; reeds within 90 steps; signal knoll reachable; enough subalpine and alpine ground in reach; a reachable viewpoint within 30 tiles of the wreckage; the wreckage unreachable now and reachable once the gap opens.
- **Gotcha:** world generation must not depend on the deal (see "Set pieces"). `tests/rules.test.ts` generates one seed with two deals and compares everything but the labels.
- **Gotcha:** the `World` uses typed arrays and is never saved; it's rebuilt from the seed. Anything that changes during play (the rockslide in M5, felled trees) goes in `GameState` as a difference.

### Set pieces
`M1` · `uncommitted` · `playtest: pending` · SPEC §6.3, §6.6

Placed in order, each on a random tile meeting its rule, claiming room round itself (`Gen.reserved`) so none overlap. Placements with a distance rule scan only their box; others try 300 random tiles before scanning the whole map (`choose`).
- **Rock overhang** at the forest edge 12–40 tiles from the start: a rock face (`F.overhang`) with the shelter floor (`T.shelter`) on its downhill side.
- **Two outcrops by the overhang**, 2–4 tiles from the shelter: the dealt spark-stone and an edge-stone, so the overhang alone doesn't give the answer away. Then 3 outcrops of each of the 5 stones across the valley.
- **Berries:** the good lookalike near the start at a forest edge (8–45 tiles), its bad twin 6–13 tiles from it; the same pair again in a high meadow; a third safe patch (another nourishing berry if the deal has one); 2 patches of each other berry. 3 patches of each other plant (bulbs in meadows, greens near marsh, mushrooms in forest) and 3 of each remedy herb.
- **Spawning gravel** on the last 4 tiles of the near stream.
- **Viewpoints:** the signal knoll (the highest local peak 50+ tiles from the start), the one that shows the wreckage (the highest high ground 9–24 tiles from it), and up to 3 more peaks 40+ tiles apart.
- **Territories** (`World.territories`): bear near the high berries, elk in a high meadow, cougar near cliffs, marmots on talus, all away from the start. Data only until M4.
- **Pack-rat midden** in rocks 10–30 tiles from the overhang. **Water cause sites** for all three sources (a lake shore, and midway up each stream); only the dealt foul source gets the beaver dam or carcass. **Landmarks:** 4–6 of waterfall, lightning-split snag, bone pile, old avalanche path, tarn, rock arch.
- **Gotcha:** slots are placed identically whatever the deal, and only labelled from it (`data` byte, the cause feature). Don't make a placement test or a validation check read `g.rules`.

## 5. Protagonists

### Candidates and the roster
`M0` · `uncommitted` · `playtest: n/a` · SPEC §4

`candidate(seed, index)` (`src/sim/protagonist.ts`) draws a protagonist from the sub-stream `protagonist:<index>`: gender, a name from equal boys' and girls' lists, age 12–15, looks (skin, hair, hair style, shirt, trousers), background, trait, tool, and 1–2 pocket items. The roster is `src/content/protagonists.ts` (7 backgrounds with modifiers as data, 7 traits, 3 tools, 8 pocket items). `protagonistProblems` validates a hand-built one; `pronouns` gives he/she forms for the log.
- For now a run plays candidate 0 (or `?candidate=N`); the selection screen is M2. `tests/protagonist.test.ts` starts a run with every background, trait, and tool.

## 6. Movement, time, and sight

### The step and movement
`M0`/`M1` · `uncommitted` · `playtest: pending` · SPEC §5.1, §5.2

`step(state, world, commands)` (`src/sim/step.ts`) applies the tick's commands, moves the survivor, advances the tick, and every game minute re-reveals the map; it returns events. Commands (`src/sim/state.ts`): `move` (a direction held), `halt`, `debug-teleport`, `debug-fire`.
- Grid steps: 6 ticks on open ground; terrain sets its own (`TERRAIN[].stepTicks`: marsh 10, talus 10, scree 14, shallows 12, ...), features add to it, a trail caps it at 6, and climbing adds one tick per 2 elevation units (up to 6). `stepTicks` in `src/sim/world.ts`.
- A tap shorter than a tick still takes a step (`queued`), and a tap during a step is taken when it ends. Walking into something blocked turns to face it and sends one `bump` event.
- Input (`src/platform/input.ts`): WASD or arrows; held keys stack, so releasing one returns to the other. The browser loop (`Loop` in `src/platform/session.ts`) runs whole ticks at 20 a second times the debug speed, at most a few per frame, and the renderer slides between them.

### Time, daylight, sight, and viewpoints
`M1` · `uncommitted` · `playtest: pending` · SPEC §5.1, §6.4

- `src/sim/time.ts`: 10 ticks a minute; the run starts at 14:30 on day 1 (`START_MINUTE`). Daylight 0–100 from an hourly table (`DAYLIGHT` in `src/content/balance.ts`): light from about 06:00, dark by 21:00.
- Sight: 14 tiles by day down to 2 at night (`sightRadius`); a fire lights 6. What's in sight is marked explored (a bitset in `GameState.explored`). The renderer's darkness uses the same circles (`sightCircles`), so the picture never shows more than the survivor can see.
- Viewpoints: standing within a tile of one reveals 30 tiles round it, once, with a line of text (the signal knoll and the wreckage view have their own).

## 7. Rendering

### Placeholder tiles and sprites
`M1` · `uncommitted` · `playtest: pending` · SPEC §12.1

`src/render/tiles.ts` draws everything in code from the 32-colour base palette (`src/render/palette.ts`): each terrain is a flat colour with a simple glyph in 4 variants; features and the survivor (layered from the protagonist's looks, four facings, two walk frames) are small shapes. Hill shading lightens slopes facing north-west. Game trails show as worn patches.
- **Gotcha:** wild rose (`F.bush`, a fixed floor food) is drawn sparse and pale so it doesn't look like the dealt berry bushes.

### Camera, grade, darkness, firelight
`M1` · `uncommitted` · `playtest: pending` · SPEC §6.4, §12.1

`Renderer` (`src/render/renderer.ts`) draws at 384×216, scaled by a whole number to the window. The camera follows the survivor's interpolated position and stops at the map's edges. Then:
- **Grade** (`src/render/grade.ts`, keyframes by minute): cool dawn, flat noon, amber dusk, blue night; colour drains toward night (`saturation` composite) and a tint is multiplied over everything.
- **Firelight:** inside a fire's radius the full-colour scene is put back, lit warm, fading out from the fire, with a glow at the heart: the only colour at night.
- **Darkness:** from the sim's daylight, up to 95% at night, with a soft hole for the survivor's own sight (dim and colourless) and for each fire.
- Render-side randomness (water shimmer, fire flicker) uses `rh` and time, never the sim.
- **Gotcha:** the map is 256×256 but the screen is 24 tiles wide; only visible tiles are drawn.

## 8. Screens and HUD

### Title, HUD, map, pause, check page
`M0`/`M1` · `uncommitted` · `playtest: pending` · SPEC §11.1, §6.4, §12.1

- Title (`src/ui/title.ts`): the name, tagline, the in-development notice, *First valley* (the default seed), *A new valley* (a random seed), a seed box (remembered in `localStorage` as `snowline/lastSeed`), controls, the version stamp, and the single-file download.
- HUD (`src/ui/hud.ts`): `Day N · afternoon` in a corner and a fading caption line (the opening lines, viewpoint lines). No numbers on screen.
- Map (M, `src/ui/mapScreen.ts`, `src/render/mapSketch.ts`): the explored valley as a pencil sketch on paper, the survivor, and viewpoints stood on.
- Pause (Esc): carry on, or leave the valley (nothing is saved yet).
- All game text is in `src/content/text.ts`. The opening implies the pilot's death without showing it.

## 9. Sound

### Event hooks
`M0` · `uncommitted` · `playtest: n/a` · SPEC §12.3

Every sim event goes through `playEvents` (`src/platform/audio.ts`), which is silent for now; ambient loops come in M4, effects and music in M6.
