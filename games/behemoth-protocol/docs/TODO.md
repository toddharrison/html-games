# TODO

Open work and the hand-off between sessions. See CLAUDE.md for how to maintain it. **Only open items live here:** when a task is done, move it to [FEATURES.md](FEATURES.md) (under its system, with the tag line) and delete it here.

## Hand-off notes
- **Just done (2026-11-22, uncommitted, on branch `m3-field-battery`):** the user's second roster request, the **siege tank**: a slow superheavy mini-boss with two turrets. The main turret carries a huge cannon; the rear one picks its own target: drones, then the trailer, then the hull. It survives a ram: it takes damage and is shoved aside, with ram gear adding to the damage. A banner calls it out on first sight. Also: enemies can now carry extra turrets (`EnemyDef.turrets`, `Enemy.guns`), and there's a `?mix=` practice param. All my calls: SPEC §15 "Siege tank (M3)", §16 Q30. FEATURES.md §7 "Siege tank". 538 tests.
- **Before that (commit 30a779b, branch `m3-field-battery`, not merged to `main` yet):** M3 content, the user's first roster request: the **field battery** (placed artillery). A fixed unit dug in near a side of the field marks a target zone where the Behemoth is headed, then drops a four-round volley into it 2.4 s later. Also a reusable area-fire targeting type (`WeaponDef.barrage`), enemy lobbed rounds with friendly fire, edge placement, long-guns/entrenched/combined mixes, batteries behind Breach walls, a zone marker and incoming whistle, and a `?doctrine=` practice param. All my calls: SPEC §7, §15 "Field artillery (M3)", §16 Q29 for review. FEATURES.md §7 "Field battery (placed artillery)". 531 tests.
- **Before that (commit f4b61e9):** three user fixes. Worn treads now slow the Behemoth to a 50% floor (`DEGRADE.treadSpeedFloor`), not toward zero; only Immobilized stops it (SPEC §5.1, §15 "Tread damage", CLAUDE.md rule). Hits on enemy vehicles are darker (`pierce` reworked; a new `ricochet` off front armor, sometimes with a whine). The map's intel panel wraps every line (Chase/Breach goals ran off the edge). FEATURES.md §2 "Behemoth movement", §7 "Facing armor", §9 "Sector map".
- **Just done (2026-11-22, commit 75a116f):** M3 **conditions and events**. Conditions: **night** and **storm** (rainstorm, blizzard, sandstorm, ash storm by biome) on 30% of battle nodes, both through a sight rule layered on concealment, and the enemy is blind too (at night the Behemoth's muzzle flash lifts that for 2 s; squalls blind both sides). A render veil with light holes, storm particles, a weather sound bed, map badges, intel, HUD line, banners; the attract mode shows one clip in four with a condition. Events: a third map node kind (about 2 a route), six events with seeded outcomes, an event screen. Save v12. All my calls: SPEC §3.1, §4.6, §8.3, §15 "Conditions and events (M3)", §16 Q27–28 for review. FEATURES.md §7 "Conditions: night and storm", §9 "Events". 519 tests.
- SPEC §16 Q1, Q19–30 still await the user's answers.
- **Next step:** the user reviews the siege tank diff and plays it and the field battery (playtest queue), then decides whether to merge `m3-field-battery` into `main`. Then the next roster request: **a unique unit for each biome** (design them with the user first).
- "Playtest and tune the economy" (M2) is still open; events add salvage, repairs, and depot actions to it.
- **Where things are documented:** code gotchas are marked **Gotcha:** in FEATURES.md (e.g. `shotSpec` vs `roundSpec`, `firingBinding`, `damageTreads`, `speedLimits` in tests, camera shake, broadside test dummies, `enterMapNode` in practice runs, null enemy weapons, the command post outside `objective.total`, the veil's per-light images). Screenshots, the audio harness, and the practice URL params are in FEATURES.md §1 (CDP key presses need a ~250 ms hold).

## Playtest queue
Built but not yet seen by the user. Check each one off by setting its FEATURES.md entry to `playtest: approved`, then remove it here.
- [ ] Public build: open https://toddharrison.github.io/html-games/ and play from there (audio, saves, fullscreen scaling)
- [ ] M0 feel pass + tuning notes; pick the internal resolution: 480×270, 576×324 (default), or 640×360 (`?res=480|576|640`; SPEC §16 Q8)
- [ ] Eased steering (any seed)
- [ ] Split front armor + ram plow: angle into fire from ahead and watch the HUD's two front boxes; ram a building off-center. `?addons=ramPlow` for the plow (it should flash and jolt on rams, never on fire); the depot zone list and cutaway strip via `?exit=40`
- [ ] Turret rings, coax, bindings, fire control: `?seed=1&addons=dorsalRing,coax,outerTreads`; rebinding needs a depot (`?exit=40` for a short battle)
- [ ] Drone bay + revive: `?seed=1&trailer=droneBay,ammoBunker` (`&immobilize=20` for the revive)
- [ ] Ground box (rock contact, fording)
- [ ] Run loop, depot, add-ons, trailer: `?seed=1&addons=all`, `?seed=1&trailer=missilePod,ammoBunker` (hold Q). Depot clicks, hover previews, resale, and partial repair have never been tried with a real mouse
- [ ] Energy weapons: `?weapons=turret:heavyLaser,prow:plasmaThrower,flankL:pulseLaser,spine:beamLaser` (beam colors and widths haven't been seen in motion)
- [ ] Cover and garrisons + damage particles: `?seed=1`, shoot a garrisoned building in a town
- [ ] Leaving the depot (or starting from the title) with a click no longer fires the main gun
- [ ] Facing armor: any seed. Watch heavy tanks back up ahead of you, light tanks show their tails while orbiting ahead, and the flank/rear sparks and "pierce" ring (rear hits are rare, see SPEC §16 Q13)
- [ ] Shell types: `?shells=turret:ap` or `turret:canister` (or switch at a depot via `?exit=40`). AP should fly flat past the cursor; canister is a short cone. HUD row reads `Cannon AP`
- [ ] Magazine cook-off: `?seed=1&cookoff=5` (torn up from inside) and `?seed=1&cookoff=5&addons=blowoutPanels` (vents; panels show OFF). Check the HUD row, the cutaway's magazine and panels at a depot, and that the blast feels catastrophic enough
- [ ] Component upgrades: `?seed=3&depot=2` (a Gen 2 reactor is for sale; click any core part, mount, or the hull for mods), then fight with them: `?seed=1&grades=reactor:3,fireControl:2&mods=turret.traverse:3`. Check the stock row, the grade panel's before>after line, Gen pips on the cutaway, the half-width mod buttons, and whether a heavy grade's overload feels fair
- [ ] Biomes, approaches, and the new terrain: `?seed=3&biome=arctic&approach=river` (frozen river, light bridge, drifts), `?biome=arctic&approach=pass`, `?biome=industrial` (tank farms: shoot one and watch the chain; walled compounds; rails), `?biome=industrial&approach=urban` (avenue), `?biome=temperate&approach=river` (bridges: shoot one out; overload a light bridge with `&addons=all`), and any seed for fortified lines, tank traps, and minefields (do swept mines read? are walls worth plowing, SPEC §16 Q18?). Ice should slide; thin ice should crack under the hull and drop it into the water. Check the HUD tags (DRIFT, ICE, FORD) and the map's Ground line. Desert: `?seed=3&biome=desert` (dunes, a wadi, an oilfield: shoot a derrick); wasteland: `?seed=3&biome=wasteland&approach=urban` (ruins, wrecks, craters, glass: tag GLASS). Is the wasteland the right kind of harsh?
- [ ] Sector map: start a new run from the title. Do the routes read (taken path, choices, current node)? Is the intel panel useful and the fog fair? (`?grades=sensors:3&exit=40` plays a short practice battle, then shows the map with no fog; `sensors:2` clears only deep fog.) Do depots as nodes squeeze repairs too hard (SPEC §16 Q19)? Win a battle and check the battle report on the left, a supply cache's extra action pip at the next depot, and the next sector opening on a forward depot
- [ ] Encounters and the alert clock: any seed. Does the Alert gauge (left panel, above the key hints) read, and do the banner and siren say "the clock is running"? Do posts feel like defended positions you drive into, and does braking feel costly? Try the doctrines on the map (entrenched should be the dug-in slog, raiders a running fight). The debug overlay (backtick) shows `ALERT`, `POSTS`, `THREAT`. Is the 15 s floor too relentless in a long battle (SPEC §16 Q1)?
- [ ] Sector map look and callsigns: `?seed=7&map`, `?seed=11&map=2&biome=industrial`, `?seed=5&map=3&biome=desert`, `?seed=9&map=3&biome=wasteland`, `?seed=3&map=2&biome=arctic`. Do the icons read as terrain at a glance (big enough? the plain and the desert's dunes are the weakest), is the background busy or calm enough, do the routes and choices still stand out? Callsign: the map's left panel, the HUD's top right, the depot header, the title's continue line, the death message
- [ ] Battle modes: `?seed=3&mode=breach&exit=60` (the fortress comes up fast) and `?seed=3&mode=chase`; on the map, B and C badges on the icons. Breach: do the three gun types read apart, is angling in for the flanks worth it, is plowing a gun a real option? Chase: does surging to catch the convoy feel like "speed is everything", and do the laid mines read (they should be visible)? Check the HUD line (left, above Alert), the amber arrows on targets, the banners, the extraction message, and the map's battle report line. Sprites for the new units are rough placeholders (the hovercraft is small)
- [ ] Directives and the run summary: start a new run from the title (the Directive picker: Enter, then 1-3 or arrows). Then `?seed=3&directive=decapitation&objective=1` (the command post sits behind the bunkers in the lane; destroy it and the Alert should read *Cut off*), `?seed=3&directive=interdiction&objective=2` (HUD *Stopped 0/3 needed*), `?seed=3&directive=breakthrough&objective=3` (the last objective: *Par 3:37 left*; extract to see *Directive complete* or *failed* and the summary). The summaries without playing: `?summary=won`, `?summary=failed`, `?summary=destroyed`. A real death: `?seed=1&immobilize=1`, hold X, then Enter (the summary's still of the blast). Do the three feel like different jobs? Is "the last objective decides the run" fair (SPEC §16 Q25)? The command post sprite is a rough placeholder
- [ ] Conditions: `?seed=3&condition=night` (does the dark read, and is the pool of sight big enough? Fire the main gun at a flash and watch the long guns answer; switch the autos off with 1–4 and see if holding fire is worth it), `?seed=3&condition=storm&biome=desert` (and `arctic`, `wasteland`, `temperate`): the first squall comes at 12–22 s; does it read as a short-range brawl, do the motes and haze look right, does the wind sound swell? On the map: the moon and raincloud badges under a battle's icon, and the "Conditions" intel line. The HUD names the condition under the ground on the right
- [ ] Events: start a new run and take an event node (the amber hazard sign), or `?event=convoy` (`orders`, `hulk`, `dump`, `drop`, `scavengers`; add `&seed=N` for other outcomes). Do the scenes and choices read, are the payoffs worth giving up a battle, and does the result screen say clearly what changed? Back on the map: the event in the left panel, *Weakened/Alerted* under the strength of the battles it moved, a revealed sector after decoding orders. Esc goes to the title; continuing reopens an undecided event
- [ ] Title attract mode: open the title (no URL params). Do ~10 s clips read as a show (enough action, the fade, the corner caption), is the dimming right for the menu, and does starting or continuing a run stop it cleanly? It's silent on purpose
- [ ] Hovercraft: `?seed=4&approach=river` (raiders or river nodes on the map); they should skim the river where tanks need a ford
- [ ] Sound: listen and tune by ear in `src/audio/synth.ts`
- [ ] Tread speed floor and hit sounds: any seed: plow towns and take tread hits (infantry rockets, mines) and watch the speed settle near half as the treads wear (does 50% feel crippled enough?). Autocannon a tank's nose (dull clank, an occasional ricochet whine) and its flank or tail (a crunch, heavier from behind): dark enough now? The intel panel: hover a Chase node (`?seed=3&map`, the C node at upper right) and the long goal wraps
- [ ] Field battery: `?seed=3&doctrine=longGuns` (or `?mode=breach&exit=60`: one dug in behind the wall). Does the zone read (the ring, the closing disc, the whistle), and is 2.4 s enough to steer clear? Is charging the battery (inside 90 units it can't fire) a real answer? Lure a volley onto their own troops. Night: `&condition=night` (the ring shows over the dark). The sprite is a rough placeholder
- [ ] Siege tank: `?seed=3&mix=siegeTank:1,lightTank:2` (add `&trailer=ammoBunker` to see the rear gun go for the trailer, `&trailer=droneBay` and take tread damage for the drones). Does the banner land, do the two guns read as separate (two glints, two reports), is it worth angling for its flanks, and does ramming it feel like shouldering a heavy thing aside? Rough placeholder sprite
- [ ] From M1: rivers (`?seed=4`), last stand (`?immobilize=10`), status visuals, smooth rendering on a real display

## M0: Feel prototype
All tasks built (FEATURES.md). The playtest and resolution choice are in the playtest queue.

### Follow-ups noticed during M0
- Enemy obstacle avoidance is crude (slide/swerve); fine for light tanks, revisit with M1 enemies
- Collision footprint ignores hull rotation (max ~41°); OK for now
- Terrain gen (`fillDeadEnds` in sim/terrain.ts) checks rock gaps a few columns ahead but not how far the hull can drift sideways per column (forward:lateral ≤ 1:0.87, less at top speed), so rocks can still line up a gap the hull can't steer into, e.g. before a river crossing. If it still happens at ~41°, make the gap check slope-aware
- Sprites are lit from the left in the vertical view (drawn for horizontal); redraw facing up in the real art pass
- Hull rotates up to ~41° when steering hard (raised from ~31°, Nov 2026, so rock fields by river crossings stay passable); check whether that reads well or should be damped visually

## M1: Combat core
All tasks built (FEATURES.md). Playtests pending for rivers, the last stand, and status visuals.

### Follow-ups noticed during M1
- No visual cue for the reveal radius. If playtesting shows players don't connect sensor damage with ambushes, try a faint sensor ring or a sweep when forest is near
- Run summary on death is just the center message for now (real summary is M3)
- Prow autocannon sprite hides under the main barrel when both face forward; flank AP mounts mostly under the turret. Revisit mount placement in the art pass
- Mount angles aren't interpolated (only the hull/turret are); fine unless it shows
- Turret slot art (art pass): the coax barely reads against the main turret, and the dorsal barrel lies across the main turret when both face forward; status sparks for turret slots use the slot's rest position
- Tab (auto-target priority) and F (abilities) from SPEC §4.3 aren't in yet
- Resize changes the render scale but isn't tested on a real window yet
- No enemy-vs-enemy separation: units can overlap (squads sharing a wood are jittered ±4 only)
- Enemy missiles: a lock tone sounds at launch, but there's no visual marker on the Behemoth
- Enemies treat rock like intact buildings (impassable; crude slide/swerve avoidance). Fine while rock is sparse; real pathing if units visibly snag
- Dead-end filling stops looking ahead after one chunk, so a chain of dead ends longer than that could slip through (the crumble failsafe catches it)
- Rock collisions use the unrotated footprint, like everything else (see M0 follow-ups)
- Heavy tanks only ever spawn ahead, and one that falls behind (forest slows it) rarely catches up; fine for now
- The flow field could replace the crude slide/swerve avoidance outside the last stand too (toward a point ahead of the Behemoth), if units visibly snag on rock during normal play
- Status visuals to judge in play: smoke volume with several red components (may hide the hull), the full-white flash of a whole tread pod on flank hits (may be loud), and heat rates (`HEAT_PER_SHOT`). Turret and barrel have no wear marks yet; mounts don't flash when their arc is hit
- Rivers: banks are hard tile squares and the hull sits on top of the water (no submerged treads); soften both in the art pass. River frequency (`riverChance` 0.35, ~1 per 50 s) is a guess; M3 approaches (river crossing) should set it per node
- Rivers: `viaFord` handles the first river between a unit and its target only; enemies rarely span two. Bridges (weight limits, engineers) and hovercraft (cross freely) are later content
- Last stand: each wave sounds the enemy's attack siren, but there's no visual flare

## M2: The loop
Goal (SPEC §13): battle → depot → battle with persistent damage and ammo, salvage, depot actions, add-ons including the trailer; side-on depot cutaway; run save/load. Built so far: FEATURES.md §9–11.
- [ ] Playtest and tune the economy (closes M2)

### Follow-ups noticed during M2
- Split front armor: enemies aim at the hull's center, so even a slight angle puts nearly all fire from ahead on one half. Check in playtest that this reads as a choice, not twitchy. A rock-face contact also snaps the heading to ~41° on its first step (the deflect shove writes `vy` directly), which throws the leading corner onto the face
- Possible nit: clicking "Battle N" in the depot may carry the held mouse button into the battle's first frame (fires the main gun once)
- Sim bot balance (8 seeds, firing everything): wins ~70%, 180–290 s per battle (over the 2.3 min estimate), 250–400 salvage; passive autos-only never extracts. Input for the economy tuning
- Sound: no UI sounds on the title/depot (repair, buy, install clanks would fit); no music; no per-chassis engine voice; slow motion before the detonation doesn't slow the audio; far sounds have no speed-of-sound delay (left out on purpose: it would feel laggy at this scale)
- Outboard treads make a stock Behemoth slightly *faster* (underloaded at 280/420 t) as well as tougher; if they feel like a no-brainer, trim the capacity or raise their mass
- Ram gear's "adds damage to whatever you hit" (SPEC §4.2) only matters for units that survive a ram (`ramDamage`: the siege tank so far); everything else is still crushed outright. Enemy Behemoths and train cars will use it too
- Add-ons are built into `BehemothView` at battle start (they only change at depots); a mid-battle add-on change would need a rebuild
- The schematic and cutaway place add-ons by hand per chassis (`ADDON_BOX`, `SLOT_BOX`, `TRAILER_BOX`, cutaway `LAYOUTS`); Class I/III will need their own
- Auxiliary generator and drone power drain: before energy weapons, nothing drew enough power for either to matter (the drones' 2/s never emptied the capacitor in bot runs). Energy weapons are in now, so check both in playtest and revisit drone `power` if needed
- A full trailer (pod + bunker) puts the stock Behemoth just over capacity (288/280 t, ~5% slower). Intended trade-off; revisit `MASS.towed` or module masses if it feels bad
- The trailer takes ~1 hit a battle (bot): almost all fire comes from ahead. Its "soaks rear fire" role needs rear threats (hovercraft raiders, Pursuit mode); nothing targets it on purpose yet
- The trailer ignores terrain and enemies: it rides in the hull's track (a hard turn can swing it over uncrushed trees), enemies drive through it, and besiegers don't treat it as solid
- The schematic draws the trailer straight behind the hull (no swing); the trailer view is built at battle start like the add-ons
- A revive leaves the hull at 30% treads among every besieger at close range; the passive bot died again within ~20 s. If players feel it's pointless, raise `revive.fraction` or have besiegers fall back a little when it ends
- The power readout shows output (`+10/S`), not net of the drones' drain
- Drones fly straight through everything and enemies never aim at them on purpose (user's call: stray rounds + splash only; flak/AA enemies later)
- Bindings: a damaged-but-working fire control keeps both channels (only destruction matters); auto missiles skip line of fire and ignore hidden units like the guns; no in-battle indicator of which mount a binding row drives. Revisit after playtest
- The battle HUD builds the weapon strip once per battle (bindings only change at depots)
- Energy: the beam laser fires ~8.5 pulses/s, not 10 (cooldown hits zero a step late at 60 Hz; same for every weapon). Tune numbers in playtest; a full energy build (heavy + beam + pulse ×2 + PD) can't run everything at once on the 10/s reactor, which is the point, and makes the auxiliary generator worth having
- Magazine: a cook-off is a late, death-spiral risk (bot: never hit while the armor holds). If munitions builds should feel riskier, raise its hit weights. No warning when it goes red (the alarm covers critical components; a voice bark would fit, SPEC §17 idea 7)
- Shells: canister as the main gun's only load is a whole-battle gamble (bot: 3/8 extractions); it shines on a second L gun. Revisit with SPEC §16 Q11 after playtest. All three use the cannon's report; AP and canister could get their own sounds
- Facing armor: rear hits are rare (~0.3 a battle for the bot); see SPEC §16 Q13 for levers. Enemy facing has no visual tell beyond the hull sprite (the sprites are lit from the left and barely show front from back yet; art pass)
- Upgrades: nothing on the battle HUD or the top-down sprite shows a grade or mod yet (only the depot cutaway's pips); the art pass could give Gen 3 parts a visible change. Add-ons, the trailer, and modules take no mods (SPEC §16 Q15). Weapon tiers (SPEC §6) are still M4
- Upgrades: a full Gen 3 refit overloads a stock Class II (~296/280 t with Gen 3 sensors and Gen 2 fire control), so Gen 2/3 treads or outboard treads become part of the path. Intended; judge in the economy tuning
- Plasma pools: enemies ignore them (SPEC §16 Q14); the hull hides a pool under it (BURN tag only); the trailer's overlap uses its box, the hull's its ground box. The beam laser doesn't ignite forests yet (§16 Q6)

## M3: Roguelike structure (current)
Goal (SPEC §13): seeded sector map with intel and approaches; procedural battles; alert clock; Assault + Breach + Chase; Directives; win/lose; permadeath; run summary; a first handful of events. Built so far: biomes, approaches, and the new terrain (FEATURES.md §3); the sector map with doctrines (FEATURES.md §9); encounters and the alert clock (FEATURES.md §7); battle modes Breach and Chase (FEATURES.md §9, §7); Directives, sector objectives, and the run summary (FEATURES.md §9); conditions (FEATURES.md §7) and events (FEATURES.md §9).
- [ ] Content toward the M3 targets (§13.1): 12 weapons, 5 weapon modifiers, 12 enemies (12 so far, counting the fortress guns, convoy, field battery, and siege tank), 3 doctrines and 2 elites. **User's requests first (Nov 2026):**
  - [ ] A unique unit for each biome (temperate, arctic, industrial, desert, wasteland): design them with the user first
  - [ ] Hovercraft raider behavior: hit-and-run from the rear, using the water (it circles like a light tank for now)

### Follow-ups noticed during M3
- Breach: rock can paint over the wall and its gun gaps like any fort (a gun may then sit on rock); fortress guns have no garrison of their own (the posts and the bunkers' infantry fill in); doctrines don't change the gun mix (a long-guns fortress could dig in more batteries)
- Siege tank: rare at sector 1's threat 7 (its threat of 4 rarely fits a post, SPEC §16 Q30); no health bar for the mini-boss; the extra turret's angle isn't interpolated; enemies don't avoid each other, so a shoved siege tank can end up overlapping another unit; the demo bot never rams on purpose
- Field battery: a zone stays up for the whole volley even if the battery dies or leaves the frame mid-salvo (fewer rounds land than the ring promised); batteries never relocate; no spotter (mobile radar) or rocket artillery yet; the bot kills most batteries before their second volley (SPEC §16 Q29); the demo bot and attract mode don't dodge zones
- Chase: the convoy follows the lane with the crude slide/swerve avoidance, so a town across the lane can hold a hauler up; haulers never react to the Behemoth (no scatter, no smoke). A Chase objective in a sector (or an Intercept with a train, M4) would want a bigger convoy
- Laid mines are drawn swept, but there's no beat when one drops beyond a smoke puff; enemies still never set mines off
- Enemies and hazards (SPEC §16 Q17): units park beside fuel tanks, drive onto thin ice and bridges, never set off their own mines. Tracked units meet walls, tank traps, and factory halls with the crude slide/swerve avoidance (they don't path to the gates), so they may bunch at fortified lines
- Mines: no reveal ring or ping when the sensors sweep one (they just appear); the trailer never sets one off and never weighs on a bridge or thin ice
- Bridges: the deck tile has no railings or edges, so a span reads as a plank rectangle; fix in the art pass. Collapses only take the hull's weight (not the trailer's)
- Thin ice: a stock Class II (245 t) breaks it in under a second, so every frozen river is a ford in practice; check that it reads as ice giving way, not as a slow river. A lighter chassis (Class I) would skate
- Terrain-only bot: each recipe costs 10–25 more tread HP than before (mines, traps); SPEC §16 Q16. Feed into the economy tuning
- Arctic gets an occasional fuel-tank farm (`tankFarms` 0.05) as a fuel depot; drop it if it reads oddly
- Hedgerows are `trivial` like forest (0.05 tread per tile at cruise); farm boxes add up over a battle. Fine so far (bot ~1 HP)
- Map art: icons are 26 px (layers sit ~37 px apart at 576×324, so 32 px would crowd them); nodes can sit on a lake or the river on the background (the icon's ground oval reads as an island); the background ignores the node's actual ground (a river node needn't be near the river)
- Sector map: no animation moving between nodes and no beat when a sector changes; depot intel lists only the weapons (add-ons and grades depend on the Behemoth when it arrives)
- Doctrines only weight the four M1 units and don't shape terrain (entrenched could bring minefields and fortified lines)
- Encounters: posts are only *when* units appear; their units then fight with the usual behaviors (a post's heavy tanks still back away ahead of the hull). Fixed units now exist (Breach's guns, behavior `fixed`); posts could hold some too. Supply trucks (§7: "destroy them to slow the reinforcement clock") would hook into `AlertClock` when they arrive
- Alert clock: nothing on the map's intel panel says how strong a node's posts or waves are beyond strength and doctrine; no visual flare for an arriving wave (only the banner and the siren, like the last stand)
- Encounter bot (8 seeds, T 7): kill salvage is ~20% below the M1 spawner (259 vs 332 a battle); input for the economy tuning (SPEC §16 Q22)
- R still retries a battle mid-run (SPEC §16 Q10); with the map, a retry keeps the node and its intel
- Desert: the derrick overlay is small and reads as a lattice square (art pass); dunes don't block sight (long sightlines are the point), but hull-down behind a crest could be a later idea
- Directives: the summary screen leaves its lower half empty (room for a cutaway of the Behemoth as it ended, SPEC §4.1's side-on view); no profile save yet, so a Directive complete unlocks nothing (M5, §9); the Directive picker offers all three every run (§16 Q26); there's no chassis choice in the run setup (one chassis)
- Decapitation: the command post has no garrison or reaction when the guns fall; its pad can sit right behind a bunker, so plowing to it means plowing a bunker too. Interdiction: a Chase objective's convoy is still 5 haulers at 1.15× cruise (SPEC §16 Q24: should the final convoy be bigger?)
- Old saves (v10) get a Directive from their last objective's mode and count the sectors behind them as taken (their real results weren't recorded)
- A bot that never steers can stall head-on against a small rock outcrop (industrial `?seed=4`, x ≈ 774: speed ~0.9, never gets past). Pre-existing (the same before Directives); players steer round it, but "nothing blocks it outright" says the deflection should carry it past
- Conditions: night has no searchlights or flares (SPEC §4.6 table) and enemies have no night behavior of their own (they don't close in under the dark on purpose); the veil sits under smoke and dust, so a far-off explosion's smoke draws over the dark unlit; the condition badges on the map are 7-pixel placeholders. The storm's "rain stops forest fires" waits for fire spread (§16 Q6). Fog/rain, ion storm, and clear are the next three (v1 target 5)
- Conditions: the Behemoth's autos mark it at night whenever they fire, so "hold fire" means toggling them off; if players never do, consider letting the AP guns (short, small flashes) not count
- Events: the six have no art beyond the map icon; none is biome-specific yet; no event starts a fight (an ambush), offers a weapon or add-on, or touches the trailer (§16 Q28). The event screen's munitions row counts only hardpoint racks, not the ammo bunker
- Wasteland: wrecks are single tiles; a "dead Behemoth" hulk (a big multi-tile wreck, a salvage jackpot) would fit as a set piece. Ruins pay no salvage for the part already knocked down

## Later milestones (break down when current)
- [ ] M4: Bosses & content (enemy Behemoths, armored trains)
- [ ] M5: Progression & polish
