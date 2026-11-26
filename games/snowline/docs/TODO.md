# TODO

Open work and the hand-off between sessions. See CLAUDE.md for how to maintain it. **Only open items live here:** when a task is done, move it to [FEATURES.md](FEATURES.md) (under its system, with the tag line) and delete it here.

## Hand-off notes
- **Overnight run (2026-11-25/26), at the user's request:** build M2 through M6 one after another on branch `snowline/spec`, a commit per milestone, questions captured in SPEC §13.2 with a simple option taken, renders left in `renders/` for the user to look at. Don't touch `games/behemoth-protocol/`.
- **Done:** M0+M1 (`27fbb89`), M2 (`12a039f`; FEATURES.md §10–13), M3 (`fa5ba50`; §14–16), M4 (`28dfbbf`; §17–21), M5 (this commit; §22–23).
- **The balance pass (M5, `npm run bot -- --count 70`, 140 runs):** learning the valley, the bot's median run is **12.5 days**, 1 of 70 rescued (beacon); handed the deal, **23.3 days**, 2 of 70 rescued. **Learning the valley costs about 11 days** of median survival, the gap SPEC §11.4 asks for. 49% (learning) and 81% (told) reach day 14; 33% and 60% day 21; almost none day 30. Cold ends 59 and 64 of the 70 runs, mostly after the severe storm (days 18–30) wrecks the camp, or on the climb to the wreckage, which the bot attempts without warm layers or a high camp. Wounds and infection (animals, a blade slipping when exhausted) end a few early runs. Runner and Reader do worst learning; the Angler (who knows the foul water) and Scout best. The bot is a weak player (FEATURES §23), so a careful human should live longer; Q40 in the spec asks what a first run should look like before tuning further. Tuning done in this pass: SPEC Q41.
- **Next step:** M6 (polish), below.

## Playtest queue
Built but not yet seen by the user. Check each one off by setting its FEATURES.md entry to `playtest: approved`, then remove it here.
- [ ] **The screens, as pictures:** `npm run tour` (or look at `renders/tour/`): title, selection, play, the action menu, inventory, tasting, the journal (notes, log, body), rest, asleep, pause, the summary.
- [ ] **A first day (M2):** *First valley*, pick a survivor, and live a day: drink at the lake (E facing water), find the berries near the start and taste them, dig cattails in the reeds, sleep at the overhang. Is the pace right (thirst over 2 days, hunger over 5)? Is the night cold enough to matter without fire? Do the log lines carry the mood?
- [ ] **The valley notes (J):** does the chart make the puzzle clear: what each row can hold, what's pinned down, what's still open?
- [ ] **Walking the valley:** grid movement feel (6 ticks a step on meadow; marsh, talus, and scree slower; trails quicker); holding and switching direction; a tap moves one tile.
- [ ] **The mood check (SPEC §12.1):** `?seed=first-light&debug=1&ff=19:30` (dusk), `&ff=23:00` (night), `&ff=05:50` (dawn); *test fire here*, then walk away from it. (`npm run shots` saves these to `renders/shots/`.)
- [ ] **The valley's shape:** `npm run inspect -- first-light <seeds>` (`renders/inspect/`). Is 256×256 right? Is the default seed a good first valley?
- [ ] **Drawn sprites:** the survivor (three hair styles, walking, asleep), trees, rocks, berries, the wreckage. Keep drawing in code, or plan for an artist (SPEC §12.1, M6)?
- [ ] **Fire and camp (M3):** strike the outcrops by the overhang, carry the one that sparks, gather tinder and sticks, light a fire facing open ground; cook crayfish; lay a bough bed. Then the bow drill (debug `give cord`, `give stick`, `give firewood <wood>`; needs the *bow-drill* technique: a Scout knows it). Is the first fire a moment? Are the odds and times right? `npm run tour` shows the craft menu, the fire's options, and a camp.
- [ ] **The living world (M4):** weather (`renders/weather-rain/`, `-storm/`, `-fog/`; seeds `wx-2`, `wx-9`, `wx-91` at 16:00 on day 1), animals (hares by the lake on any seed; the bear and elk: debug *reveal map*, the map shows territories), a dangerous animal's warning and what turns it (*reveal rules* shows the deal; try facing, shouting, a fire, or backing off), jays at the safe berries, fishing at the stream mouth, snares, mosquitoes at dusk by the water, sound (wind, water, rain, fire, insects at night). Is the weather's pace right? Do the animals feel alive without crowding?
- [ ] **The arc (M5):** a search flight (days 2–10: debug panel `?debug=1`, 64× speed, watch the log for "A drone"); a smoky signal fire (debug `give boughs -1 4`, throw them on a fire); the severe storm (*reveal rules*… the debug panel shows its day; fast-forward to it) and the rockslide; the climb, the tail wreckage, the beacon, and rescue (`?debug=1&at=X,Y` near the wreck after the slide; the debug map marks it). Is the storm the turning point it should be? Is the climb a real expedition?
- [ ] **Title:** the tagline, the backdrop, and `package.json`'s `description` (the in-development notice is off since M5: Q39).

## M6: Polish (next)
Goal (SPEC §14): final art pass (and whether an artist redraws it), sound effects and music, accessibility settings, tuning, pre-release comparison with the novel.
