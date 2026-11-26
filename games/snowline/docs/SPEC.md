# Snowline — Game Specification

Status: draft 5, 2026-11-25. **Built so far: M0 to M3** (2026-11-25); see [FEATURES.md](FEATURES.md) and [TODO.md](TODO.md). Choices made while building M0 and M1 are listed for review in 13.1; questions raised later are in 13.2 (Q19 on). Draft 5 folds in the decisions listed in section 13.1. Draft 5 adds the valley's rules (6.6): what things do is dealt fresh from each seed, so every valley has to be learned. That touches sections 2, 6–9, 11, and 14. It also sets the art direction (12.1): the mood and feel of *Kingdom Two Crowns* in a top-down game, with graphics that start simple. Draft 4 fitted the game into the html-games monorepo: it changes section 11 (technical design) and milestone M0, settles the title (Snowline, formerly Q14), and raises the question of when the game is listed publicly (Q15). The game design in sections 4–10 is unchanged from draft 3. Every open question was answered on 2026-11-25 (13.1), so the spec is ready to hand off for M0 and M1.

This game is the `snowline` workspace of the html-games monorepo. The repo-wide rules (layout, commands, deploy, commit workflow, versions) are in the root [CLAUDE.md](../../../CLAUDE.md). Paths in this file are relative to `games/snowline/`.

How to read this: sections 1–12 describe the game as currently intended. Section 13 lists what was decided and when; a tag like Q4 is the number a question had while it was open. All numbers are starting values for tuning, not commitments.

---

## 1. Summary

A single-player, top-down, tile-based survival RPG that runs in a web browser. A teenager is the only survivor of a small-plane crash in a remote mountain valley. They have the clothes they are wearing, whatever is in their pockets, and one steel tool. The player keeps them alive — water, food, fire, shelter, health — until they are rescued.

There is no magic, no monsters, and no experience-point levelling. The survivor gets better at surviving because they (and the player) learn how the valley works. And no two valleys work the same way: which berries are safe, which stone throws sparks, and how the bear behaves are dealt fresh from each seed (6.6).

The game will be released publicly. It is inspired by Gary Paulsen's novel *Hatchet* but is an original work: its own protagonists, setting, wildlife, and events (section 3).

| | |
|---|---|
| Platform | Desktop web browser, keyboard first |
| Delivery | Static HTML and TypeScript, published with the html-games site on GitHub Pages at `/html-games/snowline/`, plus a single-file build that runs from disk; no backend, no network use at runtime |
| View | Top-down, 16×16 px tiles, simple pixel art; the mood comes from light, weather, and sound (12.1) |
| World | One procedurally generated mountain valley per seed |
| Protagonist | A boy or girl aged 12–15, chosen or randomised at the start of each run |
| Session | Save anywhere; a full run is about 3–5 hours |
| End states | Rescue (win) or death (loss) |

## 2. Design pillars

These settle arguments when two features conflict.

1. **Knowledge is the progression.** New abilities come from discoveries and practice, not from levels or loot. Mistakes teach: eating the wrong berries makes the survivor sick and also teaches them which berries they were. The answers are dealt fresh for each valley (6.6), so what the player carries from run to run is knowing how to find out, not what they found.
2. **The body is the interface.** Few meters, many readable conditions (wet, cold, nauseous, limping). The player should feel the survivor's state before reading a number.
3. **Nature is indifferent.** Weather and animals follow their own rules and schedules. Nothing hunts the player because it is a game; an elk charges because the player walked into its space.
4. **Systems, not scripts.** No scene is authored to happen. Every memorable moment comes from rules interacting, so every seed tells a different story.
5. **Deterministic.** The same seed, protagonist, and inputs always produce the same game, on any machine. This is a testing requirement and also a feature (shareable runs, replays).
6. **Small and deep.** One valley, densely detailed, is better than a large empty map.

## 3. Relationship to the novel

The game shares a genre and a starting idea with *Hatchet*: a young person alone in the wilderness with one tool, learning by failing. Ideas like that are free to use. The novel's title, characters, and particular sequence of events are not, so the game deliberately departs from them.

| The novel | This game |
|---|---|
| One named protagonist with a family backstory | A chosen or random protagonist from a generated roster; no family subplot |
| Flat northern forest around a lake | A mountain valley with elevation zones from lake to alpine rock |
| A hatchet is the one tool | One of several starting tools, depending on the protagonist |
| Moose, wolves, skunk, turtle | Elk, cougar, pack rats, jays, marmots, spawning trout |
| Fire found one specific way | Three independent routes to fire |
| A tornado raises the sunken plane | A mountain storm and rockslide open a route to wreckage high on the slope |
| A fixed plot | Systems; a different story on every seed |
| The woods work the same way on every reading | The valley's rules are dealt per seed, so each run has to be learned afresh (6.6) |

What remains in common is general to the genre: a plane crash, a lone young survivor, hunger, fire, and rescue.

**Title.** The game is called **Snowline** (decided 2026-11-25). It is named for its own clock: the snowline that creeps down the mountain week by week and ends the run when it reaches the lake (5.1, 6.5). "Hatchet", the novel's title, was the working title through draft 3 and is retired; with a variable starting tool it no longer fitted the game anyway. A quick web search found no existing game called Snowline. That is not a trademark check, and it belongs in the review below.

One follow-up before release:

- **Review.** The table above is design intent, not legal advice. Have someone qualified compare the finished game, and its title, with the novel and with existing games before release.

Implementation rule: no text, names, or coined terms from the novel appear in the game, its data files, or its `package.json`. The same holds for the board game behind the valley's rules (6.6). The README and the credits may name both as inspirations, and nothing more. This is also the repo's rule for every game: homages are fine, recreating a specific existing work is not.

## 4. Protagonist

### 4.1 Selection

Starting a new run opens a selection screen with three generated candidates. The player can pick one, reroll for three more, or build one by hand.

Each protagonist has:

| Attribute | Range | Effect |
|---|---|---|
| Name | From a name list | Used in the message log and summary |
| Gender | Boy or girl | Sets pronouns in text and the base sprite; no effect on play |
| Age | 12–15 | Flavour only |
| Appearance | Skin tone, hair, clothing colours | Sprite built from recoloured layers |
| Background | One of about seven | A small head start (below) |
| Trait | One of about seven | A small complication (below) |
| Starting tool | One of three | Changes the early game (7.2) |
| Pocket items | One or two from a pool | Minor: a candy bar, a bandana, a watch, a paperclip |

The roster includes boys and girls in equal numbers. This spec says "the survivor" throughout; in the game, names and pronouns in the message log come from the protagonist data.

### 4.2 Backgrounds and traits

Backgrounds give a start, not a permanent advantage; every protagonist can learn everything.

| Background | Head start |
|---|---|
| Scout | Firecraft level 1; already knows how to make cord |
| Angler | Fishing level 1 |
| Hunter's kid | Hunting level 1; animals notice them later |
| Farm kid | Crafting level 1; heavy work costs less rest |
| Runner | Moving costs less rest; better in cold water |
| Reader | More frequent reflection hints; steadier morale |
| City kid | No head start, but skills rise faster. The hard mode. |

| Trait | Complication |
|---|---|
| Light sleeper | Wakes at night noises; poorer rest without a secure shelter |
| Afraid of the dark | Morale drops at night without a fire |
| Weak stomach | Food illnesses hit harder |
| Wears glasses | Glasses can be knocked off or broken, cutting sight distance |
| Poor swimmer | Deep water is far more dangerous |
| Picky eater | Morale drops when eating unfamiliar food, until used to it |
| Restless | Morale drops on days spent entirely in camp |

Backgrounds, traits, tools, and pocket items are data in `content/`. Each is a short list of modifiers the systems read; no system contains code for a specific background.

### 4.3 Determinism

A run is identified by the world seed plus the protagonist definition. Random candidates are drawn from the seed's `protagonist` stream, so "seed X, candidate 2" always gives the same person. A run code shown on the summary screen encodes both, and tests always specify both.

## 5. Game structure

### 5.1 Time

- The simulation runs at a fixed **20 ticks per second**.
- **10 ticks = 1 game minute**, so 1 game hour is 30 real seconds and 1 game day is 12 real minutes. The ratio is a single constant.
- Sleeping, resting, and long tasks fast-forward by running ticks faster (never by skipping them), so results are identical at any speed.
- The run starts in late summer. Temperatures fall week by week and the snowline creeps down the mountain (6.5). Snow reaches the lake around day 60 and makes survival close to impossible; this is the soft time limit. Winter play is out of scope for v1.

### 5.2 Real-time on a grid

Movement is real-time and grid-snapped. The survivor moves one tile per step; a step takes 6 ticks on open ground and more on rough or steep terrain, when injured, or when carrying a heavy load. Actions (chop, drink, craft) take a set number of ticks and can be interrupted. The game pauses in menus.

### 5.3 Arc of a run

Nothing below is scripted; these are the phases the systems should naturally produce.

1. **Shock (days 1–3).** Thirst, insects, cold nights, no food. Finding water and a shelter site.
2. **Fire (days 3–8).** Getting fire changes everything: warmth, cooked food, fewer insects, light, a signal.
3. **Provider (days 8–25).** Tools, fishing, hunting, food storage, a real camp. Illness and injury are the main threats. Exploring upward reveals the valley and the wreckage.
4. **Reckoning (day 18 onward).** A severe storm wrecks the camp and reshapes the slope. The route to rescue opens as the cold closes in.

### 5.4 Death and saving

**Permadeath** (decided 2026-11-25). There is one save slot per run, autosaved on sleep and when the tab is hidden. Death ends the run, deletes its save, and shows a summary (days survived, discoveries, cause of death, run code). There is no reloading an earlier save and no forgiving mode.

From the summary the player can start a new valley, which is the default, or play the same valley again from its seed. The same valley starts over at day 1 with the same deal of rules (6.6), so what the player learned there still holds, but nothing the survivor built or gathered carries over. The start screen also accepts a seed or a run code typed in.

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

- Bands are separated by slopes and by **cliff bands** that can be crossed only at a few scramble routes.
- Each band up is colder and windier, and steeper tiles cost more time and rest.
- High points are **viewpoints**: reaching one reveals a wide area of the map.

### 6.3 Generation

Decided 2026-11-25: procedural terrain with authored set pieces, plus one hand-checked default seed for a player's first run.

Before any terrain is made, the valley's rules are dealt (6.6). Later steps read them: which patches are safe and which stone is the spark-stone depend on the deal.

Pipeline, all driven by the world seed:

1. Height map from layered gradient noise, shaped into a basin with one high side.
2. Fill the basin floor to make the lake; carve one or two streams from the high ground down to it.
3. Cut the height map into elevation bands; place cliff bands and scramble routes.
4. Moisture map; assign terrain from band and moisture.
5. Scatter features (trees, rocks, bushes) with spacing rules per terrain.
6. Place set pieces by constraint search (see below).
7. Lay game trails between water, feeding areas, and dens.
8. Validate. If a check fails, derive the next seed and regenerate, so the result is still deterministic.

Set pieces, each guaranteed once per map unless noted:

| Set piece | Placement rule | Purpose |
|---|---|---|
| Crash site and start | Valley floor near the lake; the aircraft's forward section | Start |
| Rock overhang | Within 40 tiles of start, at the forest edge | First shelter site |
| Spark-stone outcrop | Part of or near the overhang | One route to fire |
| Safe berry patches (2–3) | Forest edge and subalpine meadow | Early food |
| Toxic lookalike patch (1–2) | Near a safe patch of similar appearance | Illness lesson |
| Stream mouth and spawning gravel | Where a stream meets the lake | Cleaner water; the autumn fish run |
| Tail wreckage | Alpine band, behind a cliff band with no route at first | Endgame target (section 10) |
| Rockslide path | Slope below the wreckage | Becomes the route after the severe storm |
| Signal knoll | Open high ground visible from the air | Best signal-fire site |
| Bear range, elk meadow, cougar ridge, marmot colony | Away from start, near their food | Animal territories |
| Pack-rat midden | Rock crevice within reach of camp | Stolen items end up here |
| Unique details (4–6 chosen from a pool) | Anywhere valid | Landmarks: waterfall, lightning-split snag, beaver dam, bone pile, old avalanche path, tarn, wind-carved arch |

Validation checks: start can reach water, the overhang, a route to fire, and at least one safe food source on foot; the wreckage is unreachable before the rockslide and reachable after; at least one viewpoint shows the wreckage; no set pieces overlap; the deal of rules is fair (6.6).

### 6.4 Day, night, and visibility

- Sun position drives the colour and direction of the light (12.1) and a visibility radius. At night without a light source the survivor sees 2 tiles; a fire lights 6.
- Moving at night without light risks falls and blundering into animals.
- The map screen shows only what has been explored, drawn as a rough sketch.

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

## 7. Survival systems

### 7.1 Vitals

Five meters, each 0–100. The HUD shows them as small icons that change state, with exact numbers only in the status screen.

| Vital | Drains from | Restored by | At zero |
|---|---|---|---|
| Health | Injury, illness, other vitals at zero | Rest with other vitals healthy | Death |
| Hydration | Time, exertion, heat, vomiting | Drinking | Health drains fast (death in about 1 day) |
| Nutrition | Time, exertion, cold | Eating | Health drains slowly; work is slower |
| Rest | Time awake, exertion, climbing | Sleep (quality depends on shelter, warmth, insects) | Collapse into forced sleep |
| Warmth | Cold air, altitude, wet clothes, wind, cold water | Fire, shelter, dry clothes, sun | Hypothermia, then health drain |

Starting pace: with no intake, hydration empties in about 2 days and nutrition in about 5. A full day awake drains rest.

**Morale** is a sixth, softer value. It rises with fire, a full stomach, successes, discoveries, and a wide view from high ground. It falls with injury, hunger, darkness, insects, and setbacks such as a missed search aircraft. Low morale slows work and worsens sleep; it never kills directly. Protagonist traits mostly act through morale.

### 7.2 Starting tools

Every protagonist begins with one of three steel tools. It never wears out, but it can be dropped or lost, and losing it is a serious setback.

| Tool | Strong at | Weak at |
|---|---|---|
| Hatchet | Felling, splitting, building; good sparks | Fine carving, butchering |
| Sheath knife | Carving, butchering, cord and fibre work | Cutting wood (slow) |
| Multi-tool | Small saw, blade, and pliers: adequate at everything; best at snares and repairs | Nothing fast; poor sparks |

### 7.3 Water

- Lake water carries a moderate risk of waterborne illness per drink; stream water a low risk; water taken high up near the source a very low risk.
- Those are the usual figures. In each valley one source is fouler than it looks, for a cause the player can find on the map; which one is dealt (6.6).
- Boiling removes the risk in every valley, but needs fire and a container. Early containers are a bark vessel heated with hot stones; a metal pot comes only from the wreckage.

### 7.4 Food

- **Foraging, always the same:** cattail roots, pine nuts, rose hips, crayfish and mussels in shallows. Safe in every valley, and thin.
- **Foraging, dealt per valley (6.6):** berries (several kinds, some toxic), bulbs (an edible one and a deadly lookalike), greens, mushrooms (high risk, high reward). Which is which changes with the seed.
- **Fishing:** spear in shallows, later a fish trap (rock weir) and bow. Hook and line come from the wreckage.
- **Hunting:** grouse, hare, and marmot with a thrown spear or bow; snares for hare.
- **Seasons:** each food has an availability window. Berries peak early and fade; nuts and rose hips come late. Around days 25–40 trout run up the stream to spawn: easy fish in quantity, and bears know it too.
- **Depletion:** patches regrow slowly, and animal populations do not respawn fast. Over-harvesting near camp forces the player to range further and higher.
- **Unknown foods:** a dealt plant is labelled by appearance ("red berries") until identified. A small taste gives a mild version of its effect, a full portion the whole of it, and watching birds or bears eat it marks it as suspected safe. What is learned goes in the valley notes (6.6) and holds for this valley only.

### 7.5 Cooking and spoilage

- Raw meat and fish carry an illness risk and give less nutrition. Cooking needs a fire and a few game minutes.
- Fresh food spoils in 1–2 days. Smoking or drying over a fire extends this to weeks.
- Live fish can be kept in a rock pen in the shallows.

### 7.6 Shelter and camp

A shelter site has four ratings: rain cover, wind cover, insulation, and security. The rock overhang starts with good rain cover and little else. Improvements, built in stages from gathered materials:

- Woven wall and door (wind, security)
- Bough bed (insulation, sleep quality)
- Fire pit with reflector stones (warmth)
- Hanging food cache (keeps out pack rats, jays, bears)
- Woodpile with cover (dry fuel after rain)
- Signal fire pile on open ground (see section 10)

The player may build further camps, including a rough high camp for the climb to the wreckage. Unsecured food and small items attract raiders.

### 7.7 Illness and injury

Each condition is a small state machine: onset, acute phase, recovery, with a severity that treatment can reduce. Conditions are shown as icons and described in the message log.

| Condition | Cause | Effect | Treatment |
|---|---|---|---|
| Food poisoning | Toxic plants, raw or spoiled food | Vomiting, hydration and nutrition loss, weakness for 1–2 days; the deadly bulb can kill | Rest, water |
| Waterborne illness | Untreated water (delayed onset, 2–5 days) | Recurring cramps, hydration loss for a week | Boiled water, rest |
| Hypothermia | Warmth at zero | Slowed actions, then health loss | Fire, dry clothes, shelter |
| Wound | Animal attack, tool slip when exhausted | Bleeding, pain, infection risk | Clean with boiled water, rest |
| Infection | Untreated wound | Fever, health loss over days | Cleaning early; first-aid kit from wreckage |
| Sprain | Falls on talus, scrambles, night travel | Slow movement for days | Rest, a splint |
| Quills | Porcupine contact | Pain, slow movement until removed | Remove (painful, morale hit) |
| Insect bites | Dawn and dusk near water without smoke | Morale and sleep loss | Smoke, mud, shelter, altitude |
| Sunburn, exhaustion | Exposure (worse high up), overwork | Minor vitals penalties | Rest, shade |

The treatments in the table work in every valley. Each valley also has a few plant remedies that work faster: one for the stomach, one for wounds, one against insects. Which plants they are is dealt (6.6), and a plant tried for the wrong complaint does nothing or makes it a little worse.

### 7.8 Inventory

- No backpack at the start: two hands and pockets, about 8 slots with a weight limit.
- A crafted bark basket or pack adds capacity. Camp storage is unlimited but exposed unless cached.

## 8. Knowledge, crafting, and skills

### 8.1 Insights

Recipes and techniques are locked until the survivor has an insight. There are two kinds. A **technique** is how to do something, and is the same in every valley: aim below the fish, bank a fire for the night. A **valley fact** is one of this valley's dealt rules (6.6): the red berries are safe here, the dark stone throws sparks. A returning player already knows the techniques exist and still has to earn every valley fact.

Insights of both kinds come from four sources:

- **Accident:** something unexpected happens while doing something else, such as steel throwing sparks off a particular stone.
- **Observation:** standing still near something for a time. Watching jays feed marks a berry as safe; watching goats shows where a cliff band can be climbed.
- **Failure:** missing fish repeatedly leads to the realisation that the aim must be below them, which sharply raises accuracy.
- **Reflection:** each night's sleep may surface a hint based on what the player has seen but not yet used. This is the in-world hint system for stuck players.

Every insight is recorded in a journal the player can re-read; valley facts also fill in the valley notes chart. Some backgrounds start with an insight or two.

### 8.2 Tool chain

The starting tool is the root of everything.

- Starting tool → cut wood, strip bark, sharpen sticks, butcher game
- Sharpened stick → fish spear (forked tip) → fire-hardened spear
- Plant fibre or a shoelace → cord → snare, bow string, lashings
- Bent sapling + cord → **bow**; straight shoots + fire-hardening + feathers → arrows
- Bark + cord → basket, water vessel
- Hides + cord, dry grass stuffing → **warm layers** for the high country
- Logs + cord → raft (optional: deep-water fishing, crossing the lake)

Crafting uses a list of known recipes, showing which ingredients are on hand. Each craft takes time and can fail at low skill, sometimes consuming materials. Task times depend on the starting tool.

### 8.3 Fire

There are three independent routes to a first fire, so no run depends on one discovery:

1. **Sparks:** striking the steel tool on spark-stone into dry tinder. Which of the valley's stones is the spark-stone, and which tinder catches, are dealt (6.6).
2. **Captured fire:** carrying embers from a lightning-struck snag after a thunderstorm, if the player reaches it in time.
3. **Friction:** a bow drill, which needs cord, the right wood, and a reflection or background insight. Slow and tiring, but it always works eventually. The right wood is dealt (6.6); the wrong one only smokes.

Once lit, fire has its own rules because so much depends on it.

- It has a fuel level that burns down, faster in wind. Banking it gives long-lasting coals that can be revived in the morning.
- Starting one needs dry tinder; lighting is a skill check that improves quickly with practice.
- Rain puts out a fire that has no cover. Wet wood smokes and burns poorly.
- A burning fire gives warmth and light in a radius, allows cooking, boiling, and fire-hardening, keeps most animals and insects away, and raises morale.
- Embers can be carried in a bark container to light a fire elsewhere.
- Fire does not spread to the forest in v1.

### 8.4 Skills

Five skills, each level 0–5: firecraft, foraging, fishing, hunting, crafting. They rise with use, including failed attempts. Higher skill means better success odds and shorter task times. There are no skill points to spend.

## 9. Animals and danger

Animals are simple state machines with a home range, a daily schedule, and senses (sight radius, hearing of player noise). They path-find on the tile grid. Populations are fixed at generation and recover slowly.

| Animal | Role | Behaviour |
|---|---|---|
| Trout | Food | School in shallows and at the stream mouth; scatter from movement; spawning run in autumn |
| Grouse | Food | Nearly invisible until very close, then flush; easier to spot with hunting skill |
| Snowshoe hare | Food | Active dawn and dusk; bolts to cover |
| Marmot | Food, alarm | Lives in talus; its whistle alerts every animal nearby |
| Jays | Nuisance, teacher | Steal unattended food in daylight; watching what they eat identifies safe plants |
| Pack rat | Nuisance | Takes small items at night and hoards them in its midden, where they can be recovered |
| Mosquitoes, blackflies | Nuisance | Swarm at dawn and dusk near water; repelled by smoke; fewer higher up and later in the season |
| Porcupine | Nuisance | Wanders at night and gnaws wooden tools and gear; quills on contact |
| Black bear | Danger | Mostly ignores the survivor; feeds at berry patches and the spawning stream; raids uncached food; attacks if crowded |
| Elk | Danger | Herds graze the high meadows; bulls turn aggressive in the autumn rut and charge inside their space |
| Cougar | Presence | Rarely seen. Follows at dusk when the survivor is weak, alone, and far from fire. Backs off when deterred; what deters this one is dealt (below). |
| Mountain goat | Ambient, teacher | Lives on the cliffs; its trails mark the scramble routes |

**Temper is dealt (6.6).** The table gives each animal's nature, which does not change. What changes from valley to valley, for the bear, the elk, and the cougar, is how bold this one is, what its warning looks like, and what makes it back off: being faced, noise, or fire. The cougar that backed away from a shout in one valley may be one that only fire turns in the next. Every temper in the deck gives a warning before an attack, and every one can be backed away from.

There is no combat system in the usual sense. Hunting is a stealth approach followed by one action whose hit chance depends on distance, skill, and whether the target is alert. Dangerous animals are survived by reading their warning signs and backing away, using trees and fire, not by fighting.

Other dangers: cold water and drowning, falls on talus and scrambles, working with a blade while exhausted, night travel, exposure at altitude, and the severe storm.

## 10. Rescue

The aircraft broke up on the mountain. The forward section came down near the lake, which is where the run starts. The tail, carrying the emergency beacon, stayed high in the alpine band. It can be seen from viewpoints as a glint long before it can be reached.

Three ways a run can end in rescue:

1. **Search aircraft.** Two or three flyovers happen at seeded times in the first 10 days. If a signal fire is burning with green boughs for smoke when the aircraft passes within range, the survivor is rescued. Higher, more open sites are seen from further away. This is hard to achieve so early and is the expert ending. A missed aircraft is a heavy morale blow.
2. **Beacon.** After the severe storm, the rockslide gives a way through the cliff band. The climb is a small expedition: carried food and water, warm layers, a way to make fire or carry embers, and probably a night out at altitude with snow on the way. The wreckage holds the beacon along with a pot, matches, fishing line, a first-aid kit, and packaged food. Activating the beacon brings rescue within 1–3 days, which still have to be survived.
3. **Late signal.** After day 40, rare aircraft cross the range. A signal fire gives a chance of being seen.

If none of these happens before winter sets in, the run ends in death.

A fourth route, walking out over a high pass before the snow closes it, would suit the mountain setting but needs either a second map or an abstracted journey. It is not part of v1 and will be reconsidered once v1 is playable.

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
  docs/        SPEC.md (this file), TODO.md (open work and session hand-off),
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

## 12. Presentation

### 12.1 Art

**Direction.** The mood and feel of *Kingdom Two Crowns*, in a top-down game (decided 2026-11-25). The goal is the feeling, not the fidelity: a small figure in a large, quiet landscape, where the time of day and the weather set the tone and a fire at night means safety. The graphics start simple and stay simple until something more has earned its place. That game is a reference, not a source: no sprite, palette, or composition is copied.

**Where the mood comes from.** Most of it is cheap. Very little of it depends on detailed sprites.

| What gives the feeling | How Snowline gets it, simply |
|---|---|
| Small figures, big landscape | One-tile sprites on a screen 24 tiles wide. Nothing to add |
| The time of day sets the tone | One colour grade over the whole scene, changing through the day: cool dawn, flat noon, amber dusk, blue night |
| Fire means safety | Night is dark and nearly colourless. A fire is a warm pool of light, and the only colour on screen |
| Quiet, with few words | A small HUD (pillar 2), a sparse message log (12.2), and no clutter |
| A soft, natural palette | One muted base palette of about 32 colours |
| Weather you can feel | Rain as a moving overlay, fog as a pale grade that shortens the view, snow lying where the snowline has reached |
| Water that sets the scene | The lake takes the colour of the sky and has a simple shimmer |
| Sound | Wind, water, rain, fire, and night insects, with silence between them (12.3). This carries as much of the mood as the picture does |

**To begin with**

- 16×16 tiles, and sprites of one tile. The view is the three-quarter top-down of classic adventure games: ground from above, things on it from the front.
- The survivor sprite is assembled from layers (body, hair, clothing) recoloured from the protagonist's appearance. Four facing directions and 2–4 frame walk, work, and carry animations.
- Animals have 2-frame animations. Water, fire, rain, and snow animate.
- Elevation reads through terrain colour, cliff-edge tiles, and thinning trees.
- Night, dusk, fog, and firelight are produced by the renderer over the same sprites: a colour grade, then darkness with a lit circle round each light. This is the one piece of graphics work beyond plain tiles that v1 commits to, and it is small.
- The lit area the player sees is the visibility the simulation uses (6.4). Flicker, shimmer, and rain use the renderer's own randomness and never feed back into the simulation (11.3, rule 3).
- **Placeholder first:** the renderer starts with tiles generated in code (flat colour plus a simple glyph). Implementation is never blocked on art.
- **Who makes the art** (decided 2026-11-25): for now Claude, the AI doing the implementation, draws it. Sprites are written in the source as small grids of palette colours, one character per pixel, and built into an atlas when the game starts. That is a form that can be drawn, reviewed in a diff, and changed like any other code. The base palette is defined once in `render/` and every sprite uses it. From M2 these drawn sprites replace the glyph tiles.
- **Room for an artist later.** The renderer also accepts a single atlas image plus a JSON index, which replaces the in-code sprites with no other code changes. Both are imported through Vite so they are bundled and addressed by relative path (11.1). The grade and the darkness work over placeholder tiles, so the mood can be judged in M1, before any sprite is drawn.

**Later, only if the simple version leaves the mood short.** None of these is in v1. Each is an upgrade to the renderer that changes nothing in the simulation, so they can be added one at a time and judged.

- Sprites taller than a tile (trees, the survivor), drawn back to front, with a canopy that fades over the survivor.
- More animation frames for the survivor.
- The lake mirroring the far shore; ripples in wind and rain.
- Long shadows at dawn and dusk; cloud shadows drifting over the ground.
- Mist on the valley floor at dawn; wind moving grass and branches; leaves turning.
- A larger palette.

With simple one-tile sprites the art is a small enough job to be done in code alongside the game. Whether a human artist redraws it before release is a decision for M6.

### 12.2 Text

A scrolling message log in short, plain, past-tense sentences carries much of the atmosphere: "The berries were bitter. He ate them anyway." Names and pronouns are filled in from the protagonist. All text lives in `content/` for later editing or translation.

Tone (decided 2026-11-25): suitable for ages 10 and up. The pilot's death is implied in the opening text and never shown. Despair is expressed through morale and the message log, never through self-harm.

Hunting and butchering are abstract but clear (decided 2026-11-25). Nothing graphic is drawn: an action, a sound, and an item. But the game does not hide what is being done. The action is named for what it is (kill, skin, gut, pluck), and the message log says it plainly: "She skinned and gutted the hare."

### 12.3 Audio

Sound carries as much of the mood in 12.1 as the picture does, and it costs far less than detailed art. Decided 2026-11-25: build the event hooks from the start, and bring the ambient loops in with the weather in M4 instead of leaving all sound to the end. Target set: ambient loops (wind, lake, night insects, rain, fire, elk bugling at dusk) and about 20 effects, with real silence between them.

Music: earlier drafts had none during play. The reference's mood owes a lot to its music, so there is now a little of it: a few short, quiet pieces that play once at moments that matter (the first fire, a first wide view from high ground, the first snow), and nothing looping under ordinary play. Music stays in M6, and the game must work without it.

### 12.4 Controls

| Key | Action |
|---|---|
| WASD or arrows | Move |
| E or Space | Interact with the faced tile |
| 1–8 | Use or equip inventory slot |
| I, C, J, M | Inventory, craft, journal, map |
| R | Rest or sleep (choose duration) |
| Esc | Pause and settings |

Keys are remappable. Condition icons differ in shape as well as colour. A setting reduces lightning flashes. Text size is adjustable.

## 13. Decisions and open questions

### 13.1 Decided (2026-11-25)

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

### 13.2 Still open

Raised while building, each with the simple option taken so work could go on (2026-11-25). Each is for discussion; changing the choice later is cheap unless noted.

- **Q19. What a save holds.** 11.6 says a save is the differences from the freshly generated world. *Taken:* the whole game state without the deal and the map (about 40 KB, mostly the explored bitset). Simpler and safer; worth revisiting only if saves get large.
- **Q20. What a taste tells.** *Taken:* a taste of a nourishing or a poor plant feels the same ("did no harm", suspected safe); only eating a handful tells them apart. A sickening or deadly plant is known from a taste.
- **Q21. Watching before there are jays.** *Taken:* until animals exist (M4), "watch the patch" is an action: 40 minutes in daylight, after which jays have eaten the plant or left it alone, giving a suspicion. When jays arrive, should watching stay an action, or only happen by standing still near them?
- **Q22. Each background's valley fact.** The spec names three. *Taken:* Scout knows the bow-drill wood, Angler the foul water, Hunter's kid one animal's temper, Farm kid one plant, Runner one stone, Reader one remedy. The Angler's is strong (it settles a whole row); is that right?
- **Q23. How fast sleep runs.** *Taken:* 90× (a night's sleep in about 4 real seconds), by running ticks.
- **Q24. The HUD's vitals.** *Taken:* six small marks in the top right (♥ ◊ ● ☾ ≈ ☼) with four pips each, which change colour and pulse when low, plus words for what the survivor feels. Is that the right amount of information on screen?
- **Q25. Where each dealt wood and tinder comes from.** *Taken:* resinous wood from conifers, white-barked from aspens, grey twisted from stunted trees, red-barked from deadfall, pale soft from driftwood on the shore; dry grass from meadows, inner bark from aspens, hanging lichen from trees above the valley floor, seed fluff from reeds, punk wood from deadfall. The names are the spec's appearances; only their sources were chosen.
- **Q26. What burning teaches about wood.** *Taken:* long-burning, smoky, and quick woods show themselves when burned; the drill wood burns "plain" (a suspicion), and only the bow drill confirms it; a wrong wood in the drill becomes "not for the drill".
- **Q27. Sharpening a stick.** *Taken:* everyone knows it from the start, so the tool chain can begin on day 1; Scouts also know the bow drill (the spec's "background insight").
- **Q28. Where camp improvements go.** *Taken:* walls, a bed, and a lean-to belong to the camp tile (the one slept on) rather than being drawn as separate walls round it. Reflector stones go on a fire, a cache on a tree, the signal pile on open ground.
- **Q29. A fire on the tile.** *Taken:* a fire takes a tile and can't be walked through; it is laid on the faced tile.

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

Out of scope for v1: multiplayer, winter, mobile and touch, other human characters, modding, localisation, forest fires, the walk-out route.

## 15. References

### Source of inspiration

- Gary Paulsen, *Hatchet* (1986). Newbery Honor, 1988. Read for tone and for what to avoid copying (section 3).
- Gary Paulsen, *Guts: The True Stories Behind Hatchet and the Brian Books* (2001). Non-fiction about real wilderness experience. Useful for making systems feel true, since facts about the outdoors are free to use.
- Sequels, for awareness of what else is the author's: *The River* (1991), *Brian's Winter* (1996), *Brian's Return* (1999), *Brian's Hunt* (2003).
- *A Cry in the Wild* (1990), the film adaptation.

### Games to look at

- **The Awful Green Things from Outer Space** — Tom Wham's board game, first published in *Dragon* magazine in 1979 and published by Steve Jackson Games since 1988. The source of the valley's rules (6.6): the effect of each weapon on the creatures is unknown until it is first used, and is random each game. Borrowed: that one idea. Not borrowed: anything else.
- **NetHack** and the roguelikes after it — unidentified potions and scrolls, shuffled every game, are the same idea in a computer game, with decades of practice at making identification fair. https://www.nethack.org/
- **UnReal World** — the deepest wilderness survival simulation in a tile-based game; injuries, trapping, food preservation. https://www.unrealworld.fi/
- **Wayward** — a top-down tile survival game written in TypeScript; the closest technical cousin. https://www.waywardgame.com/
- **The Long Dark** — tone: quiet, lonely, no monsters; warmth, calories, and wildlife as the whole game.
- **Don't Starve** — discovery by experiment, and readable danger from animals.
- **NEO Scavenger** — conditions and illness shown as text states rather than meters; crafting by trial; character traits chosen at the start.
- **Kingdom Two Crowns** (2018, published by Raw Fury) — the reference for mood and feel (12.1): small figures in a large, quiet landscape, the time of day and weather setting the tone, firelight at night, sparse sound, almost no interface. It is side-on; Snowline takes the mood, not the look, into a top-down view.
- **Eastward** and **Sea of Stars** — top-down pixel art with modern lighting; worth a look if the later upgrades in 12.1 are ever taken up.
- **The Legend of Zelda: Link's Awakening** (1993) — grid-based top-down readability at very low resolution, including cliffs and elevation.

### Technical

- Red Blob Games, terrain from noise: https://www.redblobgames.com/maps/terrain-from-noise/
- Red Blob Games, A* pathfinding: https://www.redblobgames.com/pathfinding/a-star/introduction.html
- Glenn Fiedler, "Fix Your Timestep!": https://gafferongames.com/post/fix_your_timestep/
- Glenn Fiedler, "Floating Point Determinism": https://gafferongames.com/post/floating_point_determinism/
- Robert Nystrom, *Game Programming Patterns*, game loop chapter: https://gameprogrammingpatterns.com/game-loop.html
- rot.js, a TypeScript roguelike toolkit (seeded RNG, field of view, pathfinding) worth reading even if not used: https://ondras.github.io/rot.js/hp/
- RogueBasin, articles on tile-based game design: https://www.roguebasin.com/
- Vite: https://vite.dev/ · Vitest: https://vitest.dev/ · fast-check: https://fast-check.dev/

### Art and tools

- Lospec palette list, for the base palette: https://lospec.com/palette-list
- Kenney, public-domain game art for placeholders: https://kenney.nl/assets
- Tiled map editor, if set pieces are ever hand-drawn: https://www.mapeditor.org/

### Survival background

- John Wiseman, *SAS Survival Handbook* — fire, shelter, water, and foraging basics.
- The "rule of threes" (roughly three hours without shelter in harsh conditions, three days without water, three weeks without food) as a sanity check on vital drain rates.
- Public health guidance on giardiasis, the model for the waterborne illness: delayed onset and long duration.
- A regional field guide to edible and poisonous mountain plants, for the lookalike pairs in 7.4.
