// The log's words for illness, injury, remedies, and the season's end (SPEC 7.7, 12.2).

import type { Who } from './messages.ts';

export const HAZARD_TEXT = {
  bitten: (w: Who) => `Mosquitoes came off the water in a whining cloud. ${w.name} was bitten all over.`,
  insectsAvoid: (plant: string) => `The insects whined everywhere, but not around the ${plant}.`,
  sunburn: (w: Who) => `Up here the sun was fierce. ${w.Their} face and neck were burning.`,
  exhausted: (w: Who) => `${w.name} had nothing left. Every step was an effort.`,
  infection: (w: Who) => `The wound had turned hot and swollen. ${w.name} was feverish.`,
  restless: (w: Who) => `A whole day in camp. ${w.name} felt caged.`,
  winterEnd: (w: Who) => `Winter came down to the lake, and ${w.name} could not outlast it.`,
  fall: (w: Who) => `The ground shifted underfoot. ${w.name} fell hard and turned an ankle.`,
  glasses: (w: Who) => `${w.Their} glasses were broken in the fall.`,
  slipped: (w: Who) => `${w.name} slipped and went under, came up gasping in the icy water.`,
  slip: (w: Who) => `Too tired to be careful, ${w.name} let the blade glance off and cut ${w.them}self.`,
  herbWorked: (_w: Who, plant: string, use: string) =>
    use === 'stomach' ? `The ${plant} settled the cramping stomach.` : use === 'wound' ? `The ${plant} drew the sting out of the wound.` : `Rubbed with the ${plant}, the insects kept off.`,
  herbIrritant: (w: Who, plant: string) => `The ${plant} stung, and made ${w.name} queasy.`,
  herbNothing: (plant: string) => `The ${plant} did nothing for it.`,
  cleaned: (w: Who) => `${w.name} washed the wound out with the boiled water.`,
  firstAid: (w: Who) => `${w.name} cleaned and dressed it properly, with the kit.`,
};
