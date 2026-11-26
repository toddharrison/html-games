# TODO

Open work and the hand-off between sessions. See CLAUDE.md for how to maintain it. **Only open items live here:** when a task is done, move it to [FEATURES.md](FEATURES.md) (under its system, with the tag line) and delete it here.

## Hand-off notes
- **Overnight run (2026-11-25/26), at the user's request:** build M2 through M6 one after another on branch `snowline/spec`, a commit per milestone, questions captured in SPEC §13.2 with a simple option taken, renders left in `renders/` for the user to look at. Don't touch `games/behemoth-protocol/`.
- **Done:** M0+M1 (`27fbb89`), M2 (`12a039f`; FEATURES.md §10–13), M3 (this commit; §14–16).
- **Next step:** M4 (living world), below.

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
- [ ] **Title and notice:** `TEXT.inDevelopment`, the tagline, and `package.json`'s `description`.

## M4: Living world (next)
Goal (SPEC §14): weather and its signs, temperature, snowline, animals and their dealt tempers, fishing, hunting, illness and injury, remedies, traits, ambient sound.

## Later milestones
- M5 Arc and ending · M6 Polish (SPEC §14).
