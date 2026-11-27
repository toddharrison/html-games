# Snowline — Game Specification (index)

Status: **draft 6, 2026-11-26.** M0–M6 are built (see [FEATURES.md](FEATURES.md)); **M7, "seeing and touching", is in progress, slice first** (see [TODO.md](TODO.md)). Draft 6, after the first playtest, makes the valley something the player sees and touches rather than a set of menus: things lie on the ground and are clicked, trout are fish in the water, the valley has things to find, the mouse joins the keyboard, and the art pass happens now.

The spec is split **one file per section** in [spec/](spec/), so a session reads only what its task needs. Section numbers (`SPEC 6.6`, `Q34`) are the same as before the split and are what code comments and the other docs cite. Paths in the spec are relative to `games/snowline/`. The repo-wide rules are in the root [CLAUDE.md](../../../CLAUDE.md).

## Where to look

| § | File | What it covers | Read it when |
|---|---|---|---|
| 1 | [spec/01-summary.md](spec/01-summary.md) | One-paragraph pitch, the facts table | Never needed for code work |
| 2 | [spec/02-pillars.md](spec/02-pillars.md) | The six design pillars | Settling a design argument |
| 3 | [spec/03-novel.md](spec/03-novel.md) | What may and may not come from the novel and the board game | Writing any text, names, or content |
| 4 | [spec/04-protagonist.md](spec/04-protagonist.md) | Selection, backgrounds, traits, starting tools | Protagonist or background work |
| 5 | [spec/05-structure.md](spec/05-structure.md) | Time, real time on a grid, click-to-walk (5.2), the arc, death and saving | Movement, the step, `goto` |
| 6 | [spec/06-world.md](spec/06-world.md) | Map, elevation, generation, day and night, weather, **the dealt rules (6.6)**, **loose things and discoveries (6.7)**, **visual variety (6.8)** | World generation, gathering, discoveries |
| 7 | [spec/07-survival.md](spec/07-survival.md) | Vitals, tools, water, food and **fish (7.4)**, cooking, shelter, illness, inventory | Survival systems, fishing |
| 8 | [spec/08-knowledge.md](spec/08-knowledge.md) | Insights, the tool chain and materials (8.2), fire, skills | Crafting, fire, insights |
| 9 | [spec/09-animals.md](spec/09-animals.md) | The animal table, dealt tempers | Animals |
| 10 | [spec/10-rescue.md](spec/10-rescue.md) | The three rescues | The arc and ending |
| 11 | [spec/11-technical.md](spec/11-technical.md) | Stack, **layers (11.2)**, **determinism (11.3)**, testing, debug, saves, performance | Any code change that touches `sim/` (CLAUDE.md has the short form) |
| 12 | [spec/12-presentation.md](spec/12-presentation.md) | **Art and the beauty pass (12.1)**, text, audio, **controls with the mouse (12.4)** | Rendering, UI, sound |
| 13.1 | [spec/13-decisions.md](spec/13-decisions.md) | Every decision, dated, newest first | Checking why something is the way it is |
| 13.2 | [spec/13-questions.md](spec/13-questions.md) | Open questions Q19 on, each with the option taken | Raising a question (next number: Q48) or answering one |
| 14 | [spec/14-milestones.md](spec/14-milestones.md) | M0–M7 and what "done" means | Planning |
| 15 | [spec/15-references.md](spec/15-references.md) | Inspirations, games to look at, technical and art references | Rarely |

## Keeping it tidy

- A design decision made in conversation goes into the section file it changes **and** a dated row in [13-decisions.md](spec/13-decisions.md) (newest block first). A new question goes at the end of [13-questions.md](spec/13-questions.md) with the next number.
- Keep each section file about one thing. If one grows past about 200 lines, split it into `NN-name-part.md` files and add them to the table above.
- Bump the draft number and the status line above when a round of decisions lands. The history of drafts lives in [13-decisions.md](spec/13-decisions.md), not here.

## Draft history

- **Draft 6 (2026-11-26):** seeing and touching (6.7, 6.8, 7.4, 12.1, 12.4, M7); the spec split into files.
- **Draft 5 (2026-11-25):** the valley's rules dealt per seed (6.6); the art direction (12.1).
- **Draft 4:** fitted into the html-games monorepo (11, M0); the title settled.
- **Drafts 1–3:** the game design in sections 4–10.
