// The actions each later system adds (fire, crafting, building, fishing, hunting, the wreckage), gathered
// in one place so sim/actions.ts can offer them all. Each system's file exports its own lists.

import type { ActionDef, ItemActionDef } from './actionKit.ts';

export const SYSTEM_ACTIONS: ActionDef[] = [];
export const SYSTEM_ITEM_ACTIONS: ItemActionDef[] = [];
