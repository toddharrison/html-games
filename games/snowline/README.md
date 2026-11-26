# Snowline

A browser survival RPG about a teenager alone in a mountain valley.

## Premise
A small plane goes down in a remote mountain valley, and one teenager walks away from it. They have the clothes they're wearing, whatever is in their pockets, and one steel tool. Keep them alive until they are rescued: find water, find food, make fire, build a shelter, stay well.

Summer is ending. Week by week the snowline creeps down the mountain, and once it reaches the lake the valley can't be survived.

There is no magic, no monsters, and no levelling up. The survivor gets better at surviving because they, and you, learn how the valley works.

## Game
- **Knowledge is the progression.** New abilities come from discoveries and practice, not from levels or loot. Strike steel on the right stone and you learn where sparks come from. Eat the wrong berries and you learn which ones they were.
- **Every valley has its own rules.** Which berries are safe, which stone throws sparks, which water is foul, and what makes the cougar back off are dealt fresh from each seed. What you learned in the last valley won't save you in this one; knowing how to find out will. Taste a little, watch what the jays eat, and fill in your notes.
- **A body to look after.** Hydration, nutrition, rest, warmth, health, and morale, shown as conditions you can read at a glance: wet, cold, nauseous, limping.
- **A valley with height.** One procedurally generated valley per seed, rising from the lake through forest and high meadow to bare rock. Higher is colder, windier, and steeper, and the view from the top shows you the map.
- **Fire, three ways.** Sparks, embers carried from a lightning strike, or a bow drill. Once you have it, fire is warmth, cooked food, safe water, light, and a signal, and it has to be fed and kept out of the rain.
- **Nature is indifferent.** Weather and animals follow their own schedules. Jays steal your food, pack rats steal your gear, and an elk charges because you walked into its space. There is no combat: you hunt by stealth and survive danger by reading the warning signs.
- **A different survivor every run.** A boy or girl of 12 to 15, with a background that gives a small head start, a trait that complicates things, and one of three starting tools: a hatchet, a sheath knife, or a multi-tool.
- **Rescue is the way out.** Light a signal fire when a search plane passes, or wait for the storm that opens a route to the wreckage high on the mountain and climb to its emergency beacon.
- **Same seed, same story.** The same seed, survivor, and inputs always play out the same way, so a run can be shared and replayed.

Top-down and tile-based, in simple pixel art. The mood comes from light, weather, and sound: a small figure in a big, quiet landscape, the colour of the day changing, and firelight at night. A full run is about three to five hours. You can stop and come back at any time, but death is final: the next attempt is a new valley, or the same one again from its seed.

The full design is in **[docs/SPEC.md](docs/SPEC.md)**.

## Status
In design. The specification is under review and nothing is playable yet. When it is, it will be at https://toddharrison.github.io/html-games/snowline/.

## Tech
TypeScript and Vite, drawn on a canvas with no game framework. It runs entirely in the browser: static files, no server, no network use while you play.

---
*Inspired by Gary Paulsen's novel* Hatchet*, and by Tom Wham's board game* The Awful Green Things from Outer Space*, where the rules are dealt fresh every game. Snowline is an original game with its own characters, setting, and events.*
