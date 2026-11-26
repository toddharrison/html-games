## 14. Milestones

Each milestone ends with something playable and a passing test suite, which here means the repo's own gate: `npm run typecheck`, `npm test`, and `npm run build` from the repo root, for every game. Recommendation: hand off M0 and M1 together as the first implementation task, review, then continue.

| | Milestone | Done when |
|---|---|---|
| M0 | Skeleton | `games/snowline/` is a workspace in the monorepo: `package.json` with the fields and scripts in 11.1, `npm install` run at the root, its own `CLAUDE.md`, a rewritten `README.md`, `docs/TODO.md` and `docs/FEATURES.md`, and an entry in the root `CLAUDE.md` and `README.md`. The root build puts both outputs in `dist/snowline/` and the game on the landing page. Fixed-step loop runs; seeded generator with streams; determinism guard test active; version stamp on screen; a golden replay passes in `npm test` and in a browser through `npm run check:browser` |
| M1 | Walkable world | A seed deals the valley's rules (6.6) and generates a validated valley with elevation bands; the deal shows in the debug overlay; the survivor walks it with camera, collision, the time-of-day colour grade and night darkness, a mood check over placeholder tiles (12.1), viewpoints, map screen, and debug overlay; 1,000-seed sweep passes |
| M2 | Survival core | Drawn sprites replace the glyph tiles; protagonist selection screen; vitals and morale, drinking, foraging, inventory, sleep, death screen, message log, saves with export. Dealt plants and water: tasting, the fixed floor foods, and the valley notes chart. This is the first milestone where the dealt rules can be felt, so judge the idea here |
| M3 | Fire and craft | Insights of both kinds, journal, all three fire routes with dealt stone, wood, and tinder, cooking, spoilage, tool chain to spear, shelter upgrades, starting-tool differences |
| M4 | Living world | Weather and its signs, temperature, snowline, animals and their dealt tempers, fishing, hunting, illness and injury, remedies, traits, ambient sound |
| M5 | Arc and ending | Search aircraft, severe storm and rockslide, wreckage climb, all three rescues, title and summary screens, bot-driven balance pass, including what learning a valley costs (11.4) |
| M6 | Polish | Final art pass (and whether an artist redraws it), sound effects and music, accessibility settings, tuning, pre-release comparison with the novel |
| M7 | Seeing and touching (draft 6) | **Slice first**, judged before the rest: the mouse (hover names, click to walk and act, a menu at the cursor), loose things on the ground replacing ground-type gathering (6.7), trout in the water (7.4), the shore wreckage, tracks, and noticing (6.7), and the beauty pass (12.1, 6.8). **Then:** builds as objects placed with a preview and going up in stages (Q28), a crafting panel and inventory with pictures, more discoveries, and the bot and balance redone for the new gathering |

Out of scope for v1: multiplayer, winter, mobile and touch, other human characters, modding, localisation, forest fires, the walk-out route.
