## 6. World

### 6.1 Map

- 256×256 tiles, one valley. The edges are cliffs and steep headwalls the survivor cannot climb, which explains why they cannot walk out.
- Logical screen is 384×216 px (24×13.5 tiles), scaled by whole numbers to fit the window.
- Each tile has: terrain (ground type), an elevation band, at most one feature (tree, boulder, bush, log), a list of loose items, and an "explored" flag.

### 6.2 Elevation

The valley rises from the lake through four bands. Elevation is what makes this a mountain game rather than a forest game.

| Band | Terrain | Character |
|---|---|---|
| Valley floor | Lake, streams, marsh, reeds, meadow, sand | Water, fish, insects, most early food; coldest air pools here at night |
| Montane forest | Dense conifer and aspen, deadfall | Wood, shelter, game trails, berries |
| Subalpine | Thin stunted trees, open meadow, boulders | Marmots, elk, long views; exposed to wind |
| Alpine | Talus, bare rock, late snow patches | Wreckage, goats, the best signal sites; dangerous cold and falls |

- Bands follow warmth, not height alone (decided 2026-11-26): a north-facing slope is as cold as a higher one facing the sun, so the treeline climbs the sunny side and drops on the shady one.
- Bands are separated by slopes and by **cliff bands** where the ground steps down steeply, crossed only at a few scramble routes.
- Each band up is colder and windier, and steeper tiles cost more time and rest.
- High points are **viewpoints**: reaching one reveals a wide area of the map.

### 6.3 Generation

Decided 2026-11-25: procedural terrain with authored set pieces, plus one hand-checked default seed for a player's first run.

Before any terrain is made, the valley's rules are dealt (6.6). Later steps read them: which patches are safe and which stone is the spark-stone depend on the deal.

Pipeline, all driven by the world seed. **The valley is made by its history** (decided 2026-11-26): steps 1–5 simulate how a real glacial valley forms, so its shape, water, and forests make sense together. Generation time doesn't matter much (once per run, about a third of a second).

1. **Rock and ice.** The land is laid out along the valley's line: low along it, falling from the head under the high side to the outlet, rising to ridges either side, with peaks and spurs from ridged noise and a high rim round the map. Rock hardness varies in tilted beds. Each valley is its own: the main glacier flows from a cirque under the high side and carves a U-shaped trough (broader or narrower, straighter or more winding), gouged deepest a little above its snout, which may lie near the map's middle or well off to one side; one to four side glaciers from cirques on either flank join it high above its bed, leaving hanging valleys (waterfalls); sometimes a second great glacier joins it nearly level (a confluence), and sometimes a bar of hard rock crosses the trough with a basin gouged behind it (a rock step). The ice leaves a terminal moraine across the snout (it dams the lake) and lateral moraines along the trough, and a knobbly, ice-scoured floor (points, bays, islands where the lake lies). Below the moraine the outlet river cuts a gorge out through the rim, sometimes turning hard to one side first.
2. **Rain and frost.** Droplet erosion cuts gullies and carries sediment down; steep soft rock slumps to talus. Closed hollows are breached by the streams that drain them (only the lake's basin, and the basin behind a rock step, are spared).
3. **Water.** Every depression fills: the main one behind the moraine is the lake (its moraine raised or lowered until the lake is 1,500–3,000 tiles), with islands most of the time (knobs of rock the ice rode over); the basin behind a rock step, where there is one, holds an upper lake; small high ones are tarns; the rest are filled level (bogs). What's left of the ice lies in the cirques (small glaciers) and on high north-facing ground (snowpack), and **the rivers begin at their meltwater**. Flow accumulation, with meandering (randomised) drainage, finds the streams; the two that carry most into the lake are streams A and B, with their tributaries. The lake drains over the moraine and out through the gorge, falling away where it crosses the rim.
4. **Bands, cliffs, ground.** Bands by warmth (6.2); cliffs where a band edge is steep. Ground from band, slope, aspect, and wetness (from the flow): beaches, reed bays, and marsh by the water and on the deltas; wet meadows on flats (marsh lies in patches, never single tiles); dry grass on steep sunny slopes; fir on the shady side up to the treeline; talus under cliffs; snow where the ice lies; round each glacier the ground it has just let go of (bare rubble all round, a boulder ridge and then open grass and willow in front, downhill; no trees yet); avalanche chutes cleared down steep slopes.
5. **The forest's history.** Three centuries of lightning fires, starting where it's dry, running uphill, dying out on wet ground. Each tile keeps its stand's age: recent burns are open ground with seedlings and charred fallen trunks, lying mostly one way where the wind brought them down; young stands are thick, aspen first where it's damp, with **thickets** too dense to pass; old growth is big trees with gaps and deadfall. Tree size follows age. **Trees are walked among and under** (slower); only thickets, krummholz, and rock block the way. Copses in the meadows, aspen groves, krummholz clumps, and boulders along ridgelines come from smooth noise fields.
6. Place set pieces by constraint search (see below).
7. Lay game trails as each animal wears them on its own round, not from one den to another: the elk (who make most of them) between bedding cover, their meadow, water, and the nearest pass; the bear from its den to the berry patches and to water; the cougar from its lair to where the elk feed, and to water; every grazing meadow down to the nearest water (they run together as they near it); every pass on to the nearest trail or water. Trails meander (through waypoints pushed off the line by a smooth field), run at any angle rather than along the grid (pulled taut where a straight line costs about the same), keep to easy grades, cross streams where they're narrow, and merge where one already goes. Each tile of a route knows whose it is, and that animal's prints lie along it (none on bare rock). A trail shows as a worn path only where the ground holds a tread (forest floor, scrub, sand; patchy across grass; never over rock, talus, scree, or bog), so it comes and goes.
8. Validate. If a check fails, derive the next seed and regenerate, so the result is still deterministic.

Set pieces, each guaranteed once per map unless noted:

| Set piece | Placement rule | Purpose |
|---|---|---|
| Crash site and start | Valley floor near the lake; the aircraft's forward section, two tiles long on the shore, broken behind the cabin, one wing snapped skyward, a furrow and pieces scattered round it | Start |
| Rock overhang | Within 40 tiles of start, at the forest edge | First shelter site |
| Spark-stone outcrop | Part of or near the overhang | One route to fire |
| Safe berry patches (2–3) | Forest edge and subalpine meadow | Early food |
| Toxic lookalike patch (1–2) | Near a safe patch of similar appearance | Illness lesson |
| Stream mouth and spawning gravel | Where a stream meets the lake | Cleaner water; the autumn fish run |
| Tail wreckage | Alpine band, on a ledge under the rim (or a hollow on open ground) walled by cliff, with no route at first | Endgame target (section 10) |
| Rockslide path | Slope below the wreckage | Becomes the route after the severe storm |
| Signal knoll | Open high ground visible from the air | Best signal-fire site |
| Bear den, elk meadow, cougar lair, marmot burrows | Where each would really live: the bear's den dug under rock on a shady forested slope near the high berries; the elk on the biggest open meadow with water and timber close; the cougar's lair on a rock shelf above the elk; the marmots' burrows in sunny talus by a high meadow. Away from the start, inside the rim | Animal territories; the dens are drawn and can be looked into (9) |
| Pack-rat midden | Rock crevice within reach of camp | Stolen items end up here |
| Unique details (4–6 chosen from a pool) | Anywhere valid | Landmarks: waterfall, lightning-split snag, beaver dam, bone pile, old avalanche path, tarn (a real one the ice left, or water filling a high hollow), wind-carved arch |

Validation checks: the rim holds (headwall, or the outlet's falls), start can reach water, the overhang, a route to fire, and at least one safe food source on foot; the wreckage is unreachable before the rockslide and reachable after; at least one viewpoint shows the wreckage; no set pieces overlap; the deal of rules is fair (6.6).

### 6.4 Day, night, and visibility

- Sun position drives the colour and direction of the light (12.1) and a visibility radius. At night without a light source the survivor sees 2 tiles; a fire lights 6.
- Moving at night without light risks falls and blundering into animals.
- The map screen is the survivor's own map, drawn as a kid would on a notebook page (decided 2026-11-26): not to scale (what's near camp big, what's far squeezed small, north up), only what they've seen and learned, with their own labels ("PLANE", "camp", "BEAR!!", "good berries"), and a "me" only when they're near somewhere drawn on it. The accurate map is for debugging.

### 6.5 Weather

- Weather is a seeded state machine advanced every 3 game hours: clear, cloudy, fog, drizzle, rain, thunderstorm, high wind, and snow at altitude.
- Mountain pattern: clear mornings that build to afternoon thunderstorms, fast changes, cold nights.
- Transition odds depend on the current state, the time of day, and the week of the run.
- Air temperature = seasonal base + time-of-day curve + weather modifier − elevation band. The curve is a lookup table, not a trig function (see 11.3).
- **Snowline:** from about day 30, precipitation falls as snow in the alpine band. The snowline drops one band roughly every 10 days.
- Weather uses its own random stream and never depends on player actions, so the whole run's forecast is fixed by the seed. Tests can assert "seed X has rain on day 4".
- **Signs:** storms are preceded by signs the survivor can notice, such as the wind swinging round to blow off the lake, a ring round the moon, or marmots going to ground early. Which signs mean something in this valley is dealt (6.6); the rest are noise.
- Effects: rain makes the survivor wet, puts out unsheltered fires, wets tinder and firewood, and refills containers. Wind raises chill and fire fuel use. Fog cuts visibility. Thunderstorms hurt morale at night, and a lightning strike can leave a smouldering snag (8.3).
- **Severe storm:** once per run, in a seeded window between days 18 and 30. Violent wind and rain damage or destroy shelter, scatter stored items, kill the fire, and fell trees. It also triggers the rockslide, which changes the map and opens the route to the wreckage.

### 6.6 The valley's rules

Every valley runs on the same kinds of rule, but which thing does what is dealt fresh from the seed. The berries that fed the survivor in one valley may be the ones that make them sick in the next. The player learns this valley, not the game.

The idea comes from Tom Wham's board game *The Awful Green Things from Outer Space*, where nobody knows what a weapon does to the creatures until someone tries it, the answer might be wonderful or terrible, and the answers are drawn fresh every game. Only that idea is borrowed: nothing of the board game's setting, names, art, or wording appears here (section 15).

It also fixes a weakness in drafts 1–4. With fixed rules, a player who had finished one run would know every answer, and pillar 1 would stop working after the first few hours.

**What is dealt and what is fixed.** The seed deals *which* and *what*, never *how*. Thirst, cold, fire, rain, and the controls work the same in every valley. So the player's skill at finding things out carries from run to run, and the answers do not.

| Dealt per valley | What the seed decides | How the survivor can learn it |
|---|---|---|
| Wild plants: berries, bulbs, greens, mushrooms | Which appearance is nourishing, poor, sickening, or deadly, and which two look alike | A small taste; watching what jays and bears eat; reflection |
| Remedies | Which plant settles a stomach, which cleans a wound, which keeps insects off when burned or rubbed on | Trying it when the need arises; noticing where insects are absent |
| Stone | Which of the valley's stones throws sparks from steel, and which flakes to an edge | Striking it; the accident insight |
| Wood and tinder | Which wood suits a bow drill, which burns long, which smokes heavily, and which tinder catches | Burning it and watching |
| Water | Which source is fouler than it looks, and why: a beaver pond upstream, a carcass in the inlet | Finding the cause on the map; falling ill |
| Animal temper | For each dangerous animal: how bold it is, what its warning sign is, and what makes it back off | Watching from a distance; a close call |
| Weather signs | Which signs come before a storm here | The journal tallies each sign against what followed |

**Always the same.** Cattail roots, pine nuts, rose hips, fish, crayfish, and mussels are what they look like in every valley. Boiled water is always safe, and fire always warms. A thin but safe living is possible without gambling on anything unknown. The dealt rules are where the good living is.

**Dealt from a deck, not rolled.** Each row above has a deck of outcomes in `content/`. The seed shuffles the deck and deals it across that row's appearances, using its own `rules` random stream (11.3). A deck has a core that is always dealt and a few spares that fill the remaining places. This is what keeps valleys fair. Every valley has at least two good wild foods and exactly one deadly plant; only which is which changes. Because of the spares, the last unknown cannot be worked out by elimination alone.

**Plausible, not magical.** Things that are dealt are named by how they look ("red berries", "dark glassy stone"), not by real species, because a real species does not change its nature from one valley to the next. Every rule has a natural cause the survivor could give. Once something is known, its name gains what was learned ("red berries: safe"). No name is taken from the novel.

**The valley notes.** The journal has a page that is a chart of this valley's rules: a row for each dealt thing the survivor has come across, marked unknown, suspected (with what suggested it), or known. The chart shows both sides of the puzzle (decided 2026-11-25). For each thing, what has been determined about it and what is still unknown. For each row's deck, the outcomes possible in this kind of thing, with the ones already pinned to something ticked off and the ones still unaccounted for left open. The player knows the deck but not the deal, and can see at a glance how much of the deal is left to find. Insights now come in two kinds (8.1): techniques, which are the same in every valley, and valley facts, which fill in this chart.

**Finding out must be survivable.** Every dealt rule can be learned in at least two ways, and one of them does not bet the survivor's health. A small taste is a small dose: it gives a mild version of the effect and a clear message. Nothing kills from one cautious test; the deadly plant kills at a full portion, after a small taste has already warned. Trial is fast and risky, observation is slow and safe, and reflection (8.1) helps a player who is stuck.

**A fair deal.** The world generation checks in 6.3 add: the floor foods and at least one good dealt food are within reach of the start; the spark-stone that the deal chose is the one at the overhang; the lookalike pair really are one good and one bad in this deal; the foul water is not the only water near the start.

**Protagonists.** Each background except City kid starts with one valley fact from its own field already filled in: a Hunter's kid reads one animal's temper, an Angler knows the water, a Farm kid recognises one plant. It is a head start of the same size as the others in 4.2.

**The same seed twice.** A seed fixes the rules, so replaying a seed means playing with the answers known. That is accepted (decided 2026-11-25): it makes a shared run code a fair race, and playing the same valley again after a death a second attempt. The replay starts from the seed, at day 1 (5.4).

### 6.7 Things on the ground, and things to notice

Decided 2026-11-26, after the first playtest: the player should see the valley's resources and its secrets, not find them in a menu.

**Loose things.** Everything portable that can be gathered by hand lies on the ground as something drawn, and is gathered by clicking it (or facing it and pressing E). The ground type alone no longer gives anything: a meadow is not a source of dry grass, but a tuft of dry grass on a meadow is. Each is placed when the valley is generated, by a position hash and the ground around it (never the deal), and comes back some days after it is taken, sooner after a hard wind for fallen branches and driftwood; loose stones and chips, once taken, are gone for the run. Several come in sizes, and the bigger one gives more.

| Thing | Where it lies | Gives |
|---|---|---|
| Twigs; a fallen branch (bigger) | Under and beside trees | Sticks; a branch also gives a piece of that tree's wood |
| Loose stones; a stone chip | Shore, gravel bars, talus; under an outcrop | A plain river stone (reflector, weir, hot stones); a chip of that outcrop's dealt stone |
| A tuft of dry grass | Meadows | Dry-grass tinder |
| Cattail fluff | Reed beds | Seed-fluff tinder |
| Driftwood; a driftwood log (bigger) | The lake shore | Pale soft wood |
| Fibrous stalks | Reeds, marsh, high meadow | Plant fibre |
| Pine cones (in season) | Under conifers | Pine nuts |
| A feather | Rarely, in meadows and forest edges | Feathers (arrows) |

Work that needs the steel tool or a feature (cutting wood, stripping bark, inner bark, punk wood from deadfall, lichen off a tree, prying stone from an outcrop) is still done to the tree, log, or outcrop, which are already drawn. Food plants, bushes, reeds, and shallows are unchanged.

**Things to notice.** Some things are obvious and some are subtle. Walking near an obvious one, the survivor notices it ("Something pale lay in the reeds."), and the log says so. A subtle one is only drawn, small and quiet, for a careful eye to find. Clicking either looks closer, which can teach something (a suspicion in the valley notes, a memory reflection draws on) or give something.

- **Wreckage on the shore (obvious).** In the first days, pieces of the plane wash up along the lake shore near the crash: a tangle of cable (cord), a burst bag of peanuts (food), a scrap of bright aluminium (flashes at aircraft like a mirror). Each comes once, at a set time in the first four days, on a shore tile chosen by position hash.
- **Tracks (subtle).** Prints in mud, sand, and snow near an animal's home or path. Looking at them names the animal; the dangerous ones' tracks mark their range on the map.
- **Landmarks (obvious).** Bones, the split snag, the beaver dam, the carcass, the arch: the survivor notices each the first time it comes into view.

### 6.8 Variety in how things look

Ground and features vary in a way that is always the same for a seed and a tile, and that hangs together across the map: a smooth noise field chooses each tile's variant and tint (patches of lusher grass, flowers, mossier forest floor), so a meadow is not a sheet of one tile. Things come in sizes: saplings to trees three tiles tall, pebbles to boulders to rock formations, a twig to a fallen branch. Rocks that crowd together are drawn as one outcropping. All of this is the renderer's own hashing of the tile position, except what the simulation uses (loose things and their sizes), which is generated with the world.
