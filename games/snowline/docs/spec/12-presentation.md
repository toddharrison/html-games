## 12. Presentation

### 12.1 Art

**Direction.** The mood and feel of *Kingdom Two Crowns*, in a top-down game (decided 2026-11-25). The goal is the feeling, not the fidelity: a small figure in a large, quiet landscape, where the time of day and the weather set the tone and a fire at night means safety. The graphics start simple and stay simple until something more has earned its place. That game is a reference, not a source: no sprite, palette, or composition is copied.

**Where the mood comes from.** Most of it is cheap. Very little of it depends on detailed sprites.

| What gives the feeling | How Snowline gets it, simply |
|---|---|
| Small figures, big landscape | One-tile figures on a screen 24 tiles wide, among trees two and three tiles tall and rock formations up to two. Tall things block only their own tile: the survivor walks behind them, and they fade a little then. The camera eases after the survivor rather than being fixed to them, so the land glides rather than jerks |
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

**The opening** (decided 2026-11-27): a new run starts with a short scene, read a page at a time (a click or E; Esc skips). In the dark: the kid flying north in a little plane (where to depends on their background), the engine failing, the pilot looking for somewhere to land, trees, then nothing. Then the scene fades in on the kid lying on the ground by the wreck, waking: the pilot in the front seat doesn't answer (implied, never shown), the tail is gone, nobody knows where the plane came down but someone will be looking, and the kid has to stay alive until then, with one plain line on what the game is. Then the kid gets up and play begins.

Tone (decided 2026-11-25): suitable for ages 10 and up. The pilot's death is implied in the opening text and never shown. Despair is expressed through morale and the message log, never through self-harm.

**Thoughts are the tutorial** (decided 2026-11-26). There is no separate tutorial: the survivor thinks what a kid alone out here would think next, in their own voice, first person and present tense ("My mouth is so dry. First thing: a drink."), kept in the log in quotes (the journal's log; not the lines at the foot of the screen). Under each, smaller and plainly, is how to do it ("Click the water to drink, or face it and press E."); the settings can turn those lines off. The first day's thoughts come in order, each once, and wait for the player to act before the next idea, though evening and dark come on time. **What the kid notices comes first, and differs from run to run** (decided 2026-11-27; until then the cold always led): the body and the weather speak up when it's really so (thirst; hunger; wind through the jacket when it's blowing and the kid is out in it; getting soaked in the rain; wet clothes and shivering; a hot sun drying them out; cold; tiredness), most pressing first, each back a while later in another wording, the first wording saying how to deal with it. How the crash left the kid is dealt per run (as usual, parched, hungry, or soaked and chilled), and the day's weather is dealt, so the first thing noticed varies. With nothing pressing, the first idea is the plane: there might be something useful in it. **The cold comes in the afternoon** (or at once, once the kid has felt it): the snow on the peaks means a cold night, so a fire before dark; then what a fire needs (something dry that catches, little sticks, bigger wood); striking rock for a spark; laying the fire once there's enough; shelter as the sun gets low; staying put in the dark. Water and food are noticed when the kid is thirsty or hungry. Each step toward the first fire gets the kid's reaction soon after it happens, ahead of the chain, and only the latest (sparks off a rock: take a piece; carrying it: find a spot; laid with a light at hand: sparks into the dry stuff; lit). **A failure brings a clue** (decided 2026-11-27): when something doesn't work, the kid thinks through why and what to try, as a note at once, from what really counted against it: a tinder that never catches (try another kind, by name if one is known or carried); no tinder (something fine and dry first); no small sticks (little sticks on top); a spark with nothing loose to land in (said twice, and the second time is the insight: a tinder nest); the multi-tool's thin sparks; a slow tinder; plain bad luck (again, steadier); the wrong wood for the bow drill; a thing that came apart (slower). Each cause's lines come in turn, each once, so trying again says something surer and then stops. **Thoughts stop the game** (decided 2026-11-27): each pops up as a note on a slip of the notebook's paper in the kid's hand, in the middle of the screen with the scene dimmed behind it, and the game waits until the player clicks or presses E (Enter or Esc also close it). Several in a row come one after another.

**Insights on notebook slips** (decided 2026-11-26). When the kid works something out (a technique, or a fact about this valley, known or suspected), the game stops in the same way and a note on the notebook's paper says "New idea!" or "Now I know" or "I think...", what it is, how it was learned, and what it adds to Make. What the kid notices comes back no more than every eight hours each, and the first full pockets once. Never two thoughts within half an hour of game time.

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
| I, C, J, M | What I've got (a notebook page: what I'm carrying, what I've found), Make (a notebook page, 8.2), journal, map |
| R | Rest or sleep (choose duration) |
| Esc | Pause and settings |
| Mouse over | Names what is under the cursor; the cursor shows a hand (something to do) or an eye (something to watch) |
| Click | Walk to it and do the obvious thing: gather it, watch it, drink, or just walk there (5.2) |
| Right-click | A small menu at the cursor of everything that can be done there |
| Placing (from Make) | A see-through preview under the mouse (or on the faced tile), green where it can go and red with the reason where not; click or E to place, Esc to stop |

**The kid's notebook for everything in play** (decided 2026-11-27). The inventory (I) is a page of the kid's notebook, an inventory they keep: what they're carrying, each thing as a pencil sketch with a line in their words and what they've learned about it ("It throws sparks off steel!", "I don't know what it does yet.", "eat soon"); and on a second tab, everything they've found in the valley that can be picked up (plants, remedies, stones, woods, tinder), sketched the same way with what they know. Make (8.2) uses the same sketches. The small menus in play (what can be done here, an item's uses, rest) are slips torn from the notebook, and the name beside the cursor is a scrap of the same paper. The pause menu and settings are outside the story and stay as they are. Sketches are drawn in code (`render/sketch.ts`): a few wobbly graphite strokes gone over twice, with coloured pencil where colour is the point (berries, embers, a red cross).

The mouse and the keyboard work together (decided 2026-11-26): nothing needs the mouse, and the keyboard keeps every action. Keys are remappable. Condition icons differ in shape as well as colour. A setting reduces lightning flashes. Text size is adjustable.
