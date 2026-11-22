/**
 * Events (SPEC §8.3, provisional): map nodes that are a short text choice instead of a fight. Each
 * option has seeded outcomes, so the same event on the same run always turns out the same way for
 * the same choice. M3 builds a first handful to playtest; expand or cut them after.
 *
 * Effects work on the run between battles (`sim/mapEvents.ts`):
 * - `salvage`: gain (or, negative, pay) salvage.
 * - `damage` / `repair`: a share of a part's full integrity (every tread set, each by its own size;
 *   armor over every zone and the trailer's). Repairing armor re-plates a share of what's
 *   *missing*, like a partial re-plate at the depot. Damage never takes a part below 5%.
 * - `rearm`: every munitions weapon and ammo bunker full (drones aren't ammo).
 * - `cache`: extra actions at the next depot, like a supply cache.
 * - `reveal`: every node's intel in this sector shows (fog cleared).
 * - `threat`: the defenders of the battles ahead get stronger (+) or weaker (−): the next layer's
 *   battles, or every battle still ahead in the sector.
 */

export type MapEventId = 'convoy' | 'orders' | 'hulk' | 'dump' | 'drop' | 'scavengers';
export const MAP_EVENT_IDS: readonly MapEventId[] = ['convoy', 'orders', 'hulk', 'dump', 'drop', 'scavengers'];

export type EventPart = 'treads' | 'armor' | 'sensors';

export type EventEffect =
  | { kind: 'salvage'; amount: number }
  | { kind: 'damage'; part: EventPart; share: number }
  | { kind: 'repair'; part: EventPart; share: number }
  | { kind: 'rearm' }
  | { kind: 'cache'; actions: number }
  | { kind: 'reveal' }
  | { kind: 'threat'; amount: number; scope: 'next' | 'sector' };

export interface EventOutcome {
  /** Relative odds among the option's outcomes. */
  weight: number;
  /** What happened, for the result screen (a sentence or two). */
  text: string;
  effects: readonly EventEffect[];
}

export interface EventOption {
  label: string;
  /** What the player knows before choosing (the odds are never shown as numbers). */
  hint: string;
  /** Salvage it costs up front (the option is greyed out without it). */
  cost?: number;
  outcomes: readonly EventOutcome[];
}

export interface MapEventDef {
  id: MapEventId;
  title: string;
  /** The scene, for the event screen. */
  text: string;
  /** One line for the map's intel panel. */
  teaser: string;
  /** The last option is always the one that does nothing (drive on). */
  options: readonly EventOption[];
}

const DRIVE_ON: EventOption = { label: 'Drive on', hint: 'Nothing gained, nothing risked.', outcomes: [{ weight: 1, text: 'The Behemoth rolls on.', effects: [] }] };

export const MAP_EVENTS: Record<MapEventId, MapEventDef> = {
  convoy: {
    id: 'convoy',
    title: 'Abandoned convoy',
    text: 'Trucks stand nose to tail on the road ahead, doors hanging open, engines cold. Their crews left in a hurry.',
    teaser: 'A supply column, left on the road',
    options: [
      {
        label: 'Strip it',
        hint: 'Everything aboard. It may be mined.',
        outcomes: [
          { weight: 65, text: 'The crews left everything. The salvage teams strip it to the axles.', effects: [{ kind: 'salvage', amount: 75 }] },
          {
            weight: 35,
            text: 'A charge under the lead truck goes off beneath the treads. What survived is still worth taking.',
            effects: [
              { kind: 'salvage', amount: 45 },
              { kind: 'damage', part: 'treads', share: 0.12 },
            ],
          },
        ],
      },
      {
        label: 'Shell it, then pick it over',
        hint: 'Less to take, nothing to set off.',
        outcomes: [{ weight: 1, text: 'Two rounds set off a pair of charges. The rest is safe to strip.', effects: [{ kind: 'salvage', amount: 35 }] }],
      },
      DRIVE_ON,
    ],
  },
  orders: {
    id: 'orders',
    title: 'Intercepted orders',
    text: 'The sensors catch an enemy command net sending in the clear: positions, strengths, routes.',
    teaser: 'An enemy command net, sending in the clear',
    options: [
      {
        label: 'Decode the traffic',
        hint: "Every node's intel in this sector.",
        outcomes: [{ weight: 1, text: 'The whole sector opens up: every defense ahead is on the map.', effects: [{ kind: 'reveal' }] }],
      },
      {
        label: 'Send false orders',
        hint: 'Could pull defenders away, or give you away.',
        outcomes: [
          { weight: 60, text: 'They take the bait. Units ahead are ordered off the line.', effects: [{ kind: 'threat', amount: -1, scope: 'sector' }] },
          { weight: 40, text: 'They see through it and fix your position. The sector ahead stands to.', effects: [{ kind: 'threat', amount: 1, scope: 'sector' }] },
        ],
      },
      DRIVE_ON,
    ],
  },
  hulk: {
    id: 'hulk',
    title: 'Derelict war machine',
    text: 'The burnt-out hulk of an older machine of your kind, half sunk in the ground. Its treads are still on; some of its plating is too.',
    teaser: 'The hulk of an older war machine',
    options: [
      {
        label: 'Cannibalize its treads',
        hint: 'Tread segments. Its reactor may not be dead.',
        outcomes: [
          { weight: 70, text: 'The segments come away clean and lock onto your own treads.', effects: [{ kind: 'repair', part: 'treads', share: 0.3 }] },
          {
            weight: 30,
            text: 'A discharge arcs out of the dead reactor as the segments come free, and through your sensors.',
            effects: [
              { kind: 'repair', part: 'treads', share: 0.3 },
              { kind: 'damage', part: 'sensors', share: 0.35 },
            ],
          },
        ],
      },
      {
        label: 'Strip its plating',
        hint: 'Re-plate some of the armor you have lost.',
        outcomes: [{ weight: 1, text: 'Its plates are older and thicker than yours, and they still fit.', effects: [{ kind: 'repair', part: 'armor', share: 0.4 }] }],
      },
      DRIVE_ON,
    ],
  },
  dump: {
    id: 'dump',
    title: 'Ammunition dump',
    text: 'An enemy ammunition dump behind a wire fence, the sentries asleep at the gate.',
    teaser: 'An enemy ammunition dump, lightly guarded',
    options: [
      {
        label: 'Load up',
        hint: 'Rearm every weapon. The sentries may wake.',
        outcomes: [
          { weight: 70, text: 'In and out before anyone wakes. Every rack and bin is full.', effects: [{ kind: 'rearm' }] },
          {
            weight: 30,
            text: 'Every rack is full by the time a sentry wakes and raises the alarm. The next defenders are waiting.',
            effects: [{ kind: 'rearm' }, { kind: 'threat', amount: 2, scope: 'next' }],
          },
        ],
      },
      {
        label: 'Blow it up',
        hint: 'The defenders ahead go short of ammunition.',
        outcomes: [{ weight: 1, text: 'The dump goes up behind you. The next battles will be short of shells.', effects: [{ kind: 'threat', amount: -2, scope: 'next' }] }],
      },
      DRIVE_ON,
    ],
  },
  drop: {
    id: 'drop',
    title: 'Stray supply drop',
    text: 'A supply drop meant for the enemy drifts down off course, far out across broken ground.',
    teaser: 'A supply drop, off course',
    options: [
      {
        label: 'Race for it',
        hint: '+1 action at the next depot. Rough going.',
        outcomes: [
          { weight: 65, text: 'The Behemoth gets there first. Spares and stores enough for an extra job at the next depot.', effects: [{ kind: 'cache', actions: 1 }] },
          {
            weight: 35,
            text: 'The ground is worse than it looked and the treads take a beating, but the drop is yours.',
            effects: [
              { kind: 'cache', actions: 1 },
              { kind: 'damage', part: 'treads', share: 0.1 },
            ],
          },
        ],
      },
      DRIVE_ON,
    ],
  },
  scavengers: {
    id: 'scavengers',
    title: 'Scavengers',
    text: 'A scavenger crew has picked half a battlefield clean. They will trade with anything that pays, even a war machine.',
    teaser: 'A scavenger crew, open to trade',
    options: [
      {
        label: 'Buy a field repair',
        hint: 'Treads and armor patched.',
        cost: 60,
        outcomes: [
          {
            weight: 1,
            text: 'They swarm over the hull with welders and spare links, and are gone within the hour.',
            effects: [
              { kind: 'repair', part: 'treads', share: 0.2 },
              { kind: 'repair', part: 'armor', share: 0.25 },
            ],
          },
        ],
      },
      {
        label: 'Buy spares for the depot',
        hint: '+1 action at the next depot.',
        cost: 50,
        outcomes: [{ weight: 1, text: 'Crates of parts, lashed to the hull for the next depot.', effects: [{ kind: 'cache', actions: 1 }] }],
      },
      DRIVE_ON,
    ],
  },
};
