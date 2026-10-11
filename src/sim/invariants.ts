/** SIM-40, SIM-41: state hash and invariants. */

import { MAX_BOOSTERS_PER_LEVEL, MAX_LEVEL } from './constants';
import { fnv1a } from './hash';
import type { Item, SimState } from './types';

/** SIM-40: equal states give equal hashes; the state is plain JSON with a fixed key order. */
export function hashState(s: SimState): number {
  return fnv1a(JSON.stringify(s));
}

/** Deep copy of a state (it is plain JSON). */
export function cloneState(s: SimState): SimState {
  return JSON.parse(JSON.stringify(s)) as SimState;
}

/** SIM-41: returns the broken invariants, empty when the state is consistent. */
export function checkInvariants(s: SimState): string[] {
  const problems: string[] = [];
  const cells = s.cols * s.rows;
  if (s.grid.length !== cells) problems.push(`grid has ${s.grid.length} cells, expected ${cells}`);

  const items: Item[] = [];
  for (const cell of s.grid) if (cell.kind === 'item') items.push(cell.item);
  const onField = items.length;
  if (onField > cells) problems.push(`${onField} items on ${cells} cells`);
  if (s.backwater.length !== s.backwaterCap) {
    problems.push(`backwater has ${s.backwater.length} slots, cap ${s.backwaterCap}`);
  }
  for (const item of s.backwater) if (item) items.push(item);
  if (s.hand) items.push(s.hand.item);

  const ids = new Set<number>();
  for (const item of items) {
    if (ids.has(item.id)) problems.push(`duplicate item id ${item.id}`);
    ids.add(item.id);
    if (item.id >= s.nextItemId) problems.push(`item id ${item.id} ≥ nextItemId ${s.nextItemId}`);
    const okLevel =
      item.chain === 'joker'
        ? item.level === 0
        : Number.isInteger(item.level) && item.level >= 1 && item.level <= MAX_LEVEL;
    if (!okLevel) problems.push(`item ${item.id} ${item.chain} has level ${item.level}`);
  }

  if (s.lost < 0 || s.lost > s.lives) problems.push(`lost ${s.lost} of ${s.lives} lives`);
  if (s.boostersUsed > MAX_BOOSTERS_PER_LEVEL) problems.push(`${s.boostersUsed} boosters used`);
  if (s.freezeTicks < 0) problems.push(`freezeTicks ${s.freezeTicks}`);
  if (s.stepCounter < 0 || s.stepCounter >= s.cfg.stepTicks) {
    problems.push(`stepCounter ${s.stepCounter} of ${s.cfg.stepTicks}`);
  }
  for (const p of s.piers) {
    if (p.done < 0 || p.done > p.orders.length) problems.push(`pier ${p.id} done ${p.done}`);
    const cell = s.grid[p.row * s.cols + p.col];
    if (cell?.kind !== 'pier' || cell.pierId !== p.id) {
      problems.push(`pier ${p.id} not on its cell`);
    }
  }
  if (s.status === 'won' && s.piers.some((p) => p.done < p.orders.length)) {
    problems.push('won with orders left');
  }
  return problems;
}
