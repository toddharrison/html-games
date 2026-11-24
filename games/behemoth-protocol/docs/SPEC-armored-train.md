# Armored Train Encounter (Intercept) — Draft Spec

> **Status:** draft, built (Nov 24, 2026) and **reworked the same day at the user's direction** (the rework is `d8edcca`; its second and third passes are `8434770`, version 0.4.0), awaiting the user's playtest. Not yet part of [SPEC.md](SPEC.md). When the user signs it off it merges into SPEC.md (§T17) and this file is deleted. **The fourth pass** (`125d65b`, version 0.5.0) is §T21: engine flamethrowers, troops on car roofs, ambush cars, engines plowing through other trains' wrecks, and an engine blowing up against the hull.
> **Built** (see FEATURES.md §3 "Rail line", §4 "Meeting the armored train", §9 "Armored train" and the entries after it, §12 "Train strip"): every step of §T15 (`2bb609d`, `ee45bf9`), then the rework (§9 "Armored train rework"). **Still to do:** a train theme, more balance passes, and the merge (§T15 after step 7).
> **The rework** *(user, Nov 24, after seeing the first build: "the train should be longer, have more guns on it and other offensive cars, when cars are destroyed they should split the train and cause a wreck. and it should not be so slow, the player should have to push their throttle to the max to make progress against the train")*. It changed §T3 (a longer line, a service road), §T4 (a longer train), §T5 (the pace), §T6 (four new cars, a bigger budget), §T8 (wrecks and pileups replace hulks and cutting loose), and parts of §T9, §T10, and §T12. How each was done is my call unless marked *(user)*; §T18 Q15–Q21 are what I'd like the user to judge.
> **The rework's second pass** *(user, Nov 24: "make the train cars slightly narrower and longer. make the engines more distinctive", "also add train sounds for atmosphere", "also, make the train tracks 2, so that the 3 wide bridges make sense", "2 wide with a gap between", "of gravel")*. It changed §T3 (a double track with gravel between), §T4 (sizes, the engine's look), §T5 (the pace, eased to make up for the longer train: my call), and §T13 (train sounds). §T18 Q22–Q24 are the calls I made in it.
> **The third pass** *(user, Nov 24, in one message and four follow-ups)*: crossovers through a tunnel, attack trains on the second track, bigger wrecks, a faster end pace, the train strip hidden, a second mode of attack trains only, armored cabooses, a shield car, smoother bends, and leaking wrecks. It's all in **§T20** (with the user's words), and it changed §T5 (the floor), §T6 (two cars), §T8 (the pile), and §T13 (the strip). §T18 Q25–Q31 are the calls I made in it.
> **Who decided what:** lines marked *(user)* are the user's brief or calls. Everything else is a proposal, and every number is provisional. The user answered Q1–Q4 on Nov 24 (§T18); the rework answers Q7, Q9, Q11, and Q14 and replaces Q6; Q5, Q8, Q10, Q12, and Q13 are open.
> **For the implementer:** read [CLAUDE.md](../CLAUDE.md) first (the architecture rules apply: pure sim, seeded RNG, content tables, tuning in `tuning.ts`). §T14 maps this spec onto the existing code, §T15 is the build order, §T16 is every number in one place.
> **Units:** 1 tile = 16 world units; 10 units = 1 m. The stock Class II hull is 64 × 40 units; it brakes to 18, cruises at 36, and surges to 64 units/s. Sim +x is forward ("ahead"), y is across the field.

## T1. Summary

A new battle mode, **Intercept**, fought on its own kind of map node. A long armored train runs the whole length of the battlefield on a rail line, heading the same way as the Behemoth, **faster than the Behemoth cruises and slower than it surges**. The Behemoth starts behind the train's tail and claws its way up the train at full throttle, car by car, to reach and destroy its **engines**. Every engine lost slows the train; with all of them gone the train is stopped and the objective is taken. If the train reaches the end of the line with an engine still running, it gets away.

What makes it different from every other battle:

- **The train is the level.** It's well over three screens long and stays beside the Behemoth for the whole fight. What's on screen changes because the Behemoth moves along the train, not because the ground brings new defenders.
- **The throttle is the fight.** Only a full surge gains on the train; at a cruise it pulls away, and braking loses it fast. *(user: the player should have to push the throttle to the max to make progress.)*
- **Every kill breaks the train.** A vehicle destroyed leaves the rails where it is and the train parts there: the front runs on, and everything behind piles into the wreck. *(user.)* So the farther forward a shot lands, the more of the train it takes, and the cars the Behemoth has fought past are the ones still shooting at it.
- **What's left behind a wreck is scuttled** by its own crews, a ripple of blasts from the tail forward.
- **A railway gun shells the Behemoth from off screen** for most of the fight, marking the ground where each shell will land.
- **The front of the train is where the finishers are:** destroy the lead engine, cut the track, or drop a bridge ahead of it, and the whole train piles up.

From the user's brief: a map node; a rail line the whole length of the map; several engines to reach and disable; a long train in segments that can be detached and detonated; special cars (guns, troops, mine flingers, missile launchers); hovercraft escorts; bridges; destroyed track causes a pileup; shooting the train never destroys the track; a car with a very large gun that fires from off screen at a marked target. From the rework (Nov 24): longer; more guns and other offensive cars; destroyed cars split the train and cause a wreck; fast enough that only full throttle makes progress.

## T2. Where it appears

- **Intercept is a battle mode** beside Assault, Breach, and Chase (SPEC §4.4), drawn when the map is built. Proposed weights: Assault 2, Breach 1, Chase 1, **Intercept 0.6**; at most **one Intercept per sector**; never the opening battle. It can appear in any biome, because the mode generates its own rail line.
- **Map node:** marked with an `I` on the icon's shoulder like `B` and `C`, never fogged. Intel: *Mode: Intercept. Stop the armored train (3 engines)*, the share per engine, and the usual ground, defenders, strength, weather, and reward lines. The **defenders** line (the doctrine) shades which cars the train carries (§T6).
- **Strength** is rolled as for any battle node. It sets the train's length and escorts (§T4, §T11).
- **Not yet a Directive.** A train as a sector objective or a Directive's final target is a later step (§T19).

## T3. The rail line

*(user: the line runs the entire length of the map, and it crosses bridges.)*

**Shape.** One continuous line from the first column of the battle to the last, generated from the battle seed on its own RNG stream. It's a **double track** *(user, Nov 24: "make the train tracks 2, so that the 3 wide bridges make sense", "2 wide with a gap between", "of gravel")*: two tracks with a row of gravel between them, three rows in all, the width of its bridges. **The train runs on the track nearer the middle of the field** *(my call: it keeps the train where it was, and a kill throws its wreck across the gravel and the second track rather than into the scenery)*; the second track lies on the narrow side and nothing runs on it. Rows and gaps below are measured from the train's track.

- It runs off-center: its mean row is 27% of the way across the field from one side (which side is seeded). That leaves a **wide side** (the Behemoth's side at the start) and a **narrow side**.
- It wanders between knots 24 columns apart, at most 2 rows either side of its mean row (knots sit on tile centers, so the track never jogs back and forth), and never closer than 3 rows to a field edge. It steps one row at a time, and a train crosses a step over 3 columns.
- It runs **level across every river** (8 columns either side of the river's center), so its bridge is straight.
- The battle's guaranteed way forward (the lane, SPEC §4.2) runs on the wide side, its center at least **7 rows** from the track (112 units: just outside a troop car's rockets). The Behemoth starts in the lane.
- **The service road** *(rework, my call)*: the whole lane (5 rows) is cleared of obstacles the way the railbed is, deep water in it is a ford, and a road runs down its center. The chase is at full speed the whole way, and at that speed scenery tears the treads up: measured before the road, the autopilot lost every tread to buildings, tank traps, and deep water in about 6000 units of surging. Off the road the ground is as rough as any battle's. Fords still hold the hull to a cruise, so every river costs ground against the train.
- An Intercept battle is **2.5× the usual length** (12500 units, about four minutes at the train's full pace; it was 1.4× before the train got faster).
- **The station** *(user: the train starts by pulling out of a station, ahead of the Behemoth)*: the line's first 24 columns are level, with a paved platform either side of the line and a station building two rows deep behind it on the narrow side.

**Crossovers** *(third pass)*: the line changes sides of the field twice, through a tunnel under the lane (§T20).

**Tiles.** Four new terrain materials (the cosmetic `rail` material stays as it is for other battles):

| Material | What it is | Rules |
|---|---|---|
| `track` | The line's rails, both tracks: **hardened track** on concrete sleepers *(user)*. Each one tile wide. | Open ground to everything (no slowdown, no cover, no obstacle). The treads don't tear it. Destroyed only as described in §T9 (only a break in the train's own track stops it); breaks to `crater`. |
| `ballast` | The gravel between the two tracks *(user)*. One tile wide. | Open ground, like the track; part of the line (enemy fire never breaks it). A blast can crater it, which stops nothing. |
| `railBridge` | The line over a river: a girder span 3 tiles wide, a track down each edge. | Like the girder `bridge`, but **no weight limit** and 300 HP. The whole span falls when it's shot out, whichever tile is hit. The Behemoth may drive over it. |
| `tunnel` | A tunnel portal's concrete (§T20). | Open ground; nothing breaks it. |

**What the generator guarantees along the line:**

- A **railbed**: the line's three rows and one tile either side of them are open ground; and the **service road** down the lane (above). No forest, building, wall, tank trap, fuel tank, minefield, drift, or dune is left there (roads, craters, crops, and ice stay). Structures cut by the railbed stand as smaller buildings either side (the existing rule for cut footprints).
- Rock and cliffs never come within two rows of the line; a fortified line that crosses the track has a gap there.
- **Bridges:** every river is crossed on a `railBridge`. Every Intercept battle has **at least one river** (rivers are forced at about 35% and 70% of the line if the biome's own mix produced none there; use the biome's river materials). On the wide side every river has a ford or road bridge in the lane, as rivers always do (SPEC §4.5).
- The node's biome and approach shape everything else as usual.

**The Behemoth and the line.** The track is ordinary ground to the Behemoth: it can drive along it or across it freely, behind the train or ahead of it. The rail bridge is its one dry crossing with no weight limit, which puts it directly behind (or in front of) the train.

## T4. The train

**Structure.** A train is a chain of vehicles on the line, listed front to back, grouped into **sections**. A section is one engine followed by its cars. *(user: long, multiple segments, multiple engines; Nov 24: longer.)*

| Strength | Sections | Cars per section | Vehicles (with the railway gun) | Length |
|---|---|---|---|---|
| Normal | 4 | 6 | 29 | about 1150 units (72 tiles, 3.5 screens) |
| Strong | 5 | 6 | 36 | about 1420 units |
| Objective (later) | 5 | 7 | 41 | about 1610 units |

(It was 3 sections of 4 cars, 16 vehicles and 590 units, before the rework.) The **lead section** is `engine, railway gun, cars…` (§T7); the others are `engine, cars…`.

**Sizes.** Engine 52 × 22 units (hit radius 15); car 38 × 18 (hit radius 13); a 4-unit coupling gap between vehicles. The railway gun is 68 × 20 with one hit circle of radius 18. *(user, Nov 24: "slightly narrower and longer"; they were 40 × 24, 34 × 22, and 60 × 24.)* Every unit in the sim is hit as a circle, so a vehicle's ends are a little harder to hit than its middle, and the longer they are the more so. A normal train is now about 1300 units long (it was 1150).

**The engine's look** *(user, Nov 24: "make the engines more distinctive")*: black iron where the cars are red plate, wider than they are, a long frame of drive wheels down each side, a boiler with brass bands, a red cab, a hazard-striped wedge of a plow with a headlamp, and smoke pouring from its stack while it pulls (none once it's abandoned).

**Movement.** The train's position is a single distance along the field (the line's slope is shallow, so distance along x stands in for distance along the track). Each vehicle sits at its own offset behind the front, on the line, facing along it. There is no physics between cars: position and heading come from the line's shape alone, so the train bends through curves by construction.

**Start.** The train stands **at rest** in its station as the battle opens, its tail 200 units ahead of the Behemoth's nose, and pulls out (it reaches its pace in about 6 s). *(user's idea.)* A surging Behemoth is on its tail as it gets up to speed.

**Each vehicle is its own target** with its own integrity, armor, weapons, and salvage, like any enemy unit. A destroyed vehicle **wrecks where it is and parts the train** (§T8). *(user, Nov 24; before the rework it stayed in the chain as a burnt-out hulk.)*

**Dormant off screen.** A vehicle's weapons fire only while the vehicle is inside the camera frame (the fairness rule every unit follows). Vehicles outside the frame can still be damaged (a railgun slug along the train, a blast). The railway gun is the one exception (§T7).

## T5. Pace: how fast the train runs

*(user, Nov 24: "it should not be so slow, the player should have to push their throttle to the max to make progress against the train". Before: "slightly slower than the Behemoth".)*

**The train paces the Behemoth's top speed.** Its target speed is a fixed share of the **Behemoth's present top speed** (the surge its treads and load give it right now, before terrain), and it eases toward that target at no more than 8 units/s². *(Pacing the Behemoth rather than running at a fixed speed is the user's Nov 24 answer to Q1; pacing its top speed rather than its cruise is the rework.)*

| Engines running (of 4) | Train's target speed | Stock Class II (cruise 36, top 64) |
|---|---|---|
| 4 | 0.75 × the Behemoth's present top speed | 48 |
| 3 | 0.71 × | 45 |
| 2 | 0.67 × | 43 |
| 1 | 0.63 × | 40 |
| None | 0: it brakes at 10 units/s² and is **stopped** | 0 |

General rule: `0.75 × (0.78 + 0.22 × running ÷ total)` *(the floor was 0.67, the last engine at 36; user, Nov 24: "keep the end speed of the train a little faster, as engines are lost, i found the end to be too easy")*. The floor keeps even the last engine's pace above the hull's cruise (cruise is 0.5625 of top on the Class II), so **a cruising Behemoth never gains**, whatever the train has lost.

- **Why 0.75 and not higher:** a hull at a full surge doesn't average its top speed. Measured with the autopilot on the service road, fords and steering bring a 64-unit surge down to about 56. Against a train at 48 that's a gain of about 8 units/s with every engine running (a car every 5 s), then 12, 16, and 20 as engines are lost. At a cruise the hull loses up to 12 units/s. It was 0.78 (floor 0.64) until the cars got longer: the train grew 13%, and over 16 seeds at each of two threats the autopilot's wins fell from 24 of 32 to 16. At 0.75 it wins 22 of 32.
- **Why it paces the Behemoth:** every Behemoth speed (minimum, cruise, top) scales together with tread damage and overload, so the train stays the same *relative* speed whatever the build. A slow Behemoth sees the same fight in slow motion, and pays for it the way a slow Behemoth always does: more alert waves and more railway-gun shells before the end (SPEC §4.2 "the whole battlefield slows with you").
- **Tread damage mid-battle costs ground:** the hull slows at once, the train takes a moment to ease down.
- **An untouched train is barely overhauled:** at 8 units/s the hull needs about 190 s to climb 1500 units of gap and train, and the train is off the far end in about 250 s. The fight is won by kills on the way up, each of which slows the train or breaks it.
- **Last stand:** if the Behemoth is Immobilized the train keeps the pace it had and runs for the end of the line (as a convoy does), and the railway gun keeps firing.

## T6. Cars

*(user: guns, troops, mine flingers, missile launchers, etc.)*

Cars are a content table (`content/trainCars.ts`). All eight are built, all heavy-class vehicles (sizes per §T4).

| Vehicle | HP | What it does | Counter | Cost | Salvage |
|---|---|---|---|---|---|
| **Engine** | 260 | Pulls its section. No weapon. Thick all round (×0.8 from every side). Too big to crush (§T10). | Sustained heavy fire; it's the objective. | — | 30 |
| **Gun car** | 150 | One turret with the Breach gun emplacement's heavy gun (18 a shot, range 270), 360° traverse. | Kill it first; its shots are the train's hardest. | 2 | 20 |
| **Twin gun car** *(rework)* | 190 | Two of the gun car's turrets, fore and aft, each laid on its own. | The train's heaviest broadside: a first target. | 3.5 | 28 |
| **Autocannon car** *(rework)* | 130 | A quick-firing mount: bursts of 4 light shells (2.5 each) every 2.6 s, range 220. | Stand off beyond 220, or kill it: it's thin for what it does. | 1.5 | 16 |
| **Howitzer car** *(rework)* | 130 | The field battery's area fire from a car in view: it marks a zone (radius 26) where the hull will be and drops two rounds (14 each) on it 2.6 s later, every 8 s. Can't lay its gun inside 90. | Steer out of the ring; or hug the train. | 2.5 | 20 |
| **Rocket car** *(rework)* | 120 | A ripple of 6 unguided rockets (4 each, a small blast) every 6 s, range 250, wild. | Distance: they spread. | 2 | 18 |
| **Missile car** | 130 | A rack firing the missile launcher unit's homing missiles in pairs. | Point defense; destroy it before it reloads. | 2 | 20 |
| **Troop car** | 140 | Riflemen with AT rockets fire from slits on both sides at the **treads**, short range (110). When the car is destroyed or abandoned, 2 infantry squads jump out beside it. | The service road runs just outside its reach. Punishes hugging the train. | 1.5 | 15 |
| **Mine flinger** | 120 | Every 6 s lobs a mine onto the Behemoth's line about 3 s ahead of it. The mine lands in plain sight, armed after 0.5 s, on open ground or the service road. At most 5 of its mines live at once. | Steer round them, shoot them, or destroy the car. | 1.5 | 15 |
| **Ammo car** | 70 | Unarmed. Destroyed, it explodes (radius 60, damage 90) on the cars next to it and on the Behemoth if it's close; the blast often wrecks a neighbor too. | It's the counter to its neighbors. Don't be beside it. | — | 8 |
| **Boxcar** | 90 | Unarmed cargo. Fills the slots the budget doesn't arm. | Worth shooting for its salvage, or to break the train there. | 0 | 12 |
| **Railway gun** | 320 | §T7. Lead section only, one per train. Too big to crush. | Get close: it can't shell what it can see. | — | 45 |

**Building a train** *(rework: a budget of its own, so the train carries more guns; user: "more guns on it and other offensive cars")*. The seed fills the car slots from a **budget** of `base + 1.15 × the node's threat` (base 8 / 12 / 16 by strength; threat is 7–13 over a run), spent on the costs above:

1. Slot 1 of the lead section is the railway gun (on top of the section's car slots).
2. Sections are filled tail first. The budget is split so the train gets harder toward the front, by weights running from 1.5 at the lead section to 0.75 at the tail (33 / 28 / 22 / 17% over four sections). Each section draws armed cars by the doctrine's odds, among those its remaining budget can pay for, into random free slots; what it can't spend carries forward to the section ahead.
3. Ammo cars (2 on a normal train, 3 on a strong or objective one) each take a boxcar's place beside an armed car.
4. Remaining slots are boxcars.

A normal train carries about **7 armed cars of 24 on a run's first Intercept and 11–12 on its last** (it was 4–7 of 12). I tried a budget that armed half to nearly all of the cars; a stock Behemoth under the autopilot didn't survive it (§T18 Q17).

Doctrine weights (gun / twin gun / autocannon / howitzer / rocket / missile / troop / mine flinger): combined arms 1 / 0.6 / 1 / 1 / 1 / 1 / 1 / 1; armored fist 2 / 1.5 / 1 / 0.5 / 0.5 / 1 / 1 / 0.5; long guns 1 / 0.5 / 0.5 / 2 / 1.5 / 2 / 0.5 / 1; entrenched 1 / 0.5 / 1.5 / 1 / 0.5 / 0.5 / 2 / 2; mobile raiders 1 / 0.5 / 1.5 / 1 / 1.5 / 1 / 1 / 1.5 and one extra hovercraft escort.

*As built* (`buildTrain` in `sim/trainCars.ts`, `TRAIN_LAYOUT` and `TRAIN_DOCTRINE` in `content/trainCars.ts`):

- **Gun car:** the fortress gun (`emplacementGun`: 18 a shot, range 270, reload 4.2) at 40°/s. **Twin gun car:** two of them as `EnemyDef.turrets`, 9 units fore and aft of its center, no main gun. **Autocannon car:** `trainAutocannon`. **Howitzer car:** `trainHowitzer` (`barrage`, so it marks its zone like the field battery; it fires only from inside the frame). **Rocket car:** `trainRockets`. **Missile car:** the missile launcher's missiles in pairs (`trainMissiles`, reload 6.5, range 300). **Troop car:** the infantry's tread rockets two at a time (`troopRockets`, reload 3.4); it opens fire at 110. Its 2 squads jump out (one each side) when it's destroyed by any means, a pileup included, or abandoned, once. **Mine flinger:** throws only while it's in the frame and not abandoned; the mine flies 1.2 s, lies in plain sight 0.5 s, then is a live (seen) mine tile, the kind the treads set off; it needs open ground or road within 260, or tries again 0.5 s later.
- An abandoned car's guns fall silent (§T8) and its flinger stops.
- On a train armed end to end (no boxcar left), an ammo car takes an armed car's place beside another.
- Practice: `?mode=intercept&train=engine,railgun,gun,twin,auto,howitzer,rockets,missile,troop,mines,ammo,box` (short names); `&doctrine=` for a built train.

**Later cars** (not in the first build; §T19): flak car, hangar car, observation car, shield car, flatbed with a tank.

## T7. The railway gun

*(user: a very large gun that shoots from off screen and marks a target on the ground for the Behemoth to avoid.)*

It reuses the field battery's area fire (`WeaponDef.barrage`, SPEC §15 "Field artillery (M3)") with one very large shell.

- **Fires from anywhere on the train, on or off screen.** Every 11 s (9 before the rework: the hull is now at full speed the whole fight, with only its steering to get clear) it fixes a **target zone** (radius 40) where the Behemoth will be, on its present course and speed, when the shell lands, 3.5 s later. The zone is marked on the ground the moment the gun fires (the battery's dashed ring and closing disc, larger, with a deeper incoming whistle).
- **One shell:** 45 damage at the center falling to half at the edge, striking the armor that faces the gun, a quarter of it going to the deck mounts. It **craters** all open ground in the zone (craters slow tracked units, the Behemoth included). Point defense can't stop it.
- **It doesn't spare its own side.** Escorts and train cars in the zone take half damage. So hugging the train is a gamble that can turn the gun on its own cars. It never damages the track (§T9).
- **Silent once it's in view.** It can't lay its gun closer than 300 units, which is roughly when its car enters the frame. Reaching the lead section ends the shelling; the gun car is then a big, slow-to-kill target with the best salvage on the train.
- **Destroyed:** its magazine goes up (radius 70, damage 100), damaging the engine ahead and the car behind, and it wrecks and parts the train like any vehicle (§T8; before the rework the chain held).
- The first shell is fired 4 s into the battle, as the train's introduction.

*As built:* the gun is `EnemyDef.offscreen` (area fire only may skip the frame rule) firing `railwayGunShell` (one lobbed shell, `barrage` radius 40, flight 3.5, aimed at the zone's center, tile damage 200 so every open tile in the burst craters, `unstoppable` for point defense, range 300–1200). Its zone, the half damage to its own side (`BARRAGE.friendlyFire`), and the untouched track (`credit = false`) all come from the field battery's area fire. Two limits: at night or in a squall it can't lay its gun on a hull beyond the enemy's sight unless the hull's muzzle flash marks it (the rule every enemy gun follows); and its whistle is the battery's, longer rather than deeper (sounds are a later step). Its 200 tile damage also knocks down buildings and road bridges in the zone.

## T8. Wrecks, pileups, and scuttling

> **The pile is bigger since the third pass (§T20):** seven vehicles, not four; they ride up into each other, explode, burn, cook off, and leak. The numbers in step 3 below are the second pass's.

*(user, Nov 24: "when cars are destroyed they should split the train and cause a wreck." Earlier: a segment can be detached and detonated, and the crew does it.)* **Built.** This replaces the first build's rules (a destroyed vehicle stayed in the chain as a hulk; a dead section was cut loose, coasted, and was scuttled).

**The rule.** A vehicle destroyed on the rails, by any means, **wrecks where it is and parts the train there**:

1. **The wreck.** It leaves the rails: thrown 8–24 units off the line, on the far side from the Behemoth (so a kill from alongside doesn't land on the hull), slewed round up to 50°, burning. The tile it rests on becomes a `wreck` (§T9).
2. **The front runs on.** What was coupled ahead of it keeps the train's pace.
3. **The rear piles in.** What was coupled behind it runs into the wreck a moment later: its front vehicle leaves the rails (destroyed, thrown to one side or the other), and the next, each one taking 12 units/s off what's left, until the rest is slower than 10 units/s and pulls up short. From full pace that's four vehicles in about half a second; a slowed train loses three.
4. **Engines behind the wreck are out of the fight.** Each counts as destroyed the moment the train parts: its share of the bonus is banked (banner: *2 engines stranded*), though not its own salvage unless the pile or the Behemoth destroys it. The train slows for every engine lost this way, as for one destroyed.
5. **What's left on the rails is abandoned and scuttled.** Its guns stop, troop cars empty their squads, every car **strobes** (the bomb truck's warning flash), and after a **3 s fuse** the scuttling charges fire one car at a time from the tail forward, 0.25 s apart. Each is a blast of radius 40, damage 50 (an ammo car's own blast instead, if it's still intact), hitting the Behemoth, its trailer, and enemy units like any terrain blast.

**What it pays.** A vehicle the Behemoth destroys pays in full. One lost to a pileup pays **half**. A **scuttled car pays nothing**; one destroyed before its charge fires blows at once and pays in full.

**What it means in play.**

- **Where the shot lands is the choice.** A kill at the tail takes only the tail. A kill near the front takes most of the train with it, engines included, but the hull has to get there first, past every gun, at full throttle.
- **Destroying the lead engine stops the train at a stroke**: everything piles into it. It's the same prize as cutting the track ahead of it (§T9), earned the same way: by reaching the front.
- **Salvage against speed:** every car killed one at a time pays in full; a train broken near the front pays half for four cars and nothing for the rest.
- **Get clear of what's abandoned.** The pile is behind the wreck and the charges are behind the pile; a hull that keeps its speed leaves both behind before the fuse runs out. One that brakes among them takes the ripple.
- **A pile ahead of the hull is in its way:** a car shot from behind leaves its wreck, and four more, beside the track ahead. Car wrecks can be plowed; an engine's or the railway gun's is too big (§T10).
- **An ammo car** blast (radius 60, damage 90) reaches the cars either side, and can wreck one of them as well.

## T9. Track, derailment, and the pileup

*(user: if part of the track is destroyed, a pileup of detached cars happens. Shooting the train does not destroy the track.)*

**Decided (user, Nov 24):** the line is **hardened track**, so the treads never cut it, and a derailment taking the whole objective is fine for now: "we will have to test length of train and ability to outrun it to derail it."

**What breaks the track.** A `track` tile breaks (to a crater) when **a blast from the Behemoth** hits it hard enough to crater open ground (the existing cratering threshold in `content/terrain.ts`): heavy HE shells, the siege howitzer, ballistic missiles, rocket artillery, a jettisoned trailer going off, the Behemoth's own detonation. A `railBridge` span takes damage from any of the Behemoth's weapons, like the road bridges.

**What never breaks it:**

- Anything within one tile of a train vehicle. Track and bridge tiles under or beside the train take no damage at all, so fire aimed at the train can't break the line. *(user)*
- Enemy fire of any kind, including the railway gun, mines, scuttling charges, and exploding ammo cars.
- The Behemoth's treads (this replaces SPEC §7.3's "driving along rails damages them"). A bridge span the train is on is shielded as a whole, since a span falls whole.

*As built:* "enemy fire never" is the terrain's existing `credit` flag (false for enemy rounds). A scuttling charge or an exploding fuel tank is too weak to crater track (under 100), but those blasts can still wear down a rail bridge the train isn't on.

So the track can only be cut **ahead of the train** (or behind it, which does nothing), and only on purpose.

**Derailment.** The train does not brake for a break. When its front vehicle reaches a broken track tile or a fallen span, it piles up as it does behind a wreck (§T8):

1. That vehicle **derails**: it's destroyed, comes to rest as a wreck up to 24 units to either side of the line and turned up to 50° (seeded), burning.
2. The train loses 12 units/s of speed for each vehicle derailed, and the next vehicle derails the same way, until what's left is slower than 10 units/s. At full pace that's four vehicles.
3. The vehicles left on the rails behind the pile are **abandoned and scuttled** (§T8). *(Before the rework they were halted: a static fortress.)*
4. At a fallen bridge the derailed vehicles drop into the river and are simply lost (no wreck).

**The pileup is terrain.** Each wreck is thrown 8–24 units to one side of the line and slewed round up to 50°, and the tile it rests on becomes a `wreck` (the wasteland's material: a **medium** obstacle that stops shots, 150 HP), which can be in the Behemoth's lane: if the Behemoth is beside the middle of the train when the front derails, the pile happens just ahead of it.

**A derailed train is a stopped train:** the objective is taken in full (§T12). Derailed vehicles pay **half** salvage; vehicles lost in a river pay none; abandoned ones pay only if the Behemoth destroys them before their charges fire.

**Why it isn't free:** the track that matters is ahead of the lead engine, so the Behemoth has to get to the front of the train first, past every section, and then needs a weapon that craters (or a bridge within reach, or a trailer to drop on the rails).

## T10. Collisions

| Contact | Result |
|---|---|
| The Behemoth plows into a **car** (any vehicle except an engine or the railway gun) | Heavy obstacle, as SPEC §4.2 already lists train cars: the car is destroyed and the Behemoth pays a heavy ram (less with ram gear), at its own speed: at a full surge that's most of a stock hull's treads. The car wrecks under the treads and **the train parts there, the rear piling in** (§T8). A car's wreck is plowed the same way. |
| The Behemoth hits an **engine** or the **railway gun** | Too big to crush (the siege tank's rule): the ram damages it, but it's on rails and isn't shoved. The hull is deflected and slides along it, scraping that side's armor, as against rock. Rammed from behind at a surge, the hull closes on it at only a few units/s: a dent, and the hull is thrown back off it. |
| A running train **runs into the Behemoth** (the hull is on the track **ahead of its nose**) | The struck arc takes 60 and the treads 15; a trailer is hit first and wrecked. The hull is shoved clear to the wide side. The train's front vehicle takes 90 and the train loses 30% of its speed for a moment. The train isn't stopped. |
| The Behemoth crushes **mines, squads, hovercraft** | As anywhere else. |

*As built* (`meetTrain` in `sim/collision.ts`; numbers in `TRAIN.collide`):

- **Cars** and any car's wreck (shot, piled up, or scuttled) are plowed as heavy obstacles; a wreck plowed is swept away (gone).
- **Engines and the railway gun** are too big to crush *alive and as wrecks*. The hull is pushed out of the vehicle's box like rock: head-on into its end it's held there and slid off sideways (the way it's steering, else the side it's on), with one heavy ram on first contact at the speed it *closes* on the moving vehicle. Alongside it's held off and scrapes. Held at the face of a wreck for 2 s with nowhere to go, the hull grinds through it (nothing stops it for good).
- **The train runs into the hull:** its front vehicle, at least as fast as the hull, **its nose behind the hull's center** (rework: the train now outruns a cruise, so a hull it's merely passing scrapes along it and isn't struck), meeting the hull (or the trailer in tow). The struck arc takes 60; **with a trailer in tow the trailer takes the blow instead and is wrecked** (its cook-off reaches the rear as always), and the treads take 15 either way. The front vehicle takes 90, the train loses 30% of its speed and eases back up at 8 units/s², and the hull is pushed ahead of the nose and shoved toward the wide side at 80 units/s until it's 8 units clear of the train's path. No second strike for 2 s (1 before the rework: a braked hull swinging straight again could be struck twice).

## T11. Escorts and other defenders

*(user: hovercraft escorts.)*

- **Escorts:** 2 / 3 / 3 hovercraft (normal / strong / objective) start with the train. They use the existing raider behavior unchanged: wait wide on a flank (on water when there's some), make a pass across the Behemoth's rear quarter at a drone, the trailer, or the rear armor, break off, and go again.
- **Alert waves** run on the usual clock and budget, but in an Intercept every wave is **hovercraft only**: they're the one unit that can keep up with a running fight and cross the rivers.
- **Placed defenders** (posts along the route) are 0.3× the doctrine's size: the train is the fight. The biome's own hazards (minefields, fuel tanks, hedge guns, and so on) are as usual.

## T12. Objective, rewards, and how it ends

- **The objective is a share**, like Breach and Chase (SPEC §4.4). The mode's bonus is **+90 salvage**; each engine destroyed banks its share (a quarter, on a normal train) the moment it dies, on top of its own kill salvage. An engine **stranded behind a wreck** (§T8) banks its share too, without its kill salvage.
- **Train stopped** (the last engine destroyed or stranded, or the train derailed, §T9): any shares not yet banked are banked at once. Banner: *Train stopped*.
- **The train gets through, an engine at a time:** each engine that passes the extraction line has escaped and its share is lost (as a Chase hauler's is); it goes on pulling the vehicles behind it off the field. Banners: *An engine got through*, and for the last one *The train got through*. As in every mode, missing the objective never ends the run.
- **Extraction.** The battle still ends when the Behemoth crosses the extraction line. Once the train is stopped, **or has got away off the far end** (rework: the line is 12500 units long, and there's nothing left on it to chase), the extraction line is pulled in to 600 units ahead of the Behemoth (never beyond its original place).
- **Detonation:** a Behemoth that dies beside the train takes cars with it, and they count (SPEC §5.1).

## T13. HUD, feedback, and audio

- **Objective row** (left panel, where Breach and Chase show theirs): `Engines 1/3 33%`.
- **Train strip** (new; **hidden for now**, user, Nov 24: "we also don't need the train indicator on the left, hide it for now, i may change my mind, don't remove it"; `TRAIN_STRIP_SHOWN` in render/trainStrip.ts turns it back on): a narrow column down one side of the battlefield, one pip per vehicle, front at the top. Each pip is colored by integrity (green, amber, red; an empty frame for a wreck), with a letter or glyph for its type and a heavier mark for engines. A bracket shows which vehicles are in the frame, a notch shows where the Behemoth is along the train, and abandoned cars flash until they blow. The train is longer than the screen, so this is how the player finds the engines. *As built* (`render/trainStrip.ts`): down the field's edge on the line's narrow side; letters `E R G D C H K M T F A B` (engine, railway gun, gun, twin gun, autocannon, howitzer, rocket, missile, troop, flinger, ammo, boxcar); engines framed in white, the railway gun in amber; a wreck is an empty frame, a vehicle gone a blank slot; abandoned cars flash until they blow. The longest train (41 vehicles) fits at 7 pixels a pip.
- **Edge arrows:** amber arrows point to engines that are off screen (the existing objective arrows).
- **Banners:** *Armored train ahead* (at the start, with the first shell), *Engine destroyed 25%*, *The train is cut in two / 9 cars pile into the wreck*, *2 engines stranded 75%*, *5 cars abandoned behind the wreck / Scuttling charges set: get clear*, *Track cut*, *Train derailed*, *Train stopped*, *The train got through*.
- **Railway gun:** the target zone drawn on the ground (ring and closing disc), an incoming whistle, a heavy burst, a crater.
- **Audio (placeholder synth)** *(user, Nov 24: "add train sounds for atmosphere")*, *as built*: the wheels' clatter over the rail joints, whose tempo follows the train's speed, with the rumble of its weight under it, heard from the nearest vehicle still rolling; the beat of the nearest pulling engine's exhaust, quicker the faster it goes; a three-note steam whistle as it pulls out of the station and every 24–44 s after, from the lead engine, heard however far ahead it is; steel shrieking and a crash for every vehicle that leaves the rails; brakes squealing when the train is stopped with its wheels still on the track; an alarm when cars are abandoned; the railway gun's distant boom then whistle. A train theme is in the music backlog (TODO "Themes for the other big enemies"). **Second pass** *(user, Nov 24: "add more sound effects for the train, whistles, a bit louder rail sounds")*, *as built*: the wheels are about 3 dB louder; the whistle has **signals** (two long pulling out; on the run a short and a long, the crossing call of two long, a short, and a long, two short, or one long; one long blast going into a tunnel; a run of short blasts when the train hits the hull) and sounds every 16–30 s; **attack trains have a shriller whistle of their own** (two short and a long as one comes up, then every 8–14 s as it passes), so the two kinds of train can be told apart by ear; the **slack running in** down the couplings when a train strikes the hull or cars are left standing; an engine destroyed **blows off its steam**, its whistle sagging to nothing; and a train **in a tunnel** fades to a dull rumble.
- **Art (placeholder, generated in code):** engine, ten car types, the railway gun, their burnt-out wrecks, the `track`, `ballast`, and `railBridge` tiles. Cars turn with the line.

## T14. Implementation notes

How the design maps onto the code. **Written before the build and not kept up with it** (the suggested state below predates the rework: there are no hulks, cut-loose sections, or halted pieces now). `docs/FEATURES.md` has the as-built pointers for each system.

**New files**

- `src/content/trainCars.ts`: the car table (§T6) and the train layouts by strength. Each armed car is described with the same fields an enemy unit uses (class, arcs, `turrets`, weapons), so a car is an `Enemy` like any other.
- `src/sim/train.ts`: `TrainState`, `createTrain(seed, strength, threat, doctrine, line)`, `stepTrain(w, dt)`. Pure, no Phaser.
- `src/sim/railLine.ts` (or inside `sim/terrain.ts`): the line as a function of the battle seed and recipe, sampled into a polyline with cumulative arc length. Both the terrain painter and the train read the same line.
- `tests/sim/train.test.ts`, `tests/sim/railLine.test.ts`.

**Suggested state**

```ts
interface TrainState {
  line: RailLine;              // polyline + arc lengths; pointAt(s) -> { x, y, heading }
  vehicles: TrainVehicle[];    // front to back; fixed for the battle
  pieces: TrainPiece[];        // coupled runs of vehicles; one piece at the start
  speed: number;               // the running pieces' shared speed
  outcome: 'running' | 'stopped' | 'through';
}
interface TrainVehicle { enemyId: number; car: TrainCarId; section: number; offset: number; state: 'coupled' | 'cutLoose' | 'derailed' | 'halted' | 'gone' }
interface TrainPiece   { first: number; last: number; s: number; speed: number; state: 'running' | 'coasting' | 'halted'; fuse: number | null }
```

- A vehicle's `Enemy` gets its position, heading, and velocity written by `stepTrain` each tick, before `stepEnemies`. Give train vehicles a behavior that returns no movement goal (a new `rail` piece in `content/behaviors.ts`), so navigation never moves them. Their weapons, targeting, damage, facing armor, salvage, and kill events are the ordinary unit code.
- **Pace** (§T5) needs the Behemoth's cruise from treads and load but not terrain: the same derivation in `sim/behemoth.ts` that `sim/objective.ts` deliberately bypasses for the convoy (see the comment near its "rated cruise" line).
- **Step order** inside `stepTrain`: (1) target speed from engines running and the Behemoth's cruise, eased; (2) advance each running piece along the line, coasting pieces by their own deceleration; (3) derailment checks at each running piece's front; (4) cut-loose checks (§T8 rule) and fuses; (5) write vehicle transforms; (6) end-of-line and stopped checks.

**Reuse**

| Need | Existing piece |
|---|---|
| Mode plumbing, shares, banners, objective row, amber arrows | `content/modes.ts` (`BattleModeId`, `MODE_IDS`, `MODES`), `sim/objective.ts` (`createObjective`, `startObjective`, `stepObjective`, `objectiveTaken`, `objectiveBonus`). Adding `'intercept'` to `BattleModeId` makes the compiler list every table that needs an entry. |
| Gun car turret | `EnemyDef.turrets` (`EnemyTurretDef`, built for the siege tank) and the Breach gun emplacement's weapon |
| Railway gun | `WeaponDef.barrage` (`{ radius, flight }`) and the field battery's zone marker (`render/barrageView.ts`) |
| Mine flinger | The barrage's aiming for where to throw; `Mine`, `stepMines`, `triggerMine` in `sim/trailer.ts` for the mine itself |
| Scuttling and ammo-car blasts | `blast` and `hullBlast` in `sim/trailer.ts`; the bomb truck's strobe; `burnWreck` in `sim/fire.ts` |
| Too big to crush, heavy ram | The siege tank's ram rule and `resolveBehemothCollisions` in `sim/collision.ts` |
| Escorts and hovercraft-only waves | `sim/ai/raider.ts` unchanged; filter the wave mix in `sim/encounter.ts` (see `mobileMix` in `sim/spawner.ts`) |
| Bridges falling, vehicles lost with a span | The existing `bridge` span rules in `content/terrain.ts` and `sim/hazards.ts` |
| Rail painting | `railRows` and `paintColumn` in `sim/terrain.ts` (today's cosmetic rails); rivers currently paint over rails, so the bridge is new |
| Map node, intel, save | `sim/sectorMap.ts`, `scenes/MapScene.ts`, `render/mapArt.ts`; check `save/runSave.ts` for stored mode ids (bump the save version if needed) |

**Tuning** goes in `tuning.ts` as one `TRAIN` block (pace shares, easing, start gap, fuse, ripple, coast, derail brake, wreck scatter, ram numbers, extraction pull-in) and `TERRAIN_GEN.railLine` (mean row share, knot spacing, wander, slope, forced rivers). Per-car numbers live in `trainCars.ts`.

**Practice URLs** (add to `src/config.ts`): `?mode=intercept` (exists as a parameter; add the value), `?train=engine,gun,ammo,box,…` to force a layout front to back, `?terrain&mode=intercept` to preview the line.

**Sim rules to respect:** nothing in `sim/train.ts` may assume a screen direction; all randomness (layout, wreck scatter) comes from seeded streams of its own so existing battles' seeds are unchanged; "in frame" uses the sim's frame (`sim/frame.ts`), not the renderer.

## T15. Build order

Seven steps, each a session that ends playable and tested. Stop after each for the user's playtest (add it to the *Playtest queue* in TODO.md, and move the finished step to FEATURES.md).

**Reworked (Nov 24, `d8edcca`)** at the user's direction: a longer train, the pace, wrecks and pileups in place of hulks and cutting loose, four new cars and a budget of its own, the service road; see the status note at the top, and FEATURES.md §9 "Armored train rework". Its tests are in `tests/sim/train.test.ts` and `tests/sim/trainCars.test.ts`.

**Done (Nov 24, `2bb609d`): steps 1, 2, 5, and 7.** Of step 2, the train strip and the objective row's place were split as planned. Of step 7, there are banners and two radio and alarm cues but no train sounds, and no bot balance pass. **Done (Nov 24, `ee45bf9`): steps 3, 4, and 6**, as the sections above say (*As built*), with tests in `tests/sim/trainCars.test.ts`. **Still to do:** train sounds (wheels, whistle, couplings, the derailment, a deeper whistle for the railway gun) and a theme, an autopilot balance pass (the autopilot still plows up the track, §T18 Q11), and the merge (§T17).

1. **The line.** `railLine`, the `track` and `railBridge` materials, the railbed and bridge guarantees, placeholder tile art, the terrain preview. *Tests:* over 50 seeds × every biome × every approach, the track is unbroken from the first column to the last; slope, edge clearance, and railbed rules hold; every river column on the line is a `railBridge`; at least one river exists; the lane's center is ≥ 5 rows from the track; other modes' terrain is byte-for-byte unchanged for existing seeds.
2. **A train that runs.** `trainCars.ts` (engine and boxcar only), `train.ts` movement and pace, placeholder sprites that turn with the line, `?mode=intercept`, vehicles as enemies that take damage and leave hulks, engines slowing the train, the objective (shares, stopped, got through), the objective row, the extraction pull-in. *Tests:* vehicles keep their spacing through curves; pace follows the table for each count of engines; a Behemoth at the overload floor still gains at cruise; a cruising bot reaches the front within 10% of the line's end; the three outcomes bank the right salvage.
3. **The train strip and collisions.** The HUD strip, heavy rams on cars, too-big-to-crush engines, the train running into the hull. *Tests:* each row of §T10.
4. **Armed cars.** Gun, missile, troop, mine flinger, ammo car; building a train from threat and doctrine; dormant off screen. *Tests:* the builder spends the budget front-heavy and deterministically; nothing fires from outside the frame; the ammo car's blast hits its neighbors.
5. **Cutting loose.** The §T8 rule, coasting, the fuse and ripple, no salvage for scuttled cars, chain breaks from ammo cars and rams, gaps. *Tests:* each case in §T8 (tail engine dies; middle engine dies first, then the tail; ammo car splits a section; a piece ahead of all running engines is pushed, not cut).
6. **The railway gun.** §T7 in full. *Tests:* silent inside 300; half damage to its own side; never damages track.
7. **Track, derailment, and the node.** Breaking track and bridges, the shield within one tile of the train, derailment and the pileup, halted pieces; then the map node (weights, one per sector, icon, intel), escorts and hovercraft-only waves, 0.3× posts, banners and sounds, a demo-bot pass for balance numbers. *Tests:* each rule in §T9; the map never draws two Intercepts in a sector; then merge the spec (§T17).

## T16. Numbers in one place

All provisional.

| Group | Values |
|---|---|
| Line (`TERRAIN_GEN.railLine`) | 2.5× battle length (12500); mean row 27% across; knots every 24 columns; wander ±2 rows; ≥ 3 rows from an edge; level 8 columns either side of a river; a step crossed over 3 columns; rock ≥ 2 rows off; second track 2 rows off on the narrow side, gravel between; lane ≥ 7 rows away; service road 5 rows wide (the lane), cleared, forded; rivers forced near 35% and 70%; station 24 columns from column 4 |
| Tiles | `railBridge` 300 HP, no weight limit, 3 tiles wide; track and ballast break at the cratering threshold (only the train's own track cuts the line); shield radius 1 tile round any vehicle |
| Train (`TRAIN`, `TRAIN_CARS`, `TRAIN_LAYOUT`) | Starts at rest, start gap 200; engine 52 × 22 (radius 15), car 38 × 18 (radius 13), coupling 4; sections 4 / 5 / 5, cars per section 6 / 6 / 7 |
| Pace | 0.75 × present **top speed** × (0.78 + 0.22 × running ÷ total); eases at 8 units/s²; brakes to a stop at 10 units/s² |
| Cars | HP, cost, salvage per §T6; troop rockets range 110; mine every 6 s, 3 s lead, armed after 0.5 s, 5 live; ammo car blast 60 / 90 |
| New cars (as built) | Twin gun: 2 × fortress gun, 190 HP, cost 3.5. Autocannon: 4 × 2.5 every 2.6 s, range 220 (max 230), cost 1.5. Howitzer: zone 26, flight 2.6 s, 2 × 14 (blast 14), every 8 s, range 90–330, cost 2.5. Rocket: 6 × 4 (blast 5) every 6 s, spread 0.1, range 250, cost 2 |
| Budget | 8 / 12 / 16 by strength + 1.15 × the node's threat; split by weights 1.5 (lead) to 0.75 (tail); ammo cars 2 / 3 / 3, not charged |
| Railway gun | Every 11 s; zone radius 40; 3.5 s flight; 45 damage, half at the edge, a quarter to deck mounts; half to its own side; minimum range 300; first shell at 4 s; magazine blast 70 / 100 |
| Wrecks and pileups (`TRAIN.derail`) | −6 units/s per vehicle that piles in; the rest stops under 10 units/s (seven vehicles from full pace); each rides 40% of its length up into the last; wrecks 10–34 units off the line, alternate sides, up to 75° turned; a blast 34 / 28 as each lands; 60% cook off 1–5 s later (30 / 22, with fire); wrecks burn 16 s; half salvage; none in a river |
| Leaks (`TRAIN.leak`, `OIL`) | Plasma 25% of wrecks (an engine 60%), else oil 45%; 2–4 spots, one every 0.4–1.4 s, 14–44 units from the wreck; plasma pool radius 11, 9 s, 6 a second; oil slick radius 9–15, soaks away in 45 s, burns 9 s once lit |
| Attack trains (`TRAIN.raid`, `MODES.*.train.raids`) | Engine + 2–3 armed cars; pace 1.12 × present top speed; start 40 behind the frame, gone 260 ahead of it. Intercept: second track, first at 45 s, then every 50–70 s, 35% with a caboose. Gauntlet: either track, first at 6 s, then every 13–19 s, 7 / 9 / 11 of them, 40% with a caboose |
| Crossovers (`TRAIN.crossovers`, `railLine.crossover`) | At 20% and 53% of the line; 18 columns across; the middle half underground (8 columns); portals 2 columns deep; no river within 33 columns |
| Scuttling (`TRAIN.scuttle`) | Fuse 3 s; ripple 0.25 s a car, tail forward; blast 40 / 50; no salvage |
| Collisions | Train into hull (ahead of its nose): 60 to the arc (or the trailer wrecked instead), 15 treads; 90 to the train's front vehicle; train speed −30%, easing back; hull shoved at 80/s until 8 clear; 2 s between strikes. Hull held at a wreck's face 2 s: it grinds through |
| Armed cars (as built) | Gun car: fortress gun, range 270. Missile car: launcher missiles in pairs, range 300. Troop car: tread rockets ×2, opens at 110, 2 squads. Mine flinger: every 6 s (retry 0.5), 3 s lead, 1.2 s flight, 0.5 s lying, 5 live, range 260 |
| Railway gun (as built) | 68 × 20, radius 18, 320 HP, ×0.8 all round, ram 60; range 300–1200; tile damage 200 |
| Forces | Escorts 2 / 3 / 3; waves hovercraft only; posts 0.3× |
| Objective | +90 bonus, an equal share per engine destroyed or stranded; extraction pulled in to 600 ahead once the train is stopped or through |
| Map | Mode weights Assault 2, Breach 1, Chase 1, Intercept 0.6; one per sector; never the opening battle |

## T17. Merging into SPEC.md (when signed off)

- **§7.3 Armored trains:** replace with §T4–§T10 (drop "may stop, and can reverse", "driving along rails damages them", and side-ramming a car off the rails). §4.2's "the Behemoth cruises at its own pace" needs a line: an Intercept is fought at a surge.
- **§4.4 Battle modes:** add the Intercept row and its implemented paragraph (§T1, §T5, §T12).
- **§3.1 The map:** mode weights and the one-per-sector rule (§T2).
- **§4.5 / §4.6 Terrain:** `track`, `railBridge`, the railbed (§T3, §T9).
- **§7 roster:** the armored train row; **§13.1:** car types built.
- **§15:** a decisions row "Armored train (M4)". **§16:** whatever is still open from §T18. **§17:** the ideas in §T19.
- **README.md:** a line if the public summary lists modes.

## T18. Open questions

1. ~~**Pace (§T5)**~~: *user, Nov 24:* "let's try it that way for now": the train paces the Behemoth. Then, after the first build: "it should not be so slow, the player should have to push their throttle to the max to make progress": it now paces the Behemoth's **top speed** (Q15).
2. ~~**"Detached and detonated" (§T8)**~~: *user, Nov 24:* the crew does it.
3. ~~**Who can cut the track (§T9)**~~: *user, Nov 24:* "treat it as hardened track": the treads never cut it; cratering blasts and bridge demolition do.
4. ~~**Derailment ends the fight (§T9)**~~: *user, Nov 24:* fine for now; the length of the train and how easily it's outrun and derailed are to be tested. With the rework the train is much harder to outrun, and destroying the lead engine now does the same (Q16).
5. **Railway gun and its own train (§T7).** *Built as proposed (Nov 24), to judge in play.* It fires regardless and hurts its own cars at half damage. The alternative is a no-fire strip beside the train. Also: is "silent once it's on screen" right, or should it keep firing until destroyed?
6. ~~**Scuttled cars pay nothing (§T8).**~~ Replaced by Q16: with the rework the choice is where to break the train.
7. ~~**Plowing through cars (§T10).**~~ *Rework:* a car plowed wrecks and breaks the train like any car destroyed, and at a surge it costs most of a stock hull's treads. To judge in play.
8. **Frequency and stakes (§T2).** One per sector at most, in any biome, at weight 0.6: about right? Should an Intercept always count as a *strong* node?
9. ~~**Length (§T3, §T4).**~~ *user, Nov 24:* longer. Now 29 vehicles on a 12500-unit line (Q18).
10. **Which later car first (§T19)?** Flak, hangar, or observation car.
11. ~~**Plowing the train (§T10, and Q7).**~~ The autopilot now keeps off the rails (it was plowing all 15 vehicles in 35 s), and the train outruns a cruise, so a hull on the track behind it closes slowly.
12. **How tough the train is.** Engines have 260 HP at ×0.8 from every side, boxcars 90. Unchanged by the rework, though every kill is now worth more (it takes what's behind it too). Tougher cars, or is that the point?
13. **The start (§T4).** With the train pulling out from rest 200 units ahead, a surging hull is on its tail as it reaches its pace. Right, or should the train get a head start?
14. ~~**A cruising hull never catches the lead engine** (§T5).~~ Now by design.

Raised by the rework (Nov 24), for the user to judge in play:

15. **The pace (§T5).** 0.75 of top speed with every engine (0.78 before the cars got longer, Q22), down to 0.56 on the last. At a surge the autopilot gains about a car every 5 s at first. Is that "pushing the throttle to the max to make progress", or should it be tighter still (0.82: a car every 10 s) or looser? And should the last engine still outrun a cruise (it does now, barely)?
16. **How much a kill takes (§T8).** I read "split the train and cause a wreck" as: the destroyed car wrecks, and everything behind it piles in or is stranded and scuttled, engines included. So one boxcar destroyed behind the lead engine strands three engines, and the lead engine destroyed stops the train. The gentler reading: a rear half with a running engine brakes and stops short (no pile), or carries on as a second train. Which did you mean?
17. **How many guns (§T6).** About 7 armed cars of 24 at a run's start, 11–12 at its end, plus the four new kinds. With half to nearly all of the cars armed, a stock Behemoth under the autopilot was shot immobile in about 100 s in 11 runs of 12. As built, at threat 7 it stops the train in 5 runs of 8 (about 2 minutes, 16–52% of its treads left) and is immobilized in the other 3 with 2–3 engines out of the fight; at threat 10, 5 of 8. Upgraded hulls and a player who picks targets will do better. More guns and weaker ones, or fewer and harder?
18. **The line's length (§T3).** 12500 units is about four minutes if the train isn't touched; the autopilot's wins take about two. Once the train is stopped or gone the extraction line comes in.
19. **The service road (§T3).** The lane is cleared the whole way and fords every river, 112 units from the track. Without it, plowing scenery at a surge wore out the treads before the end. It makes the Intercept's ground plainer than other battles'. Keep, or should the cleared ground be right beside the train (fast but under the troop cars' rockets), with the lane left rough?
20. **Scuttling (§T8).** Kept from your first brief, moved to what's stranded behind a wreck (there's no dead section to cut loose any more). A hull at speed never sees most of it. Keep, shorten the fuse so it's seen, or drop it?
21. **New cars (§T6).** Twin gun, autocannon, howitzer, and rocket cars, all from existing weapon parts. A flame car and a tesla car would need enemy versions of those weapons; the held-back cars are in §T19. Which next?

Raised by the rework's second pass (Nov 24):

22. **Longer cars cost balance (§T4, §T5).** Longer cars make a longer train and a longer chase under fire. At 40 × 18 the autopilot's wins fell from 24 of 32 to 16, so the cars are 38 × 18 (you said "slightly") and the pace is eased from 0.78 to 0.75 of top speed; that measures 22 of 32. Would you rather keep the pace and have fewer cars, or longer cars still and a slower train?
23. **Which track the train runs on (§T3).** The one nearer the lane, so the fight is at the same distance as before and wrecks are thrown across the second track. The other choice puts an empty track between the Behemoth and the train. Nothing runs on the second track; a second train, or the train switching tracks, would be new work.
24. **Train sounds (§T13).** Wheels, an engine's exhaust beat, a whistle, derailing, and brakes, all synthesized. I can't hear them: the levels and the whistle's chord are set by reasoning, not by ear, and want your ears most of all.
Raised by the third pass (Nov 24), all in §T20:

25. **Which way attack trains come.** From behind, overtaking: they run the same way as everything else, faster than the hull can go, so each is a drive-by of 15–30 s. Oncoming trains on the other track (a closing speed of 100+, a few seconds each) would be a different, sharper thing. Which did you picture, or both?
26. **The tunnel.** A portal at each end, ordinary land between, the road over it, the train out of reach for about 4 s. You also offered a bridge over the road, or a span straight across: a bridge would hide the *hull* from the train instead, and the crossing can't be squarer than this while a train's vehicles are spaced by how far along the field they are (at 45° they'd visibly stretch apart). Enough, or do you want the bridge too?
27. **The second mode's name and shape.** "Gauntlet": 7 / 9 / 11 attack trains, one every 13–19 s on either track, each engine a target, the extraction line pulled in after the last. They can't be chased (they're faster than a surge), so it's a shooting gallery with wrecks: is that the mode you meant, or should some be slow enough to run down?
28. **The shield car.** It stops everything that flies flat (bullets, shells, missiles, beams, railgun slugs), not lobbed shells, blasts, flame, or arcs, and its arm turns at 40°/s, so it can be flanked. I read "non-ballistic" as "not lobbed". Should missiles fly over it? Should the plate have hit points?
29. ~~**Wrecks landing on the other track** stop the trains that come after (only where you can see it). So a raider can derail the armored train, and the armored train's wrecks can kill raiders. Fun, or too easy a win?~~ *Answered (user, Nov 24, §T21):* engines plow through wrecks that weren't part of their own train.
30. **Leaks.** A quarter of wrecks leak plasma (engines more), most of the rest oil. Unlit oil does nothing to the hull: should it be slick?
31. **Balance after all this** (the autopilot, a stock hull, 16 seeds each): Intercept stops the train and gets out in 13 of 16 at threat 7 and 9 of 16 at threat 10, the same total as before the pass (the faster end is offset by piles that take seven cars and burn). Gauntlet: out alive in 15 of 16 and 8 of 16, with about 5 of 7 raiders destroyed.

Raised by the sounds' second pass (Nov 24, §T13):

32. **More whistles, and how many is too many.** You asked for more train sounds, whistles, and a bit louder rails. My calls: the wheels are up about 3 dB and the whistle about 2 dB with them (so the louder wheels don't bury it); the armored train whistles every 16–30 s (it was 24–44) with five signals in place of one; attack trains have a shriller whistle of their own and sound it every 8–14 s as they pass; a train whistles going into a tunnel and shrieks short blasts when it hits you. Is that the right amount, and do the two whistles tell the trains apart? Left out: a flange squeal on the bends (the line steps tile by tile, so it would chirp), a bell, the railway gun's traverse.

Raised by the fourth pass (Nov 24, §T21):

33. ~~**What an engine's flamethrowers are for.**~~ *Answered (user, Nov 24: "you need to increase the flamethrower range for the engine by 50%"):* they reach 112.5 units now (they were 75), which reaches a hull in the lane wherever the lane runs within about 130 of the track. Still open: the flame doesn't touch the trailer.
34. ~~**Which cars carry troops on the roof.**~~ *Answered (user, Nov 24: "troops on any cars (that don't have guns or other things that would block them)", and "the troops on top of the train car should have cover"):* the guard car is gone; boxcars, troop cars, and ammo cars carry squads by chance, each in a sandbagged nest. My numbers (odds 30% / 50% / 25%, cover 0.5) want your eye.
35. ~~**The ambush car's tell.**~~ *Answered (user, Nov 24: "it's ok to be a surprise"):* none.
36. ~~**An engine against the hull.**~~ *Answered (user, Nov 24: "this should hurt you bad"):* the blast is 200 now (it was 120) and the treads take 20 more. One strike on a fresh hull strips the struck arc, takes 35 off the treads, and puts about 60 into one component inside (measured on ten seeds: the reactor down to a third, or the treads to 5%, or the magazine or fire control gone). A second is usually the end.
37. **Plowing costs the engine almost nothing** (a quarter of its speed for a moment, 15 of its 260 hit points, never its last). Only an engine at the head of a train under way plows; standing cars and its own train's wreckage still stop it.
38. **Balance after the fourth pass** *(user, Nov 24: "we'll balance with playtesting")*. For the record, the autopilot on a stock hull, 16 seeds each, extracted with the objective where there is one: Intercept 12 of 16 at threat 7 and 6 of 16 at threat 10 (13 and 8 before the pass); Gauntlet extractions 6 of 16 and 3 of 16 (13 and 9 before). Riders aren't bought from the train's budget, so they're firepower on top of it; the flamethrowers now reach the lane; and trains no longer die on each other's wrecks. The autopilot doesn't keep away from engines, so it's a pessimistic player.

## T19. Ideas held back

Not in this build. They move to SPEC §17 at the merge.

- **Observation car.** Spots for the railway gun. Destroy it and the gun aims at where the Behemoth *is*, not where it will be, so cruising clears every shell. A mid-train target with an immediate payoff.
- **Hangar car.** Launches the hovercraft and replaces losses until it's destroyed, so the escorts belong to the train.
- **Flak car.** Shoots down the Behemoth's missiles and drones near the train. Needs enemy point defense, which doesn't exist yet.
- **Shield car; flatbed with a tank** that rolls off when the train halts (both from the old §7.3 table).
- **Pilot car.** A flatcar of rails pushed ahead of the lead engine, as real armored trains did: it takes the first break in the track, and the train crawls across a patch at a third of its speed. A counter to Q4 if derailment proves too easy.
- **Signal boxes and sidings.** A set of points ahead of the train with a signal box beside it: destroy the box and the train is switched into a dead-end siding and hits the buffers.
- **Stations.** A fortified platform the line runs through: a short gauntlet of fixed guns on the Behemoth's side.
- **Tunnels.** In a mountain pass the train disappears into a tunnel for a stretch (a breather from its guns, and it comes out with repairs made or a new escort).
- **A train sprint.** The train surges for a few seconds when an engine is under fire, like the convoy's alarm.
- **Night:** a searchlight car that reveals the Behemoth to everything; a smoke car that screens the train.
- **Boarders** from troop cars when the hull is alongside (ties to SPEC §17 idea 1).
- **A rail Directive:** the enemy is moving a superweapon by rail; every sector's objective is a train, and the last one is the longest.
- **A second track:** a second, shorter train on a parallel line, or one coming the other way.

## T20. The third pass: crossovers, attack trains, the Gauntlet, and bigger wrecks

*(user, Nov 24: "provide a couple of crossovers, where the train go briefly underground or under a bridge and switches to the other side of the map. on the secondary rail, have small two or three car attack trains that move faster come by every minute or so. the train wrecks are not massive enough, the cars need to pile up, explode, smoke, fire, the whole works. keep the end speed of the train a little faster, as engines are lost, i fond the end to be too easy. we also don't need the train indicator on the left, hide it for now, i may change my mind, don't remove it. let's also add another mode, where instead of one big train, it is many of the small ones we have on the secondary rail line. they would need to collide and explode with any derailed trains on the track visible to the player. some of the small trains should have heavily armed and armored cabooses. also add a car with a cargo loader arm that deploys a shield it can use to block non balistic shots from the behemoth. enhance the tiles for roads and train tracks where it swerves one space to the side to make them look more continuous instead of broken." Then: "the crossover needs to prevent collisions with the tank, that's why i said underground or a bridge over the road that the tank passes under. maybe even a horizontal span for a bit"; "make the tunnel more obvious and the land over not just big concrete, it can be normal terrain"; "some cars should leak plasma spots onto the ground when they are wrecked"; "like oil spills, maybe that too, and flamable".)* **Built.** Everything below is as built; how each was done is my call unless it's in the user's words above.

**Crossovers.** Twice in a battle (at 20% and 53% of the line) the line crosses to the other side of the field, straight across over 18 columns, and the lane crosses it the other way: after a crossover the train is on the Behemoth's other flank, so the other side's armor takes the fire. For the middle half of the way the line is **underground**: a concrete portal over the tracks at each end (two columns deep, a dark mouth and a hazard-striped lintel over each track), and between them the land is whatever the battlefield has there, with the lane's road running over it. Vehicles in the tunnel can't be seen, hit, locked on to, burnt, or collided with, and don't fire. A banner says the train is in a tunnel and will come out on the other side. No track lies in the open within three rows of the road anywhere on the crossing, and no river comes within 33 columns of one. The second track passes under the first in the tunnel, so it's on the line's far side from the lane both before and after.

**Attack trains.** Short trains with a pace of their own: **an engine and two or three armed cars**, drawn by the doctrine's odds, 35–40% of them with an armored caboose in the last car's place. They run at **1.12 × the Behemoth's present top speed**, so they come up from behind the frame (a whistle and a banner announce each), pass the hull over 15–30 s, and run on ahead. In an Intercept one comes up the **second track** 45 s in and then every 50–70 s while the armored train runs; they aren't targets. Each is its own piece of the train model: it wrecks, piles up, is abandoned and scuttled like any other.

**Wrecks on the track.** A train runs into **any wreck lying across its track where the Behemoth can see it** (inside the frame), whoever left it there, and piles up on it. The armored train's kills are thrown across the second track, so they wreck the attack trains that come after; an attack train's pile can land on the armored train's track and derail it. Each track is cut on its own (a crater on one doesn't stop the other).

**The Gauntlet** (a fifth battle mode, `gauntlet`; map weight 0.6, one a sector, bonus 80, 1.6× the usual length, posts ×0.5): the same double line with its crossovers and service road, and **no armored train**. Attack trains come up either track, the first 6 s in and then one every 13–19 s, **7 / 9 / 11** of them by strength. **Each one's engine is a target** ("raiders" on the HUD): destroyed, it pays its share; one that gets 260 units ahead of the frame has got away. Once the last has been destroyed or has got away, the extraction line comes in to 600 ahead.

**Two new cars.**

| Car | What it does | Numbers |
|---|---|---|
| **Shield car** (`S`) | A loader's arm holding an armor plate, 46 long, 22 out from the car. It swings toward the Behemoth at 40°/s once that's within 340, so the plate stands between the hull and the car, and stows along the car otherwise. **The plate stops the Behemoth's direct fire**: bullets, shells, and missiles that aren't lobbed, beams, and railgun slugs (a shell bursts on it). Lobbed shells go over; blasts, flame, and arcs reach round it; a shot from behind the plate goes home. Unarmed. | 140 HP, cost 2, salvage 18 |
| **Armored caboose** (`Z`) | An attack train's tail: plate that takes ×0.6 from every side, a rocket rack amidships, a gun turret forward, an autocannon aft. Never drawn for an armored train. | 240 HP, salvage 40, 40 × 20 |

**Bigger wrecks** (§T8's pile, replaced): each vehicle that piles in takes **6** units/s off the rest (it was 12), so **seven** leave the rails from full pace, over about five seconds. Each **rides 40% of its length up into the last** and is thrown to the other side from it, 10–34 units off the line and turned up to 75°: an accordion, not a row. Each **goes up as it lands** (a blast 34 across, 28 damage), **burns** where it lies for 16 s with the ground round it (black smoke, flame, embers), and with odds of 60% **cooks off** 1–5 s later (a second blast that throws fire about). The fire and the blasts finish off what's still on the rails nearby; a car that dies that way pays half, as one in the pile does.

**Leaks.** A wreck may leak for a few seconds: **plasma** from its power cells (25% of wrecks, 60% of engines), or else **oil** (45% of the rest), 2–4 spots of it, each landing 14–44 units from the wreck. A plasma spot is a pool like the plasma thrower's (it burns units, tiles, and the Behemoth's treads for 9 s). An oil spot is a slick that does nothing until fire or plasma touches it; then the whole slick burns for 9 s. Unlit, it soaks away in 45 s.

**Bends.** Where a track, the gravel between the tracks, or the lane's one-tile road steps a row sideways, it's drawn as one curve running from tile to tile (an overlay half a tile wider than the tile each side), not two kinked tiles.

## T21. The fourth pass: close quarters

*(user, Nov 24: "flamethrowers on train engines, infantry on top of train cars, a surprise car where the side shoots off and it's full of guns for a surprise attack, engines should plow through wrecks instead of blowing up unless part of the train in the first place (the long one vs the small attack trains). collision of engine with behemoth causes large explosion.")* Everything here is built (version 0.5.0), with the user's answers the same day worked in (§T18 Q33–Q36, Q38); Q37 is still mine.

**Engine flamethrowers.** Every engine (the armored train's and the attack trains') has **two flame projectors**, one behind the plow and one on the cab roof, each turning all the way round. They reach **112.5 units** (75 at first; the user asked for half again); a projector opens up on a hull within 105 after 0.6 s of aim, and gives a **two-second gout** (twenty licks) then three seconds while the pressure builds. A lick that lands on the hull **scorches the armor arc it lands on** (0.8 each: both projectors on target are 16 a second) and what gets through goes inside like any hit, but with no blow to the hull. The stream is stopped by the hull, lights whatever burns in its path (woods, hedges, buildings), and leaves no fuel burning on the ground (the train would roll its own cars through it). It does nothing to its own side. The track is 90–150 units from the lane, so **an engine reaches a hull in the lane on the nearer stretches**; keeping to the far side of the lane, or off it, keeps clear.

**Troops on the roof.** Any car with nothing on its roof in their way may carry infantry up there: **boxcars** (30% of them, two squads), **troop cars** (50%, two squads, on top of the two inside), and **ammo cars** (25%, one squad). Cars with a turret, an arm, a hopper, or a mask never do. Who rides where is drawn when the train is made up (its own stream for each train, so it never changes what the train is made of). They're ordinary squads (the same rockets, the same 14 hit points), carried by the car: they shoot as the train runs, can be shot, burnt, or blasted off it without harming the car, and go underground with it in a tunnel. **Each squad is in a sandbagged nest: it has cover, half of what's shot at it** (as a wood gives 0.3 and a building 0.6; blasts ignore cover, as they do on the ground). **When the car is wrecked they're lost with it; when it's abandoned they climb down** beside it and fight on foot, with whatever cover the ground gives. They cost the alert clock nothing, and nothing from the train's budget: they're on top of it.

**Ambush cars** (`Q`). **A boxcar to look at.** When the Behemoth comes within **170** of it on screen, or the moment anything damages it, **its side panels are blown off** toward the hull and it's a gun deck: a turret amidships with the gun car's gun, and an autocannon mount at each end. Its guns can lay 0.7 s after the panels go, each with its own aim telegraph after that. Off screen it keeps its mask whatever hits it. 150 HP, cost 4, salvage 26. A banner calls it ("Ambush: a boxcar drops its sides").

Its odds by doctrine (combined / armored fist / long guns / entrenched / raiders): 0.6 / 0.8 / 0.4 / 0.6 / 1.2. Attack trains draw it by the same odds. It has no tell (user: "it's ok to be a surprise").

**Engines plow through wrecks.** A train under way with **an engine at its head** that meets a wreck lying across its track, in view, **plows through it if the wreck was no part of its own train** (the armored train is one train; each attack train is its own). The wreck is swept off the rails and gone, the train loses a quarter of its speed for a moment, and the engine takes 15 damage (never its last 1). So the armored train's kills, thrown across the second track, no longer wreck the attack trains that come after, an attack train's wreck no longer derails the armored train, and in a Gauntlet one train's wreck no longer kills the next. What still piles up: everything behind a wreck in its own train (that's what a kill does, §T8), a train with a car at its head, a break in the line, and a train that runs into cars still standing on the rails.

**An engine against the hull.** When a train's engine runs into the Behemoth on the track ahead of it (§T10 "the train strikes"), the hull takes the ram as before (60 on the struck arc, or the trailer wrecked; 15 on the treads) and **the engine blows up against it**: a blast 90 across of 200 damage, with fire, which the hull and everything near share, and 20 more on the treads. It's meant to hurt badly (user: "this should hurt you bad"): on a fresh hull one strike strips the struck arc, takes a third of the treads, and puts about 60 into a component inside. The engine is destroyed (the Behemoth's kill), a wreck where it stood, and what it pulled piles into that. A car at a train's head strikes as before. An engine bearing down on a hull in its track, within 220 units, **shrieks the danger signal** first.

**Seeing them all.** `?seed=3&mode=intercept&train=all` is one of every car behind an engine (the railway gun, then every car in the table's order, the ambush car and the caboose included; some of its boxcars, troop cars, and ammo cars will have squads on the roof).

