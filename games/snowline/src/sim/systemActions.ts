// The actions each later system adds (fire, materials, camp, and from M4 fishing and hunting), gathered
// in one place so sim/actions.ts can offer them all. Each system's file exports its own lists and imports
// only sim/actionKit.ts from the action machinery, which keeps imports free of cycles.

import type { ActionDef, ItemActionDef } from './actionKit.ts';
import { CAMP_ACTIONS } from './camp.ts';
import { FIRE_ACTIONS, FIRE_ITEM_ACTIONS } from './fire.ts';
import { MATERIAL_ACTIONS } from './materials.ts';
import { HUNT_ACTIONS, HUNT_ITEM_ACTIONS } from './hunting.ts';
import { HAZARD_ITEM_ACTIONS } from './hazards.ts';

export const SYSTEM_ACTIONS: ActionDef[] = [...HUNT_ACTIONS, ...FIRE_ACTIONS, ...MATERIAL_ACTIONS, ...CAMP_ACTIONS];
export const SYSTEM_ITEM_ACTIONS: ItemActionDef[] = [...FIRE_ITEM_ACTIONS, ...HUNT_ITEM_ACTIONS, ...HAZARD_ITEM_ACTIONS];
