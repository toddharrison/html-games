# Features

The list of everything that's been built. When a task in [TODO.md](TODO.md) is done, its entry moves here (see CLAUDE.md, "Task tracking"). TODO.md holds only open work.

**How to search:** the entries are grouped by game system. Every entry starts with one tag line:

`M1` · `27fbb89` · `playtest: pending` · SPEC §6.3

- **Milestone:** `M0`, `M1`, ... (SPEC §14).
- **Commit:** the commit that landed it, or `27fbb89`.
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
10. [The body](#10-the-body)
11. [Food, water, and learning the valley](#11-food-water-and-learning-the-valley)
12. [Actions and inventory](#12-actions-and-inventory)
13. [Saves and run codes](#13-saves-and-run-codes)
14. [Fire](#14-fire)
15. [Materials, crafting, and camp](#15-materials-crafting-and-camp)
16. [Insights](#16-insights)
17. [Weather](#17-weather)
18. [Animals](#18-animals)
19. [Hunting and fishing](#19-hunting-and-fishing)
20. [Illness, injury, remedies, traits](#20-illness-injury-remedies-traits)
21. [Ambient sound](#21-ambient-sound)
22. [The arc and rescue](#22-the-arc-and-rescue)
23. [The bot and balance](#23-the-bot-and-balance)
24. [Polish](#24-polish)
25. [Seeing and touching (M7 slice)](#25-seeing-and-touching-m7-slice)

## 1. Project and dev tools

### Workspace and builds
`M0` · `27fbb89` · `playtest: n/a` · SPEC §11.1, §11.2

The `snowline` npm workspace: `build` (typecheck, `vite build`, then `scripts/standalone.mjs`), `test`, `typecheck`, `dev`, plus the by-hand scripts below. The root build copies `dist/` to the site and lists the game on the landing page from `package.json`'s `title` and `description`.
- **Single file:** `scripts/standalone.mjs` inlines the one script and one stylesheet into `dist/standalone.html` (about 75 KB), which runs from disk. The title screen links to it as a download (hidden on the dev server and when already running from disk). It fails the build if anything still points at `./assets/`.
- **Version stamp:** `src/platform/version.ts` (`VERSION`), injected by `vite.config.ts` as in the other game; shown on the title screen, the debug overlay, the check page, and in replay files.
- **Gotcha:** `vite.config.ts` turns off the module-preload polyfill so the build stays one script. Don't add dynamic `import()` without updating the standalone step.
- **Gotcha:** tests use Node APIs, so `tsconfig.node.json` type-checks `tests/` (with the scripts and configs); `tsconfig.json` covers `src/` only.

### Debug overlay and URL parameters
`M1` · `27fbb89` · `playtest: pending` · SPEC §11.5

`?debug=1` adds a panel (backquote hides and shows it): seed (and the retry seed if the valley needed one), tick, day and time, daylight, sight, position and facing, the tile under the survivor and under the mouse (terrain, band, elevation, feature and its data byte, water body, flags), viewpoints reached, stream counters, and the command count. Buttons: speed (pause, 1×, 4×, 16×, 64×, 120×), reveal map (the map screen shows everything and the set pieces), reveal rules (the deal as a table), map with click-to-teleport, test fire here, export replay, import replay.
- URL: `?seed=S` starts straight into a valley, `?candidate=N` plays that candidate, and with debug `?ff=HH:MM` fast-forwards by running ticks and `?at=X,Y` starts with a teleport there.
- Key files: `src/ui/debug.ts` (`DebugPanel`), `src/platform/app.ts`, `src/platform/replay.ts` (`toReplay`, `parseReplay`; the file carries the seed, protagonist, every command, the tick, and the state hash, and loading one says whether the state matches).
- **Gotcha:** teleport and the test fire are sim commands (`debug-teleport`, `debug-fire`), so they go into the command log and replays stay exact. The console for spawning items and setting vitals waits for M2, when there are items and vitals.

### Seed inspector, screenshots, browser check, sweep
`M1` · `27fbb89` · `playtest: n/a` · SPEC §11.4

- `npm run inspect -- <seed ...> [--scale N]`: `scripts/inspect.ts` generates valleys in Node and writes PNGs to `renders/inspect/` (markers: red start, orange overhang, white wreckage, yellow viewpoints, pink signal knoll, cyan territories, magenta rockslide gap), with timing and any failed tries. The picture is `src/tools/mapImage.ts`.
- `npm run shots -- [--seed S] [--at X,Y] [HH:MM ...]`: `scripts/shots.mjs` runs the dev server and headless Chromium and saves screenshots at each time, plus a night shot with a test fire and the map, to `renders/shots/`.
- `npm run places -- [--seed S] [--time HH:MM] [--only name,prefix]`: `scripts/places.ts` picks a valley's interesting places (crash, overhang, wreck, knoll, glacier toe, burn, thicket edge, old growth, treeline, talus, marsh, avalanche track, the busiest game trail, one of each den, one of each landmark, with the survivor two tiles below these so they're not hidden) and `scripts/places.mjs` screenshots each at midday into `renders/places/<seed>/` (30b4851).
- `npm run check:browser [-- --no-build]`: `scripts/check-browser.mjs` builds, then runs the golden replays in headless Chromium against the served build and `dist/standalone.html` from disk. `scripts/browser.mjs` is the shared Chromium driver (Playwright's cached headless shell or `CHROME_HEADLESS`; nothing in the lockfile). Last run: both pass.
- `npm run sweep`: `tests/worldgen.sweep.ts` (via `vitest.sweep.config.ts`) generates 1,000 seeds and runs `tests/worldChecks.ts` on each, printing tries per valley and why any try failed. `SWEEP_COUNT=n` changes the count.

## 2. Determinism

### Seeded streams, hashing, and the guard
`M0` · `27fbb89` · `playtest: n/a` · SPEC §11.3

- `src/sim/rng.ts`: `hashString` (cyrb128) seeds `sfc32`; `makeRng(seed, name)` gives a named stream; `STREAMS` lists them (`worldgen`, `rules`, `protagonist`, `weather`, `animals`, `skill-checks`). Each `RngState` counts its draws (`n`, shown in the debug overlay). `hash2(seed, x, y, salt)` is the position hash for per-tile choices.
- `src/sim/hash.ts`: `canonicalJson` (sorted keys) and `fnv1a`; `hashValue` hashes any plain data.
- `src/sim/worldgen/noise.ts`: gradient noise and `fbm` from `+ − ×` and `Math.floor` only.
- `tests/determinism-guard.test.ts` reads every file under `src/sim/` and `src/content/` (comments and strings blanked) and fails on `Math.random`, `Date`, `performance`, engine-dependent `Math` functions, `**`, browser APIs, or an import from outside those folders.
- **Gotcha:** the guard is a regex over code with comments and quoted strings blanked. Template strings are checked as code (their `${...}` parts are code), so a banned word in a template string's text is a false alarm: reword it.

### Golden replays and property tests
`M0` · `27fbb89` · `playtest: n/a` · SPEC §11.4

- `src/tools/goldens.ts`: two replays (`first steps` on the default seed into dusk; `night walk` on `golden-2` with a test fire, a night walk, and a teleport), each with a world hash and a state hash. `src/tools/runner.ts` runs scenarios headless (`runScenario`, `runTo`, `stateHash`, `worldHash`, and a per-seed `valley` cache).
- `tests/golden.test.ts` checks them in Node; the `?check=1` page (`src/platform/check.ts`) checks them in a browser and sets `window.__snowlineCheck`.
- `tests/property.test.ts` (fast-check, fixed seed): after any presses, releases, and teleports the survivor stands on open ground with a sane step; the same input always gives the same state; a state round-tripped through JSON halfway carries on identically.
- **Gotcha:** a deliberate change to the sim or world generation moves the hashes. The test prints the new ones; paste them in only once the change is meant.

## 3. The valley's rules

### Dealing the rules
`M1` · `27fbb89` · `playtest: pending` · SPEC §6.6

`dealRules(seed)` (`src/sim/rules.ts`) deals every row from the seed's `rules` stream: plants (11, with one lookalike pair), remedies (5), stones (5), woods (5), tinders (5), water (lake and two streams, one foul, with a cause), tempers (bear, elk, cougar: boldness, warning, deterrent), and weather signs (7). `dealDeck` deals the whole core and fills with shuffled spares. The decks and the things' names are in `src/content/decks.ts`.
- Fairness: `dealProblems` checks exactly one deadly plant, at least two nourishing, a real lookalike pair (a nourishing and a bad berry of one family), one spark-stone, one foul water, a tinder that catches, a drill wood, all three remedies, and fire turning some animal. The plant deck is reshuffled (same stream) until a lookalike pair exists; it takes about two deals on average.
- `describeRules` renders the deal for the debug overlay.
- **Gotcha:** the deal isn't saved; it is re-dealt from the seed. It lives in `GameState.rules` so systems read it from state.
- Not yet: the starting valley fact for each background (the field is in `content/protagonists.ts`, `mods.fact`), `GameState.known`, and the valley notes chart: M2.

## 4. World generation

### The pipeline and validation
`M1` · `27fbb89` · `playtest: pending` · SPEC §6.1–6.3

`generateWorld(seed, rules)` (`src/sim/worldgen/index.ts`) runs the stages in order, retrying on `seed~1`, `seed~2`, ... until a valley validates (40 tries at most). With the history pipeline (2026-11-26), the 1,000-seed sweep makes every valley, 976 on the first try and 24 on the second (stream too short, no room for the crash, the water-cause site, a boxed-in start), never a third. About 350 ms a valley in Node (erosion is most of it).
1. `shape.ts` `shapeBasin`: height from a bowl round the lake, a tilt up toward one of eight high sides, and layered noise with crags higher up; a headwall rim 3–7 tiles deep; the lake as the lowest 8.5% of the interior that joins up (at least 600 tiles).
2. `cutBands`: four elevation bands by quantile (floor, montane, subalpine, alpine), smoothed twice, with patches under 40 tiles merged away.
3. `carveStreams`: two streams from high sources on either side of the valley's axis, cheapest-path down to the lake (climbing is expensive; the far stream may not touch or run beside the near one). Lake shallows along the shore.
4. `raiseCliffs`: a cliff wherever a subalpine or alpine tile steps down at least `CLIFF_DROP` (4) to a lower band, measured to the lower band's tiles only (`482337e`: it used to be the biggest drop to any neighbour, so a bank above a gully cut into the same band became cliff: about 12% of cliffs). A stream tile there becomes falling water only where the stream itself drops: water beside it at its level or above (feeding it) and water in the lower band a cliff's drop below; otherwise it stays stream (never cliff), so a corner tile laid on the bank beside a stream that runs on level is no longer a stray waterfall beside it (`s-0` at 158,77; `s-5` lost a whole false falls). Then scramble routes (scree): 4 into the subalpine band and 3 into the alpine, at least 26 tiles apart. Floor to forest is an open slope. **Gotcha:** the default seed's start moved to 124,141 (beside the wreck) and its overhang to 99,162; goldens moved.
5. `wreck.ts` `chooseStart`: the start on dry valley floor 1–2 tiles from the lake and 3–9 from the near stream's mouth, with the forward section of the aircraft beside it. `sealWreck`: the tail wreckage in alpine ground at least 90 tiles away, in a walled pocket (see "The tail's pocket" below); the wall's lowest point is the rockslide gap (`FLAG.slideGap`), and a 10-tile talus path runs downhill from it (`FLAG.slidePath`).
6. `cover.ts` `coverGround`: moisture from noise and distance to water; ground by band and moisture (sand, reeds, marsh, meadow; forest with clearings; high meadow, scrub, boulder fields; talus, bare rock, late snow at the very top). Trees, aspens, stunted trees, boulders, deadfall, and wild rose scattered with position-hashed spacing.
7. `setpieces.ts` `placeSetPieces`: see below. `finish.ts` `layTrails`: game trails from each territory and the high berries to the nearest water, clearing trees and boulders. `validate`: below.
- **Validation** (`finish.ts` `validate`; `tests/worldChecks.ts` repeats it from outside on the finished World): start walkable; lake shallows and the near stream both close by on foot (so the foul source is never the only one); overhang reachable within 90 steps; spark-stone and the near safe berries reachable; reeds within 90 steps; signal knoll reachable; enough subalpine and alpine ground in reach; a reachable viewpoint within 30 tiles of the wreckage; the wreckage unreachable now and reachable once the gap opens.
- **The tail's pocket** (`M7` · `30b4851` · `playtest: pending` · SPEC §6.3, §10): `sealWreck` (`wreck.ts`) prefers a centre 4–6 tiles from the rim (`fromRim`), so the pocket is a ledge under the headwall, which is its back wall; with no room there, open alpine ground clear of the rim. The pocket is the tiles within `POCKET_R` (5) ± `POCKET_WOBBLE` (2, a perlin field) that join up, never on headwall. The wall's first course is every tile touching the pocket, corners included, so it always seals; the lip is its lowest non-headwall tile; two more ragged courses (`hash2f` salt 121) go on where the ground rises behind the pocket (85%, 50%) and seldom elsewhere (30%, 8%), never within 4 tiles of the lip, so the gap always breaks right through. The rim stays headwall where the wall meets it. Tuning: `POCKET_R`, `POCKET_WOBBLE`, `POCKET_REACH`. **Gotcha:** candidates need `POCKET_REACH + 1` clear tiles (not counting the rim), so a bigger pocket means fewer valleys with room.
- **Gotcha:** world generation must not depend on the deal (see "Set pieces"). `tests/rules.test.ts` generates one seed with two deals and compares everything but the labels.
- **Gotcha:** the `World` uses typed arrays and is never saved; it's rebuilt from the seed. Anything that changes during play (the rockslide in M5, felled trees) goes in `GameState` as a difference.

### Set pieces
`M1` · `27fbb89` · `playtest: pending` · SPEC §6.3, §6.6

Placed in order, each on a random tile meeting its rule, claiming room round itself (`Gen.reserved`) so none overlap. Placements with a distance rule scan only their box; others try 300 random tiles before scanning the whole map (`choose`).
- **Rock overhang** at the forest edge 12–40 tiles from the start: a rock face (`F.overhang`) with the shelter floor (`T.shelter`) on its downhill side.
- **Two outcrops by the overhang**, 2–4 tiles from the shelter: the dealt spark-stone and an edge-stone, so the overhang alone doesn't give the answer away. Then 3 outcrops of each of the 5 stones across the valley.
- **Patches grow like plants** (`M7` · `30b4851` · `playtest: pending`): `placePatch` grows each patch from its centre, each new tile beside one already in it (8-way), one in five a step further off, within 4 tiles of the centre (position-hashed, salts 61–63), so patches are clumps and drifts, not a block from a 5×5 box. The renderer draws plants, herbs, and bushes up to 3 px off-centre and mirrored by hash (salts 85–87).
- **Berries:** the good lookalike near the start at a forest edge (8–45 tiles), its bad twin 6–13 tiles from it; the same pair again in a high meadow; a third safe patch (another nourishing berry if the deal has one); 2 patches of each other berry. 3 patches of each other plant (bulbs in meadows, greens near marsh, mushrooms in forest) and 3 of each remedy herb.
- **Spawning gravel** on the last 4 tiles of the near stream.
- **Viewpoints:** the signal knoll (the highest local peak 50+ tiles from the start), the one that shows the wreckage (the highest high ground 9–24 tiles from it), and up to 3 more peaks 40+ tiles apart.
- **Territories** (`World.territories`): bear near the high berries, elk in a high meadow, cougar near cliffs, marmots on talus, all away from the start. Data only until M4.
- **Pack-rat midden** in rocks 10–30 tiles from the overhang. **Water cause sites** for all three sources (a lake shore, and midway up each stream); only the dealt foul source gets the beaver dam or carcass. **Landmarks:** 4–6 of waterfall, lightning-split snag, bone pile, old avalanche path, tarn, rock arch. The tarn (`placeTarn`, 30b4851, `playtest: pending`) is one the geology made, small and high (its body under `TARN_MAX` 140 tiles with a tile in the subalpine band or above: not the upper lake behind a rock step, which is `WATER.tarn` too and took the landmark on the trough floor; `482337e`), at least 10 tiles in from the map's edge, if there is one; otherwise the deepest small hollow on open high ground at least 12 in (its height below the ring 4 tiles round it), filled from its lowest tile up (`TileHeap` by height plus a little perlin) to 9–22 tiles within 5 of it, deep where water lies all round. It used to be a stamped disc of radius √5 (a plus shape).
- **Gotcha:** slots are placed identically whatever the deal, and only labelled from it (`data` byte, the cause feature). Don't make a placement test or a validation check read `g.rules`.

### The valley made by its history: rock, ice, and water
`M7` · `46d8182` · `playtest: pending` · SPEC §6.2, §6.3

`shapeValley` (`src/sim/worldgen/geology.ts`) replaces the old basin, lake, and stream steps. Along the valley's line (the main glacier's centre line, then the outlet river's), the land is laid out low and falling from head to outlet, rising to ridges either side, with ridged-noise peaks and a rim (`ridged`, `nearestOn`). Rock hardness in tilted beds. The main glacier (`Ice`: centre line, bed, half-width) carves a U trough (`carveIce`, profile q³), its bed gouged deepest near the snout; 2–3 side glaciers from flank cirques join it 0.07–0.13 above its bed (hanging valleys); cirques are bowls (`carveCirque`). A moraine ring at the snout (kept in `moraine` so it can be scaled) and lateral moraines. The outlet gorge is cut below the moraine to past the map's edge. Then droplet erosion (`erode`: Beyer's method, ~85,000 drops, its own `geology` rng stream; only `Math.sqrt`), talus slumping (`slump`, repose by hardness), breaching of side hollows (`breach`), and the ice-scoured knobs, spurs, and bays on the trough floor (after erosion, so they last). Water: priority-flood fill (`fill`), the lake as the filled hollow behind the moraine, the moraine scaled until the lake is 1,500–3,000 tiles (`LAKE_TARGET`); other hollows are tarns (high, small, deep) or filled level as bogs (`g.bog`). Remnant ice: a glacier lobe in each cirque against its back wall, ragged-edged, with a tongue (`g.snow` 2), and snowpack on high north-facing ground, smoothed into fields (`g.snow` 1). Flow: randomised-D8 receivers (`receivers(filled, wander)`, so channels meander), accumulation of rain plus meltwater (glacier 30, snow 2 per tile), channels at `CHANNEL` (600). Streams A and B are the two biggest inflows to the lake (B at least 20 tiles from A), with their tributaries; channels run under the ice (not laid on snow); diagonal steps get a corner tile so a stream is wadeable along. The outlet from the spill point to the rim, as lake water; where it crosses the rim it's `T.waterfall`. Lake depth by the filled level (shore always shallows).
- `cutBands` (`shape.ts`) cuts bands by warmth: height plus aspect (`cold`). `raiseCliffs` puts a cliff only where a band edge drops `CLIFF_DROP` (4) or more; a band with no cliff needs no routes.
- About 350 ms a valley in Node (erosion is most of it), 1 s under Vitest; the sample in `tests/worldgen.test.ts` is now the default and 9 seeds (`SAMPLE_SEEDS`), and `testTimeout` is 40 s (raised at the 0.0.1 release: CI runs about 2.5× slower; the search-flights test now uses a flat world instead of four valleys).
- **Gotcha:** `g.flow`, `g.bog`, `g.snow`, `g.outlet`, and `g.age` are new `Gen` fields that later stages read (cover, set pieces). `World.age` is new (tests' `flatWorld` has it). The rim check accepts `T.waterfall` where the outlet leaves.
- **Gotcha:** the default seed's snapshot and the goldens' world hashes changed; the start is now on the lake's west arm.
- **Each valley its own** (`M7` · `30b4851` · `playtest: pending` · SPEC §6.2, §6.3): the layout used to be one template rotated (head 96 out, snout 30 past the centre, 2–3 side glaciers, the start always by the main river). Now from the `geology` stream: `headOut` 84–98, `snoutAt` 5–60 past the centre (so the lake can lie well off-centre), both ±35 to the side; the trough's bends `wander` 12–40; ice `breadth` ×0.8–1.2; 1–4 side glaciers on random flanks; a `confluence` (30%: the first side glacier is a second great one, half-width 10–15, joining 0.01–0.03 above the bed, cirque 16); a rock step (`stepAt`, 35%: a bar 0.12 high across the trough with a basin 0.07 deep behind it, laid after erosion so it stands; `breach` spares it, and its hollow, 40–1,200 tiles, becomes an upper lake as `WATER.tarn`); the outlet turns up to ±0.7 to the side (`turn`, a dog-leg). Streams A and B swap half the time, so the start is as often by the side stream. **Islands** (`ISLAND_CHANCE` 0.92; it was 0.85, raised so the default valley has one): one to three knobs of rock in the lake, at least 12 tiles apart and sized to stay clear of the shore (`toShore`), then the lake is refilled. `coverGround` makes land cut off by water and under `ISLAND_MAX` (150) tiles a rocky shore (boulders, 35% sand) round forest. Boulders are sparser (the `ridgeRocks` densities lowered by about a third). The start must be on the main body of land (the largest connected land, never an island or a spit cut off by cliffs: `chooseStart`), and the water cause's stream site is the open stream tile nearest the stream's middle either way, clear of the mouth (its upper half may run under ice); together these took the 1,000-seed retries from 75 back down (150-seed check: 149 first try). Upper lakes form in about a third of valleys; 28 of 30 sample valleys have an island of 4+ tiles. **Gotcha:** the default seed's start is now 122,140 (on the south shore by the stream mouth); its snapshot and the goldens changed.

### Ground, forest history, trees and thickets
`M7` · `46d8182` · `playtest: pending` · SPEC §6.3, §6.8, §12.1

`coverGround` (`cover.ts`) assigns ground from band, slope, aspect (`sunny`), and wetness (`moisture`, from `g.flow` and `g.bog`), tidies lone tiles into what's round them, and clears avalanche chutes down steep slopes (`FLAG.avalanche`). Fire history: 14–21 fires over ~290 years (`fire-history` rng stream), each starting where dry, spreading by chance plus a smooth field (`patch`), uphill faster, capped at 150–1,550 tiles; `g.age` keeps years since each tile last burned (255 for older). Burns under 20 years become meadow with fallen trunks and seedlings; young stands (20–70) are thick (`young`), aspen first where damp, with **thickets** (`F.thicket`, blocking) where the `thicket` field is high; old growth (160+) is thinner (`oldGrowth`) with more deadfall. Trees now stand side by side (plain `h(1) < density`, not `scatter`), since **conifers and aspens no longer block** (`extraTicks` 3 and 2); stunted trees and rocks still use `scatter` (never side by side). The renderer sizes trees by age (`treeSize`), draws a thicket as three crowded saplings, and draws a tree over the survivor, faded, when they stand on its tile (`over`). Cliffs and the rim are drawn as rock formations.
- **High meadow in swales, not strands** (`M7` · `482337e` · `playtest: pending` · SPEC §6.3): runoff raised `moisture` only on the tile a trickle crossed, so above the forest every little gully became a ribbon of bright high meadow one tile wide winding through the scrub. Now the subalpine and alpine ground is chosen by `highWet`: the moisture with the tile's own runoff swapped for a swale, the most of any runoff within 3 tiles, reaching `SWALE` (2.6) tiles where that gully is flat and about 1.2 where it's steep, edges stirred by perlin (salt 104). Then any high meadow up high not part of a 2×2 block of it, or in a patch under `MIN_HIGH_MEADOW` (8), goes to the commonest of scrub, forest, boulders, talus, rock round it (fixed order for ties). The floor and montane bands, marsh, and fire still read `moisture`. **Gotcha:** this moves every valley's high ground, so landmarks placed on it move too (`first-light`'s bone pile went from 80,50 to 15,113).
- **Glacier forefields and marsh patches** (`M7` · `30b4851` · `playtest: pending` · SPEC §6.3): `coverGround` flags glacier ice (`g.snow` 2) `FLAG.glacier` and walks out from it 8-way up to `FOREFIELD` (7), remembering the ice's height (`fromIce`, `iceElev`). `forefield`: within ~2 (perlin-stirred) all round, talus; in front (lower than the ice) to ~4, boulders; to 7, the ground it would be anyway, but forest becomes meadow or high meadow (`OPEN_FORE`). Forefield tiles (`fore`) are skipped by the tidy pass and get no trees, thickets, or deadfall (rocks and bushes only). Marsh: twice, meadow with 5+ marsh neighbours turns marsh; then any marsh patch under `MIN_MARSH` (10) turns, from its edge in, into the commonest dry ground beside it (meadow, forest, reeds, high meadow, scrub, sand), so a seep in forest doesn't leave a meadow ribbon. **Gotcha:** `FLAG.glacier` is a `flags` bit, so the feature pass's `g.flags[i]` skip covers it.
- **Gotcha:** `FLAG.trail` is the visible path, not the route: read `World.trails` for whose trail a tile is.
- **Gotcha:** anything that assumed trees block (a test, a path, the bot) now sees them as slow ground; a thicket is the blocking tree.

### Log bridges
`M7` · `9ed349b` · `playtest: pending` · SPEC §6.3

`layLogBridges` (`src/sim/worldgen/bridges.ts`, after `layTrails`): candidates are crossings east or south from an open bank over 1–3 stream or gravel tiles (`MAX_SPAN`) to an open bank, with a conifer or aspen within 2 tiles of a bank (a tree that could have fallen over it). Score: trees (capped), a hash, +2 where a game trail reaches either bank, +1.5 within 30 tiles of the start. Best first, at least 18 tiles apart (`SPACING`), up to 12 (`MAX_BRIDGES`). The crossed tiles get `FLAG.bridge`; `World.bridges` keeps each (first stream tile, way across, length). On a bridge tile: no wetting (`entered` in `sim/step.ts`), drying as on land (`body.ts`), a step takes `LOG_STEP_TICKS` (9; `stepTicks`), and in the dark (8%) or exhausted (5%) a slip into the stream (`stepHazards`, `HAZARD_TEXT.offLog`: wet through). Drawn flat under everything by `spanLog` (`flora.ts`): a trunk from root plate to broken top, rotated for north–south crossings. On the kid's map, "log bridge (stay dry!)" once seen. Every sample valley has 12; first-light's nearest is 22 tiles from the start. **Gotcha:** the world hash includes the flags, so the goldens moved.

### Gravel shallows
`M7` · `uncommitted` · `playtest: pending` · SPEC §6.3, §7.7, §5.2

`layFords` (`src/sim/worldgen/fords.ts`, after `layLogBridges`): crossings east or south from an open bank over 1–4 stream or gravel tiles (`MAX_SPAN`) of slow water to an open bank, where the stream falls at most one elevation step a tile along its course (`fall`; about 60% of stream tiles); none on a log. Score: still water (+0.8) or nearly (+0.3), width, a hash, +2 where a game trail reaches a bank. Best first, 14 tiles apart (`SPACING`), 6 from a log bridge, up to 14. Then every lake-shallows tile within 2 of a stream tile touching the lake (the mouth's gravel fan). All get `FLAG.ford` (bit 128, the last free one); no new terrain, so drinking, fishing, the water's look and sound are unchanged. first-light: 29 stream tiles, 20 lake fan tiles. Underfoot: `FORD_STEP_TICKS` (8; `stepTicks`), wet only to `FORD_WET` (25; `entered`), and nobody goes under (`stepHazards`). Named "gravel shallows" (`nameAt`). Drawn by `Ground.gravelBar` (`render/ground.ts`): a smooth field over the ford tiles with a perlin edge, pale water, pebble clumps, white riffles, fading into the stream round it. On the kid's map, "shallow crossing" (stepping stones) once seen, one per crossing.
- **Going under, for anyone** (`stepHazards`): wading a stream or gravel 1.2% a tile, lake shallows 0.3%, +4% in the dark, +3% worn out, +3% a poor swimmer (who loses more warmth and morale); soaked through. Before, only a poor swimmer could (3%).
- **Gotcha:** the world hash includes the flags, so world hashes moved (the default seed's terrain snapshot didn't).

### Dens and the trail network
`M7` · `46d8182` · `playtest: pending` · SPEC §6.3, §9

`placeTerritories` (`setpieces.ts`) places each range by habitat with a scored search (`best`): the bear's den (`F.den` data 0) under rock on a shady slope near forest, 5–26 tiles from the high berries; the elk on the most open meadow with water and timber near; the cougar's lair (data 1) on rock above the elk, 6–34 tiles from it; the marmots' burrows (data 2, up to four) in sunny talus by a high meadow. All at least 10 tiles inside the map's edge and away from the start. Dens are drawn (the bear's as a cave, `bearDen` in `render/landmarks.ts`; the lair and burrows `den1`, `den2` in `sprites.ts`), named by look (`DENS` in `content/loose.ts`), and looked into with *look-den* (`loose.ts`: the text, a temper row for the bear and cougar, a discovery the first time). `layTrails` (`finish.ts`) lays each animal's own round, never den to den: the elk from bedding (the nearest open forest within 12) to their meadow, to water, and to the nearest pass within 70; the bear from its den to each safe berry patch within 45, and to water; the cougar from its lair to the elk meadow, and to water; the ten biggest meadows each down to water; every pass (one tile per scramble route) to the nearest trail or water. Each trail meanders (`meander`: up to four waypoints pushed off the line by a smooth field, snapped to open ground, each leg an eight-way cheapest path (`cheapestPath(..., true)`: diagonals cost √2 and need both side tiles open) pulled taut by `taut` and laid as four-way tiles by `line4` in `grid.ts`; 30b4851, see below); the cost favours easy grades (climb ×0.35), avoids water, discounts existing trail (×0.4), and adds per-tile roughness and a smooth field. `g.trailBy` / `World.trails` records whose each tile of the route is (`TRAIL_BY`; overlaps go to the bear), and `scatterLoose` puts that animal's prints along it (none on rock, talus, boulders, scree). The worn path (`FLAG.trail`: drawn, and quicker underfoot) shows only where the ground holds a tread: always on forest floor, scrub, and sand, 70% on meadow, 30% on snow, never on rock, talus, scree, bog, or water, so trails come and go. Prints are named by look (`LOOSE` names). `thinkMinute` warns at once on a bear's trail with bear prints within 3 tiles (`BEAR_TRAIL_THOUGHT`, then not for half a game day).
- **Trails at any angle** (`M7` · `30b4851` · `playtest: pending` · SPEC §6.3): each leg was a four-way cheapest path, which came out as straight runs with right-angle turns. Now `taut` walks the eight-way route and, from each bend, jumps to the farthest point up to 24 steps on whose four-way line (`line4`) costs at most 1.06× the route's own cost (the line's cost scaled by straight length over |dx| + |dy|), so bends stay only where the ground makes them. Underfoot it's still four-way tiles (movement is four-way). `ground.ts` draws a trail tile with exactly two trail neighbours at a right angle as a line cut across the corner, edge-middle to edge-middle, so a staircase reads as one slanting line. Tuning: the 24 and 1.06 in `taut`. **Gotcha:** `cheapestPath` without `diagonal` visits neighbours in the old N, E, S, W order, so rivers and every other caller are unchanged.
- **Trails drawn as lines** (`M7` · `482337e` · `playtest: pending` · SPEC §6.3, §12.1): trails used to be drawn tile by tile, each worn tile joined to every neighbouring one, so where two trails ran side by side or met, the touching pairs drew rungs: a comb. Now `layTrails` keeps each laid trail's bend points (`taut` collects them; `meander` returns `{ path, bends }`) in `Gen.trailLines` / `World.trailLines` (not in `worldHash`; generation is unchanged). `Ground.indexTrail` rounds each line's corners (two Chaikin passes, each cut at most 20 px so it stays on the tiles laid) and lists each segment on every tile within 1.25 tiles; `paint` draws the worn path within ~1–2 px of the nearest segment (perlin wobble), wherever the smoothed `tread` field (1 on `FLAG.trail` tiles) is over 0.3, thinner as it falls, so a path fades out where the ground stops holding a tread. Trails side by side show as two braided paths. **Gotcha:** a test world built by hand (`tests/sample.ts`) needs `trailLines: []`.

## 5. Protagonists

### Candidates and the roster
`M0` · `27fbb89` · `playtest: n/a` · SPEC §4

`candidate(seed, index)` (`src/sim/protagonist.ts`) draws a protagonist from the sub-stream `protagonist:<index>`: gender, a name from equal boys' and girls' lists, age 12–15, looks (skin, hair, hair style, shirt, trousers), background, trait, tool, and 1–2 pocket items. The roster is `src/content/protagonists.ts` (7 backgrounds with modifiers as data, 7 traits, 3 tools, 8 pocket items). `protagonistProblems` validates a hand-built one; `pronouns` gives he/she forms for the log.
- For now a run plays candidate 0 (or `?candidate=N`); the selection screen is M2. `tests/protagonist.test.ts` starts a run with every background, trait, and tool.

### No repeats among the three cards
`M7` · `86eeda9` · `playtest: pending` · SPEC §4.1, §4.3

Candidates come in pages of `PAGE` (3, `src/sim/protagonist.ts`; `ui/select.ts` shows one page). The sub-stream `protagonist-page:<page>` shuffles both name lists, the backgrounds, the traits, and the tools; card `index % PAGE` takes its slot from each, so a page never repeats a name (two cards of one gender take different slots of that gender's list), background, trait, or tool, and every page offers a hatchet, a knife, and a multi-tool. Gender, age, looks, and pockets still come from `protagonist:<index>`. `tests/protagonist.test.ts` checks 20 pages of three seeds.
- Changed who every seed's candidates are (first-light's first page: Wren, Theo, Hazel; was Mira, Ravi, Mira). Run codes and saves store the whole protagonist, so they're unaffected; `?candidate=N` links show someone new. Goldens moved (state only): `first steps` `ba0804cf`/`4fd41a24`, `night walk` `e23c937b`/`738a07f9`.
- **Gotcha:** every roster list (each gender's names, backgrounds, traits, tools) needs at least `PAGE` entries; there are exactly 3 tools.

## 6. Movement, time, and sight

### The step and movement
`M0`/`M1` · `27fbb89` · `playtest: pending` · SPEC §5.1, §5.2

`step(state, world, commands)` (`src/sim/step.ts`) applies the tick's commands, moves the survivor, advances the tick, and every game minute re-reveals the map; it returns events. Commands (`src/sim/state.ts`): `move` (a direction held), `halt`, `debug-teleport`, `debug-fire`.
- Grid steps: 6 ticks on open ground; terrain sets its own (`TERRAIN[].stepTicks`: marsh 10, talus 10, scree 14, shallows 12, ...), features add to it, a trail caps it at 6, and climbing adds one tick per 2 elevation units (up to 6). `stepTicks` in `src/sim/world.ts`.
- A tap shorter than a tick still takes a step (`queued`), and a tap during a step is taken when it ends. Walking into something blocked turns to face it and sends one `bump` event.
- Input (`src/platform/input.ts`): WASD or arrows; held keys stack, so releasing one returns to the other. The browser loop (`Loop` in `src/platform/session.ts`) runs whole ticks at 20 a second times the debug speed, at most a few per frame, and the renderer slides between them.

### Free walking (prototype)
`M7` · `482337e` · `playtest: pending` · SPEC §5.2; Q46

The survivor walks over the tile grid instead of stepping tile to tile; the world stays on tiles. `FREE_WALK` (`content/balance.ts`) picks it for every new run (`newGame(..., walk)`, `GameState.walk` 'free'; absent is 'grid', so old saves and grid runs are unchanged). Set it false to go back.
- **Position:** `PlayerState.fx`, `fy` are the feet in 1/256ths of a tile (`SUB`); `x`, `y` stay the tile under them, so everything that asks where the survivor is still works. `lastFx`, `lastFy` are last tick's, for the renderer.
- **Moving** (`moveFree` in `sim/step.ts`): the held way `vx`, `vy` (-1, 0, 1 each) from the new `walk` command (input sends every held direction at once, so two keys walk on a slant; `dir` is the key pressed last, for facing); `move`/`halt` still work (one way). Speed: a tile in the ticks a grid step onto the tile ahead would take (`stepTicks` × slowness × load), ×181/256 on a slant; whole units, no trigonometry, so replays stay exact. A tap walks at least `TAP_TICKS` (3) in the `queued` direction (`nudge`).
- **Collision:** a footprint of `FOOT_HALF_W` × `FOOT_HALF_H` (about 10 × 6 px) must lie on tiles `canEnter` allows (bar the one the feet are on); `slide` moves one axis at a time as far as it fits, so a slant slides along walls; walking straight into an edge eases round the corner up to `CORNER_EASE` (4 px). Stopped dead: faces it and sends one `bump`.
- **A new tile** (`entered`, shared with grid steps): distance, wet feet, the `step` event, hazards, sight, viewpoints. `stepLeft`/`stepTotal` are 1 on that tick only (fish see a step start).
- **Clicked walks** (`steer`, `followed`): toward the next tile's centre, cutting the corner (3/8 tile) when the route turns and both sides are open; back to the centre if that catches; a step done when the feet cross into the next tile (two at once on a cut corner); off the route, the way is found again; arrives on entering the last tile.
- **Facing** stays four-way (sprites, "the tile in front" for actions): on a slant it keeps whichever of the two ways it already faced.
- **Pace eased** (`M7` · `uncommitted` · `playtest: pending` · SPEC §5.2): `PlayerState.pace` is last tick's speed (0 when stopped, blocked, asleep, or at a task). On the move, the new speed is `easePace(was, target)`: half the gap a tick, at least one unit, whole numbers only; from a standstill it is the target at once (no wind-up). Without it the speed changed the tick the feet crossed into a tile (the speed comes from the tile ahead), so walking through forest (meadow 6, conifer 10, aspen 8 ticks) lurched every tile. Goldens moved (state only).
- **Renderer:** the camera eases after the feet (see §7 "Camera, grade, darkness, firelight"); walking frames change every half tile walked.
- **Tests:** `tests/step.test.ts` "free walking"; the grid-timing tests set `walk` 'grid'. The bot plays on the grid (`playBot` clears the free fields). Goldens moved (state hashes only).
- **Gotcha:** "the tile in front" is still the neighbour of the tile under the feet, which can be a little behind where the survivor is drawn when they're near a tile's edge.

### Time, daylight, sight, and viewpoints
`M1` · `27fbb89` · `playtest: pending` · SPEC §5.1, §6.4

- `src/sim/time.ts`: 20 ticks a minute (`TICKS_PER_MINUTE`; 10 until 2026-11-27, `M7` · `uncommitted` · `playtest: pending`): an hour is a real minute. Write every game-time duration in ticks with `MIN`, `HOUR`, `DAY` (`content/balance.ts`), never a bare number; walking, animals' step timers, the bear's warning window, and fish timers are real-time ticks and stay as they are. `minutesUntil` gives the minutes to a time of day. The run starts at 11:00 on day 1 (`START_MINUTE`; 14:30 until 2026-11-26). Daylight 0–100 from an hourly table (`DAYLIGHT` in `src/content/balance.ts`): light from about 06:00, dark by 21:00.
- Sight: 14 tiles by day down to 2 at night (`sightRadius`); a fire lights 6. What's in sight is marked explored (a bitset in `GameState.explored`). The renderer's darkness uses the same circles (`sightCircles`), so the picture never shows more than the survivor can see.
- Viewpoints: standing within a tile of one reveals 30 tiles round it, once, with a line of text (the signal knoll and the wreckage view have their own).

## 7. Rendering

### Placeholder tiles and sprites
`M1` · `27fbb89` · `playtest: pending` · SPEC §12.1

**Ground and trees are now drawn by the M7 beauty pass (§25); the terrain atlas here is no longer used for the ground.** `src/render/tiles.ts` draws everything in code from the 32-colour base palette (`src/render/palette.ts`): each terrain is a flat colour with a simple glyph in 4 variants; features and the survivor (layered from the protagonist's looks, four facings, two walk frames) are small shapes. Hill shading lightens slopes facing north-west. Game trails show as worn patches.
- **Gotcha:** wild rose (`F.bush`, a fixed floor food) is drawn sparse and pale so it doesn't look like the dealt berry bushes.

### Camera, grade, darkness, firelight
`M1` · `27fbb89` · `playtest: pending` · SPEC §6.4, §12.1

`Renderer` (`src/render/renderer.ts`) draws in 384×216 screen pixels, scaled by a whole number to the window (and since the smooth camera, drawn at the device's own pixels: see below). The camera follows the survivor's interpolated position and stops at the map's edges. Then:
- **The camera eases** (`M7` · `uncommitted` · `playtest: pending` · SPEC §12.1): `Renderer.camera(state, alpha, dt)` keeps `follow`, an aim that closes on the survivor's sprite corner with `1 - exp(-dt / FOLLOW_TAU)` a frame (`FOLLOW_TAU` 0.14 s, about 7 px behind at a walk), and snaps when the survivor is more than `FOLLOW_SNAP` (4 tiles) from it or the world changes (`setWorld`). The view is the survivor's own position (`snap(px * TILE)`, the one `drawSurvivor` uses) less the lag snapped on its own, so the survivor holds still on screen while the world scrolls; before, camera and sprite were rounded apart and the survivor wobbled a pixel. `Loop` (`platform/session.ts`) no longer sends alpha 0 while paused, which snapped the picture back a tick when a note popped up.
- **Drawn at device pixels, so the camera moves by less than a game pixel** (`M7` · `uncommitted` · `playtest: pending` · SPEC §12.1): the canvas is `SCREEN_W × k` by `SCREEN_H × k` (`Renderer.resize(k)`, from `App.fit`: the window's scale times the device pixel ratio, or just the window's scale past `MAX_DEVICE_SCALE` 8), and every frame draws through `setTransform(k)` in screen pixels as before. The camera and the survivor are snapped to device pixels (`snap`: 1/k of a screen pixel); every tile, tree, and sprite still sits on a whole screen pixel of the world, so the art is as crisp as before and only the view slides. Before, the ground moved one game pixel (5 screen pixels at scale 5) a frame with a stalled frame every few, which was the jerk; now 4–5 device pixels every frame.
  - The sun-shadow layer stays one pixel a screen pixel (`SCREEN_W + 2` wide) but is drawn on the world's pixels (shifted by the camera's part-pixel and laid back by it), so shadows keep their blocky edge.
  - The darkness mask is one pixel a screen pixel and laid over with smoothing (it's only soft gradients); the firelight's `color`/`tmp` buffers are at `k`, and only the box round each fire (`box`) is copied, tinted, and masked.
  - Things rounded on screen pixels after taking the camera away would jitter against the world: round in world pixels, then take `cam.x` off (trout rings, waterfall foam and spray were changed).
  - Cost: in headless Chromium on the GPU, a night frame with a fire is about 0.5 ms even at a 3840×2160 canvas; in software rendering (SwiftShader) about 13 ms at 2304×1296, most of it the firelight.
  - **Gotcha:** `this.color`, `this.tmp`, and the canvas carry a scale of `k`: draw a whole buffer as `(0, 0, SCREEN_W, SCREEN_H)`, and a part of one with source rectangles times `k`. Setting a canvas's size resets its transform and smoothing (`resize` sets both again).
- **Grade** (`src/render/grade.ts`, keyframes by minute): cool dawn, flat noon, amber dusk, blue night; colour drains toward night (`saturation` composite) and a tint is multiplied over everything.
- **Firelight:** inside a fire's radius the full-colour scene is put back, lit warm, fading out from the fire, with a glow at the heart: the only colour at night.
- **Darkness:** from the sim's daylight, up to 95% at night, with a soft hole for the survivor's own sight (dim and colourless) and for each fire.
- Render-side randomness (water shimmer, fire flicker) uses `rh` and time, never the sim.
- **Gotcha:** the map is 256×256 but the screen is 24 tiles wide; only visible tiles are drawn.

### Tall things, rock formations, and the wreckage
`M7` · `46d8182` · `playtest: pending` · SPEC §12.1, §6.8

Trees are two to three tiles tall (`CONIFER` and `ASPEN` sizes in `src/render/flora.ts`; size by how crowded the stand is, in `Renderer.setWorld`), the split snag is a tall dead trunk (`tallSnag`, see "Landmarks drawn big" below), and rocks are drawn as boulders and crags (see "Rocks" below). Everything tall still blocks only its own tile; the survivor can stand behind it and it fades to half (`standUp` in `draw`). The forward wreck (`src/render/wreck.ts`, `forwardWreck`) is one 64-pixel drawing over its two tiles, mirrored by hash: the fuselage torn behind the cabin, the nose crumpled with the propeller bent back, a wing snapped skyward, the tail fin, a sprung door, a rust streak. Under everything, `crashScar` draws the furrow it ploughed, a torn panel, and scattered bits, with water tiles left clear (`layWreck`). The tail section (`tailWreck`) is a torn tube with its fin standing two tiles high.
- The draw loop now covers three rows below the view and two columns either side, for tall and wide things reaching in.
- **Things off the grid** (`M7` · `482337e` · `playtest: pending` · SPEC §12.1): `Renderer.offset(tx, ty, salt, mx, up, down)` sets each thing off its tile's centre: a smooth perlin field at /3.3 (salts `groveSeed + salt`, `+ salt + 1`; neighbours drift together) plus a per-tile hash (`200 + salt * 2`, `201 + salt * 2`), clamped so it stays in its tile. Trees (`treeOffset`, salt 7): 7 across, 5 up, 4 down; thickets half that. Boulders (21): 5, 4, 3. Outcrops (25): 3, 2, 2. Cliff and rim buttresses (29): 4, 3, 2. Bushes, plants, herbs (33): 5, 4, 3. Deadfall (37): 5, 3, 3. Loose things (41): 5, 4, 3. `standUp` takes the vertical offset. The overhang, wreck, landmarks, dens, and falls stay anchored. Replaces the separate small hash jitters (trees ±3/±2, boulders ±2, plants ±3/±2, logs ±3/±2, loose ±2/±1).
- **Conifers by kind, varied, with trunks** (`M7` · `482337e` · `playtest: pending` · SPEC §6.5, §12.1): every conifer was the same stacked cone. `conifer(size, v, form)` in `flora.ts` now draws three forms (`ConiferForm`): spruce (full drooping cone, blue-green), fir (narrow spire, exponent 1.25, darkest), pine (a clear trunk 20–28% of its height plus a little, a narrow rounded crown of dense tufts on short upswept branches; brown bark). `v` (0–3, `CONIFER_VARIANTS`) varies the lean (top up to ±1.5 px), each side's fullness, ragged tiers of different depths, a broken branch (one side of a tier short, 14%), a broken top on big ones (10%, a short grey stub), and a tint of ±10%. Every tree from size 2 shows a bare trunk under the crown (3–7 px; flared at the roots), in shade just under it. `Renderer.formAt` picks the form per tile from what the world says: burned within 120 years, mostly pine (it comes back first after fire); subalpine and up, mostly fir; sunny slopes (higher ground to the north), half pine; otherwise mostly spruce. Thickets use the same forms. Trees now stand up to 3 px off their tile's centre and 2 px up or down (hash 97, 98), so stands aren't on a grid. Render only. **Gotcha:** the canvas is 30 wide with the trunk at x 14, so the bark-stripped scar is at `sx + 7 + jx` for both conifers and aspens.
- **Aspens** (`M7` · `30b4851` · `playtest: pending` · SPEC §12.1, §6.5): `aspen(size, v, leaf)` in `flora.ts`: a white trunk two pixels wide (one for saplings) with black marks, shaded on the right, running up into an upright, airy crown (an ellipse `R*0.8` by `R*1.7`) of small leaf clusters with branches between, kept inside the canvas (the old blobs were clipped flat on top). About 80% of a conifer's height at each size (`ASPEN`; 16–33 px against 13–49), so grown spruce and fir stand over them. `leaf` (`AspenLeaf`): 0 green, 1 turning (a third of the clusters gold), 2 gold, 3 thinning; `Renderer.aspenLeaf` picks it by day: each grove turns together (perlin at /9, `groveSeed`), from about day 8 to 26, higher bands sooner; gold for 22 days, then thinning. Trees are cached by kind, size, variant, and leaf. `renders/sheet/` (git-ignored) has a sheet of sizes. **Gotcha:** a bark-stripped tree's scar is drawn at `sx + 7 + jx` (the tree's own offset), which assumes the trunk at x 12 of a 26-wide aspen canvas and x 14 of a 30-wide conifer's.
- **Rocks** (`M7` · `30b4851` · `playtest: pending` · SPEC §12.1): `rockMass` (blocky ledges and strata, which read as sharp and didn't fit the ground) is replaced in `flora.ts` by `paintRock`: a rock is a few `Lump`s (superellipses, `p` 2 round to 5 blocky), each pixel the front-most lump's, shaded by its surface normal against `LIGHT` (upper left) in six tones of the stone's colour with a 4×4 Bayer dither and a little grain; a dark crease where lumps meet, a dark foot and shaded outline, a lit top edge, specks of the stone's mark, lichen on lit tops. `boulder(size, v)`: one rounded lump plus up to two grown on. `crag(size, v)`: two or three square-shouldered buttresses (tallest mid), rubble at the foot, upright joints. `Renderer.rock`: boulders (`stone` -2) use `boulder`, everything else `crag`; 6 variants; boulders sit off-centre and mirrored by hash. Boulder size is by hash (40% size 0, 35% 1, 18% 2, 7% 3; +1 when crowded); outcrops are crags of 2, or 3 when crowded; the overhang 3. Cliffs and the rim: the face is ground (`ground.ts`: mottled weathered rock, a few broken fractures with lit lips, lichen; the old full-height column stripes and tile-edge bands are gone); crags stand on 70% of the cliff tiles that face open ground (size 1–3, the rim 2–3) and on 12% of the rim's inner tiles (size 3). The darkest stone (`STONE_LOOK[0]`) is lifted so it doesn't draw black.
- **Landmarks drawn big, and the bear's cave** (`M7` · `482337e` · `playtest: pending` · SPEC §6.3, §9, §12.1): `src/render/landmarks.ts`, drawn with `paintRock` (now exported from `flora.ts` with `Lump`, `canvas`, `px`) and stood on their tile by `standUp`, mirrored by hash, 2 variants each: `rockArch` (58×46: two broad legs and a span of blocks on a curve, a round-topped hole cut through, the span's underside and the legs' inner faces in shadow), `tallSnag` (62–68 px, over the tallest conifers: split top, scorch, bark in strips, limb stubs; replaces flora's `snag`), `bonePile` (skull and antlers, ribs, spine, long bones), `carcass` (on its side, opened ribs, legs out, antler, a stain), `bearDen` (54×40: a rock mound with a wide dark mouth on the den's tile, a fan of spoil, old bones, a raked log; den data 0 only, the lair and burrows keep their 16-px sprites). Each still blocks only its own tile (`FEATURES` unchanged). The atlas sprites (`tiles.ts`) stay for the map and UI.
- **Waterfalls** (`M7` · `482337e` · `playtest: pending` · SPEC §6.3, §12.1): `src/render/falls.ts`. `findFalls` groups `T.waterfall` tiles (8-way), gives each falls the way its water runs (from the other water beside it that lies above its foot, else highest tile to lowest), its foot (furthest along that way, two tiles in from the map's edge), where the water comes from (`ux`, `uy`), and whether water carries on below the foot (`below`). **On the ground** (`ground.ts`, every falls): a cascade down the river's own bed: ledges of wet dark rock (`FALL_ROCK`) across the flow every 7 px, wobbled, the water pouring white over most of each; churned white below a ledge, then green-blue (`FALL_WATER`) with white streaks along the flow; banks within 2 px wet dark rock (a little gorge). No longer `HARD`, so they join the stream's outline; `Renderer.water` races foam along the flow. **Face-on** (`faceOn`: running toward the viewer, `dy` ≥ 0.6, the water above lined up within 0.6 of the foot, and water below it): `fallsArt(big, v)` (40×34 or 34×28): a low band of wet rock across the river, the water dark and glassy to the lip, a pale line where it tips, a white streaked sheet the width of a stream (12 or 9 px), a pool going white to green-blue into the stream below; the top rows clear so the stream above shows. `Renderer.drawFalls` puts the pool's middle on the foot tile's centre and draws moving streaks and spray, fading when the survivor is behind. In the sample (11 valleys) only one falls is face-on; the rest, including every outlet at the rim, cascade. Cliff and rim buttresses are left off tiles beside falling water and within 2 of a foot (`byFalls`). (World generation used to mark a stream's corner tile on the bank as falling water where the stream crossed a band edge; fixed in `raiseCliffs`, §4.)
- **The survivor always in sight** (`M7` · `482337e` · `playtest: pending` · SPEC §12.1): everything tall fades when the survivor is behind it, but in a thick stand three or four faded trees stack over them and hide them (it looked like an aspen's fault in `berries.png`; it was the conifers). `draw` keeps `hidden` (set wherever a tree, thicket, rock, cliff buttress, landmark, or falls fades for the survivor) and, after every layer, draws the survivor again on top at 70%.
- **Gotcha:** hovering is still by tile: a tree's canopy over the tile behind it isn't the tree; click the trunk's tile. A bark-stripped tree's scar is placed by trunk (`sx + 7 + jx` for both): change it if the canvases' widths change.

## 8. Screens and HUD

### The survivor's thoughts (the tutorial)
`M7` · `46d8182` · `playtest: pending` · SPEC §12.2

`thinkMinute` (`src/sim/thoughts.ts`, run each game minute from `minuteHooks`) gives at most one thought per half hour of game time (`THOUGHT_GAP`), none in the first 20 minutes (`FIRST_AT`) or asleep. The first evening's steps (`FIRST`: water, look, gather, fire, shelter, dark, food) come once each, skipped once done; a step thought but not done holds back the next non-urgent one for two game hours (`PATIENCE`); shelter, dark, and food are urgent and come on time. Then the first full pockets once. (Thirst, hunger, cold, and tiredness are now `NOTICE`, checked before the chain: see "What the kid notices".) Words in `src/content/thoughtText.ts`. A thought is a log line in quotes and a `thought` event; the app shows it as a note that pauses the game, with the how-to line under it, which settings can turn off (`Prefs.hints`) (see "Thoughts and insights as notes").
- Memory keys: `thought:<id>` (count), `thought-last:<id>` and `thought-at` (ticks), `thought:slept`.
- **Gotcha:** a step's `done` must become true when the player has done the thing, or it holds the chain back for `PATIENCE` each time; a nudge with nothing to do (`look`) counts as done once thought.

### Tasks fast-forward
`M7` · `cb96676` · `playtest: pending` · SPEC §5.1

`App.onFrame` (`src/platform/app.ts`) runs the loop at `TASK_SPEED` (16; 8 until the clock slowed, 2026-11-27, so a task takes the same real time) while `state.task` is set, as it runs `SLEEP_SPEED` (180; was 90) while asleep: ticks run faster, never skipped, so replays and hashes don't change. An event in `STEADY_ON` (an animal, a thought, a storm, a slide, an aircraft, sickness, the weather, lightning, a notice) sets `steadied`, and the rest of that task runs at normal speed; `task-start` clears it. Platform only.

### Thoughts up front, and the fire reactions
`M7` · `cb96676` · `playtest: pending` · SPEC §12.2

(Changed again 2026-11-27: see "What the kid notices, the opener, and the clues"; `noCatch` and the water and food steps are gone.) The first day's chain (`FIRST` in `src/sim/thoughts.ts`, text in `content/thoughtText.ts`) then started with `cold` (the snow on the peaks: a fire before dark), then `water`, `gather` (what a fire needs), `fire` (striking rock; due once tinder or a stick is carried), `lay` (enough to lay one and a way to light it), then shelter, dark, food as before; `look` folded into `gather`'s hint. `FIRE_REACTIONS` (`FIRE_THOUGHTS`: `sparked`, `carrying`, `laid`, `noCatch`, `lit`) come ahead of the chain once `REACT_GAP` (10 game minutes) has passed since the last thought; only the latest that applies is said, and the earlier ones are marked thought. Shown as notes (below).
- **Gotcha:** `laid` waits for a way to light (a carried spark-stone, matches, or embers); without one it would tell the kid to strike sparks they can't make.

### What the kid notices, the opener, and the clues
`M7` · `uncommitted` · `playtest: pending` · SPEC §12.2, §8.3

`thinkMinute` (`src/sim/thoughts.ts`) now checks `NOTICE` before the first day's chain: wet and cold (wet ≥ 50, warmth < 65, no fire within 2), rain (wetting weather, no rain cover, wet ≥ 25), wind (`weatherNow().wind` ≥ 0.6, warmth < 72, little wind cover, no fire), thirsty (< 62), chilled (warmth < 35), hot (`weatherNow().hot`, hydration < 80, in the open), hungry (< 60), tired (rest < 20); the first that holds and wasn't thought in the last 8 hours (`RETURN_GAP`) is said, in `wording` order (the first wording, with its how-to, once; then the others in turn). Text: `NOTICING` in `content/thoughtText.ts`. Every condition is something the body sim really does (wind and wet chill, hot sun dries you out, `body.ts`). `FIRST` is now cold (when it's 14:00, day 2, or a cold-type thing has been noticed; urgent), wreck (always; done once searched), gather, fire, lay (all after the cold), shelter, dark; water and food left it (thirst and hunger are noticed). `RETURNING` is gone (folded into `NOTICE`).
- **How the crash left the kid** (`crashLeft`, `sim/newGame.ts`): from the `protagonist` stream (unused during a run otherwise), one of four: as usual, parched (hydration 52), hungry (nutrition 50), soaked and chilled (wet 60, warmth 60).
- **Clues** (`clue(s, id, events, fill)`): a failure's note at once, the cause's lines (`CLUES`) in turn, each once (`thought:clue:<id>`); returns how many have been said. Fire (`light` in `sim/fire.ts`): no tinder → `noTinder`; flared out → `flaredOut`; didn't catch → `catchClue`: a tinder that never catches → `dudTinder` (naming another tinder: one known to catch, else one carried); tinder nest not known → `nest` (its second line teaches `tinder-nest`); only the multi-tool → `weakSparks` once; slow tinder → `slow` once; else `unlucky`. Bow drill in the wrong wood → `drillWood`. A craft that came apart (`craft.ts`) → `craftFail`. The `noCatch` fire reaction is gone.
- **Gotcha:** a noticing condition must be something the sim really does, or the kid gives false advice (trees don't break the wind in `shelterAt`, so the wind line says rock or something built). The water how-to mustn't say the water is safe: that's dealt.

### Insight slips
`M7` · `cb96676` · `playtest: pending` · SPEC §12.2, §8.1

On a `discovery` event the app asks `insightText` (`src/ui/insight.ts`) for a card: a technique gives "New idea!", its name, its text, and the recipes it adds to Make; a fact gives "Now I know" or "I think...", "The <look> <what it means>" (`MEANS`, else the raw value), and how it was learned. Shown as a note (below). UI only.

### Thoughts and insights as notes
`M7` · `d88b426` · `playtest: pending` · SPEC §12.2

Each `thought` event and each `discovery` with an insight card is queued in `App.notes` (`src/platform/app.ts`); after a tick's events, if nothing else is open, `showNote` opens the `note` modal (`notePage`, `src/ui/note.ts`), which pauses the loop like any modal. A click anywhere, E/Space, Enter, or Esc (`closeNote`) shows the next queued note or returns to play; a note can't be closed for its first 400 ms (`NOTE_GUARD`) so a key or click already on its way doesn't skip it. The note is a slip of notebook paper (ruled, the kid's hand, tilted) in the middle of the screen, the scene dimmed a little behind it (`.overlay.noting`, `.note` in `style.css`), with "Click or press E to carry on" (or "more (N)"). The lines at the foot of the screen skip thoughts (log lines in quotes) and techniques' `learned` lines (`isNote` in `src/ui/hud.ts`); the journal's log and the diary keep them. Platform and UI only: hashes unchanged.
- `Loop` (`src/platform/session.ts`) now checks `paused` before each tick, so a note opened by a tick stops the rest of that frame's ticks (at 8× or 90× a frame runs many).
- Scripts: `clearNotes()` in `scripts/browser.mjs` reads away any open notes; `tour`, `shots`, and `places` call it (the tour before each key and shot, and it shoots the first thought as `04-note`).
- **Gotcha:** the old caption (`Hud.think`) and timed slip (`Hud.insight`) are gone; `Hud.say` still puts narration (the opening, a view, "Not there") in the caption.

### Title, HUD, map, pause, check page
`M0`/`M1` · `27fbb89` · `playtest: pending` · SPEC §11.1, §6.4, §12.1

- Title (`src/ui/title.ts`): the name, tagline, the in-development notice, *First valley* (the default seed), *A new valley* (a random seed), a seed box (remembered in `localStorage` as `snowline/lastSeed`), controls, the version stamp, and the single-file download.
- HUD (`src/ui/hud.ts`): `Day N · afternoon` in a corner (the clock if the survivor has a watch); the six vitals as an icon over four drawn segments on a dark backing (sized up 2026-11-26 after the playtest: they and the log were too small), coloured and pulsing as they run low; words for what the survivor feels (wet, cold, thirsty, a condition's word and shape); the task in progress with a bar; the last few log lines, fading. Exact numbers are in the journal's Body page.
- Map (M, `src/ui/mapScreen.ts`): the kid's map (below). In debug, the accurate map first (`src/render/mapSketch.ts`: the explored valley tile by tile as a pencil sketch, the survivor, viewpoints, everything when revealed, click to teleport), with a button to switch.
- **The kid's map** (`M7` · `99514a3` · `playtest: pending` · SPEC §6.4): `drawKidMap` in `src/render/kidMap.ts`, on a 720 px notebook page (ruled, red margin), drawn fresh from the state each time the map opens. **Not to scale** (`makePage`): a fisheye about home (the first build or fire, else the crash): full size within 12 tiles, then distance^0.72; fitted to everything explored below the title band, at most 11 px a tile (so an early map is small mid-page), with a perlin wobble (±10 px). **Ground** from a survey in 4-tile cells of explored tiles: water (lake or tarn) and ice as smooth blobs (`blobField`, metaballs, `sum`) filled with crayon scribble and a pencil edge (`crayon`); streams as one blue line (stream tiles gathered into 3-tile cells, joined to neighbours, `blobField` `max` so it stays even); trails dotted along `World.trailLines`; peaks on rock cells and little trees on forest cells, a few, by hash. **Places**, each with an icon and a label in a hand font (Comic Sans MS or the like), only as known: PLANE; camp; the overhang once seen ("dry spot under the rock"); the tail, the knoll, lookouts stood on; spark rocks once a stone from them has sparked (`fact` 'sparks'); landmarks noticed (`noticed-<k>`); dens seen (the bear's "BEAR!! stay away" once looked into, `den-bear`); plant patches seen, labelled only when something's known ("dull red berries - ok to eat", "... - BAD!") or "berries?"; foul water once known. Icons are drawn first and keep a little room; important labels (home, the wreckage, warnings in red) are written first, then the rest, each text once, beside its place wherever it fits (`label`, up to 18 positions), or not at all. **Me**: a red stick figure only within 13 tiles of a place on the map, else "(not sure where I am now)". Title "<name>'s map", a north arrow, the days in tally marks. Render only. `renders/kidmap/run.mjs` (git-ignored) screenshots it at the start and after a scripted few days; it uses `window.__snowline`, the session, set only in debug (`app.ts`).
- Pause (Esc): carry on, or leave the valley (nothing is saved yet).
- All game text is in `src/content/text.ts`. The opening implies the pilot's death without showing it.

## 9. Sound

### Event hooks
`M0` · `27fbb89` · `playtest: n/a` · SPEC §12.3

Every sim event goes through `playEvents` (`src/platform/audio.ts`) to the app's `Sound`; see §21.

## 10. The body

### Vitals, morale, and death
`M2` · `12a039f` · `playtest: pending` · SPEC §7.1, §5.4

`bodyMinute` (`src/sim/body.ts`) runs every game minute: hydration and nutrition drain (faster walking or working, `EXERTION`; slower asleep), rest drains awake and comes back asleep (`sleepQuality`: shelter, warmth, the light-sleeper trait), warmth follows the air temperature, and health falls while a vital is empty or a condition harms it, and recovers slowly when all is well. Morale drifts toward a target from the situation (fire, food, dark, illness, the afraid-of-the-dark trait). At health 0 the run ends (`GameState.over`, with a cause for the summary).
- Numbers: `DRAIN`, `EMPTY_HARM`, `HEAL_RATE`, `SLEEP_GAIN` and friends in `src/content/balance.ts`. With no intake, hydration empties in 2 days and kills about a day later; nutrition lasts about 5 days.
- **Temperature** (`airTemp`): season base cooling 0.25 °C a day, an hourly curve table, −3 °C a band, cold air pooling on the valley floor at night, plus the weather (M4). Being wet (`player.wet`, from wading or rain) and wind multiply the loss; a fire within 3 tiles warms (`warmthNear` in `src/sim/surroundings.ts`).
- Collapse: at rest 0 the survivor falls asleep where they stand for 4 hours. While asleep they wake if thirsty or freezing.
- **Gotcha:** `surroundings.ts` is where shelter, fire warmth, and the weather plug in; later systems fill it in.

### Conditions
`M2` · `12a039f` · `playtest: pending` · SPEC §7.7

`src/content/conditions.ts` defines every illness and injury (rates per minute at severity 100, how long it lasts, how resting heals it, an HUD word and shape). `addCondition`, `treat`, `slowFactor`, `clumsyFactor` in `src/sim/body.ts`. M2 uses nausea (from a taste), food poisoning, deadly poisoning, and waterborne illness; the rest arrive with their causes in M4.

## 11. Food, water, and learning the valley

### Dealt plants: picking, tasting, eating, watching
`M2` · `12a039f` · `playtest: pending` · SPEC §6.6, §7.4

Plant patches are picked by the handful (`pick`, in season only: `SEASONS` in balance.ts; berries end on day 30), and a picked tile is bare for days (`GameState.regrow`; drawn faded). With a handful (`plant` item, `d` = plant index):
- **Taste** (`taste` in `src/sim/food.ts`): an answer an hour later. Nourishing and poor both feel fine (suspected *safe*); sickening brings nausea and is known; deadly numbs the tongue and is known. Nothing dies of a taste.
- **Eat**: nutrition by outcome now, and the whole effect within half an hour: nourishing and poor become known; sickening is food poisoning; deadly is deadly poisoning, which kills.
- **Watch** (40 minutes in daylight at a patch): jays come down and eat safe plants (suspected *safe*), or leave them alone (suspected *unsafe*). It stands in for real jays until animals arrive in M4.
- What's learned is a `Fact` in `GameState.known` (`src/sim/knowledge.ts`: `learn`, `see`, `fact`, `thingName`). A known fact is never downgraded.

### Floor foods, raw food, spoilage
`M2` · `12a039f` · `playtest: pending` · SPEC §7.4, §7.5

Cattail roots dug from reeds, crayfish and mussels felt for in the shallows (soaking the survivor), rose hips from wild rose (day 10 on), pine nuts from conifers (day 14 on). Every tile regrows after a few days (`REGROW_DAYS`). Raw shellfish risk food poisoning (`rawRisk`; cooking arrives in M3). Food carries the tick it was gathered and spoils (`spoil`, hourly, carried or on the ground); the inventory shows *fresh*, *eat soon*, *going off*. The pocket candy bar and granola bar never spoil.

### Water and the foul source
`M2` · `12a039f` · `playtest: pending` · SPEC §7.3, §6.6

`drinkAt` (`src/sim/food.ts`): each drink rolls for waterborne illness on the `health` stream: lake 3.5%, streams 1.2%, high water 0.3%, and the dealt foul source 7× that. The illness shows 2–5 days later (`GameState.pending`), lasts about a week, and when it starts the survivor suspects the source they drank from most in the days before. Looking at the beaver dam or carcass on the foul source makes it known. `GameState.drinks` remembers recent drinks.

### Starting valley facts
`M2` · `12a039f` · `playtest: pending` · SPEC §6.6 (protagonists)

`startingFact` in `src/sim/newGame.ts`: Scout knows the bow-drill wood, Angler the foul water, Hunter's kid one animal's temper, Farm kid one plant, Runner one stone, Reader one remedy (drawn from the `events` stream); City kid nothing. Said in the log on day 1.

### The valley notes
`M2` · `12a039f` · `playtest: pending` · SPEC §6.6

The journal's first page (`src/ui/journal.ts`): for each kind of dealt thing, the outcomes its deck can hold with their possible counts, highlighted when some are found and struck through when all are; then a row for each thing come across, *unknown*, *suspected?* (italic), or known, with how it was learned. It reads only `GameState.known`.

### The kid's notebook (the journal's look)
`M7` · `9ed349b` · `playtest: pending` · SPEC §8.1, §12.1

The journal (J) is the kid's notebook, in the same paper and hand as their map (§8 "The kid's map"): `.notebook` in `src/ui/style.css`: ruled paper (a fixed line height `--rule`, `calc(var(--k) * 7px * var(--text))`, so writing of every size sits on the lines; the rules a background that scrolls with the page), a red margin, a hand font (Comic Sans MS or the like), pencil colours, the page a little askew, coloured index tabs ("Valley notes", "Diary", "What I can do", "How I feel"). In the notes, a known outcome is underlined green, or in red with a wavy underline when it turned out badly (`BAD` in `journal.ts`: deadly, sickening, foul, irritant, crumbles, fails, inert, nothing, bold); unknown is "?". The diary (the log) is grouped under headings for each stretch of a day, "day 2, early morning": the part of the day (`partOfDay`), the clock time only if the kid has a watch, as on the HUD. "How I feel" draws the vitals as pencil-hatched bars, and "What's wrong" lists conditions. `npm run tour` shows three of the pages (`renders/tour/08`–`10`).

### The diary in the kid's words
`M7` · `9ed349b` · `playtest: pending` · SPEC §8.1, §12.2

`diaryLine` (`src/content/diary.ts`) writes each log line as the kid would in the diary (the log itself, and the captions, stay as narration). `firstPerson`: the name becomes "I" where it starts a clause (after the start, a stop or comma, or a joining word: `CLAUSE_START`) and "me" elsewhere; "Name's" "my"; she/he "I"; her as "me" or "my" by the next word (`AFTER_ME`); his "my", him "me", herself/himself "myself"; a few verb fixes ("I am", "I have"). Then `PHRASES`, about 100 rules: weather, signs, sleep, body, tasting and eating, fire, animals, hazards, things noticed, small things, each as a kid would write it ("Started raining.", "Woke up freezing.", "Felt sick. DON'T eat the glossy red berries.", "FIRE!!! The tinder caught and I MADE FIRE!!"). Unmatched lines keep the first person and lose a leading "I" before a doing verb (`DROP_I`: "Found 3 sticks."). Thoughts are written without their quotes. Tests: `tests/notebook.test.ts`. **Gotcha:** the phrasebook matches the narration's exact words; changing a line in `content/*Text.ts` or `messages.ts` can make its diary line fall back to the plain first person.

### Water damage to the notebook
`M7` · `9ed349b` · `playtest: pending` · SPEC §8.1, §12.1

`src/sim/notebook.ts`, each game minute (`minuteHooks`): the notebook (in a pocket) takes up water while the kid's clothes are soaked (`player.wet` ≥ 30: a quarter of the difference a minute) and dries 0.2 a minute otherwise. Crossing 50 is a soaking (`notebook-soakings`, a tide mark) and while it's 50 or more it takes lasting damage (`notebook-damage`, up to 0.0625 a minute, capped at 100, never mends) and everything written so far counts as under water (`notebook-soaked-at`). All in `memory`, written only once it's been wet (a dry run's state is unchanged). `notebookWear` reads it. **Journal**: a tide mark per soaking (up to 7, hashed size and place); writing from before the last soaking is smudged (blurred, ink run blue) or washed half away (blurred, faint) by hash as the damage grows (`blot`); the page is darker while damp. The map stays dry (the user chose this: it's kept apart from the notebook). `renders/kidmap/wet.mjs` (git-ignored) shows a soaked diary. Tests: `tests/notebook.test.ts`.

## 12. Actions and inventory

### Actions on the faced tile
`M2` · `12a039f` · `playtest: pending` · SPEC §5.2, §12.4

E (or Space) offers what can be done to the faced tile and the survivor's own (`availableActions` in `src/sim/actions.ts`); one option runs at once, several open a numbered menu. Each action is a definition (`ActionDef` in `src/sim/actionKit.ts`): an offer (label or null), minutes, a skill, whether it needs light, and what it does. Commands carry the action and tile; the sim checks again before starting. An action is a `GameState.task` that ticks down; moving cancels it; Esc cancels it. Times stretch with conditions, low morale, and hunger (`clumsyFactor`) and shrink with skill (`speedAt`).
- M2 actions: drink, pick, watch, pick herbs, dig cattail, feel the shallows, rose hips, pine nuts, gather sticks, pick up, look at the dam or carcass, search the wreck.
- **Gotcha:** later systems add their actions to `SYSTEM_ACTIONS` in `src/sim/systemActions.ts`, importing only `actionKit.ts`, which avoids import cycles.

### Full hands and used-up spots
`M7` · `46d8182` · `playtest: pending` · SPEC §7.8, §5.2, §12.4

What's gathered or made but doesn't fit is set down at the survivor's feet as a stash (`giveOrDrop` in `src/sim/inventory.ts`; `receive` in `src/sim/actionKit.ts` adds the log line "…so he set them down at his feet"). Every gathering, catch, cooking, filling, dressing, and crafting output goes through it. An `ActionDef` can say why it can't be done again yet (`spent`: picked over, stripped, out of season, hands full); `availableActions` keeps it with `ActionOption.spent`, the menus grey it out with the reason (`offered` in `src/ui/look.ts`), the hover label says it (`lookHint`), a click never picks it, and `startAction` refuses it, so it takes no time.
- `spentUntilBack(why)` for harvests that grow back (`ready`/`deplete`, `GameState.regrow`); `spentWhenUsedUp(why, kind, supply)` for those that don't (next entry). Loose things and stashes are `hands full` when not even one would fit (`hasRoom`), so they stay where they lie.
- **Gotcha:** a `done` that adds items should call `receive` (or `gather`) after its own log line, not `give`, or what doesn't fit is lost. Weir and cache takes still use `give` and leave the rest in place.

### What grows back and what is used up
`M7` · `46d8182` · `playtest: pending` · SPEC §8.2, §6.7, §7.4

Only what really comes back within a run regrows on a timer (`GameState.regrow`): plant patches, bushes, reeds, the shallows, and loose things. Fallen twigs and branches and driftwood (`blows` in `LOOSE`) also come back as soon as a hard wind has blown since they were taken (`blewSince` in `src/sim/weather.ts`: any forecast period after the take with `WEATHER[id].wind >= BLOWING`, i.e. high wind, thunderstorm, the great storm; read from the forecast, no state). Everything else is used up for good after a few takes per tile (`SUPPLY` in balance.ts; times taken in `GameState.taken`, keys `<kind><tile>`; `supplyLeft`/`useSupply` in `actionKit.ts`): a tree's limbs (`w`, 3 cuts), its bark (`b`, 3: *Strip bark* and *Shred inner bark* share it), lichen (`li`, 2), a deadfall's wood (`w`, 3; the trunk stays, "only the trunk is left") and punk (`p`, 2), and loose stones and outcrop chips (`once` in `LOOSE`; `taken['l<tile>']`). Green boughs never run out. A tree with any bark taken is drawn with a pale scar on its trunk (`barkStripped`, `src/render/renderer.ts`).
- Saves went to schema 4 for `taken`, then 5 when the valleys changed (the history pipeline); older saves can't be carried on.
- Bot, 30 seeds, measured before the new valleys: learning the valley, median 19.6 days (was 19.1); handed the deal, 21.8 (was 22.2). It lived mostly on driftwood and branches, so it rarely met a used-up woodland; the playtest is the real test. (On the new valleys, see TODO.md's bot note.)
- **Gotcha:** `GameState.regrow` and `taken` are looked up, never iterated (determinism); wind is worked out from the forecast at lookup, not by sweeping the map.
- Extra hooks for later systems: `src/sim/systems.ts` (per tick, per minute, commands, tiles a system opens or blocks) and `src/sim/start.ts` (setup at the start of a run).

### Inventory, items, and skills
`M2` · `12a039f` · `playtest: pending` · SPEC §7.8, §8.4

`src/content/items.ts` lists every item (including those for later milestones). `src/sim/inventory.ts`: 8 slots and a carrying weight of 12 (a basket adds 4 slots and 8 weight); stacks merge by kind and data; `drop` makes a stash on the ground (drawn as a bundle), and *pick up* takes it back. I opens the kid's notebook inventory (FEATURES §12 "The inventory as the kid's notebook"); 1–9 open an item's uses (eat, taste, put down). Skills (`src/sim/skills.ts`) rise with use, levels 0–5, backgrounds start at level 1 in theirs; City kid learns 1.3× faster.

### The inventory as the kid's notebook
`M7` · `6b6bb55` · `playtest: pending` · SPEC §12.4

I opens `packPage` (`src/ui/pack.ts`), a notebook page with two tabs (← → turn): *What I'm carrying*, each slot as a pencil sketch, its name and count, "eat soon" / "going off!", and the kid's note (`noteOn`: a dealt thing's fact in the kid's words via `KNOWN`, or "I don't know what it does yet."; else `ITEM_NOTES` in `content/itemNotes.ts`), clicked or numbered for its uses; and *What I've found*: every plant, remedy, stone, wood, and tinder seen or carried, sketched, with what's known and how. The small menus in play (`App.openList`: what can be done here, an item's uses, rest) get the `slip` class, a torn notebook slip; the cursor's label (`.tip`) is a paper scrap. The pause menu and settings are unchanged.
- **Sketches** (`src/render/sketch.ts`): `sketch({k, plant?, tint?})` draws on a 48×48 canvas with a `Pen` that goes over each wobbly stroke twice (the wobble hashed from the name, so a sketch is the same every time), shading by hatching, coloured pencil only where colour is the point. One per item kind, per build (`build:<id>`), the fire, plants by kind and tint; anything without one is a question mark (also used for unknown Make parts). Shown with `mix-blend-mode: multiply` so they sit on the paper.

### Sleep and rest
`M2` · `12a039f` · `playtest: pending` · SPEC §7.1, §5.1

R offers: rest an hour (awake), sleep three hours, sleep until first light, sleep until the sun is up. Time runs 90× faster while asleep, by running ticks (`SLEEP_SPEED` in `src/platform/app.ts`), with the screen dimmed. E, Enter, R, or Esc wakes; moving ends a rest. Sleeping autosaves.

## 13. Saves and run codes

### Saves
`M2` · `12a039f` · `playtest: pending` · SPEC §5.4, §11.6

`src/platform/saves.ts`: one slot in IndexedDB (database `snowline`, store `runs`), saved on sleep, when the tab is hidden, and from the pause menu (*Save and leave*). The title offers *Carry on* when one exists. Death deletes it (permadeath). *Save to a file* exports it; *Load a saved file* on the title imports one. A save is the GameState without the deal and the map (`toRecord`, `restore`); `migrate` refuses a save from another schema (`SCHEMA` in `src/sim/newGame.ts`, now 5).
- **Gotcha:** the save is the whole state, not the differences from a fresh world that SPEC §11.6 describes (Q19). It's about 40 KB, mostly the explored bitset.

### Run codes and the summary
`M2` · `12a039f` · `playtest: pending` · SPEC §4.3, §5.4

`src/sim/runCode.ts`: `SL1.` plus the seed and protagonist as base64url JSON. The summary screen (`src/ui/summary.ts`) shows how the run ended, days survived, facts and techniques learned, the run code, and offers a new valley, the same valley again from day 1, or the title. The title's seed box takes a run code too.

### Protagonist selection
`M2` · `12a039f` · `playtest: pending` · SPEC §4.1

`src/ui/select.ts`: three candidates for the seed (background, trait, tool, pockets), *Three others* for the next three, or *Choose for myself* (name, boy or girl, age, background, trait, tool). `?seed=` in the URL still starts straight in with candidate 0.

### Drawn sprites
`M2` · `12a039f` · `playtest: pending` · SPEC §12.1

`src/render/sprites.ts`: sprites as 16×16 grids of palette colours, one character per pixel, with a legend each: conifer, stunted tree, aspen, snag, boulder, wild rose, berry bush (tinted per plant), deadfall, the crash, the tail, and a stash bundle. The survivor is built from recoloured layers (skin, hair, clothes, trousers) in three facings (west mirrors east), two walking frames, three hair styles, and asleep. Terrain is still painted in code (flat colour and glyph, `src/render/tiles.ts`), as are the remaining features.
- **The survivor redrawn** (`M7` · `482337e` · `playtest: pending` · SPEC §4, §12.1): `PERSON_ROWS` in `sprites.ts` use shade letters lit from the upper left (H/l/h hair with a highlight, S/s skin and shade, e eyes, C/d/c jacket with z its zip, P/p trousers, b boots); `personSprite` mixes the shades from the protagonist's colours (`mix` from `tiles.ts`) and draws long hair and the tied-back tail with them. `Atlas.person` paints the figure on its own canvas and puts a dark outline round it (rgba 22,18,16,0.85), so the survivor reads on any ground. `renders/sheet/kid.html` (`node renders/sheet/kid.mjs`) draws every pose for four looks.

### Tour script
`M2` · `12a039f` · `playtest: n/a` · SPEC §11.4

`npm run tour`: `scripts/tour.mjs` plays through the screens in headless Chromium (title, selection, play, the action menu, inventory, tasting, the journal pages, rest, sleep, pause, death and the summary) and saves a screenshot of each to `renders/tour/`. Fails on any page error.

## 14. Fire

### Laying a fire
`M7` · `cb96676` · `playtest: pending` · SPEC §8.3, §12.4

A laid fire is a build, `fire-lay` (`LAY` in `src/sim/fire.ts`), whose `items` hold its tinder, sticks, and wood (`layParts`; ready to light with tinder and `LAY_STICKS` (2) sticks, `layReady`). `place:fire` (unlisted: only the Make page's placing or the bot start it) needs open ground (`fireSiteProblem`: not water, snow, scree, a feature, a fire, a build, or things lying there), rings the spot, and puts in what's carried (`layIn`: the best-known tinder, up to two sticks, the best-known wood). `lay-fire` adds what's missing, greyed with what's still needed; `unlay-fire` gives it all back. The light actions (`fire-sparks`, `-match`, `-embers`, `-drill`) are offered on a laid fire for each way the kid knows of (`knowsOf`: sparks only with the *sparks* technique or a known spark-stone carried, since 2026-11-27), greyed with `lightProblem` ("nothing in it yet", "need a piece of the …"); with no way known, `fire-light` (*Light the fire*, always greyed "I need a way to start it"). **Lighting is tried with anything in it** (`6b6bb55`): no tinder fails and teaches *tinder-nest* (`FIRE_MSG.noTinder`); tinder with fewer than `LAY_STICKS` sticks catches, flares out, and teaches *kindling* (`flaredOut`); a fire that catches also teaches *kindling*. Lighting burns the laid tinder whether it catches or not; a fire that catches gets the sticks (12 min each) and the wood (`WOOD_BURN`), and the lay is gone. The wrong-wood bow drill is `drillWorks`. A laid fire blocks walking (`blockedBySystems`). Drawn by `drawLay` (`render/fireArt.ts`): scraped earth, a stone ring, a tinder nest, a tent of sticks, a split log. Clicking does the obvious thing (`OBVIOUS` in `ui/look.ts`: lay, then light by match, embers, sparks, drill); `strike-outcrop` is offered only until that stone is known, so the next click on it pries a piece loose. The bot lays and lights the same way (`tendFire`), and lights only a complete lay (`layReady`): a try with something missing would only burn its tinder.
- **Gotcha:** lighting no longer works on open ground from the pockets; every fire starts as a laid one. The signal pile still lights from the pockets (`canIgnite` in `arc.ts`).

### Three routes to fire
`M3` · `fa5ba50` · `playtest: pending` · SPEC §8.3, §6.6

`src/sim/fire.ts`. **Since M7 a fire is laid first and lit from the laid fire ("Laying a fire" above).** The ways to light it:
- **Sparks:** strike any outcrop (or a carried stone) with the steel tool first (`strike`): the dealt spark-stone throws sparks (known, and the *sparks* technique by accident), others flake to an edge, crumble, or do nothing (all known). Then *Light a fire with sparks* needs a known spark-stone carried. The multi-tool throws poor sparks (`TOOL_WORK.sparks`).
- **Captured fire:** `strikeSnag` makes the lightning-split snag smoulder for 6 hours (the weather calls it, M4); with bark, *Take embers from the smouldering snag* gives embers in bark (and the *carry-embers* technique), which die after 4 hours.
- **Bow drill:** made from 2 sticks, cord, and a piece of firewood (whose wood it keeps); works only if that wood is the dealt drill wood. A wrong one "only smoked" (the wood becomes *not for the drill*, suspected then known). Tiring.
- Matches (from the wreckage, M5) nearly always work.
- The tinder used decides the odds (`TINDER_CATCH`: catches, slow, fails) plus firecraft skill and the *tinder-nest* technique. A fire that catches makes the tinder known; a tinder that fails twice becomes known (or suspected) as failing.

### A fire's life, cooking, boiling
`M3` · `fa5ba50` · `playtest: pending` · SPEC §8.3, §7.3, §7.5

`GameState.fires`: fuel (minutes), then coals for 45 minutes, then out. Sticks add 12 minutes, firewood by its dealt kind (`WOOD_BURN`: long-burning 120, smoky 60 with smoke, quick 30), green boughs make thick smoke. Wood put on a fire teaches what it is about 40 minutes later (`woodLesson`; drill wood burns "plain", suspected). *Bank the fire* (technique) keeps coals 9 hours with no light; any fuel revives coals. *Wrap embers in bark* (technique) carries fire elsewhere. A fire lights 6 tiles, warms within 3 (4 with reflector stones), and blocks the tile.
- Beside a burning fire: *Cook* turns raw food into cooked (crayfish, mussels, fish, meat); *Smoke* (technique) makes meat and fish keep 20 days; *Boil* a pot of water, or a bark vessel of water with hot stones (technique, needs a stone). Vessels are filled at water (*Fill*); unboiled water carries its source's risk (`waterRisk` in food.ts); boiled water is always safe.
- Rendering: the stone ring, flames by fuel, smoke when smoky, glowing coals, a banked mound; the smouldering snag glows and smokes.

## 15. Materials, crafting, and camp

### Materials
`M3` · `fa5ba50` · `playtest: pending` · SPEC §8.2, §6.6

`src/sim/materials.ts`. **Since M7, everything gathered by hand comes from loose things on the ground (§25): sticks, driftwood, plant fibre, dry grass, seed fluff, plain stones, pine cones, feathers; the ground-type actions (*Gather sticks*, *Pull dry grass*, *Gather driftwood*, *Pull plant fibre*, *Gather seed fluff*, *Gather pine nuts*) are gone.** What stays here is work on a tree, log, or outcrop: firewood cut from conifers (resinous wood), aspens (white-barked), stunted trees (grey twisted) with the steel tool; broken from deadfall (red-barked). Green boughs and bark (conifer, aspen). Tinders from features: shredded inner bark (aspen, needs steel), hanging grey lichen (trees above the valley floor), punk wood (deadfall). Wood and tinder rows appear in the notes when gathered (`WOOD_SOURCE`, `TINDER_SOURCE` in `src/content/recipes.ts`).
- **Tools differ** (`TOOL_WORK`): the hatchet cuts wood fastest and is clumsy at fine work; the knife is the reverse and best with fibre; the multi-tool is middling at everything and poor at sparks.

### The Make page
`M7` · `cb96676` · `playtest: pending` · SPEC §8.2, §12.4

C opens `makePage` (`src/ui/make.ts`), a notebook page (the journal's `.notebook` styles) listing `makeBook` (`src/sim/craft.ts`): the fire first, then every known recipe (`where: 'hands'`) and build (`where: 'placed'`), grouped by `need` (`NEEDS` in `content/recipes.ts`, in the kid's words, in that order). Each entry has a pencil sketch (`sketch` in `render/sketch.ts`: the fire, `build:<id>`, or the recipe's output) and its parts with small sketches, green and ticked when carried, red with a question mark when `unknown`. Number keys pick the first nine. A hands recipe is crafted; the fire and every build start placing. `craftMenu` is gone.
- **The fire's parts** (`fireParts` in `src/sim/fire.ts`, `6b6bb55`) are named only as far as the kid knows: tinder by its look once one is known to catch, else "tinder that catches?" (with *tinder-nest*) or "something dry to get it going?"; "sticks for kindling" (with *kindling*) or "something to burn?"; wood by its look once one is known to burn long, else "wood that burns well?" only with *kindling* (optional); the starter is whatever is carried (a match, embers, the bow drill, a piece of the known spark-stone), else "a rock that sparks on steel?" (with *sparks*) or "a way to start a fire?". **An unknown part has no count, no tick, and a question-mark sketch** (`make.ts` `part`): what's carried mustn't give it away.
- **Placing** (`App.placing`, the chosen `MakeEntry`): the tile under the mouse (or the faced one) shows `drawGhost` (`render/buildArt.ts`: a green or red tint, the thing see-through over it), drawn after the light so it shows at night; the tip says "Lay the fire here" / "<label> here" or "Not here: <reason>" (`fireSiteProblem` / `buildSiteProblem`, or no stand beside it). The kid's thought while choosing is the build's `ask`. Click or E queues a `goto` with `place:fire` or `place:<build>`; Esc or C stops.

### Builds placed and built from what's brought
`M7` · `6b6bb55` · `playtest: pending` · SPEC §7.6, §8.2

Every build goes up the way a fire is laid (`BUILD_ACTIONS` in `src/sim/craft.ts`, registered in `systemActions.ts`). `place:<id>` (unlisted, one per `BUILDS` entry; started by Make's placing or the bot) needs the faced tile to pass `buildSiteProblem` (camp builds: walkable open ground, not water, snow, scree, a feature, or a fire, and a lean-to not on the overhang floor; reflector stones on a fire or laid fire; a cache on a conifer or aspen; a weir in shallows, stream, or gravel; the signal pile on open ground; never where a site already stands or one of that kind is). It pushes a site, a build of kind `site:<id>` whose `items` hold what's gone in, puts in what's carried (`putIn`, by slot, keeping each stone's or wood's `d`), and if that's everything builds it at once (`work`: the site becomes the build, items cleared except a cache's or weir's). Its minutes include the build's own time only when what's carried completes it (`workMinutes`). On a site: `site-work` ("Add to the lean-to", or the build's label when what's carried completes it; greyed "needs 4 sticks, 4 green boughs" when nothing carried helps) and `site-undo` (gives it all back). `siteAt`, `siteProgress`, `buildDef`, `knowsBuild` are the helpers. No system reads a `site:` kind as the thing it will be; the storm takes sites of fragile builds too (`arc.ts`).
- Drawn by `drawSite` (`render/buildArt.ts`): the finished art faint, firming up with `siteProgress`, with four stakes; the hover name is "the lean-to, not finished" (`ui/look.ts`), and `site-work` is the obvious click. `buildArt` draws any finished build (sprites; reflector and weir as stones, which had no drawing before).
- The bot builds its bed as `place:bed` from beside the camp, and only once it knows *bough-bed* (`improveCamp`).
- **Gotcha:** `startCraft`/`finishCraft` are for hands recipes only now; the `build:` recipe path and `buildTile` are gone. A build's tile is where it was placed, not where the survivor stands.

### What a kid knows from the start
`M7` · `6b6bb55` · `playtest: pending` · SPEC §4.2, §8.1, §8.2

Any kid knows the fire, the lean-to, and the sharpened stick (`newGame` adds `sharpen`; the lean-to has no technique). Each background's `techniques` (`content/protagonists.ts`) add what it would teach: scout (tinder-nest, kindling, sparks, bow-drill, cord, bough-bed), angler (spear, aim-low), hunter (snare, kindling, cache), farm (woodpile, splint), runner (splint), reader (tinder-nest, kindling, sparks, reflector, bark-vessel, hot-stones, weir, signal), city (nothing). The blurbs say so. New techniques (`content/insights.ts`): *kindling*, *bough-bed*, *reflector*, *woodpile*. Reflection (`RIPE` in `sim/insight.ts`) can bring *kindling* after a failed fire, *bough-bed* after a night not on a bed (`slept-on-ground`, remembered on waking in `step.ts`), *reflector* after an hour by a fire at night, *woodpile* after two fires and day 3.
- Goldens: `night walk` state `da5b671b` (the new `slept-on-ground` memory); `first steps` unchanged.
- **Gotcha:** the covered woodpile does nothing in the sim (Q48).

### Sleeping in a lean-to, on a bed, under the overhang
`M7` · `uncommitted` · `playtest: pending` · SPEC §7.6, §5.2

`sleep-in` and `rest-in` (`CAMP_ACTIONS`, `src/sim/camp.ts`), offered standing on a lean-to, a bough bed, or the overhang's floor (`bedPlace`): *Sleep in the lean-to till morning* (at `bedtime`: from 17:00, before 06:00, or rest < 50; sleeps until 06:30, `minutesUntil`) and *Rest in the lean-to for an hour* (awake; not on the overhang's open floor, where it would turn every click there into a menu). Both 1 minute, then `lieDown` (`src/sim/rest.ts`, shared with the rest menu's `sleep` command; its own module to avoid an import cycle through `step.ts`). Clicked from afar via `ON_TILE` in `reach.ts`; `sleep-in` is in `OBVIOUS`, so at bedtime a click on the lean-to walks in and sleeps.

### Crafting and camp improvements
`M3` · `fa5ba50` · `playtest: pending` · SPEC §8.2, §7.6

`craftOptions` (`src/sim/craft.ts`) is what the survivor knows how to make in the hands, with what's missing; the Make page (above) shows it. Recipes (`RECIPES`): cord (fibre), sharpened stick (known from the start), fish spear, fire-hardened spear (at a fire), bow drill, bark vessel, basket (+4 slots), and, for M4, snares, bow, arrows, splint, warm layers. Some fail at low crafting skill, spoiling the materials. Builds (`BUILDS`): lean-to (known to any kid), bough bed, woven wall and door, reflector stones round a fire, covered woodpile, hanging cache on a tree (hang and take down food, `src/sim/camp.ts`), fish weir, signal fire pile; all but the lean-to need a technique. **How builds go up: "Builds placed and built from what's brought" below.**
- Shelter (`shelterAt` in `src/sim/surroundings.ts`): the overhang floor (rain 0.8, wind 0.25), a lean-to (rain 0.6), a wall (+wind, +security, +insulation), a bed (insulation, and sleep quality). Sleep quality (`sleepQuality`) reads them; the light sleeper needs security.
- **Gotcha:** improvements belong to the camp tile, not to tiles of their own (Q28).

## 16. Insights

### Techniques and reflection
`M3` · `fa5ba50` · `playtest: pending` · SPEC §8.1

`src/content/insights.ts` lists 22 techniques with their journal text. They come by accident (sparks from striking stone; carrying embers from the snag), by background (Scout: cord and the bow drill; everyone knows how to sharpen a stick), or by **reflection**: waking from 3 hours' sleep or more, the first technique that's ripe (`RIPE` in `src/sim/insight.ts`: e.g. holding fibre ripens cord; two failed fires ripen the tinder nest; a night by a fire ripens banking) comes to mind with a 55% chance (Reader 82%). `GameState.memory` keeps the counts these read (`src/sim/memory.ts`). The journal's Skills page lists what's been worked out.

## 17. Weather

### The forecast, temperature, rain, and the snowline
`M4` · `28dfbbf` · `playtest: pending` · SPEC §6.5

`makeForecast` (`src/sim/weather.ts`) draws the whole run's weather at the start from the `weather` stream: a state every 3 hours (`GameState.weather.f`, 90 days), from transition odds (`TRANSITIONS` in `src/content/weather.ts`) adjusted so mornings clear, afternoons build to thunderstorms, fog gathers before dawn, and rain grows week by week. The severe storm takes four periods on an afternoon in days 18–30 (`severeDay`; its effects are M5). The forecast never reads the player.
- Each state (`WEATHER`) changes the air by day and night, adds wind (worse higher up), wets (rain soaks the survivor outside the overhang or a lean-to, and drowns an uncovered fire), fogs (sight shrinks: `sightOf` in `src/sim/sight.ts`), and darkens the sky. Clear midday sun warms (`SUN_WARMTH`).
- **Snowline** (`snowBand`): from day 30 rain falls as snow in the alpine band, and the line drops a band every 10 days, reaching the lake on day 60; snow lies drawn over those bands. The run ends in winter on day 72 (`WINTER_DAY` in `src/sim/hazards.ts`) if nothing else has.
- Lightning in thunderstorms flashes the screen (toned down by a setting), rumbles, and now and then sets the split snag smouldering (captured fire, §14).
- The HUD names the weather; the log notes each change.

### Weather signs
`M4` · `28dfbbf` · `playtest: pending` · SPEC §6.5, §6.6

Every 3 hours while the survivor is awake (5:00–22:00), each sign may show as a log line (`WEATHER_TEXT.sign`): a sign the deal says foretells shows 70% of the time when rain or a storm is coming within 9 hours, else 4%; a noise sign 10%. Each sign shown is judged 12 hours later against the forecast (`judgeSign`): after 2 judgements a suspicion, after 4 consistent ones it's known (foretells or noise). The tally is in `GameState.memory` (`sign-hit:i`, `sign-miss:i`).

## 18. Animals

### The valley's animals
`M4` · `28dfbbf` · `playtest: pending` · SPEC §9

`src/content/animals.ts` (kinds, counts, speeds, active hours, senses, ranges) and `src/sim/animals.ts`. At the start (`spawnAnimals`): 10 grouse, 12 hares, 8 marmots, 6 jays, 3 pack rats, 2 porcupines, a black bear, 6 elk (one bull), a cougar, 4 mountain goats, each near its ground and territory. Every tick each animal counts down to its next step, in ID order (`animalsTick`), and decides: wander its range, rest outside its hours, run from the survivor (prey), or its own business:
- **Grouse** hide until flushed or the hunter is close; **marmots** whistle and scatter everything nearby; **hares** run at dawn and dusk.
- **Jays** fly to the patches of safe plants and eat (seen within 7 tiles, that's a suspicion the plant is safe), and steal food left lying out.
- **Pack rats** at night carry small things off to the midden, where they can be found again (not from the hoard itself). **Porcupines** gnaw wooden tools left out, and walking into one leaves quills.
- **Goats** on the cliffs: standing still and watching them shows where the scree routes run (marked on the map).
- Hunted animals come back after 5–9 days.
- Big animals and porcupines block the way. Drawn as 2-frame sprites (`ANIMAL_SPRITES`), facing the way they last moved.

### Dealt tempers: bear, elk in the rut, cougar
`M4` · `28dfbbf` · `playtest: pending` · SPEC §9, §6.6

Too close (by the dealt boldness: shy 2, wary 3, bold 5 tiles; a shy one may simply leave), a dangerous animal **warns** with its dealt warning, for about a minute. Then it backs off if it was met with its dealt deterrent: **face** (stood still, facing it, not a step taken), **noise** (*Shout and wave your arms*, offered while one warns), or **fire** (a burning fire within 3 tiles). Backing well away always works. Otherwise it attacks: a wound and a blow, never instant death unless the survivor is already failing. The bull elk is dangerous only in the rut (days 20–45); other elk run. The cougar only follows at dusk when the survivor is weak, alone, and far from fire, then closes in. The bear raids food left out within its reach.
- Learning: a warning seen gives boldness and warning (suspected); being turned by the deterrent makes it known. Watching from 6–12 tiles, standing still 20 minutes in daylight, gives the first part safely.

## 19. Hunting and fishing

### Hunting, snares, dressing game
`M4` · `28dfbbf` · `playtest: pending` · SPEC §7.4, §9

`src/sim/hunting.ts`. With a spear, *Throw the spear at the hare* (within 3 tiles) or with a bow and arrows *Shoot* (6): one try, its chance from distance, hunting skill, a fire-hardened point, and whether the animal is already running. A kill is a `game` item; *Skin and gut* (a steel tool) gives meat and a hide, or for a grouse meat and feathers; the log says what was done plainly. Snares (recipe, technique) set on the faced tile catch hares that range near at night (`trapsHour`); *Take the hare from the snare*.

### Fishing and the trout run
`M4` · `28dfbbf` · `playtest: pending` · SPEC §7.4

**Since M7 trout are fish in the water (§25); spearing and watching changed there.** A density per water tile (`fishHere`, now in `src/sim/fish.ts`): spawning gravel best, then streams, then lake shallows; the trout run (days 25–40) doubles the near stream and the gravel. It places the fish, and the line and the weir still use it directly. *Fish with the line* (from the wreckage) is better. Watching ripens the weir; a weir of stones (technique) fills by itself, up to three fish.

## 20. Illness, injury, remedies, traits

### Injuries and illness
`M4` · `28dfbbf` · `playtest: pending` · SPEC §7.7

`src/sim/hazards.ts`: mosquitoes at dawn and dusk near water below the forest's top, before day 45, unless there's smoke close by (bites); sunburn high up in clear midday sun; exhaustion with rest nearly gone; falls on talus, scree, boulders, and snow, much likelier in the dark or exhausted (sprain; with glasses, they may break: sight −3); a blade slipping when cutting wood exhausted (wound); an animal's attack (wound). A wound left uncleaned for 12 hours turns to infection (55%); *Clean the wound with the boiled water* prevents it; the first-aid kit (M5) treats wounds, infection, and sprains. A splint (recipe) treats a sprain. *Pull out the quills*.

### Remedies
`M4` · `28dfbbf` · `playtest: pending` · SPEC §7.7, §6.6

A herb can be tried three ways when there's a complaint: *Chew* for the stomach, *Press on the wound*, *Rub on against insects* (always offered). The right one works (the deal: one each), and becomes known; the irritant stings and nauseates (known); the others do nothing (suspected "not for …", known "nothing" after two). The insects stay away from the insect herb growing wild: standing beside a patch at dusk shows it.

### Traits
`M4` · `28dfbbf` · `playtest: pending` · SPEC §4.2

All seven now act: light sleeper and afraid of the dark (M2, via sleep and morale), weak stomach (M2), picky eater (M2), wears glasses (broken in a fall or an attack: sight −3 by day), poor swimmer (slips in streams and shallows: soaked, chilled, shaken), restless (a day with under 30 tiles walked costs morale at midnight).

## 21. Ambient sound

### Ambient loops
`M4` · `28dfbbf` · `playtest: pending` · SPEC §12.3

`Sound` (`src/platform/audio.ts`) synthesizes everything with WebAudio from a noise buffer and oscillators, so no audio files ship: wind (stronger with the weather and higher up), water near the lake and streams (loudest by a waterfall), rain, a fire's hiss and crackle, night insects (summer, low down, dry nights), an elk's bugle at dusk in the rut, and thunder after lightning. Loops fade to silence in menus, while asleep at high speed, and when the run is over. It starts on the first key or click (browsers require it). The pause menu toggles sound (`snowline/muted` in settings). Effects for events come in M6 (`src/platform/effects.ts`).

## 22. The arc and rescue

### Search aircraft, signal fires, and the late signal
`M5` · `f32db44` · `playtest: pending` · SPEC §10, §5.3

`planArc` (`src/sim/arc.ts`) fixes the flights at the start from the `events` stream: two or three search flights on days 2–10 between 9:00 and 17:00, then late flights every 5–9 days from about day 40. A distant drone is heard 20 minutes before; the aircraft is overhead for 12 minutes (drawn crossing the sky). At the end of its pass, the chance it saw the survivor (`signalChance`) comes from the best burning fire with smoke: 0.25, plus 0.12 a band up, 0.3 on the signal knoll, 0.1 for a lit signal pile, 0.08 if no trees within 2 tiles (less among trees); a fire without smoke 0.03; flashing the mirror in clear weather +0.25 (*Flash the mirror at the aircraft*). Late flights see 70% as well. Seen: rescue 2½ hours later. A missed search flight costs 18 morale.
- The signal pile (build, *signal* technique) is lit with matches, embers, or the spark-stone (*Light the signal fire*): a big fire with 5 hours of smoke.

### The severe storm and the rockslide
`M5` · `f32db44` · `playtest: pending` · SPEC §6.5, §10

On the severe storm's first minute (`storm` in `src/sim/arc.ts`): lean-tos, walls, beds, woodpiles, signal piles, and snares are wrecked (reflector stones, the cache, and the weir stand); fires go out (a banked one may survive); everything left lying out is flung up to 5 tiles; about a hundred trees across the valley come down (`arc.felled`: drawn and passable as deadfall); the survivor is soaked and shaken, and outside a shelter chilled and perhaps hurt. When the storm passes, the mountain comes down: the cliff ring's gap opens (`arcOpens`, read by `blockedBySystems`), and seeing the slide from near it says so.

### The forward wreck's finds
`M7` · `uncommitted` · `playtest: pending` · SPEC §10, §7.8

*Search the wreck* (`search-crash`, `src/sim/actions.ts`): 20 minutes, by light; each search gives the next of `CRASH_FINDS` (`content/arc.ts`): the flight bag (`flight-bag`, new item: `hasBag` in `inventory.ts` treats it as a basket, +4 slots and +8 carry, not stacking with one), 3 cord (wire from behind the panel), a scrap of bright aluminium; count in `crash-searched`. Then greyed out, "nothing more to take" (`spent`). The bag has a sketch (`sketch.ts`) and a note (`itemNotes.ts`). The first-day `wreck` thought points at it.

### The wreckage and the beacon
`M5` · `f32db44` · `playtest: pending` · SPEC §10

*Search the tail wreckage* (once): the beacon, a metal pot, 12 matches, fishing line and hooks, a first-aid kit, and 4 packs of food (what doesn't fit is left on the ground). *Switch on the beacon*: rescue comes 1–3 days later, which still have to be survived.

### Title and summary
`M5` · `f32db44` · `playtest: pending` · SPEC §5.4, §11.1

The title shows the first valley at golden hour behind it. The in-development notice is gone (SPEC §11.1: until a run can end in rescue), and `package.json`'s description no longer says so. The summary says how a rescue came.

### Turning in place
`M5` · `f32db44` · `playtest: pending` · SPEC §12.4

Shift and a direction turns to face it without stepping (`face` command). Needed to light a fire facing open ground, and handy everywhere.

## 23. The bot and balance

### The bot player
`M5` · `f32db44` · `playtest: n/a` · SPEC §11.4

`src/tools/bot.ts` (`Bot`, `playBot`): a scripted survivor that plays through the same commands as a player. In priority: back away from a warning animal (or shout, if it knows noise turns it); sleep when exhausted; go for the wreckage once the slide opens, and switch on the beacon; drink at water not known to be foul; at night or in a downpour, go to the overhang, light and feed a fire, sleep until first light; eat (cooking first) what's known or suspected safe, tasting unknown plants one at a time; find the spark-stone by striking outcrops and carry a piece; keep tinder (not known to fail), sticks, and firewood; lay a bough bed; forage. It puts down what it knows is useless. `handDeal` gives it every valley fact for the second mode.
- `npm run bot -- [--count N] [--days D]` (`scripts/bot.ts`, `src/tools/botReport.ts`) plays N seeds with the backgrounds in turn, each in both modes, and writes `renders/bot/report.txt` and `runs.json`.
- **Gotcha:** the bot is a balance probe, not a good player: it never makes warm layers, hunts, fishes with a spear, or builds walls, and it climbs to the wreckage without preparing. A careful human should do better.

### The balance pass
`M5` · `f32db44` · `playtest: n/a` · SPEC §11.4, §14

Results of the 70-seed run are in TODO.md's hand-off. Changes made because the bot showed nights were lethal for reasons a player couldn't fix: wet clothes dry much faster (`DRYING`: 0.35 a minute by day, 1 by a fire), the cold bites a little less (`COLD_LOSS` 0.0038, `WET_CHILL` 1.8), hypothermia takes about 14 hours to kill instead of 10, clear midday sun warms (`SUN_WARMTH`), digging cattails soaks less, and a survivor woken by the cold can doze off again (woken at most every 3 hours).

## 24. Polish

### Sound effects and music
`M6` · `8d45bb1` · `playtest: pending` · SPEC §12.3

`src/platform/effects.ts`: footsteps by ground (water, stone, snow, reeds and sand, soft earth; at most one every 0.28 s), a bump, picking up, eating, drinking, chopping and striking at the start of the work, a fire catching, sickness, a discovery's two notes, an animal's warning growl and attack, sleep and waking, the storm and the slide's rumble; a search aircraft's drone while it's overhead (`Sound.update`). `src/platform/music.ts`: four short pieces, each played once a run: the first fire, the first wide view, the first snow, rescue. Slow lines of soft notes over a held low note, through an echo. Nothing loops under play. Music can be turned off in settings.

### Settings and accessibility
`M6` · `8d45bb1` · `playtest: pending` · SPEC §12.4

`src/ui/settings.ts`, from the title and the pause menu: text size (90–140%, scaling every screen), fewer and softer lightning flashes, volume, sound, music, and remapping every key (click *Change*, press a key; a key does one thing; *Default keys*). Stored as `snowline/settings`, `snowline/keys`, `snowline/volume`, `snowline/muted`, `snowline/music`. Conditions already show a shape as well as a word (M2).

### Art pass
`M6` · `8d45bb1` · `playtest: pending` · SPEC §12.1

Every feature is now a drawn sprite (`src/render/sprites.ts`): outcrops (tinted per stone), the overhang's face, herbs (tinted per remedy), bulbs, greens, and mushrooms (tinted per plant), bones, the rock arch, the beaver dam, the carcass, the midden, plus M3's camp builds, M4's animals, and M5's aircraft. The survivor rocks between frames while working. Terrain is still painted in code (flat colour and a glyph in four variants). Whether an artist redraws it is Q43.

### Originality check
`M6` · `8d45bb1` · `playtest: n/a` · SPEC §3

`tests/originality.test.ts` fails the build if a name or coined term from the novel or the board game (or the novel's title, capitalised) appears in the game's source, data, `index.html`, or `package.json`. `docs/ORIGINALITY.md` sets out what was taken and what wasn't, for the review by someone qualified that SPEC §3 asks for before release.

## 25. Seeing and touching (M7 slice)

### Loose things on the ground
`M7` · `37795da` · `playtest: pending` · SPEC §6.7, §8.2

`World.loose` (one byte per tile, ids in `src/content/loose.ts`) is generated by `scatterLoose` (`src/sim/worldgen/loose.ts`), the last stage, after the trails: position-hashed from the ground and features around a tile, never the deal, only on open passable ground with no feature. Kinds and what they give: twigs and a fallen branch (sticks; a branch also a piece of the nearest tree's wood), loose stones (plain stone, no `d`) and chips under an outcrop (that outcrop's dealt stone), a tuft of dry grass, cattail fluff, driftwood and a driftwood log (beside the lake), fibrous stalks, pine cones (in season only), a feather, and tracks of hare, elk, bear, and cougar (in each animal's territory: soft ground and trails; firm ground rarely). `src/sim/loose.ts`: `looseAt` (what's there now: regrowth is `regrow['l<tile>']`, sooner after a wind for `blows` kinds, never for `once` kinds; a fire covers it, cones only in season), `looseData` (the dealt index from the nearest tree or outcrop), `looseName`, and the actions *Pick up …* (`gather-loose`) and *Look at the prints* (`look-tracks`: the text, a temper row in the notes for a dangerous animal, a discovery the first time).
- **Tuning:** chances per tile in `CHANCE` (`worldgen/loose.ts`); regrowth days and minutes per kind in `LOOSE`. On first-light: ~2,100 twigs, ~650 branches, ~790 stone piles, ~560 grass tufts, ~50 fluff, ~60 driftwood, ~50 stalks, ~1,000 cone spots, ~100 feathers, ~70 sets of tracks; 12 things within 6 tiles of the start.
- **Gotcha:** `worldHash` now includes `loose`, and `tests/rules.test.ts` checks the deal leaves it alone.
- **Gotcha:** the bot gathers through `gatherNear`/`goAdjacentTo` on `looseAt` (`src/tools/bot.ts`).

### Click to walk and act
`M7` · `37795da` · `playtest: pending` · SPEC §5.2, §12.4

A `goto` command (`x, y, onto, action, at`) starts a `Route` on `PlayerState.route`: `findRoute` (`src/sim/route.ts`, A* on the four-way grid, costed by `routeCost` in `sim/step.ts` (2026-11-27: `stepTicks` plus `ROUTE_WADE` 36 for wading, `ROUTE_FORD` 3 on gravel shallows, `ROUTE_UNKNOWN` 6 on ground not yet explored, `ROUTE_MUCK` 2 on marsh and reeds, `ROUTE_ROUGH` 3 on talus, scree, boulders, −`ROUTE_TRAIL` 1 on a game trail; the estimate uses the cheapest step, 5, so it stays admissible), ties by tile, at most `ROUTE_LIMIT` (16000, was 9000) tiles opened) finds a way to the tile beside the target (or onto it). The step follows it when no direction is held; a blocked step finds the way again (3 tries). On arrival the survivor faces the target and starts the action on it (`at: 'front'`) or on their own tile (`'here'`). A direction key, Esc, or `cancel` drops the route; no way there says so in the log. `actionsAt` (`src/sim/reach.ts`) asks every action's own offer as if the survivor stood beside the tile and faced it (`standFor`), so a click never offers what the keyboard couldn't. In the browser (`src/platform/app.ts`, `src/ui/look.ts`): hovering names what's under the mouse (only explored tiles; animals and trout only when seen) beside the cursor, with what a click does; the cursor is a hand, an eye (watching), or a crosshair (walk); corner marks pulse on a tile that can be acted on. Watching the trout is offered on the survivor's own tile only if a trout is on it (it was offered whenever one was within 4 tiles, so clicking the ground underfoot by the water offered it; 2026-11-27). Actions in `ON_TILE` (`sleep-in`, `rest-in`) are offered by walking onto the clicked tile (`Reach.onto`; the app sends `goto` with `onto`). Left-click does the obvious thing (`OBVIOUS` order in `look.ts`), else opens the menu; right-click opens a small menu at the cursor (`.panel.context`) with every option and *Walk here*.
- **Gotcha:** a stale menu is safe: the sim checks the offer again on arrival (`startAction`).
- **Gotcha:** the tour (`scripts/tour.mjs`) now waits a moment after *test fire here*: the meadow no longer offers anything, which used to hide that race.

### Trout in the water
`M7` · `37795da` · `playtest: pending` · SPEC §7.4, §9

`GameState.fish` (`src/sim/fish.ts`): up to 9 trout kept within 12 tiles of the survivor (dropped beyond 18), placed by `fishMinute` in proportion to `fishHere` over the water in reach (never within 3 tiles of the survivor), from the new `fish` random stream. Each holds near its home tile, drifts now and then, darts away (`spook`) when a step starts within 2 tiles (55% at 1, 20% at 2), and drifts back. *Spear the trout* (2 min) needs a fish on the faced tile: 20% (60% knowing to aim low) plus skill, ×0.4 if it's startled; a miss startles the fish near it, and four misses teach to aim low as before. *Watch the trout* (15 min, from where the survivor stands, a trout within 4 tiles): three watches teach to aim low without a miss, with a different line each time. The renderer eases each fish between tiles (`fishAt`), flicks the tail, and draws rings where trout rise at dusk.

### Wreckage on the shore, and noticing
`M7` · `37795da` · `playtest: pending` · SPEC §6.7

`src/sim/notice.ts`, words in `src/content/discoveries.ts`. Three pieces of the plane wash up as stashes at set times (`DEBRIS`: cable → 3 cord at +5 h, a bag of peanuts (new food item) at +19 h, a scrap of bright aluminium (new item; flashes at aircraft like the mirror) at +49 h) on shore tiles beside the lake within 14 tiles of the crash (30 if the shore is short), chosen by hash of the seed. Each minute in daylight, a piece not yet noticed within 6 tiles is noticed (a line, a discovery, a little morale, a `notice` event); so is each landmark (`LANDMARK_NOTICE`) the first time. Stashes are drawn as what's in them when there's a drawing (`LooseArt.item`: cable, peanuts, glinting aluminium).
- **Gotcha:** state is in `memory`: `debris-<id>` is 0 (not yet), 1 (lying there), 2 (noticed or gone); `debris-<id>-at` is its tile; `noticed-<k>` per landmark.

### The beauty pass
`M7` · `37795da` · `playtest: pending` · SPEC §6.8, §12.1

- **Ground** (`src/render/ground.ts`): drawn pixel by pixel in 16×16-tile chunks, built when first seen (and one more each frame round the view, `warm`), 28 kept. Each pixel's owner is decided by `owner` (see "Smooth outlines" below). Colour drifts between each ground's two moods by a large noise field (`mood`) and brightness by a small one; texture per pixel (grass strokes, reed stalks, needles, ripples). Water darkens with depth (`depth`, steps from land), has wind lines and swells, foam on the shore and darker wet ground beside it. Trails are worn lines along each trail's route ("Trails drawn as lines", §4); snow lies in patches. Then drawn-only detail in sizes per tile (`decorate`): grass clumps, flower drifts, ferns in lush hollows, moss, rocks from pebbles to boulders on scree and talus, lichen, alpine flowers.
- **Trees and rocks** (`src/render/flora.ts`): conifers in five sizes (sapling to giant, up to 32 px tall), aspens in three, stunted trees, boulders in two, outcrops as crags in their stone's colours, the overhang as dark crag, deadfall as a fallen trunk (below). Tree size comes from how many trees stand round it, height, and the hash (`treeSize`). Tall trees rise into the rows above; the canopy fades when the survivor is behind it; tree tops sway with the wind.
- **Smooth outlines** (`M7` · `30b4851` · `playtest: pending` · SPEC §12.1): `owner` in `ground.ts` (replacing the old `PRIO` spreading and `edgeDepth`): the four tiles whose centres surround a pixel vote for their ground with bilinear weights, votes for one ground add up, each ground's total is stirred by its own two perlin octaves (salt `300 + t * 5`; ±~0.3, water ×0.35 so a one-tile stream stays whole), and the most wins. Every boundary runs in a wandering curve: staircases read as slopes, a lone tile as a rounded patch. Cliffs and the rim take part too (their rock sprites stand on top); only the overhang floor (`HARD`) keeps exact squares (the falls did too until they got their own drawing). Fast path: all four tiles the same ground, no noise. **Gotcha:** passability is still per tile, so up to about half a tile of water can be drawn as land at a convex shore and the other way round.
- **Glacier ice** (`M7` · `482337e` · `playtest: pending` · SPEC §6.3, §12.1): redrawn crisp (the soft perlin version read as fog or cloud). `Ground.measureIce` works out per ice tile `iceIn` (tiles in from the edge, 1–8), `iceUp` (0 at its glacier's snout, 1 at its top) and `iceSteep` (slope over that glacier's median), and refits `flowX`/`flowY` on ice to a plane over the ice within 5 tiles, so the flow runs down the glacier, not off its sides. `glacier()`: bare ice `ICE` (a little bluer by a broad field) with a rare sparkle; `firn()` above about half way up, a ragged crisp line (perlin /30) with wind ripples; dirty edges (`ICE_DIRT`, blotchy, by `iceIn` under ~1.5) with 2×2 stones. The ground's broad brightness is cut to a quarter on ice. `traceRunnels`: meltwater runnels from scattered heads (2.2% of bare tiles 3+ in) traced down the flow with a meander, ending at the dirty edge or joining another; stored per tile as pixels. `crevasses`: sets of one or two long bowed cracks across the flow (leaning up-glacier near the sides), a dark blue slot with its far wall lit, where `iceSteep` is high or 2–3 tiles in from the edge, never in the firn. `portals`: a dark ice cave in the highest ice tile beside each stream head. In `paint`, ice with open ground just below it is a shaded wall (`ICE_FACE`), and with open ground above, a lit lip. Render only. **Gotcha:** in a cirque the ice slopes down from the back wall, so crevasses there run parallel to it (as bergschrunds do). Marsh (`30b4851`): lighter wet-meadow `MOOD`, sedge strokes, small pools with a glint, tussocks and cotton sedge in `decorate`.
- **Deadfall** (`M7` · `30b4851` · `playtest: pending` · SPEC §6.3, §12.1): `log(angle, len, burnt, v)` in `flora.ts` draws a trunk in a 40 px canvas (`LOG_SIZE`) at one of 8 angles, 12–24 px long, tapering from the butt (a tipped-up root plate, or a splintered break for `v` 1) to the top, with branch stubs; charred in a burn, moss on top for `v` 0. `Renderer.logArt` picks per tile by position hash: in a recent burn (`World.age` 1–19) mostly angle 1 (roots west, blown down by the westerly), some 0, 2, or 7; elsewhere any angle; off-centre by up to 3 px. Felled trees after the storm draw the same way. Render only: the world and goldens don't change. **Gotcha:** a long trunk reaches into the next tile, but only its own tile is the deadfall you click.
- **Loose things** (`src/render/looseArt.ts`): drawn in code in 3 variants each, with a soft dark outline so they read over the ground detail (which has none); tracks are faint on purpose.
- **Light and air** (`src/render/renderer.ts`): shadows for trees, rocks, things, animals, and the survivor, cast away from the sun and long at dawn and dusk, merged in one layer; cloud shadows drifting on fair days; mist on the valley floor near water at dawn; waterfall foam falling; corner marks for the mouse.
- **Gotcha:** frame time is steady at 60 fps in headless Chromium; the first frame in a new area builds a chunk or two (a few ms each).
