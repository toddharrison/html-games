## 12. Presentation

### 12.1 Art

**Direction.** The mood and feel of *Kingdom Two Crowns*, in a top-down game (decided 2026-11-25). The goal is the feeling, not the fidelity: a small figure in a large, quiet landscape, where the time of day and the weather set the tone and a fire at night means safety. The graphics start simple and stay simple until something more has earned its place. That game is a reference, not a source: no sprite, palette, or composition is copied.

**Where the mood comes from.** Most of it is cheap. Very little of it depends on detailed sprites.

| What gives the feeling | How Snowline gets it, simply |
|---|---|
| Small figures, big landscape | One-tile sprites on a screen 24 tiles wide. Nothing to add |
| The time of day sets the tone | One colour grade over the whole scene, changing through the day: cool dawn, flat noon, amber dusk, blue night |
| Fire means safety | Night is dark and nearly colourless. A fire is a warm pool of light, and the only colour on screen |
| Quiet, with few words | A small HUD (pillar 2), a sparse message log (12.2), and no clutter |
| A soft, natural palette | One muted base palette of about 32 colours |
| Weather you can feel | Rain as a moving overlay, fog as a pale grade that shortens the view, snow lying where the snowline has reached |
| Water that sets the scene | The lake takes the colour of the sky and has a simple shimmer |
| Sound | Wind, water, rain, fire, and night insects, with silence between them (12.3). This carries as much of the mood as the picture does |

**To begin with**

- 16×16 tiles, and sprites of one tile. The view is the three-quarter top-down of classic adventure games: ground from above, things on it from the front.
- The survivor sprite is assembled from layers (body, hair, clothing) recoloured from the protagonist's appearance. Four facing directions and 2–4 frame walk, work, and carry animations.
- Animals have 2-frame animations. Water, fire, rain, and snow animate.
- Elevation reads through terrain colour, cliff-edge tiles, and thinning trees.
- Night, dusk, fog, and firelight are produced by the renderer over the same sprites: a colour grade, then darkness with a lit circle round each light. This is the one piece of graphics work beyond plain tiles that v1 commits to, and it is small.
- The lit area the player sees is the visibility the simulation uses (6.4). Flicker, shimmer, and rain use the renderer's own randomness and never feed back into the simulation (11.3, rule 3).
- **Placeholder first:** the renderer starts with tiles generated in code (flat colour plus a simple glyph). Implementation is never blocked on art.
- **Who makes the art** (decided 2026-11-25): for now Claude, the AI doing the implementation, draws it. Sprites are written in the source as small grids of palette colours, one character per pixel, and built into an atlas when the game starts. That is a form that can be drawn, reviewed in a diff, and changed like any other code. The base palette is defined once in `render/` and every sprite uses it. From M2 these drawn sprites replace the glyph tiles.
- **Room for an artist later.** The renderer also accepts a single atlas image plus a JSON index, which replaces the in-code sprites with no other code changes. Both are imported through Vite so they are bundled and addressed by relative path (11.1). The grade and the darkness work over placeholder tiles, so the mood can be judged in M1, before any sprite is drawn.

**The beauty pass (decided 2026-11-26).** The first playtest found the simple version short of the mood: a flat sheet of square tiles with lone trees. So these move up from "later" and are built now, still drawn in code at 16 px, all in the renderer, none touching the simulation:

- Terrain that blends: edges between ground types are ragged overlaps, not square; a foam line where water meets land; water darkening with depth.
- Variant tiles chosen by a smooth noise field, and a tint that drifts across the map with it (6.8).
- Ground detail of several sizes that is only drawn: flowers, pebbles, ferns, grass clumps, small rocks. Loose things (6.7) stay readable over it: each has a soft shadow and a darker outline, and the cursor names it.
- Trees in sizes from sapling to tall, the tall ones rising into the tile above, drawn back to front, the canopy fading when the survivor is behind it.
- Shadows under trees and things, long at dawn and dusk; wind moving the tree tops and grass; cloud shadows drifting over the ground; mist on the valley floor at dawn.

Still later, if wanted: more animation frames for the survivor, the lake mirroring the far shore, leaves turning, a larger palette. Whether a human artist redraws it before release is still open (Q43).

### 12.2 Text

A scrolling message log in short, plain, past-tense sentences carries much of the atmosphere: "The berries were bitter. He ate them anyway." Names and pronouns are filled in from the protagonist. All text lives in `content/` for later editing or translation.

Tone (decided 2026-11-25): suitable for ages 10 and up. The pilot's death is implied in the opening text and never shown. Despair is expressed through morale and the message log, never through self-harm.

Hunting and butchering are abstract but clear (decided 2026-11-25). Nothing graphic is drawn: an action, a sound, and an item. But the game does not hide what is being done. The action is named for what it is (kill, skin, gut, pluck), and the message log says it plainly: "She skinned and gutted the hare."

### 12.3 Audio

Sound carries as much of the mood in 12.1 as the picture does, and it costs far less than detailed art. Decided 2026-11-25: build the event hooks from the start, and bring the ambient loops in with the weather in M4 instead of leaving all sound to the end. Target set: ambient loops (wind, lake, night insects, rain, fire, elk bugling at dusk) and about 20 effects, with real silence between them.

Music: earlier drafts had none during play. The reference's mood owes a lot to its music, so there is now a little of it: a few short, quiet pieces that play once at moments that matter (the first fire, a first wide view from high ground, the first snow), and nothing looping under ordinary play. Music stays in M6, and the game must work without it.

### 12.4 Controls

| Key | Action |
|---|---|
| WASD or arrows | Move |
| E or Space | Interact with the faced tile |
| 1–8 | Use or equip inventory slot |
| I, C, J, M | Inventory, craft, journal, map |
| R | Rest or sleep (choose duration) |
| Esc | Pause and settings |
| Mouse over | Names what is under the cursor; the cursor shows a hand (something to do) or an eye (something to watch) |
| Click | Walk to it and do the obvious thing: gather it, watch it, drink, or just walk there (5.2) |
| Right-click | A small menu at the cursor of everything that can be done there |

The mouse and the keyboard work together (decided 2026-11-26): nothing needs the mouse, and the keyboard keeps every action. Keys are remappable. Condition icons differ in shape as well as colour. A setting reduces lightning flashes. Text size is adjustable.
