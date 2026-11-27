## 4. Protagonist

### 4.1 Selection

Starting a new run opens a selection screen with three generated candidates. The player can pick one, reroll for three more, or build one by hand. The three shown together never share a name, background, trait, or starting tool, so each set of three offers one of each tool.

Each protagonist has:

| Attribute | Range | Effect |
|---|---|---|
| Name | From a name list | Used in the message log and summary |
| Gender | Boy or girl | Sets pronouns in text and the base sprite; no effect on play |
| Age | 12–15 | Flavour only |
| Appearance | Skin tone, hair, clothing colours | Sprite built from recoloured layers |
| Background | One of about seven | A small head start (below) |
| Trait | One of about seven | A small complication (below) |
| Starting tool | One of three | Changes the early game (7.2) |
| Pocket items | One or two from a pool | Minor: a candy bar, a bandana, a watch, a paperclip |

The roster includes boys and girls in equal numbers. This spec says "the survivor" throughout; in the game, names and pronouns in the message log come from the protagonist data.

### 4.2 Backgrounds and traits

Backgrounds give a start, not a permanent advantage; every protagonist can learn everything.

| Background | Head start | Knows from the start (decided 2026-11-27) |
|---|---|---|
| Scout | Firecraft level 1 | Tinder and kindling, sparks off steel, the bow drill, cord, a bough bed |
| Angler | Fishing level 1 | A fish spear; aiming below the fish |
| Hunter's kid | Hunting level 1; animals notice them later | Snares, kindling, hanging food from bears |
| Farm kid | Crafting level 1; heavy work costs less rest | A covered woodpile, a splint |
| Runner | Moving costs less rest; better in cold water | A splint |
| Reader | More frequent reflection hints; steadier morale | The most, from books: tinder and kindling, sparks off steel, reflector stones, bark vessels, boiling with hot stones, a fish weir, a signal fire |
| City kid | No head start, but skills rise faster. The hard mode. | Only what any kid knows |

What any 12–15-year-old knows, whatever their background: that a fire needs something to burn and a way to light it, a shelter of branches (a lean-to), and a sharpened stick. Everything else is a technique (8.1), known from a background or learned in the valley.

| Trait | Complication |
|---|---|
| Light sleeper | Wakes at night noises; poorer rest without a secure shelter |
| Afraid of the dark | Morale drops at night without a fire |
| Weak stomach | Food illnesses hit harder |
| Wears glasses | Glasses can be knocked off or broken, cutting sight distance |
| Poor swimmer | Deep water is far more dangerous |
| Picky eater | Morale drops when eating unfamiliar food, until used to it |
| Restless | Morale drops on days spent entirely in camp |

Backgrounds, traits, tools, and pocket items are data in `content/`. Each is a short list of modifiers the systems read; no system contains code for a specific background.

### 4.3 Determinism

A run is identified by the world seed plus the protagonist definition. Random candidates are drawn from the seed's `protagonist` stream, so "seed X, candidate 2" always gives the same person. Each set of three is dealt its names, backgrounds, traits, and tools together, without repeats; each candidate's own draw gives the rest. A run code shown on the summary screen encodes both, and tests always specify both.
