# Snowline

A browser survival RPG: a teenager is the only survivor of a small-plane crash in a mountain valley, and the player keeps them alive until rescue. Top-down, tile-based, real-time on a grid. Inspired by Gary Paulsen's *Hatchet*, with the valley's rules dealt fresh from each seed after Tom Wham's *The Awful Green Things from Outer Space*, but an original game.

This game is one workspace in the html-games monorepo. The repo-wide rules (layout, commands, deploy, commit workflow, versions) are in the root [CLAUDE.md](../../CLAUDE.md). **Paths in this file and in this game's docs are relative to `games/snowline/`.** Public build: https://toddharrison.github.io/html-games/snowline/

## Starting a session (read little, in this order)
1. **[docs/TODO.md](docs/TODO.md)**, the hand-off notes at the top: what's in progress and the exact next step.
2. **Only the spec sections the task needs.** [docs/SPEC.md](docs/SPEC.md) is a one-screen index; the spec itself is one file per section in [docs/spec/](docs/spec/), with a "read it when" column. Don't read the whole spec.
3. **Only the [docs/FEATURES.md](docs/FEATURES.md) entries for the systems you touch** (its Contents list is at the top): code pointers, tuning, and gotchas.
4. Then the code. The rules below are the ones that are easy to break; you don't need to reread SPEC 11 for them.

## Source of truth
- **The spec ([docs/SPEC.md](docs/SPEC.md) and [docs/spec/](docs/spec/))** is the design. [README.md](README.md) is a short public summary; if they disagree, the spec wins. Update the README when a spec change affects its summary.
- A design decision made in conversation goes into the section file it changes and a dated row in `docs/spec/13-decisions.md`. Open questions are in `docs/spec/13-questions.md` (the next one is Q46). Keep each spec file about one thing (the index says how).

## Status
- **M0–M6 are built** and were playtested once (2026-11-26). **M7, "seeing and touching" (SPEC 14), is in progress, slice first:** see [docs/TODO.md](docs/TODO.md).
- Versions: TypeScript 7, Vite 8, Vitest 5, fast-check 4, no runtime dependencies, no game framework (SPEC §11.1).
- **Originality is tested:** `tests/originality.test.ts` fails on banned names and terms (SPEC §3); add any you find to its list. The pre-release review notes are in `docs/ORIGINALITY.md`.

## Rules that are easy to break
- **Originality (SPEC §3).** No text, names, or coined terms from *Hatchet* or from *The Awful Green Things from Outer Space* in the game, its data, or `package.json`. The README and credits may name both as inspirations, nothing more. Dealt things are named by how they look ("dull red berries"), never by a real species.
- **Layers (SPEC §11.2).** `src/sim/` and `src/content/` never import from `render/`, `ui/`, `platform/`, or `tools/`, and use no browser API. The whole game runs in Node.
- **Determinism (SPEC §11.3).** In `sim/` and `content/`: no `Math.random`, `Date`, `performance`, `Math.sin/cos/pow/exp/log/...`, or `**`. Randomness comes from a named stream in `sim/rng.ts` (or `hash2` for per-tile choices in world generation). Process entities in ID order; never let logic depend on `Set`/`Map` or object key order. `GameState` is plain JSON data. **`tests/determinism-guard.test.ts` enforces this** and gates the deploy.
- **Dealt rules (SPEC §6.6, §11.2).** `content/decks.ts` says what a thing *can* be; `GameState.rules` holds what it *is* in this valley; the UI shows only what is in `GameState.known`. Systems read a dealt property through `rules`, never straight from a content table.
- **World generation never reads the deal's stream, and placement never branches on the deal.** Set-piece slots are placed the same way whatever was dealt and only labelled from it afterwards (`sim/worldgen/setpieces.ts`), and validation checks only deal-independent things. `tests/rules.test.ts` checks that changing the deal leaves the terrain alone.
- **Imports carry the `.ts` extension, and only erasable TypeScript is allowed** (`allowImportingTsExtensions`, `erasableSyntaxOnly`): no enums, no namespaces, no constructor parameter properties. That lets Node run any module directly, e.g. `node scripts/inspect.ts`.
- **Storage names start with `snowline`** (`localStorage` keys `snowline/...`, IndexedDB database `snowline`): every game shares the origin.
- **The game is public from M0.** The in-development notice (`package.json`'s `description`, `TEXT.inDevelopment`) came off at M5, when a run could first end in rescue (SPEC §11.1; Q39 asks whether to restore it until M6).

## Testing
- `npm test` runs in CI and gates every game's deploy: keep it deterministic and quick (target under 30 s; it is about 7 s now).
- **Golden replays** (`src/tools/goldens.ts`): when a deliberate change to the sim or world generation moves a hash, `tests/golden.test.ts` prints the new one. Check the change is meant, paste it in, and say so in the hand-off. Then run `npm run check:browser` to confirm browsers agree.
- **The default seed** (`first-light`, `DEFAULT_SEED`) is every player's first valley. If world generation changes, look at it again (`npm run inspect -- first-light`) before updating its snapshot in `tests/worldgen.test.ts`.
- Run by hand (SPEC §11.4): `npm run sweep` (1,000 seeds, a few minutes), `npm run check:browser` (golden replays in headless Chromium, served and from disk), `npm run bot` (the bot over many seeds in both modes; `renders/bot/report.txt`), `npm run tour` (screenshots of every screen; fails on page errors). Tools for looking: `npm run inspect -- <seeds>` (map PNGs in `renders/inspect/`), `npm run shots -- [--at X,Y] [HH:MM ...]` (screenshots at times of day in `renders/shots/`). `renders/` is git-ignored.
- Tests use Node APIs, so they are type-checked by `tsconfig.node.json` with the scripts; `tsconfig.json` covers `src/` only.

## Task tracking (docs/TODO.md and docs/FEATURES.md)
The user clears context regularly, so **[docs/TODO.md](docs/TODO.md) is the hand-off between sessions**. Whatever isn't written there is lost. **[docs/FEATURES.md](docs/FEATURES.md)** lists everything that's been built.
- **At the start of a session**, read docs/TODO.md to see what's in progress and what's next. Look up existing features, code pointers, and gotchas in docs/FEATURES.md.
- **TODO.md holds only open work.** Mark a task in progress when you start it. Add new tasks and follow-ups as they come up.
- **When a task is done, move it to FEATURES.md** in the same session, then delete it from TODO.md. Never leave checked-off items in TODO.md. In FEATURES.md, file it under its game system (not by milestone), with the standard tag line (milestone · commit or `uncommitted` · `playtest: pending/approved/n/a` · SPEC sections), a short description of what it does, then key files, symbols, tuning, and gotchas (marked **Gotcha:**). If it still needs the user's eyes, also add it to the *Playtest queue* in TODO.md. After committing, replace `uncommitted` with the commit hash.
- **Before a natural stopping point** (or whenever the user mentions clearing context), update the *Hand-off notes* in TODO.md: what was just done, what's half-finished, and the exact next step. Implementation details go in FEATURES.md, not in the hand-off notes.
- Keep TODO.md short. Use milestones from SPEC §14 as headings and break the current milestone into concrete tasks; later milestones stay coarse until they're current. Remove stale notes rather than piling them up.

## Workflow
Follow the root [CLAUDE.md](../../CLAUDE.md): leave changes uncommitted and commit only when asked. Pushing to `main` deploys the public build.
