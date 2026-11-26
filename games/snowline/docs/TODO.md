# TODO

Open work and the hand-off between sessions. See CLAUDE.md for how to maintain it. **Only open items live here:** when a task is done, move it to [FEATURES.md](FEATURES.md) (under its system, with the tag line) and delete it here.

## Hand-off notes
- **Just done (2026-11-25, uncommitted, on branch `snowline/spec`):** M0 and M1 built together, as SPEC §14 recommends. The workspace builds both outputs (`dist/index.html` and `dist/standalone.html`), the 123 tests pass in about 7 s, the golden replays match in headless Chromium served and from disk, and 1,000 seeds generate valid valleys (`npm run sweep`). Nothing is committed and the version is still `0.1.0` (first release).
- **My calls, for review** (in SPEC §13.1, "Choices made while building M0 and M1"): two outcrops by the overhang (the spark-stone and an edge-stone); cliff bands only below the subalpine and alpine bands; the dealt water sources are always the lake and two streams (a tarn is extra, high, clean water); the HUD shows a word for the time, not a clock; the test fire is a debug sim command so the darkness can be judged before M3; the run starts at 14:30.
- **Next step:** the user plays M1 (playtest queue below), reviews the choices above, and says whether to commit and push. A push makes the game public at `/html-games/snowline/` with the in-development notice. Then M2.

## Playtest queue
Built but not yet seen by the user. Check each one off by setting its FEATURES.md entry to `playtest: approved`, then remove it here.
- [ ] **Walking the valley:** `npm run dev -w snowline`, *First valley*. Does grid movement feel right (6 ticks a step on meadow; marsh, talus, and scree slower; trails quicker)? Does holding and switching direction respond well, and does a tap move one tile?
- [ ] **The mood check (SPEC §12.1, over placeholder tiles):** `?seed=first-light&debug=1&ff=19:30` for dusk, `&ff=23:00` for night, `&ff=05:50` for dawn; *test fire here* in the debug panel, then walk away from it. Is dusk amber enough, night dark and colourless enough, the survivor's 2-tile night sight right, and the fire warm enough to mean safety? (`npm run shots` saves the same views to `renders/shots/`.)
- [ ] **The valley's shape:** `npm run inspect -- first-light <any seeds>` and look at `renders/inspect/`, or *reveal map* on the debug map. Lake, forest, the high side, cliff bands with scramble routes, the sealed wreckage. Is 256×256 the right size for the time a run lasts? Is the default seed a good first valley? Things to check on foot with `?at=X,Y`: the overhang and its two stones (first-light `?at=117,151`), the cliff bands and scree, a viewpoint (first-light `?at=26,175` is the one by the wreckage).
- [ ] **The map screen (M):** does the sketch read, and is revealing only what's been seen right?
- [ ] **The deal:** *reveal rules* in the debug panel for a few seeds. Do the decks give the variety you want?
- [ ] **Title screen and notice:** wording of the in-development notice (`TEXT.inDevelopment`), the tagline, and `package.json`'s `description` on the landing page.

## M2: Survival core (next)
Goal (SPEC §14): drawn sprites replace the glyph tiles; protagonist selection; vitals and morale, drinking, foraging, inventory, sleep, death screen, message log, saves with export; dealt plants and water: tasting, the floor foods, and the valley notes chart. The first milestone where the dealt rules can be felt: judge the idea here.
- [ ] Break into tasks when M2 starts.
- Carried from M1: the debug console's item and vitals controls (SPEC §11.5) need items and vitals; each background's starting valley fact (`mods.fact`) needs `GameState.known`; the run code (SPEC §4.3) comes with the summary screen.

## Later milestones
- M3 Fire and craft · M4 Living world · M5 Arc and ending · M6 Polish (SPEC §14).
