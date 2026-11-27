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

| Background | Head start |
|---|---|
| Scout | Firecraft level 1; already knows how to make cord |
| Angler | Fishing level 1 |
| Hunter's kid | Hunting level 1; animals notice them later |
| Farm kid | Crafting level 1; heavy work costs less rest |
| Runner | Moving costs less rest; better in cold water |
| Reader | More frequent reflection hints; steadier morale |
| City kid | No head start, but skills rise faster. The hard mode. |

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
