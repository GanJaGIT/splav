/**
 * SIM-42: npm run bench — tick time of the simulation on the biggest field, 7×8 (5 lanes + banks).
 * The deft bot plays games and its action logs are replayed, so only `step()` is timed.
 * Target: ≤ 0.1 ms per tick. Exit code 1 if missed.
 */

import { performance } from 'node:perf_hooks';
import { Bot, createState, step, type Action, type LevelData } from '../src/sim';

const TARGET_MS = 0.1;
const TICKS_PER_GAME = 3000;
const GAMES = 30;
const RUNS = 3;

function field(name: string, stepTicks: number, perStep: [number, number]): [string, LevelData] {
  return [
    name,
    {
      id: 'c3-99',
      chapter: 3,
      lanes: 5,
      rows: 8,
      stepTicks,
      seed: 1,
      waitFirstMerge: false,
      spawn: {
        perStep,
        weights: [
          { chain: 'wood', level: 1, w: 3 },
          { chain: 'garden', level: 1, w: 3 },
          { chain: 'stone', level: 1, w: 3 },
          { chain: 'fish', level: 1, w: 3 },
          { chain: 'wood', level: 2, w: 1 },
        ],
      },
      initial: [],
      script: [],
      piers: [
        { col: 0, row: 2, resident: 'fisher', orders: [{ chain: 'wood', level: 6 }] },
        { col: 6, row: 3, resident: 'miller', orders: [{ chain: 'stone', level: 6 }] },
        { col: 0, row: 5, resident: 'gardener', orders: [{ chain: 'fish', level: 6 }] },
      ],
      obstacles: [
        { type: 'rock', col: 2, row: 5 },
        { type: 'snag', col: 4, row: 4 },
        { type: 'snag', col: 5, row: 6 },
        { type: 'rock', col: 6, row: 7 },
      ],
      backwater: 5,
      // The bench keeps games running: losses never end them.
      lives: 1_000_000,
      intro: null,
      gift: null,
    },
  ];
}

/** Action logs of games played by the deft bot. */
function record(level: LevelData): Action[][][] {
  const games: Action[][][] = [];
  for (let g = 0; g < GAMES; g++) {
    const s = createState(level, { seed: g + 1 });
    const bot = new Bot(12);
    const log: Action[][] = [];
    for (let t = 0; t < TICKS_PER_GAME && s.status === 'playing'; t++) {
      const actions = bot.next(s);
      log.push(actions);
      step(s, actions);
    }
    games.push(log);
  }
  return games;
}

function measure(level: LevelData, games: Action[][][]): { ms: number; ticks: number } {
  let best = Infinity;
  let ticks = 0;
  for (let run = 0; run < RUNS; run++) {
    const states = games.map((_, g) => createState(level, { seed: g + 1 }));
    ticks = 0;
    const start = performance.now();
    games.forEach((log, g) => {
      const s = states[g];
      if (!s) return;
      for (const actions of log) step(s, actions);
      ticks += log.length;
    });
    best = Math.min(best, (performance.now() - start) / ticks);
  }
  return { ms: best, ticks };
}

console.log(
  `Бенчмарк SIM-42: поле 7×8, ${GAMES} игр по ${TICKS_PER_GAME} тиков, лучший из ${RUNS} прогонов`,
);
let worst = 0;
for (const [name, level] of [
  field('уровень главы 3 (шаг 20, порции 1–2)', 20, [1, 2]),
  field('перегруз (шаг 3, порции 2–3)', 3, [2, 3]),
]) {
  const games = record(level);
  const { ms, ticks } = measure(level, games);
  worst = Math.max(worst, ms);
  console.log(`  ${name}: ${ms.toFixed(4)} мс на тик (${ticks} тиков)`);
}
const ok = worst <= TARGET_MS;
console.log(
  `  цель ≤ ${TARGET_MS} мс на тик: ${ok ? 'выполнена' : 'НЕ выполнена'} (худший ${worst.toFixed(4)} мс)`,
);
process.exit(ok ? 0 : 1);
