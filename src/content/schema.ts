/**
 * §3.12: content schemas with hand-written checks. Every function returns a list of problems;
 * an empty list means the data is valid. Tests run them over every JSON file (QA-02).
 */

import { BOOSTER_IDS, type BoosterId } from '../config';
import { MAX_LEVEL } from '../sim/constants';
import type { ItemChain } from '../sim/types';

export interface ChainDef {
  id: ItemChain;
  maxLevel: number;
  unlockChapter: number;
}

export type BuildingEffect =
  | { type: 'daily' }
  | { type: 'backwater'; value: number }
  | { type: 'chapter'; value: number }
  | { type: 'dailyGift' }
  | { type: 'coinBonus'; value: number };

export interface BuildingDef {
  id: string;
  price: number;
  effect: BuildingEffect;
  resident: string;
}

export interface BoosterDef {
  id: BoosterId;
  /** GD-80: the level that gives it first. */
  unlockLevel: string;
  /** INP-05: keyboard shortcut (KeyboardEvent.code). */
  key: string;
}

/** What a level is checked against. */
export interface LevelContext {
  chains: readonly ChainDef[];
  residents: readonly string[];
}

const ITEM_CHAINS: readonly string[] = ['wood', 'garden', 'stone', 'fish'];
const LEVEL_ID = /^(c[1-3]-\d\d|daily-[a-z0-9-]+)$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function validateChains(raw: unknown): string[] {
  const p: string[] = [];
  const list = isObj(raw) ? raw.chains : undefined;
  if (!Array.isArray(list) || list.length === 0) return ['chains: a non-empty "chains" list'];
  const seen = new Set<string>();
  list.forEach((c: unknown, i) => {
    if (!isObj(c)) return p.push(`chains[${i}]: an object`);
    if (typeof c.id !== 'string' || !ITEM_CHAINS.includes(c.id)) p.push(`chains[${i}].id: unknown`);
    else if (seen.has(c.id)) p.push(`chains[${i}].id: duplicate ${c.id}`);
    else seen.add(c.id);
    if (c.maxLevel !== MAX_LEVEL) p.push(`chains[${i}].maxLevel: ${MAX_LEVEL} (GD-20)`);
    if (!isInt(c.unlockChapter, 1, 3)) p.push(`chains[${i}].unlockChapter: 1…3`);
  });
  return p;
}

export function validateBuildings(raw: unknown): string[] {
  const p: string[] = [];
  const list = isObj(raw) ? raw.buildings : undefined;
  if (!Array.isArray(list) || list.length === 0) return ['buildings: a non-empty "buildings" list'];
  const ids = new Set<string>();
  const residents = new Set<string>();
  list.forEach((b: unknown, i) => {
    if (!isObj(b)) return p.push(`buildings[${i}]: an object`);
    if (typeof b.id !== 'string' || !/^[a-z]+$/.test(b.id)) p.push(`buildings[${i}].id: a-z`);
    else if (ids.has(b.id)) p.push(`buildings[${i}].id: duplicate ${b.id}`);
    else ids.add(b.id);
    if (!isInt(b.price, 1, 1_000_000)) p.push(`buildings[${i}].price: a positive integer`);
    if (typeof b.resident !== 'string' || !/^[a-z]+$/.test(b.resident)) {
      p.push(`buildings[${i}].resident: a-z`);
    } else if (residents.has(b.resident)) {
      p.push(`buildings[${i}].resident: duplicate ${b.resident}`);
    } else residents.add(b.resident);
    const e = b.effect;
    if (!isObj(e)) return p.push(`buildings[${i}].effect: an object`);
    const ok =
      e.type === 'daily' ||
      e.type === 'dailyGift' ||
      (e.type === 'backwater' && isInt(e.value, 1, 10)) ||
      (e.type === 'chapter' && isInt(e.value, 2, 3)) ||
      (e.type === 'coinBonus' && typeof e.value === 'number' && e.value > 0 && e.value < 1);
    if (!ok) p.push(`buildings[${i}].effect: unknown or bad value`);
  });
  return p;
}

export function validateBoosters(raw: unknown): string[] {
  const p: string[] = [];
  const list = isObj(raw) ? raw.boosters : undefined;
  if (!Array.isArray(list)) return ['boosters: a "boosters" list'];
  const ids = list.map((b: unknown) => (isObj(b) ? b.id : undefined));
  if ([...ids].sort().join() !== [...BOOSTER_IDS].sort().join()) {
    p.push(`boosters: exactly ${BOOSTER_IDS.join(', ')}`);
  }
  list.forEach((b: unknown, i) => {
    if (!isObj(b)) return p.push(`boosters[${i}]: an object`);
    if (typeof b.unlockLevel !== 'string' || !LEVEL_ID.test(b.unlockLevel)) {
      p.push(`boosters[${i}].unlockLevel: a level id`);
    }
    if (typeof b.key !== 'string' || !/^Digit[1-9]$/.test(b.key)) {
      p.push(`boosters[${i}].key: Digit1…Digit9 (INP-05)`);
    }
  });
  return p;
}

export function validateLevel(raw: unknown, ctx: LevelContext): string[] {
  const p: string[] = [];
  if (!isObj(raw)) return ['level: an object'];
  const L = raw;
  if (typeof L.id !== 'string' || !LEVEL_ID.test(L.id)) p.push('id: c<chapter>-<NN> or daily-…');
  const chapter = L.chapter;
  if (!isInt(chapter, 1, 3)) return [...p, 'chapter: 1…3'];
  if (!isInt(L.lanes, 3, 5)) return [...p, 'lanes: 3…5 (GD-10)'];
  if (!isInt(L.rows, 7, 8)) return [...p, 'rows: 7 or 8 (GD-10)'];
  const lanes = L.lanes;
  const rows = L.rows;
  const cols = lanes + 2;
  // LD-04, UI-10
  if (chapter === 1 && (lanes > 4 || rows > 7)) p.push('chapter 1 field is at most 4×7 (LD-04)');
  if (!isInt(L.stepTicks, 1, 1000)) p.push('stepTicks: a positive integer');
  if (!isInt(L.seed, 0, 0xffffffff)) p.push('seed: an unsigned 32-bit integer');
  if (typeof L.waitFirstMerge !== 'boolean') p.push('waitFirstMerge: true or false');
  if (!isInt(L.backwater, 1, 10)) p.push('backwater: 1…10');
  if (!isInt(L.lives, 1, 5)) p.push('lives: 1…5');
  if (L.intro !== null && (typeof L.intro !== 'string' || !/^[a-z-]+$/.test(L.intro))) {
    p.push('intro: null or an id (a-z, -)');
  }
  if (L.gift !== null) {
    const g = L.gift;
    if (!isObj(g) || !BOOSTER_IDS.includes(g.booster as BoosterId) || !isInt(g.count, 1, 10)) {
      p.push('gift: null or { booster, count }');
    }
  }

  const unlocked = new Set(ctx.chains.filter((c) => c.unlockChapter <= chapter).map((c) => c.id));
  const checkItem = (where: string, v: Obj, allowJoker = false): void => {
    if (
      typeof v.chain !== 'string' ||
      !(ITEM_CHAINS.includes(v.chain) || (allowJoker && v.chain === 'joker'))
    ) {
      p.push(`${where}.chain: unknown`);
    } else if (!unlocked.has(v.chain as ItemChain)) {
      p.push(`${where}.chain: ${v.chain} is not open in chapter ${chapter}`);
    }
    if (!isInt(v.level, 1, MAX_LEVEL)) p.push(`${where}.level: 1…${MAX_LEVEL}`);
  };

  const taken = new Map<string, string>();
  const occupy = (
    where: string,
    col: unknown,
    row: unknown,
    bankOk: boolean,
    riverOk: boolean,
  ): void => {
    if (!isInt(col, 0, cols - 1) || !isInt(row, 0, rows - 1)) {
      p.push(`${where}: col 0…${cols - 1}, row 0…${rows - 1}`);
      return;
    }
    const bank = col === 0 || col === cols - 1;
    if (bank && !bankOk) p.push(`${where}: not allowed on a bank`);
    if (!bank && !riverOk) p.push(`${where}: not allowed in the river`);
    const key = `${col},${row}`;
    const other = taken.get(key);
    if (other) p.push(`${where}: the cell is taken by ${other}`);
    else taken.set(key, where);
  };

  const spawn = L.spawn;
  const spawnChains = new Map<string, number>();
  if (!isObj(spawn)) {
    p.push('spawn: an object');
  } else {
    const ps = spawn.perStep;
    if (
      !Array.isArray(ps) ||
      ps.length !== 2 ||
      !isInt(ps[0], 1, lanes) ||
      !isInt(ps[1], 1, lanes) ||
      ps[0] > ps[1]
    ) {
      p.push(`spawn.perStep: [min, max] with 1 ≤ min ≤ max ≤ ${lanes}`);
    }
    if (!Array.isArray(spawn.weights) || spawn.weights.length === 0) {
      p.push('spawn.weights: a non-empty list');
    } else {
      spawn.weights.forEach((w: unknown, i) => {
        if (!isObj(w)) return p.push(`spawn.weights[${i}]: an object`);
        checkItem(`spawn.weights[${i}]`, w);
        if (typeof w.w !== 'number' || !(w.w > 0)) p.push(`spawn.weights[${i}].w: > 0`);
        if (typeof w.chain === 'string' && typeof w.level === 'number') {
          spawnChains.set(w.chain, Math.min(spawnChains.get(w.chain) ?? MAX_LEVEL, w.level));
        }
      });
    }
  }

  if (!Array.isArray(L.obstacles)) p.push('obstacles: a list');
  else {
    L.obstacles.forEach((o: unknown, i) => {
      if (!isObj(o) || (o.type !== 'rock' && o.type !== 'snag')) {
        return p.push(`obstacles[${i}]: { type: rock | snag, col, row }`);
      }
      // GD-11: a snag only in the river, a rock in the river or on a bank.
      occupy(`obstacles[${i}]`, o.col, o.row, o.type === 'rock', true);
    });
  }

  if (!Array.isArray(L.piers) || L.piers.length < 1 || L.piers.length > 3) {
    p.push('piers: 1…3 piers (GD-42)');
  } else {
    L.piers.forEach((pier: unknown, i) => {
      if (!isObj(pier)) return p.push(`piers[${i}]: an object`);
      occupy(`piers[${i}]`, pier.col, pier.row, true, false);
      if (typeof pier.resident !== 'string' || !ctx.residents.includes(pier.resident)) {
        p.push(`piers[${i}].resident: one of ${ctx.residents.join(', ')}`);
      }
      if (!Array.isArray(pier.orders) || pier.orders.length < 1 || pier.orders.length > 3) {
        return p.push(`piers[${i}].orders: 1…3 orders (GD-42)`);
      }
      pier.orders.forEach((o: unknown, j) => {
        if (!isObj(o)) return p.push(`piers[${i}].orders[${j}]: an object`);
        checkItem(`piers[${i}].orders[${j}]`, o);
        const from = typeof o.chain === 'string' ? spawnChains.get(o.chain) : undefined;
        if (typeof o.level === 'number' && (from === undefined || from > o.level)) {
          p.push(
            `piers[${i}].orders[${j}]: the river never brings ${String(o.chain)} up to level ${o.level}`,
          );
        }
      });
    });
  }

  if (!Array.isArray(L.initial)) p.push('initial: a list');
  else {
    L.initial.forEach((it: unknown, i) => {
      if (!isObj(it)) return p.push(`initial[${i}]: an object`);
      occupy(`initial[${i}]`, it.col, it.row, true, true);
      checkItem(`initial[${i}]`, it);
    });
  }

  if (!Array.isArray(L.script)) p.push('script: a list');
  else {
    L.script.forEach((e: unknown, i) => {
      if (!isObj(e)) return p.push(`script[${i}]: an object`);
      if (!isInt(e.step, 0, 100_000)) p.push(`script[${i}].step: ≥ 0`);
      if (!isInt(e.col, 1, lanes)) p.push(`script[${i}].col: a lane, 1…${lanes}`);
      checkItem(`script[${i}]`, e);
    });
  }
  return p;
}
