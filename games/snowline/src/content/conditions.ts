// Illness and injury (SPEC 7.7). Each condition runs from onset through its acute phase to recovery;
// its severity (0–100) scales its effects and treatment brings it down. Rates are per game minute at
// severity 100.

export type ConditionId =
  | 'nausea'
  | 'food-poisoning'
  | 'deadly-poisoning'
  | 'waterborne'
  | 'wound'
  | 'infection'
  | 'sprain'
  | 'quills'
  | 'bites'
  | 'sunburn'
  | 'exhaustion';

export interface ConditionDef {
  name: string;
  /** The log line when it is over. */
  ends: string;
  /** A short word for the HUD, and a shape so it isn't told apart by colour alone (SPEC 12.4). */
  word: string;
  shape: string;
  /** How long it lasts untreated, in game minutes, at severity 100. */
  minutes: number;
  /** Drains per minute at severity 100. */
  hydration?: number;
  nutrition?: number;
  health?: number;
  rest?: number;
  morale?: number;
  /** Steps take this much longer at severity 100 (1.5 = 50% longer). */
  slow?: number;
  /** Work takes this much longer at severity 100. */
  clumsy?: number;
  /** Severity lost per minute while resting (asleep or resting), on top of the steady recovery. */
  restHeals?: number;
}

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  nausea: { name: 'nausea', ends: 'The queasiness had passed.', word: 'queasy', shape: '~', minutes: 180, hydration: 0.02, morale: 0.02 },
  'food-poisoning': {
    name: 'food poisoning', ends: 'The sickness had run its course.',
    word: 'sick',
    shape: '≈',
    minutes: 1800,
    hydration: 0.09,
    nutrition: 0.04,
    health: 0.012,
    rest: 0.03,
    morale: 0.03,
    clumsy: 1.6,
    restHeals: 0.05,
  },
  'deadly-poisoning': {
    name: 'poisoned', ends: 'The poison had worked its way out.',
    word: 'poisoned',
    shape: '☠',
    minutes: 1200,
    hydration: 0.1,
    nutrition: 0.05,
    health: 0.16,
    rest: 0.05,
    morale: 0.05,
    slow: 2,
    clumsy: 2,
    restHeals: 0.04,
  },
  waterborne: {
    name: 'stomach cramps', ends: 'The cramps had finally stopped.',
    word: 'cramps',
    shape: '§',
    minutes: 7 * 1440,
    hydration: 0.04,
    nutrition: 0.015,
    morale: 0.01,
    clumsy: 1.2,
    restHeals: 0.01,
  },
  wound: { name: 'wound', ends: 'The wound had closed.', word: 'bleeding', shape: '+', minutes: 2 * 1440, health: 0.03, morale: 0.01, clumsy: 1.3, restHeals: 0.05 },
  infection: { name: 'infection', ends: 'The fever broke.', word: 'fever', shape: '!', minutes: 5 * 1440, health: 0.035, hydration: 0.02, rest: 0.03, morale: 0.02, restHeals: 0.01 },
  sprain: { name: 'sprain', ends: 'The ankle could take weight again.', word: 'limping', shape: '‡', minutes: 3 * 1440, slow: 2.2, morale: 0.005, restHeals: 0.04 },
  quills: { name: 'quills', ends: 'The last of the quills had worked out.', word: 'quills', shape: '#', minutes: 4 * 1440, slow: 1.4, morale: 0.02, health: 0.005 },
  bites: { name: 'insect bites', ends: 'The bites had stopped itching.', word: 'bitten', shape: '∴', minutes: 600, morale: 0.03, rest: 0.01 },
  sunburn: { name: 'sunburn', ends: 'The sunburn had faded.', word: 'burnt', shape: '○', minutes: 1440, morale: 0.01, hydration: 0.01 },
  exhaustion: { name: 'exhaustion', ends: 'The worst of the tiredness had lifted.', word: 'spent', shape: '_', minutes: 720, slow: 1.3, clumsy: 1.4, morale: 0.01, restHeals: 0.3 },
};
