# TODO

Open work and the hand-off between sessions. See CLAUDE.md for how to maintain it. **Only open items live here:** when a task is done, move it to [FEATURES.md](FEATURES.md) (under its system, with the tag line) and delete it here.

## Hand-off notes
- **Where things stand (2026-11-26):** M0–M6 are committed on branch `snowline/spec` (last `9cc803a`), not pushed; version 0.1.0 (Q45). After the first playtest the user asked for draft 6 (SPEC 14, M7, "seeing and touching"). **The M7 slice is built and committed (`37795da`, branch `snowline/spec`, not pushed)** (FEATURES §25): loose things on the ground replace ground-type gathering, click to walk and act (hover names, right-click menu), trout in the water, wreckage washing up and noticing, and the beauty pass. The spec was split into `docs/spec/` the same day (index: docs/SPEC.md).
- **Checks:** 420 tests pass; typecheck and build pass; goldens moved on purpose (the world hash now includes `loose`; the state has fish, routes, a `fish` stream; "first steps" now walks by `goto`) and `npm run check:browser` agrees; `npm run tour` passes. Saves are schema 3: older saves can't be carried on.
- **Bot, 30 seeds (`npm run bot -- --count 30`):** learning the valley, median **19.1 days** (was 12.5 over 70 seeds before M7), 1 rescued; handed the deal, **22.2 days** (was 23.3). Learning now costs ~3 days instead of ~11: likely the free aim-low by watching, tinder gathered by sight, and fewer ground-gathering detours; not retuned (the user balances by playtest). Cold still ends nearly every run.
- **Renders for the user:** `renders/m7/` (start at dawn, noon, dusk; forest; stream mouth), `renders/tour/`, `renders/mouse/` (hover label, right-click menu).
- **Next step:** the user plays the slice (playtest queue, first item) and says what to change. Then the rest of M7 below.

## M7, after the slice is approved (SPEC 14)
- Builds as objects placed with a preview and going up in stages (Q28); a crafting panel and inventory with pictures.
- More discoveries (the user asked for subtle and obvious ones); more art passes as the playtest asks (the straw tuft, cattail fluff, and stalks are the weakest drawings).
- The bot and balance redone for the new gathering (see the numbers above); does learning the valley cost enough now (SPEC 11.4)?

## Playtest queue
Built but not yet seen by the user. Check each one off by setting its FEATURES.md entry to `playtest: approved`, then remove it here.
- [ ] **The M7 slice (FEATURES §25):** *First valley*. Hover over things near the start (the name and what a click does show by the cursor); click a tuft of dry grass, some twigs, driftwood on the shore; right-click for the menu. Walk to the stream mouth and watch the trout (click one: an eye), walk up and see them scatter, stand still and see them come back; with a spear, face one and throw. Watch the shore in the first two days for wreckage washing up (cable, a bag of peanuts, a glint of aluminium). Find prints on sand or a game trail and look at them. And look: the shore, the meadow's drifts of flowers, the forest, shadows through the day, mist at dawn, clouds' shadows. Is this the direction? What looks wrong?
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
- [ ] **Polish (M6):** sound effects (footsteps, the fire catching, a discovery) and the four pieces of music (first fire, first wide view, first snow, rescue); the settings screen (text size, fewer flashes, keys); the drawn sprites (`renders/tour/`, `renders/art-overhang/`).
- [ ] **Title:** the tagline, the backdrop, and `package.json`'s `description` (the in-development notice is off since M5: Q39).

## After v1 (SPEC §10, §14)
- The walk-out over the pass, reconsidered once v1 is playable.
- Whatever the review of Q19–Q45 turns up.
