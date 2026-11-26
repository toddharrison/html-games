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
Playable from start to rescue; awaiting review before release. Choose a survivor and keep them alive in a generated valley: find water, forage, taste carefully, make fire, build a camp, and fill in your notes on what this valley's plants, stone, wood, and water do. Weather turns, animals go about their business, and winter comes down the mountain. Get out by signal fire when the search aircraft pass, or climb to the beacon in the tail wreckage once the great storm's rockslide opens a way. The game is at https://toddharrison.github.io/html-games/snowline/ once it is published, and also as a single HTML file you can download and open from disk.

Controls: click something to walk to it and do the obvious thing (right-click for every choice); or WASD or the arrow keys to walk (Shift to turn on the spot), E to act on what you face, I for what you carry, 1–9 to use it, C to make things, J for the journal, R to rest, M for the map, Esc to pause.

## Tech
TypeScript and Vite, drawn on a canvas with no game framework. It runs entirely in the browser: static files, no server, no network use while you play. The same seed and the same keys always play out the same way, on any machine.

```sh
npm install                  # at the repo root
npm run dev -w snowline      # play locally; add ?seed=anything to pick a valley, ?debug=1 for the debug overlay
npm test -w snowline         # the tests
```

---
*Inspired by Gary Paulsen's novel* Hatchet*, and by Tom Wham's board game* The Awful Green Things from Outer Space*, where the rules are dealt fresh every game. Snowline is an original game with its own characters, setting, and events.*
