# Behemoth Protocol

A browser roguelike where you play the boss.

## Premise
You are the Behemoth: a giant cybernetic war machine bristling with weapons, with heavy armor and massive treads. Its objective is simple: carry out the directive it was given. A whole battalion stands in its way, with many kinds of units: infantry, tanks, missile launchers, hovercraft, artillery, armored trains, even enemy Behemoths.

## Game
- **Vertically scrolling battles.** The battlefield scrolls as the Behemoth grinds up the screen. The scroll speed is its ground speed, and it never stops by choice. Nothing on the battlefield blocks it; obstacles are crushed, plowed through, or deflected.
- **Three triggers, many guns.** Bind each weapon to a mouse button, the missile key, or the fire-control computer; aim the main guns, secondaries, and missiles yourself, and let point defense and anti-personnel weapons fire automatically.
- **Component damage.** No health bar: treads, armor, weapons, sensors, and the reactor take damage separately. Lose the treads and you're stuck. Lose the reactor and you go out in a massive explosion.
- **Between battles.** Pick your route, then repair treads, refill missile launchers, add weapon systems, bolt on add-ons (even a towed trailer) to grow the machine, and upgrade its parts: swap in a Gen 3 reactor, or speed up a turret ring.
- **Roguelike.** Procedurally generated runs across a branching field map, permadeath, persistent unlocks, and New Game Plus. Each run's machine takes a callsign from the old names of devils and demons.

The full design is in **[docs/SPEC.md](docs/SPEC.md)**.

## Tech
TypeScript, Vite, and Phaser; runs in the browser. Prototype (M3, the roguelike structure, in progress: the sector map, biomes, approaches, and the Breach and Chase battle modes are in): **[Play it in your browser](https://toddharrison.github.io/html-games/behemoth-protocol/).** To run it locally: `npm install` at the repo root, then `npm run dev` in this folder to play, or `npm test` to run the sim tests.

---
*Inspired by Steve Jackson Games' Ogre.*
