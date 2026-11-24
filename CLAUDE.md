# HTML Games

A monorepo of browser games, published to GitHub Pages at https://toddharrison.github.io/html-games/ (repo: https://github.com/toddharrison/html-games).

## Layout
- `games/<slug>/`: one self-contained game per folder (npm workspace), with its own `package.json`, `index.html`, `src/`, `tests/`, `docs/`, `README.md`, and **its own `CLAUDE.md` with that game's rules. Read it before working on the game.** Paths in a game's docs are relative to that game's folder.
- `site/index.html`: landing page template. `scripts/build-site.mjs` fills in the `<!-- GAMES -->` marker with one card per game, using `title` and `description` from the game's `package.json`.
- `.github/workflows/deploy.yml`: on every push to `main`, runs typecheck, tests, and build, then deploys `dist/` to GitHub Pages.

## Games
- [games/behemoth-protocol/](games/behemoth-protocol/) (see its [CLAUDE.md](games/behemoth-protocol/CLAUDE.md)): a roguelike about driving a giant war machine. Phaser 4, TypeScript 7, Vite 8, Vitest 5.

## Commands (from the repo root)
- `npm install` installs every workspace. There's one lockfile, at the root.
- `npm run dev -w <slug>` starts a game's dev server. `cd games/<slug> && npm run dev` also works.
- `npm test`, `npm run typecheck`, `npm run build` run across all games. `build` also assembles the Pages site in `dist/` (`dist/<slug>/` plus the landing page). `npm run preview` serves it.

## Every game must
- Define `build` (output in `games/<slug>/dist/`), `test`, and `typecheck` scripts, plus `title` and `description` in its `package.json`.
- Build with relative asset paths (Vite `base: './'`). The site is served from the `/html-games/<slug>/` subpath.
- Namespace its `localStorage` keys with its slug (e.g. `behemoth-protocol/run`). Every game shares the `toddharrison.github.io` origin.
- Be an original game. Homages are fine; recreating a specific existing game's name, characters, art, or terminology isn't.

## Adding a game
Create `games/<slug>/` with the scripts and fields above, run `npm install` at the root, and add it to the list here and in [README.md](README.md). The landing page and the deploy pick it up automatically.

## Workflow
- Leave changes **uncommitted** so the user can review diffs in VS Code. Commit only when asked.
- **Version numbers are semantic.** Each game's `package.json` `version` follows semver, and every set of changes bumps it by what changed: **patch** for fixes, tuning, and polish; **minor** for new features or content (a mode, a unit, a weapon, a system); **major** for a change that breaks saves or remakes how the game plays. Before 1.0 a breaking change is a minor bump. Bump it along with the work, once per set of changes headed for one commit (the largest kind of change in the set decides), and run `npm install` at the root so the lockfile follows.
- When asked to commit while on `main`: create a branch, commit, then fast-forward merge to `main` and delete the branch if the user asks. Pushing to `main` deploys the public site.
