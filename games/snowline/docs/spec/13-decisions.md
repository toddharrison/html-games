## 13. Decisions and open questions

### 13.1 Decided

**2026-11-26, after the first playtest (draft 6).** The game was fun but too menu-driven and visually flat.

| Decision | Where it shows up |
|---|---|
| Things to gather lie on the ground, drawn, and are clicked; the ground type alone gives nothing. All portable materials come only from them. | 6.7, 8.2 |
| Trout are fish drawn in the water, which can be watched and are speared one at a time. | 7.4, 9; Q34 |
| Things to discover, obvious (noticed) and subtle (only drawn). | 6.7 |
| Mouse and keyboard together: hover names, click to walk and act, right-click for a menu. | 5.2, 12.4 |
| Variety from a smooth noise field; things in sizes; the beauty pass now, in code. | 6.8, 12.1; Q43 |
| Build a slice first, judge it, then roll out (builds and crafting with pictures after). | 14, M7; Q28 |

**2026-11-25.**

| Decision | Where it shows up |
|---|---|
| The game will be released. It is like *Hatchet* but not the same. | Sections 1, 3 |
| The protagonist is selected or randomised at the start of a run. | Section 4 |
| Systems, not a scripted retelling. | Pillar 4; section 5.3 |
| Real-time, grid-snapped, pausable. | Section 5.2 |
| Standalone HTML and TypeScript with no backend server; no game framework. Phaser was considered and turned down for v1; reconsider if the later visual upgrades are taken up. | Sections 11.1, 12.1 |
| 12-minute game days as a starting point. | Section 5.1 |
| Morale is included as a lightweight mechanic. | Section 7.1 |
| Rescue is the win condition, by several routes. | Section 10 |
| The setting is mountains, deliberately unlike the novel. | Sections 6, 9 |
| The protagonist roster includes girls as well as boys. | Section 4.1 |
| The starting tool varies: hatchet, sheath knife, or multi-tool. | Section 7.2 |
| The build produces a single self-contained HTML file as well as a static folder. | Section 11.1 |
| Walking out over the pass is not in v1; reconsider afterwards. | Section 10 |
| The game lives in the html-games monorepo as `games/snowline/` and uses its existing build, test, and GitHub Pages deploy. | Sections 11, 14 |
| The title is **Snowline** (was Q14). The folder, URL path, and storage prefix are `snowline` to match. Renaming the folder after players have saves would change the URL and orphan those saves. | Section 3; 11.1, 11.6 |
| The art has the mood and feel of *Kingdom Two Crowns*, but not from the side view. Graphics are kept simple to begin with. | Section 12.1 |
| Permadeath, with no reloading and no forgiving mode (was Q4). | Section 5.4 |
| The valley is procedural, with authored set pieces and one hand-checked default seed (was Q6). | Section 6.3 |
| Tone: ages 10 and up (was Q7). | Section 12.2 |
| Claude makes the art for now, as sprites drawn in code (was Q10). | Section 12.1 |
| Hunting and butchering are abstract, but it is clear what is being done (was Q13). | Section 12.2 |
| The game is public from M0 with an in-development warning (was Q15). | Section 11.1 |
| Seven kinds of rule are dealt per valley to start with (was Q16). Bait, fibre, and bark are held back for after v1. | Section 6.6 |
| The valley notes show the possible outcomes, and what is determined against what is unknown (was Q17). | Section 6.6 |
| After a death the same valley can be played again, from its seed (was Q18). | Sections 5.4, 6.6 |
| Sound (was Q11): event hooks from the start, ambient sound in M4, effects and a few short pieces of music at key moments in M6. No music looping under play. | Section 12.3 |
| The rules change with each playthrough, by seed, after the board game *The Awful Green Things from Outer Space*: "that's why the player needs to learn the rules of the valley every time". | Section 6.6; pillar 1 |

Choices made in draft 5 to turn that decision into a design. The scope, the chart, and replaying a seed were agreed on 2026-11-25 (table above); the rest are still for review:

- **The seed deals which and what, never how.** The body, fire, weather, and the controls are the same in every valley. Seven things are dealt: wild plants, remedies, stone, wood and tinder, water, animal temper, and weather signs.
- **A deck, not dice.** Every valley gets the same mix of good and bad outcomes, differently assigned, so no seed is unfair. A few spare outcomes stop the last unknown being worked out by elimination.
- **A safe floor.** A handful of foods, boiled water, and fire behave the same everywhere, so a cautious player can live thinly without gambling.
- **Finding out is survivable.** A small taste is a small dose; nothing kills from one cautious test; every rule can also be learned by watching.
- **Things are named by appearance**, not by real species, so that a berry changing its nature between valleys stays believable.
- **The valley notes chart** shows what is determined and what is unknown, and lists the possible outcomes.
- **Remedies, animal temper, and weather signs are new content** that draft 4 did not have. They were added because they are where a dealt rule can turn out well as well as badly.
- **Backgrounds start with one valley fact** from their own field.
- **Replaying a seed keeps its rules**; after a death the default is a new valley.

Choices made in draft 5 to turn the art direction into a plan (agreed 2026-11-25):

- **The mood is carried by cheap things:** a colour grade for the time of day, darkness with firelight, a muted palette, a quiet interface, weather overlays, and sound. Sprites stay one tile and simply animated.
- **The costly parts of the reference's look are deferred, not planned:** tall sprites, smooth animation, a mirroring lake, long shadows, mist, and wind. They are listed in 12.1 as later upgrades, to add one at a time if the simple version falls short.
- **Sound moves earlier**, from M6 to M4, and there is a little music, because much of the reference's mood is in its sound (12.3).
- **What the player sees at night is exactly what the simulation lets the survivor see.**

Changes made in draft 4 that follow from the monorepo decision but have not been discussed individually, for review:

- **A test replaces the ESLint rule** that bans non-deterministic calls in `sim/` and `content/` (11.3, rule 8). The repo has no linter and CI does not run one; a test is enforced by the gate that already exists.
- **Playwright is not a dependency.** The browser replay check is a script run by hand before a release, on the pattern the other game already uses (11.4). CI checks the replays in Node only.
- **The 1,000-seed sweep and the bot runs are run by hand**, with a 25-seed sample in `npm test`, because this game's tests now gate the deploy of every game (11.4).
- **Storage is prefixed with `snowline`**, and run saves stay in IndexedDB instead of the `localStorage` the other game uses, because the origin's storage is shared (11.6).
- **The single file is built into `dist/standalone.html`**, so it is published as a download alongside the hosted game (11.1).
- **Versions match the repo:** TypeScript 7, Vite 8, Vitest 5, semantic versions that change only at a release (11.1).
- **The spec moved** from `SPEC.md` to `docs/SPEC.md`, where the repo keeps each game's docs.

Choices made while building M0 and M1 (2026-11-25), for review:

- **Two outcrops by the overhang:** the dealt spark-stone and an edge-stone, so "the stone by the overhang" isn't itself the answer. 6.3's rule (the spark-stone is the one at the overhang) still holds.
- **Cliff bands only below the subalpine and alpine bands.** The valley floor rises into the forest as an open slope; the scramble routes are 4 into the subalpine band and 3 into the alpine.
- **The dealt water sources are always the lake and two streams.** The near stream's mouth is beside the start, so the foul source is never the only water near it. A tarn, when one is placed, is extra high water that is always clean.
- **The HUD shows a word for the time** ("Day 2 · dusk"), not a clock, in keeping with pillar 2. A wristwatch in the pockets could show the time later.
- **A test fire is a debug command in the simulation**, so night and firelight can be judged in M1, before fire exists (M3). It is in the command log, so replays stay exact.
- **The crash happens at 14:30 on day 1**, so the first dusk comes about two hours (eight real minutes) in.
- **Imports carry `.ts` extensions and only erasable TypeScript is used**, so Node runs the simulation and tools directly (`npm run inspect`) with no build step.

Changes made in draft 2 that follow from those decisions but have not been discussed individually, for review:

- Wildlife replaced with a mountain set: elk, cougar, marmot, pack rat, jays, and goats in place of moose, wolves, skunk, and turtle.
- The wreckage moved from the lake bottom to the alpine band; a rockslide, not a raised plane, opens the way to it.
- Three routes to fire instead of one.
- An autumn trout run replaces early-season eggs as the time-limited food.
- Elevation bands, viewpoints, and a descending snowline added.
- Protagonist backgrounds, traits, and starting tools added.
