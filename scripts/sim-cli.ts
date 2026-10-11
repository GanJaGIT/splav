/**
 * SIM-60: npm run sim -- <level id | all> [--bot novice|normal|deft|all] [--seeds 20] [--calm]
 * Prints every seed (result, losses, seconds, coins, merges, max combo), a summary per bot,
 * the flow (LD-07) and the LD-01, LD-02, LD-05 checks. Exit code 1 if a requirement fails.
 */

import type { BotKind } from '../src/config';
import {
  BOT_KINDS,
  CHECK_SEEDS,
  durationRange,
  flowLimit,
  flowRate,
  requiredWins,
  runBot,
  seedBot,
  type BotRun,
  type LevelData,
} from '../src/sim';
import { levelIds, loadLevel } from './lib/levels';

interface Args {
  ids: string[];
  bots: BotKind[];
  seeds: number;
  calm: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    ids: [],
    bots: [...BOT_KINDS],
    seeds: CHECK_SEEDS,
    calm: false,
    quiet: false,
  };
  let botArg = 'all';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--bot') botArg = argv[++i] ?? 'all';
    else if (a === '--seeds') args.seeds = Number(argv[++i]);
    else if (a === '--calm') args.calm = true;
    else if (a === '--quiet') args.quiet = true;
    else args.ids.push(a);
  }
  if (args.ids.length === 1 && args.ids[0] === 'all') args.ids = levelIds();
  if (botArg !== 'all') {
    if (!BOT_KINDS.includes(botArg as BotKind)) throw new Error(`unknown bot ${botArg}`);
    args.bots = [botArg as BotKind];
  }
  if (!Number.isInteger(args.seeds) || args.seeds < 1)
    throw new Error('--seeds: a positive integer');
  return args;
}

const pad = (v: string | number, n: number): string => String(v).padStart(n);
const fmt = (n: number, digits = 1): string => n.toFixed(digits).replace('.', ',');
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function runLevel(level: LevelData, args: Args): boolean {
  console.log(
    `\n=== ${level.id}: поле ${level.lanes}×${level.rows}, stepTicks ${level.stepTicks}` +
      `${args.calm ? ' (спокойная река)' : ''}, perStep [${level.spawn.perStep.join(', ')}], сид ${level.seed}`,
  );
  const runs = new Map<BotKind, BotRun[]>();
  for (const kind of args.bots) {
    const list: BotRun[] = [];
    for (let k = 0; k < args.seeds; k++) {
      list.push(runBot(level, kind, { seed: level.seed + k, calm: args.calm }));
    }
    runs.set(kind, list);
    if (args.quiet) continue;
    console.log(`  бот ${kind}:`);
    for (const r of list) {
      const res = r.won ? 'победа ' : r.status === 'timeout' ? 'таймаут' : 'проигрыш';
      console.log(
        `    сид ${pad(r.seed, 6)}  ${res}  потери ${r.lost}  ${pad(fmt(r.seconds), 6)} с  ` +
          `монеты ${pad(r.coins, 4)}  слияния ${pad(r.merges, 3)}  комбо ${pad(r.maxCombo, 2)}`,
      );
    }
  }

  console.log('  сводка:');
  for (const [kind, list] of runs) {
    const wins = list.filter((r) => r.won);
    console.log(
      `    ${kind.padEnd(6)} побед ${pad(wins.length, 2)}/${list.length}, ` +
        `средние потери ${fmt(mean(list.map((r) => r.lost)), 2)}, ` +
        `длительность побед ${fmt(mean(wins.map((r) => r.seconds)))} с, ` +
        `монеты ${fmt(mean(list.map((r) => r.coins)), 0)}, макс. комбо ${Math.max(...list.map((r) => r.maxCombo))}`,
    );
  }

  let ok = true;
  const mark = (pass: boolean): string => {
    if (!pass) ok = false;
    return pass ? '✓' : '✗';
  };
  const flow = flowRate(level);
  const limit = flowLimit(level.chapter);
  console.log(
    `  ${mark(flow <= limit + 1e-9)} LD-07 поток ${fmt(flow, 2)} предм./с (предел главы ${fmt(limit, 2)})`,
  );

  if (args.seeds === CHECK_SEEDS && !args.calm) {
    for (const [kind, need] of Object.entries(requiredWins(level.id)) as [BotKind, number][]) {
      const list = runs.get(kind);
      if (!list) {
        console.log(`  · LD-01 ${kind} ≥ ${need}/20 — бот не запускался`);
        continue;
      }
      const wins = list.filter((r) => r.won).length;
      console.log(`  ${mark(wins >= need)} LD-01 ${kind}: ${wins}/20, нужно ≥ ${need}`);
    }
    const normal = runs.get('normal');
    if (normal) {
      const [lo, hi] = durationRange(level.id);
      const avg = mean(normal.filter((r) => r.won).map((r) => r.seconds));
      console.log(
        `  ${mark(avg >= lo && avg <= hi)} LD-02 средняя длительность побед normal ${fmt(avg)} с, нужно ${lo}…${hi} с`,
      );
    }
    const sb = seedBot(level.chapter);
    const first = runs.get(sb)?.[0];
    if (first)
      console.log(
        `  ${mark(first.won)} LD-05 сид ${level.seed} — бот ${sb} ${first.won ? 'проходит' : 'НЕ проходит'}`,
      );
  } else {
    console.log('  LD-01, LD-02, LD-05 проверяются только на 20 сидах без --calm');
  }
  return ok;
}

const args = parseArgs(process.argv.slice(2));
if (args.ids.length === 0) {
  console.error(
    'Использование: npm run sim -- <id уровня | all> [--bot novice|normal|deft|all] [--seeds 20] [--calm] [--quiet]',
  );
  process.exit(2);
}
let allOk = true;
for (const id of args.ids) allOk = runLevel(loadLevel(id), args) && allOk;
process.exit(allOk ? 0 : 1);
