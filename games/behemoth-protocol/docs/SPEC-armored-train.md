# Armored Train Encounter (Intercept) — Draft Spec

> **Status:** draft, built (Nov 24, 2026) and **reworked the same day at the user's direction** (the rework is `d8edcca`), awaiting the user's playtest. Not yet part of [SPEC.md](SPEC.md). When the user signs it off it merges into SPEC.md (§T17) and this file is deleted.
> **Built** (see FEATURES.md §3 "Rail line", §4 "Meeting the armored train", §9 "Armored train" and the entries after it, §12 "Train strip"): every step of §T15 (`2bb609d`, `ee45bf9`), then the rework (§9 "Armored train rework"). **Still to do:** train sounds and a theme, more balance passes, and the merge (§T15 after step 7).
> **The rework** *(user, Nov 24, after seeing the first build: "the train should be longer, have more guns on it and other offensive cars, when cars are destroyed they should split the train and cause a wreck. and it should not be so slow, the player should have to push their throttle to the max to make progress against the train")*. It changed §T3 (a longer line, a service road), §T4 (a longer train), §T5 (the pace), §T6 (four new cars, a bigger budget), §T8 (wrecks and pileups replace hulks and cutting loose), and parts of §T9, §T10, and §T12. How each was done is my call unless marked *(user)*; §T18 Q15–Q21 are what I'd like the user to judge.
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

**Shape.** One continuous track from the first column of the battle to the last, generated from the battle seed on its own RNG stream.

- It runs off-center: its mean row is 27% of the way across the field from one side (which side is seeded). That leaves a **wide side** (the Behemoth's side at the start) and a **narrow side**.
- It wanders between knots 24 columns apart, at most 2 rows either side of its mean row (knots sit on tile centers, so the track never jogs back and forth), and never closer than 3 rows to a field edge. It steps one row at a time, and a train crosses a step over 3 columns.
- It runs **level across every river** (8 columns either side of the river's center), so its bridge is straight.
- The battle's guaranteed way forward (the lane, SPEC §4.2) runs on the wide side, its center at least **7 rows** from the track (112 units: just outside a troop car's rockets). The Behemoth starts in the lane.
- **The service road** *(rework, my call)*: the whole lane (5 rows) is cleared of obstacles the way the railbed is, deep water in it is a ford, and a road runs down its center. The chase is at full speed the whole way, and at that speed scenery tears the treads up: measured before the road, the autopilot lost every tread to buildings, tank traps, and deep water in about 6000 units of surging. Off the road the ground is as rough as any battle's. Fords still hold the hull to a cruise, so every river costs ground against the train.
- An Intercept battle is **2.5× the usual length** (12500 units, about four minutes at the train's full pace; it was 1.4× before the train got faster).
- **The station** *(user: the train starts by pulling out of a station, ahead of the Behemoth)*: the line's first 24 columns are level, with a paved platform either side of the track and a station building two rows deep behind it on the narrow side.

**Tiles.** Two new terrain materials (the cosmetic `rail` material stays as it is for other battles):

| Material | What it is | Rules |
|---|---|---|
| `track` | The line's rails: **hardened track** on concrete sleepers *(user)*. One tile wide. | Open ground to everything (no slowdown, no cover, no obstacle). The treads don't tear it. Destroyed only as described in §T9; breaks to `crater`. |
| `railBridge` | The line over a river: a girder span 3 tiles wide with the rails down its middle. | Like the girder `bridge`, but **no weight limit** and 300 HP. The whole span falls when it's shot out. The Behemoth may drive over it. |

**What the generator guarantees along the line:**

- A **railbed**: the track tile and one tile either side are open ground (ballast); and the **service road** down the lane (above). No forest, building, wall, tank trap, fuel tank, minefield, drift, or dune is left there (roads, craters, crops, and ice stay). Structures cut by the railbed stand as smaller buildings either side (the existing rule for cut footprints).
- Rock and cliffs never come within two rows of the track; a fortified line that crosses the track has a gap there.
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

**Sizes.** Engine 40 × 24 units (hit radius 15); car 34 × 22 (hit radius 13); a 4-unit coupling gap between vehicles. *Changed while building:* every unit in the sim is hit as a circle, so a 48-unit car would have had ends no shot could touch. The railway gun is 60 × 24 with one hit circle of radius 18 (its ends are a little harder to hit than its middle). Every car but the engine and the railway gun is 34 × 22, radius 13.

**Movement.** The train's position is a single distance along the field (the line's slope is shallow, so distance along x stands in for distance along the track). Each vehicle sits at its own offset behind the front, on the line, facing along it. There is no physics between cars: position and heading come from the line's shape alone, so the train bends through curves by construction.

**Start.** The train stands **at rest** in its station as the battle opens, its tail 200 units ahead of the Behemoth's nose, and pulls out (it reaches its pace in about 6 s). *(user's idea.)* A surging Behemoth is on its tail as it gets up to speed.

**Each vehicle is its own target** with its own integrity, armor, weapons, and salvage, like any enemy unit. A destroyed vehicle **wrecks where it is and parts the train** (§T8). *(user, Nov 24; before the rework it stayed in the chain as a burnt-out hulk.)*

**Dormant off screen.** A vehicle's weapons fire only while the vehicle is inside the camera frame (the fairness rule every unit follows). Vehicles outside the frame can still be damaged (a railgun slug along the train, a blast). The railway gun is the one exception (§T7).

## T5. Pace: how fast the train runs

*(user, Nov 24: "it should not be so slow, the player should have to push their throttle to the max to make progress against the train". Before: "slightly slower than the Behemoth".)*

**The train paces the Behemoth's top speed.** Its target speed is a fixed share of the **Behemoth's present top speed** (the surge its treads and load give it right now, before terrain), and it eases toward that target at no more than 8 units/s². *(Pacing the Behemoth rather than running at a fixed speed is the user's Nov 24 answer to Q1; pacing its top speed rather than its cruise is the rework.)*

| Engines running (of 4) | Train's target speed | Stock Class II (cruise 36, top 64) |
|---|---|---|
| 4 | 0.78 × the Behemoth's present top speed | 50 |
| 3 | 0.71 × | 45 |
| 2 | 0.64 × | 41 |
| 1 | 0.57 × | 36.5 |
| None | 0: it brakes at 10 units/s² and is **stopped** | 0 |

General rule: `0.78 × (0.64 + 0.36 × running ÷ total)`. The floor keeps even the last engine's pace above the hull's cruise (cruise is 0.5625 of top on the Class II), so **a cruising Behemoth never gains**, whatever the train has lost.

- **Why 0.78 and not higher:** a hull at a full surge doesn't average its top speed. Measured with the autopilot on the service road, fords and steering bring a 64-unit surge down to about 56. Against a train at 50 that's a gain of about 6 units/s with every engine running (a car every 6 s), then 10, 14, and 19 as engines are lost. At a cruise the hull loses 4 to 17 units/s.
- **Why it paces the Behemoth:** every Behemoth speed (minimum, cruise, top) scales together with tread damage and overload, so the train stays the same *relative* speed whatever the build. A slow Behemoth sees the same fight in slow motion, and pays for it the way a slow Behemoth always does: more alert waves and more railway-gun shells before the end (SPEC §4.2 "the whole battlefield slows with you").
- **Tread damage mid-battle costs ground:** the hull slows at once, the train takes a moment to ease down.
- **An untouched train is barely overhauled:** at 6 units/s the hull needs about 220 s to climb 1350 units of gap and train, and the train is off the far end in about 245 s. The fight is won by kills on the way up, each of which slows the train or breaks it.
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

*As built* (`buildTrain` in `sim/train.ts`, `TRAIN_LAYOUT` and `TRAIN_DOCTRINE` in `content/trainCars.ts`):

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
- **Train strip** (new): a narrow column down one side of the battlefield, one pip per vehicle, front at the top. Each pip is colored by integrity (green, amber, red; an empty frame for a wreck), with a letter or glyph for its type and a heavier mark for engines. A bracket shows which vehicles are in the frame, a notch shows where the Behemoth is along the train, and abandoned cars flash until they blow. The train is longer than the screen, so this is how the player finds the engines. *As built* (`render/trainStrip.ts`): down the field's edge on the line's narrow side; letters `E R G D C H K M T F A B` (engine, railway gun, gun, twin gun, autocannon, howitzer, rocket, missile, troop, flinger, ammo, boxcar); engines framed in white, the railway gun in amber; a wreck is an empty frame, a vehicle gone a blank slot; abandoned cars flash until they blow. The longest train (41 vehicles) fits at 7 pixels a pip.
- **Edge arrows:** amber arrows point to engines that are off screen (the existing objective arrows).
- **Banners:** *Armored train ahead* (at the start, with the first shell), *Engine destroyed 25%*, *The train is cut in two / 9 cars pile into the wreck*, *2 engines stranded 75%*, *5 cars abandoned behind the wreck / Scuttling charges set: get clear*, *Track cut*, *Train derailed*, *Train stopped*, *The train got through*.
- **Railway gun:** the target zone drawn on the ground (ring and closing disc), an incoming whistle, a heavy burst, a crater.
- **Audio (placeholder synth):** wheel clatter whose tempo follows the train's speed, an engine chuff, an alarm when cars are abandoned, a coupling parting, a pileup's crash, the railway gun's distant boom then whistle. A train theme is in the music backlog (TODO "Themes for the other big enemies").
- **Art (placeholder, generated in code):** engine, ten car types, the railway gun, their burnt-out wrecks, the `track` and `railBridge` tiles. Cars turn with the line.

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
| Line (`TERRAIN_GEN.railLine`) | 2.5× battle length (12500); mean row 27% across; knots every 24 columns; wander ±2 rows; ≥ 3 rows from an edge; level 8 columns either side of a river; a step crossed over 3 columns; rock ≥ 2 rows off; lane ≥ 7 rows away; service road 5 rows wide (the lane), cleared, forded; rivers forced near 35% and 70%; station 24 columns from column 4 |
| Tiles | `railBridge` 300 HP, no weight limit, 3 tiles wide; track breaks at the cratering threshold; shield radius 1 tile round any vehicle |
| Train (`TRAIN`, `TRAIN_CARS`, `TRAIN_LAYOUT`) | Starts at rest, start gap 200; engine 40 × 24 (radius 15), car 34 × 22 (radius 13), coupling 4; sections 4 / 5 / 5, cars per section 6 / 6 / 7 |
| Pace | 0.78 × present **top speed** × (0.64 + 0.36 × running ÷ total); eases at 8 units/s²; brakes to a stop at 10 units/s² |
| Cars | HP, cost, salvage per §T6; troop rockets range 110; mine every 6 s, 3 s lead, armed after 0.5 s, 5 live; ammo car blast 60 / 90 |
| New cars (as built) | Twin gun: 2 × fortress gun, 190 HP, cost 3.5. Autocannon: 4 × 2.5 every 2.6 s, range 220 (max 230), cost 1.5. Howitzer: zone 26, flight 2.6 s, 2 × 14 (blast 14), every 8 s, range 90–330, cost 2.5. Rocket: 6 × 4 (blast 5) every 6 s, spread 0.1, range 250, cost 2 |
| Budget | 8 / 12 / 16 by strength + 1.15 × the node's threat; split by weights 1.5 (lead) to 0.75 (tail); ammo cars 2 / 3 / 3, not charged |
| Railway gun | Every 11 s; zone radius 40; 3.5 s flight; 45 damage, half at the edge, a quarter to deck mounts; half to its own side; minimum range 300; first shell at 4 s; magazine blast 70 / 100 |
| Wrecks and pileups (`TRAIN.derail`) | −12 units/s per vehicle that piles in; the rest stops under 10 units/s; wrecks 8–24 units off the line, up to 50° turned; half salvage; none in a river |
| Scuttling (`TRAIN.scuttle`) | Fuse 3 s; ripple 0.25 s a car, tail forward; blast 40 / 50; no salvage |
| Collisions | Train into hull (ahead of its nose): 60 to the arc (or the trailer wrecked instead), 15 treads; 90 to the train's front vehicle; train speed −30%, easing back; hull shoved at 80/s until 8 clear; 2 s between strikes. Hull held at a wreck's face 2 s: it grinds through |
| Armed cars (as built) | Gun car: fortress gun, range 270. Missile car: launcher missiles in pairs, range 300. Troop car: tread rockets ×2, opens at 110, 2 squads. Mine flinger: every 6 s (retry 0.5), 3 s lead, 1.2 s flight, 0.5 s lying, 5 live, range 260 |
| Railway gun (as built) | 60 × 24, radius 18, 320 HP, ×0.8 all round, ram 60; range 300–1200; tile damage 200 |
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

15. **The pace (§T5).** 0.78 of top speed with every engine, down to 0.57 on the last. At a surge the autopilot gains about a car every 6 s at first. Is that "pushing the throttle to the max to make progress", or should it be tighter still (0.82: a car every 10 s) or looser? And should the last engine still outrun a cruise (it does now, barely)?
16. **How much a kill takes (§T8).** I read "split the train and cause a wreck" as: the destroyed car wrecks, and everything behind it piles in or is stranded and scuttled, engines included. So one boxcar destroyed behind the lead engine strands three engines, and the lead engine destroyed stops the train. The gentler reading: a rear half with a running engine brakes and stops short (no pile), or carries on as a second train. Which did you mean?
17. **How many guns (§T6).** About 7 armed cars of 24 at a run's start, 11–12 at its end, plus the four new kinds. With half to nearly all of the cars armed, a stock Behemoth under the autopilot was shot immobile in about 100 s in 11 runs of 12. As built, at threat 7 it stops the train in 5 runs of 8 (about 2 minutes, 16–52% of its treads left) and is immobilized in the other 3 with 2–3 engines out of the fight; at threat 10, 5 of 8. Upgraded hulls and a player who picks targets will do better. More guns and weaker ones, or fewer and harder?
18. **The line's length (§T3).** 12500 units is about four minutes if the train isn't touched; the autopilot's wins take about two. Once the train is stopped or gone the extraction line comes in.
19. **The service road (§T3).** The lane is cleared the whole way and fords every river, 112 units from the track. Without it, plowing scenery at a surge wore out the treads before the end. It makes the Intercept's ground plainer than other battles'. Keep, or should the cleared ground be right beside the train (fast but under the troop cars' rockets), with the lane left rough?
20. **Scuttling (§T8).** Kept from your first brief, moved to what's stranded behind a wreck (there's no dead section to cut loose any more). A hull at speed never sees most of it. Keep, shorten the fuse so it's seen, or drop it?
21. **New cars (§T6).** Twin gun, autocannon, howitzer, and rocket cars, all from existing weapon parts. A flame car and a tesla car would need enemy versions of those weapons; the held-back cars are in §T19. Which next?

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
