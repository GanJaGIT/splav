import { describe, expect, it } from 'vitest';
import {
  boostersData,
  buildingsData,
  chainsData,
  levelContext,
  residents,
} from '../../src/content';
import {
  validateBoosters,
  validateBuildings,
  validateChains,
  validateLevel,
} from '../../src/content/schema';
import { level } from './sim/helpers';

describe('content (§3.12)', () => {
  it('chains, buildings and boosters are valid', () => {
    expect(validateChains(chainsData)).toEqual([]);
    expect(validateBuildings(buildingsData)).toEqual([]);
    expect(validateBoosters(boostersData)).toEqual([]);
    expect(residents).toHaveLength(6);
  });

  it('GD-21: four chains, garden and wood from chapter 1, stone 2, fish 3', () => {
    expect(chainsData.chains.map((c) => [c.id, c.unlockChapter])).toEqual([
      ['wood', 1],
      ['garden', 1],
      ['stone', 2],
      ['fish', 3],
    ]);
  });

  it('VIL-02: six buildings with starting prices', () => {
    expect(buildingsData.buildings.map((b) => b.price)).toEqual([60, 200, 450, 700, 1000, 1400]);
  });

  it('rejects broken content', () => {
    expect(validateChains({})).not.toEqual([]);
    expect(
      validateChains({ chains: [{ id: 'gold', maxLevel: 7, unlockChapter: 9 }, 5] }),
    ).toHaveLength(4);
    expect(validateChains({ chains: [chainsData.chains[0], chainsData.chains[0]] })).toEqual([
      'chains[1].id: duplicate wood',
    ]);
    expect(validateBuildings({ buildings: [] })).not.toEqual([]);
    expect(
      validateBuildings({
        buildings: [
          { id: 'Mill', price: 0, resident: 'x1', effect: { type: 'chapter', value: 9 } },
          { id: 'a', price: 1, resident: 'a', effect: null },
          { id: 'a', price: 1, resident: 'a', effect: { type: 'daily' } },
          7,
        ],
      }),
    ).toHaveLength(8);
    expect(
      validateBoosters({ boosters: [{ id: 'dam', unlockLevel: 'x', key: 'KeyA' }, 1] }),
    ).toHaveLength(4);
    expect(validateBoosters(null)).not.toEqual([]);
  });
});

describe('validateLevel', () => {
  const ok = level({
    piers: [{ col: 4, row: 2, resident: 'fisher', orders: [{ chain: 'wood', level: 3 }] }],
    spawn: { perStep: [1, 1], weights: [{ chain: 'wood', level: 1, w: 1 }] },
  });
  const check = (over: Record<string, unknown>): string[] =>
    validateLevel({ ...ok, ...over }, levelContext);

  it('accepts a valid level', () => {
    expect(validateLevel(ok, levelContext)).toEqual([]);
  });

  it('rejects broken fields', () => {
    expect(validateLevel(null, levelContext)).toEqual(['level: an object']);
    expect(check({ id: 'level 1' })).toContain('id: c<chapter>-<NN> or daily-…');
    expect(check({ chapter: 4 })).toContain('chapter: 1…3');
    expect(check({ lanes: 6 })).toContain('lanes: 3…5 (GD-10)');
    expect(check({ rows: 9 })).toContain('rows: 7 or 8 (GD-10)');
    expect(check({ lanes: 5 })).toContain('chapter 1 field is at most 4×7 (LD-04)');
    expect(
      check({ stepTicks: 0, seed: -1, waitFirstMerge: 1, backwater: 0, lives: 0 }),
    ).toHaveLength(5);
    expect(check({ intro: 'New!', gift: { booster: 'rocket', count: 1 } })).toHaveLength(2);
    expect(check({ spawn: null })).toContain('spawn: an object');
    expect(
      check({ spawn: { perStep: [2, 1], weights: [{ chain: 'stone', level: 0, w: 0 }, 3] } }),
    ).toEqual(
      expect.arrayContaining([
        'spawn.perStep: [min, max] with 1 ≤ min ≤ max ≤ 3',
        'spawn.weights[0].chain: stone is not open in chapter 1',
        'spawn.weights[0].level: 1…6',
        'spawn.weights[0].w: > 0',
        'spawn.weights[1]: an object',
      ]),
    );
    expect(check({ spawn: { perStep: [1, 1], weights: [] } })).toContain(
      'spawn.weights: a non-empty list',
    );
  });

  it('checks cells, piers, orders, obstacles, initial items and the script', () => {
    const problems = check({
      piers: [
        { col: 2, row: 2, resident: 'king', orders: [{ chain: 'garden', level: 3 }] },
        { col: 0, row: 9, resident: 'fisher', orders: [] },
        7,
      ],
      obstacles: [
        { type: 'snag', col: 0, row: 3 },
        { type: 'rock', col: 2, row: 2 },
        { type: 'lava', col: 1, row: 1 },
      ],
      initial: [{ col: 1, row: 1, chain: 'joker', level: 1 }, 'x'],
      script: [{ step: -1, col: 0, chain: 'wood', level: 1 }, null],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'piers[0]: not allowed in the river',
        'piers[0].resident: one of fisher, carpenter, miller, gardener, stoker, builder',
        'piers[0].orders[0]: the river never brings garden up to level 3',
        'piers[1]: col 0…4, row 0…6',
        'piers[1].orders: 1…3 orders (GD-42)',
        'piers[2]: an object',
        'obstacles[0]: not allowed on a bank',
        'piers[0]: the cell is taken by obstacles[1]',
        'obstacles[2]: { type: rock | snag, col, row }',
        'initial[0].chain: unknown',
        'initial[1]: an object',
        'script[0].step: ≥ 0',
        'script[0].col: a lane, 1…3',
        'script[1]: an object',
      ]),
    );
    expect(check({ piers: [] })).toContain('piers: 1…3 piers (GD-42)');
    expect(check({ obstacles: 1, initial: 1, script: 1 })).toEqual([
      'obstacles: a list',
      'initial: a list',
      'script: a list',
    ]);
  });
});
