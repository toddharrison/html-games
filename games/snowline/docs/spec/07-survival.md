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
- **Fishing:** spear in shallows, later a fish trap (rock weir) and bow. Hook and line come from the wreckage. Trout are fish in the water, not a number (decided 2026-11-26, replacing Q34): a few dark shapes in each pool and run, most on the spawning gravel and at the stream mouth. They hold against the current, drift between pools, scatter when the survivor walks up, and settle again if they stand still; at dusk they rise. A spear is thrown at one particular fish on the faced tile. Watching them (click a fish) is how the survivor learns their habits; missing teaches to aim below them. The line and the weir still go by how many fish the water holds.
- **Hunting:** grouse, hare, and marmot with a thrown spear or bow; snares for hare.
- **Seasons:** each food has an availability window. Berries peak early and fade; nuts and rose hips come late. Around days 25–40 trout run up the stream to spawn: easy fish in quantity, and bears know it too.
- **Depletion:** patches regrow slowly, and animal populations do not respawn fast. What doesn't grow back within a run is used up for good (8.2). Over-harvesting near camp forces the player to range further and higher.
- **Unknown foods:** a dealt plant is labelled by appearance ("red berries") until identified. A small taste gives a mild version of its effect, a full portion the whole of it, and watching birds or bears eat it marks it as suspected safe. What is learned goes in the valley notes (6.6) and holds for this valley only.

### 7.5 Cooking and spoilage

- Raw meat and fish carry an illness risk and give less nutrition. Cooking needs a fire and a few game minutes.
- Fresh food spoils in 1–2 days. Smoking or drying over a fire extends this to weeks.
- Live fish can be kept in a rock pen in the shallows.

### 7.6 Shelter and camp

A shelter site has four ratings: rain cover, wind cover, insulation, and security. The rock overhang starts with good rain cover and little else. Improvements, built in stages from gathered materials. Every build works the way a fire is laid (8.2, 8.3; decided 2026-11-27): chosen in Make, placed with a preview, then the kid walks beside the spot, marks it out, and puts in what they carry. If that's everything, it's built then and there; if not, it stands as a site, drawn faint and firming up as its parts go in, until the rest is brought (click it) or it's taken apart again. A storm takes a site the way it takes the thing it would have been. Camp builds (lean-to, bed, wall, woodpile) share the spot slept on; reflector stones go round a fire, a cache on a tree, a weir in the shallows, the signal pile on open ground:

- Woven wall and door (wind, security)
- Bough bed (insulation, sleep quality)
- Fire pit with reflector stones (warmth)
- Hanging food cache (keeps out pack rats, jays, bears)
- Woodpile with cover (dry fuel after rain)
- Signal fire pile on open ground (see section 10)

A lean-to, a bough bed, or the overhang can be clicked (decided 2026-11-27): the kid walks onto it and sleeps there till morning (offered in the evening, at night, or worn out), or rests there an hour out of the weather (the lean-to and bed).

The player may build further camps, including a rough high camp for the climb to the wreckage. Unsecured food and small items attract raiders.

### 7.7 Illness and injury

Each condition is a small state machine: onset, acute phase, recovery, with a severity that treatment can reduce. Conditions are shown as icons and described in the message log.

| Condition | Cause | Effect | Treatment |
|---|---|---|---|
| Food poisoning | Toxic plants, raw or spoiled food | Vomiting, hydration and nutrition loss, weakness for 1–2 days; the deadly bulb can kill | Rest, water |
| Waterborne illness | Untreated water (delayed onset, 2–5 days) | Recurring cramps, hydration loss for a week | Boiled water, rest |
| Hypothermia | Warmth at zero | Slowed actions, then health loss | Fire, dry clothes, shelter |
| Going under | Wading a stream (more in the dark, worn out, or a poor swimmer; less in the lake's still shallows; never on gravel shallows) | Soaked through, warmth and morale lost | Fire, dry clothes |
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
- Nothing gathered or made is lost to full hands: what doesn't fit is set down at the survivor's feet, and the log says so.
