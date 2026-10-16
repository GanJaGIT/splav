/** §3.12: game content as data. The simulation gets it through levels and never imports it. */

import boostersData from './boosters.json';
import buildingsData from './buildings.json';
import type { ShopProductDef } from '../services/shop';
import type { DailyTemplate } from '../sim/daily';
import chainsData from './chains.json';
import dailyData from './daily.json';
import type { BoosterDef, BuildingDef, ChainDef, LevelContext } from './schema';
import shopData from './shop.json';

export const chains = chainsData.chains as ChainDef[];
export const buildings = buildingsData.buildings as BuildingDef[];
export const boosters = boostersData.boosters as BoosterDef[];
/** SIM-70: the shape of the daily river. */
export const dailyTemplate = dailyData as DailyTemplate;
/** YG-14: what each product gives. */
export const shopProducts = shopData.products as ShopProductDef[];

/** Pier residents come from the village buildings (VIL-02). */
export const residents: string[] = buildings.map((b) => b.resident);

export const levelContext: LevelContext = { chains, residents };

export { chainsData, buildingsData, boostersData };
