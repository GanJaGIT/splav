/** §3.12: game content as data. The simulation gets it through levels and never imports it. */

import boostersData from './boosters.json';
import buildingsData from './buildings.json';
import chainsData from './chains.json';
import type { BoosterDef, BuildingDef, ChainDef, LevelContext } from './schema';

export const chains = chainsData.chains as ChainDef[];
export const buildings = buildingsData.buildings as BuildingDef[];
export const boosters = boostersData.boosters as BoosterDef[];

/** Pier residents come from the village buildings (VIL-02). */
export const residents: string[] = buildings.map((b) => b.resident);

export const levelContext: LevelContext = { chains, residents };

export { chainsData, buildingsData, boostersData };
