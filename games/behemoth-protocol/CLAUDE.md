# Behemoth Protocol

A browser roguelike: the player drives a giant cybernetic war machine (the Behemoth) up a vertically scrolling battlefield against a combined-arms force. It's an homage to Steve Jackson Games' *Ogre*, but an original game. Never use *Ogre*'s name, unit designations (e.g. "Mark III/V", "GEV"), factions, or terminology in code, content, or UI.

This game is one workspace in the html-games monorepo. The repo-wide rules (layout, commands, deploy, commit workflow) are in the root [CLAUDE.md](../../CLAUDE.md). **Paths in this file and in this game's docs are relative to `games/behemoth-protocol/`.** Public build: https://toddharrison.github.io/html-games/behemoth-protocol/

## Source of truth
- **[docs/SPEC.md](docs/SPEC.md)** is the design spec. [README.md](README.md) is a short public-facing summary; if they ever disagree, the spec wins. Update the README when a change to the spec affects its summary.
- Settled decisions are logged in SPEC §15; open questions are in §16. When a design decision is made in conversation, update the spec (including §15/§16) rather than recording it only here.

## Status
- Spec draft v0 complete (Nov 2026). **M0 feel prototype** first pass implemented (Nov 2026); awaiting playtest and tuning. See docs/TODO.md for current state and docs/FEATURES.md for what's built.
- Versions: Phaser 4 (tint: `setTint(c).setTintMode(Phaser.TintModes.FILL)`; `setTintFill` is a no-op), TypeScript 7, Vite 8, Vitest 5.

## Tech stack and architecture rules (from SPEC §2, §12)
- TypeScript (strict), Vite, Phaser, Vitest. Static hosting; no backend.
- **`src/sim/` is pure TS with no Phaser imports**: deterministic, unit-tested, fixed 60 Hz timestep. Phaser scenes only render sim state and turn input into commands.
- **All randomness goes through the seeded RNG** (`sim/rng.ts`). Never use `Math.random()` in sim code.
- **Content is data-driven:** weapons, enemies, chassis, add-ons, terrain, biomes, etc. are typed tables in `src/content/`. Game-wide tuning knobs (anything not per unit, weapon, chassis, etc.) all live in `src/content/tuning.ts`; don't scatter tuning numbers through sim code. Behaviors and projectile types are reusable pieces combined per unit or weapon.
- Sim code must not assume a camera view (a side-on battle mode may be added later). Hits report an abstract arc (front-left/front-right/rear/left/right/top).
- Chunky pixel art at a low internal resolution with integer scaling (`pixelArt: true`). Placeholder sprites are generated in code. The Behemoth is composed of independent component sprites.
- Saves: versioned JSON in `localStorage`; a run save (deleted on death) and a profile save (unlocks and NG+).

## Core design rules that are easy to violate
- **Forward momentum:** the Behemoth never stops by choice and never reverses; braking only goes down to minimum speed. Nothing on the battlefield blocks it outright: obstacles are crushed, plowed through (damage scales with obstacle size and is reduced by ram gear), or deflected. There is no auto-scroll; the camera follows the Behemoth and never scrolls backward (sole exception: it eases back to center the Immobilized Behemoth for the last stand). Battles scroll vertically (the Behemoth drives up the screen); the sim stays camera-agnostic (sim +x = forward), and only `src/render/` maps it to screen-up.
- Speed (minimum, cruise, top) scales down with tread integrity, to a floor of half (`DEGRADE.treadSpeedFloor`) while any tread set works. Zero tread integrity = Immobilized = a stop and a doomed last stand.
- No single HP bar: component damage model. Reactor destroyed = a spectacular detonation that damages enemies and counts toward progression.

## Task tracking (docs/TODO.md and docs/FEATURES.md)
The user clears context regularly, so **[docs/TODO.md](docs/TODO.md) is the hand-off between sessions**. Whatever isn't written there is lost. **[docs/FEATURES.md](docs/FEATURES.md)** lists everything that's been built.
- **At the start of a session**, read docs/TODO.md to see what's in progress and what's next. Look up existing features, code pointers, and gotchas in docs/FEATURES.md.
- **TODO.md holds only open work.** Mark a task in progress when you start it. Add new tasks and follow-ups as they come up.
- **When a task is done, move it to FEATURES.md** in the same session, then delete it from TODO.md. Never leave checked-off items in TODO.md. In FEATURES.md, file it under its game system (not by milestone), with the standard tag line (milestone · commit or `uncommitted` · `playtest: pending/approved/n/a` · SPEC sections), a short description of what it does, then key files, symbols, tuning, and gotchas (marked **Gotcha:**). If it still needs the user's eyes, also add it to the *Playtest queue* in TODO.md. After committing, replace `uncommitted` with the commit hash. (`initial` marks work that landed before the history was flattened into the monorepo's first commit.)
- **Before a natural stopping point** (or whenever the user mentions clearing context), update the *Hand-off notes* in TODO.md: what was just done, what's half-finished, and the exact next step. Implementation details go in FEATURES.md, not in the hand-off notes.
- Keep TODO.md short. Use milestones from SPEC §13 as headings and break the current milestone into concrete tasks; later milestones stay coarse until they're current. Remove stale notes rather than piling them up.

## Workflow
Follow the root [CLAUDE.md](../../CLAUDE.md): leave changes uncommitted and commit only when asked. Pushing to `main` deploys the public build.
