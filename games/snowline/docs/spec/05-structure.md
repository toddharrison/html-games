## 5. Game structure

### 5.1 Time

- The simulation runs at a fixed **20 ticks per second**.
- **10 ticks = 1 game minute**, so 1 game hour is 30 real seconds and 1 game day is 12 real minutes. The ratio is a single constant.
- Sleeping, resting, and long tasks fast-forward by running ticks faster (never by skipping them), so results are identical at any speed.
- The run starts in late summer. Temperatures fall week by week and the snowline creeps down the mountain (6.5). Snow reaches the lake around day 60 and makes survival close to impossible; this is the soft time limit. Winter play is out of scope for v1.

### 5.2 Real-time on a grid

Movement is real-time and grid-snapped. The survivor moves one tile per step; a step takes 6 ticks on open ground and more on rough or steep terrain, when injured, or when carrying a heavy load. Actions (chop, drink, craft) take a set number of ticks and can be interrupted. The game pauses in menus.

A click on something in view (12.4) sends the survivor to it: they walk a path to the tile beside it, face it, and do what was asked. The walk is a command to the simulation (`goto`), found and followed inside it, so replays stay exact; a direction key or Esc cancels it.

### 5.3 Arc of a run

Nothing below is scripted; these are the phases the systems should naturally produce.

1. **Shock (days 1–3).** Thirst, insects, cold nights, no food. Finding water and a shelter site.
2. **Fire (days 3–8).** Getting fire changes everything: warmth, cooked food, fewer insects, light, a signal.
3. **Provider (days 8–25).** Tools, fishing, hunting, food storage, a real camp. Illness and injury are the main threats. Exploring upward reveals the valley and the wreckage.
4. **Reckoning (day 18 onward).** A severe storm wrecks the camp and reshapes the slope. The route to rescue opens as the cold closes in.

### 5.4 Death and saving

**Permadeath** (decided 2026-11-25). There is one save slot per run, autosaved on sleep and when the tab is hidden. Death ends the run, deletes its save, and shows a summary (days survived, discoveries, cause of death, run code). There is no reloading an earlier save and no forgiving mode.

From the summary the player can start a new valley, which is the default, or play the same valley again from its seed. The same valley starts over at day 1 with the same deal of rules (6.6), so what the player learned there still holds, but nothing the survivor built or gathered carries over. The start screen also accepts a seed or a run code typed in.
