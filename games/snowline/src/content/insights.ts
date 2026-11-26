// Techniques (SPEC 8.1): how to do something, the same in every valley. Each is learned once, by
// accident, observation, failure, or reflection, or known from the start by some backgrounds. Recipes
// and some actions are locked until their technique is known.

export interface TechniqueDef {
  id: string;
  name: string;
  /** What the journal says the survivor worked out. */
  text: string;
  /** The line in the log when it is learned. */
  learned: string;
}

export const TECHNIQUES: readonly TechniqueDef[] = [
  { id: 'cord', name: 'Cord', text: 'Twist plant fibre against itself and it holds.', learned: 'Twisting the fibres together, they held. Cord.' },
  { id: 'sharpen', name: 'A sharp stick', text: 'A stick with a point is a tool.', learned: 'A stick with a point on it could dig, or stab, or hold meat over a fire.' },
  { id: 'spear', name: 'Fish spear', text: 'Split the end of a stick into prongs and fish can be speared.', learned: 'Split the tip into prongs, and a stick could hold a fish.' },
  { id: 'aim-low', name: 'Aim below the fish', text: 'Water bends the light: a fish is lower than it looks.', learned: 'The fish was never where it looked. Aim below it.' },
  { id: 'sparks', name: 'Sparks from steel', text: 'Some stone throws sparks when struck with steel.', learned: 'Steel on the right stone threw sparks. Sparks meant fire.' },
  { id: 'tinder-nest', name: 'A tinder nest', text: 'Sparks catch in a loose nest of the driest stuff, blown on gently.', learned: 'A loose nest, blown on gently, would catch a spark.' },
  { id: 'bow-drill', name: 'Bow drill', text: 'A spindle spun fast in a notched board makes a coal, if the wood is right.', learned: 'Spin a stick fast enough against another and it would smoke, and then glow.' },
  { id: 'bank-fire', name: 'Banking a fire', text: 'Bury the coals in ash at night and they keep till morning.', learned: 'Coals buried in ash would keep through the night.' },
  { id: 'carry-embers', name: 'Carrying embers', text: 'Embers wrapped in bark keep alive for hours.', learned: 'Embers wrapped in bark stayed alive. Fire could be carried.' },
  { id: 'hot-stones', name: 'Boiling with hot stones', text: 'Stones heated in the fire boil water in a bark vessel.', learned: 'Drop a hot stone in water and it boiled. Even in bark.' },
  { id: 'bark-vessel', name: 'Bark vessels', text: 'Folded bark, pinned, holds water.', learned: 'Folded right and pinned with a stick, bark held water.' },
  { id: 'basket', name: 'Baskets', text: 'Bark and cord make a basket to carry more.', learned: 'Bark stitched with cord made a basket.' },
  { id: 'fire-harden', name: 'Fire-hardening', text: 'Wood turned slowly over coals goes hard.', learned: 'Turned over the coals, the point went dark and hard.' },
  { id: 'smoking', name: 'Smoking food', text: 'Meat and fish dried in smoke keep for weeks.', learned: 'Food hung in the smoke dried, and kept.' },
  { id: 'weir', name: 'A fish weir', text: 'A ring of stones in the shallows traps fish.', learned: 'The fish went round the stones and could not find their way out.' },
  { id: 'snare', name: 'Snares', text: 'A loop of cord on a trail catches hares.', learned: 'Hares used the same paths every time. A loop of cord on one would catch them.' },
  { id: 'bow', name: 'A bow', text: 'A bent sapling and a cord throw an arrow.', learned: 'A sapling bent with a cord, and a straight shoot to throw.' },
  { id: 'cache', name: 'Hanging food', text: 'Food hung high from a branch is safe from thieves.', learned: 'Hung high, out on a branch, food was out of reach.' },
  { id: 'walls', name: 'Woven walls', text: 'Saplings woven between stakes keep out wind and animals.', learned: 'Woven saplings could make a wall.' },
  { id: 'signal', name: 'A signal fire', text: 'Green boughs on a fire make smoke that can be seen from the air.', learned: 'Green boughs on a fire made thick white smoke. Anyone flying over would see it.' },
  { id: 'warm-layers', name: 'Warm layers', text: 'A hide stuffed with dry grass keeps out the cold.', learned: 'A hide, stuffed with dry grass and tied on, would keep the cold out.' },
  { id: 'splint', name: 'A splint', text: 'Straight sticks bound to a hurt ankle let it heal.', learned: 'Bound between straight sticks, the ankle could take weight.' },
];

export function technique(id: string): TechniqueDef {
  const t = TECHNIQUES.find((x) => x.id === id);
  if (!t) throw new Error(`unknown technique ${id}`);
  return t;
}
