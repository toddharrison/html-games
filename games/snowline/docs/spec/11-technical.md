## 11. Technical design

### 11.1 Stack and delivery

The game is one npm workspace, `games/snowline/`, in the html-games monorepo. It uses the repo's build, test, and deploy pipeline as it stands and adds none of its own.

**The game itself**

- TypeScript in strict mode. World rendered on a Canvas 2D context, with a colour grade and firelight drawn over it (12.1). Menus, inventory, journal, and HUD are HTML and CSS layered over the canvas.
- **No backend.** The shipped game is static files that make no network requests: no server, accounts, analytics, CDN scripts, or web fonts. Everything, including art and audio, is bundled.
- **No game framework** and, ideally, no runtime dependencies. The repo's other game uses Phaser, and Phaser was considered here and turned down for v1 (2026-11-25). The reasons:
  - The interface is mostly text (inventory, crafting, journal, valley notes, map), which HTML and CSS handle far better than a framework's bitmap text.
  - The drawing job is small: about 24×14 visible tiles and a hundred or so sprites, a colour grade, and darkness with lit circles (12.1). There is no physics, and movement is on a grid.
  - Phaser would be the largest thing in the build and would be inlined whole into the single-file download.
  - Determinism is *not* a reason. The other game keeps a pure, seeded, fixed-step simulation and lets Phaser only draw it; this game could do the same.
- **When to reconsider:** if the later visual upgrades in 12.1 (a mirroring lake, shadows, mist) are taken up, a WebGL renderer becomes worth having, and Phaser is the obvious way to get one. All drawing lives in `render/` (11.2) and nothing else depends on it, so the switch would be contained.

**Toolchain, the same as the rest of the repo**

- TypeScript 7, Vite 8, Vitest 5, on Node 22 or newer (CI runs Node 24). `tsconfig.json`, `tsconfig.node.json`, and `vite.config.ts` start as copies of the ones in `games/behemoth-protocol/`, minus the Phaser-specific lines.
- There is one lockfile, at the repo root. Dependencies are added from the root (`npm install -D <package> -w snowline`), never with a lockfile inside the game folder.
- The only tool this game adds is fast-check, for property tests. It adds no linter and no browser-test dependency: the repo has neither, and 11.3 and 11.4 say what replaces them.

**What the repo requires of the workspace**

| Requirement | For this game |
|---|---|
| `package.json` `name` | `snowline`, the folder name. It is the workspace name, the URL path, and the storage prefix |
| `package.json` `title` and `description` | Shown on the site's landing page, which lists every workspace automatically. `"Snowline"`, and a one-sentence description that says the game is in development |
| `package.json` `version` | Semantic, starting at `0.1.0`. It changes only when a release is pushed, never with ordinary commits. Before 1.0 a change that breaks saves or replays is a minor bump |
| `build` script | Typecheck, then build to `dist/`, which must contain `index.html` |
| `test` script | `vitest run`. Must pass headless in Node |
| `typecheck` script | `tsc --noEmit` for the source and for the config files |
| `dev` script | `vite`. Run from the root as `npm run dev -w snowline` |
| Relative asset paths | Vite `base: './'`. The game is served from `/html-games/snowline/`, so no asset URL written in code, CSS, or the art index may start with `/` (Vite rewrites the entry script in `index.html` itself) |
| Storage names | Everything the game stores in the browser is prefixed with `snowline` (11.6), because every game on the site shares one origin |

**Deploy**

- Every push to `main` runs `npm run typecheck`, `npm test`, and `npm run build` for every game, then publishes the site to GitHub Pages. This game lands at https://toddharrison.github.io/html-games/snowline/.
- The gate is shared. A failing or flaky test in this game blocks the deploy of every game, so what runs in `npm test` must be deterministic and quick (11.4).
- **The game is public from M0, with an in-development warning** (decided 2026-11-25). The warning is in two places: the `description` on the landing page, and a notice on the game's own title screen. Both stay until the game can be played through to a rescue (M5).
- The title screen shows a version stamp, the `package.json` version plus the short git commit, injected at build time the way `games/behemoth-protocol/vite.config.ts` does it. Saves and exported replays record it.

**Two build outputs, one `build` script**

1. The Pages build: `vite build` writes `dist/index.html` and its assets.
2. The single file: a second step writes `dist/standalone.html`, with scripts, styles, and art inlined. It is published with the rest of `dist/`, so the site offers it as a download, and it runs when opened straight from disk. The single file matters because browsers refuse to load separate script modules from a page opened as a local file. How it is produced (a small script in `scripts/`, or a Vite plugin) is the implementer's choice.

### 11.2 Layout and layers

The workspace follows the layout the repo expects of every game:

```
games/snowline/
  package.json, index.html, vite.config.ts, tsconfig.json, tsconfig.node.json
  CLAUDE.md    This game's rules for whoever works on it (see below)
  README.md    Short public summary; the spec wins if they disagree
  docs/        SPEC.md (the spec's index) and spec/ (one file per section),
               TODO.md (open work and session hand-off),
               FEATURES.md (what is built, with code pointers)
  src/         The game (layers below)
  tests/       Vitest, tests/**/*.test.ts, Node environment
  scripts/     Node scripts run by hand: the single-file build step, the browser replay check
  dist/        Build output, git-ignored
```

`CLAUDE.md` is written in M0, modelled on `games/behemoth-protocol/CLAUDE.md`. It carries the rules that are easy to break: the layer rule below, the determinism rules in 11.3, the originality rule in section 3, and the same TODO.md and FEATURES.md hand-off routine the other game uses.

```
src/
  sim/        Pure game logic. No DOM, no clock, no storage, no Math.random.
    rng.ts      Seeded generator and named streams
    worldgen/   Map generation pipeline
    systems/    One file per system: vitals, weather, fire, animals, illness, ...
    state.ts    The GameState type
    step.ts     step(state, commands) -> events
  content/    Data only: items, recipes, plants, animals, illnesses, weather tables,
              set pieces, the rule decks (6.6), protagonist backgrounds and traits,
              name lists, insight text, balance numbers
  render/     Draws GameState to the canvas; owns sprites, camera, colour grade, firelight, weather
  ui/         HTML HUD and menus
  platform/   Browser glue: input, main loop, saves, audio
  tools/      Headless runner, bot player, seed inspector (used by tests and sweeps)
```

The valley's rules (6.6) add one rule for code. `content/` says what a thing *can* be: its appearance and its row's deck. `GameState.rules` holds the deal, what each thing *is* in this valley, and `GameState.known` holds what the survivor has learned. Systems read a dealt property only through `rules`, never straight from a content table, and the UI shows only what is in `known`.

The rule that matters most: `sim/` and `content/` never import from the other folders. The whole game can run in Node with no browser, which is also what lets the repo's CI test it.

### 11.3 Determinism rules

1. **One source of randomness.** A seed string is hashed to initialise a small, fast generator (sfc32 or similar). Each system draws from its own named stream (`worldgen`, `rules`, `protagonist`, `weather`, `animals`, `skill-checks`, ...), so adding a random call in one system does not shift results in another. Stream states are part of the save.
2. **Position-hashed randomness for world generation**, so a tile's result does not depend on the order tiles are visited.
3. **Fixed step.** The simulation advances only in whole ticks. The renderer may interpolate between ticks but never feeds anything back.
4. **Inputs are commands.** Keyboard state is turned into commands stamped with a tick number (`move north`, `use item 3`). The simulation sees only commands.
5. **No engine-dependent maths in the simulation.** JavaScript guarantees identical results for `+ − × ÷` and `Math.sqrt`, but not for `Math.sin`, `Math.cos`, `Math.pow`, `Math.exp`, or `Math.log`. The simulation uses integers where it can, lookup tables for curves, and an in-repo noise function built from basic arithmetic.
6. **Stable ordering.** Entities are processed in ID order. No logic depends on object key order or `Set`/`Map` insertion order.
7. **State is plain data.** `GameState` is a JSON-serialisable object with no class instances or functions.
8. **Enforced by a test.** The repo has no linter, and its deploy gate is typecheck, test, and build. So the ban is a Vitest test that reads every file under `src/sim/` and `src/content/` and fails on `Math.random`, `Date`, `performance`, the non-deterministic `Math` functions, or an import from outside those two folders. It runs in `npm test`, so a violation blocks the deploy.

### 11.4 Testing

Tests are split by where they run, because `npm test` gates the deploy of the whole site (11.1).

**In `npm test`: runs in CI on every push to `main`.** Node only, no browser, the same result on every run. Target: under 30 seconds for this game.

- **Unit tests** per system with hand-built states. A test that depends on a dealt rule builds its own deal (`rules` is plain data) and does not rely on what some seed happens to deal.
- **Deal tests:** the same seed always gives the same deal; over the world generation sample every deal passes the fairness checks in 6.6; changing the deal never changes the terrain, and the reverse (they are separate streams).
- **Scenario tests:** `runScenario(seed, protagonist, commands)` runs headless and asserts on the result ("drinks lake water 10 times on seed X, falls ill on day 4").
- **Golden replays:** a seed, protagonist, and command log run to tick N must produce a known state hash.
- **World generation sample:** a fixed list of about 25 seeds, the default seed among them, passes every validation check.
- **Protagonist sweep:** every background, trait, and tool combination starts a valid run.
- **Property tests:** invariants hold after any command sequence (vitals stay in 0–100, nothing stands on an impassable tile, item counts are never negative). fast-check runs with a fixed seed and a bounded number of cases, so a failure in CI repeats locally.
- **The determinism guard** from 11.3, rule 8.

**Run by hand: before a release, and after changing what they cover.** These are too slow or too environment-dependent for the shared gate. Each is an `npm run` script in this workspace.

- **World generation sweep** (`npm run sweep`): generate 1,000 seeds and assert every validation check passes. It is the same test as the sample with a longer seed list, kept out of `npm test` by its file name.
- **Bot player** (`npm run bot`): a simple scripted survivor in `src/tools/` that plays hundreds of seeds headless and reports survival curves per background. This is the main balance tool. The bot learns each valley's rules the way a player must, by tasting, watching, and trying. A second mode hands it the deal, and the gap between the two curves is what learning the valley costs.
- **Browser replay check** (`npm run check:browser`): runs the golden replays in a real browser to catch engine differences, against the Pages build and once against `dist/standalone.html` opened from disk. It follows `games/behemoth-protocol/scripts/playtest.mjs`: a Node script that serves the build and drives a locally installed headless Chromium, with nothing added to the lockfile and nothing for CI to download. Firefox and Safari are checked by opening the debug page that runs the same replays and reading the result.

### 11.5 Debug tools

`?seed=...` in the URL sets the seed. `?debug=1` adds an overlay (tick, position, tile info, animal states, stream counters), time controls, a reveal-map toggle, a reveal-rules toggle that shows the valley's deal, and a console for spawning items and setting vitals. Replays can be exported and imported as a file.

### 11.6 Saves

- A save is the seed, the protagonist, the tick count, the parts of state that differ from the freshly generated world, and stream states. This keeps saves small because the map is rebuilt from the seed. The valley's rules are dealt again from the seed in the same way; what the survivor has learned of them is saved.
- Stored in the browser (IndexedDB), with a schema version number and a migration step.
- **Names carry the game's slug.** Every game on the site is served from the same origin (`toddharrison.github.io`), so they share one storage area and one quota. The IndexedDB database is named `snowline`. Small settings (key bindings, text size, last seed) go in `localStorage` under keys that start with `snowline/`, such as `snowline/settings`. Run saves stay out of `localStorage`, which is small and shared with the other games.
- Saves can also be exported to and imported from a file. This is the backup, and it covers the single-file build, because browser storage behaves inconsistently for pages opened from disk.

### 11.7 Performance and browser support

- 60 frames per second rendering with a 20 Hz simulation on a mid-range laptop, colour grade and firelight included. The scene is drawn at the logical 384×216 and scaled up, so those passes work on about 83,000 pixels, which Canvas 2D can afford.
- Only visible tiles are drawn. All animals simulate every tick (there are roughly a hundred, which is cheap).
- Current desktop Chrome, Firefox, and Safari. Touch and mobile are out of scope for v1.
