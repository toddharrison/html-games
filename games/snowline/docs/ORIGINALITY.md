# Originality review (pre-release)

SPEC §3 asks for a comparison of the finished game, and its title, with the novel that inspired it and with existing games, by someone qualified to judge, before release. This page is the material for that review, as the game stands at M6 (2026-11-26). It is design notes, not legal advice.

## Inspirations, and what was taken

| Source | Taken | Not taken |
|---|---|---|
| Gary Paulsen's novel *Hatchet* (1986) | The genre's starting idea: a young person alone in the wilderness after a small-plane crash, with one tool, learning by failing; hunger, fire, and rescue. | The title, the protagonist and his family story, the pilot, the lake setting, the moose, wolves, skunk, and turtle, the tornado that raises the plane, the "survival pack", the book's names for things, and its sequence of events. |
| Tom Wham's board game *The Awful Green Things from Outer Space* | One idea: what things do is unknown until tried, and is dealt fresh every game (the valley's rules, SPEC §6.6). | Its setting, creatures, weapons, names, art, and wording. |
| *Kingdom Two Crowns* (mood reference) | A feeling: a small figure in a large, quiet landscape; time of day and weather setting the tone; fire as safety at night. | Any sprite, palette, composition, interface, or the side-on view. |

## The game against the novel

| The novel | Snowline |
|---|---|
| One named protagonist with a family backstory | A boy or girl of 12–15 from a generated roster (28 first names, none from the novel), with a background and a trait; no family story |
| A lake in flat northern forest | A mountain valley with four elevation bands, cliff bands, scramble routes, and a snowline coming down |
| A hatchet as the one tool | A hatchet, a sheath knife, or a multi-tool, each with different strengths |
| Moose, wolves, skunk, turtle, a bear | Black bear, elk, cougar, mountain goats, marmots, grouse, hares, jays, pack rats, porcupines; the dangerous ones' tempers dealt per valley |
| Fire found one way, from sparks off a rock | Three independent routes: sparks off whichever stone the seed deals, embers from a lightning-struck snag, or a bow drill of whichever wood the seed deals |
| A tornado raises the sunken plane | A severe storm's rockslide opens a way to the tail wreckage high on the mountain; the beacon is there |
| A fixed plot | Systems; no scene is scripted; every seed is a different valley with different rules |
| Specific named foods and coined terms | Things named by how they look ("glossy red berries", "dark glassy stone"); no term from the novel |

## Checks in the build

- `tests/originality.test.ts` fails the build if any of the novel's character names or coined terms, the novel's title (capitalised as a title), or the board game's name, maker, or creatures appear in the game's source, data, `index.html`, or `package.json`. Only the README's credit line names the two works.
- The roster (`src/content/protagonists.ts`) is common first names.

## For the reviewer

1. **The title, Snowline.** A quick web search in November 2026 found no game of that name. That is not a trademark search.
2. **The premise.** A teenager surviving alone after a small-plane crash is the novel's premise. The game departs from it in setting, cast, events, and structure (above), and credits the novel as its inspiration in the README.
3. **The hatchet.** One of three starting tools is a hatchet, as in the novel. It is an ordinary tool, but a reviewer may want it noted.
4. **The board game's idea.** Dealing what things do afresh each game is the board game's central idea, credited in the README. Only the idea is used.
5. **The mood reference.** *Kingdom Two Crowns* is named in the spec only; nothing of its look is used.
