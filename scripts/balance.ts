/**
 * SIM-61: npm run balance — the normal bot plays every level in order; docs/balance.md gets the
 * coins per level, the running total against building prices (VIL-02, VIL-03), the wins of all
 * three bots, durations and losses, and warnings for LD-01, LD-03, LD-07 and VIL-03.
 * Exit code 1 when there are warnings.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BotKind } from '../src/config';
import { buildings } from '../src/content';
import {
  BOT_KINDS,
  CHECK_SEEDS,
  FIRST_WIN_BASE,
  FIRST_WIN_PER_STAR,
  flowLimit,
  flowRate,
  parseLevelId,
  requiredWins,
  runBot,
  type LevelData,
} from '../src/sim';
import { levelIds, loadLevel } from './lib/levels';

/** VIL-03: the player passes every level once, with 2 stars. */
const STARS = 2;
const FIRST_WIN_BONUS = FIRST_WIN_BASE + FIRST_WIN_PER_STAR * STARS;
/** The building that opens each next chapter (VIL-02). */
const GATES: Record<number, string> = { 1: 'mill', 2: 'bridge' };

interface Row {
  level: LevelData;
  wins: Record<BotKind, number>;
  seconds: number;
  lost: number;
  coins: number;
  total: number;
}

const fmt = (n: number, d = 0): string => n.toFixed(d).replace('.', ',');
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const rows: Row[] = [];
let total = 0;
for (const id of levelIds()) {
  const level = loadLevel(id);
  const wins = { novice: 0, normal: 0, deft: 0 } as Record<BotKind, number>;
  const normal = [];
  for (const kind of BOT_KINDS) {
    for (let k = 0; k < CHECK_SEEDS; k++) {
      const r = runBot(level, kind, { seed: level.seed + k });
      if (r.won) wins[kind]++;
      if (kind === 'normal') normal.push(r);
    }
  }
  const won = normal.filter((r) => r.won);
  // Level coins without the first-win bonus, averaged over the normal bot's wins.
  const coins = Math.round(
    mean(won.map((r) => r.coins - (FIRST_WIN_BASE + FIRST_WIN_PER_STAR * (3 - r.lost)))),
  );
  total += coins + FIRST_WIN_BONUS;
  rows.push({
    level,
    wins,
    seconds: mean(won.map((r) => r.seconds)),
    lost: mean(normal.map((r) => r.lost)),
    coins,
    total,
  });
}

const warnings: string[] = [];
rows.forEach((r, i) => {
  const id = r.level.id;
  for (const [kind, need] of Object.entries(requiredWins(id)) as [BotKind, number][]) {
    if (r.wins[kind] < need)
      warnings.push(`LD-01 ${id}: ${kind} ${r.wins[kind]}/20, нужно ≥ ${need}`);
  }
  const flow = flowRate(r.level);
  if (flow > flowLimit(r.level.chapter) + 1e-9) warnings.push(`LD-07 ${id}: поток ${fmt(flow, 2)}`);
  const prev = rows[i - 1];
  if (prev && parseLevelId(id)?.num !== 1 && prev.wins.normal - r.wins.normal > 5) {
    warnings.push(`LD-03 ${id}: обычный бот ${prev.wins.normal} → ${r.wins.normal} из 20`);
  }
});

// VIL-03: buildings in their order, the gate of the next chapter affordable by the chapter's end.
const order = buildings.map((b) => ({ id: b.id, price: b.price }));
const afford: Record<string, string> = {};
let spent = 0;
let next = 0;
for (const r of rows) {
  while (next < order.length && r.total - spent >= (order[next]?.price ?? Infinity)) {
    const b = order[next] as { id: string; price: number };
    spent += b.price;
    afford[b.id] = r.level.id;
    next++;
  }
}
for (const [chapter, gate] of Object.entries(GATES)) {
  const last = [...rows].reverse().find((r) => r.level.chapter === Number(chapter));
  const upTo = order.slice(0, order.findIndex((b) => b.id === gate) + 1);
  const need = upTo.reduce((a, b) => a + b.price, 0);
  if (!last || last.total < need) {
    warnings.push(
      `VIL-03 глава ${chapter}: к концу главы ${last?.total ?? 0} монет, а постройки до «${gate}» стоят ${need}`,
    );
  }
}

const lines: string[] = [
  '# Баланс «Сплава»',
  '',
  `Создаётся командой \`npm run balance\` (SIM-61). Обычный бот проходит все уровни подряд по одному разу; монеты уровня — среднее по его победам на 20 сидах, плюс бонус первого прохождения на ${STARS} звезды (${FIRST_WIN_BONUS}). Бонус бани (+10%) не учитывается — запас в пользу игрока.`,
  '',
  '## Уровни',
  '',
  '| Уровень | Поле | Поток | Новичок | Обычный | Ловкий | Длительность, с | Потери | Монеты | Всего |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.level.id} | ${r.level.lanes}×${r.level.rows} | ${fmt(flowRate(r.level), 2)} | ${r.wins.novice}/20 | ${r.wins.normal}/20 | ${r.wins.deft}/20 | ${fmt(r.seconds)} | ${fmt(r.lost, 2)} | ${r.coins} | ${r.total} |`,
  ),
  '',
  '## Постройки (VIL-02, VIL-03)',
  '',
  '| Постройка | Цена | Накопленная стоимость | Доступна после уровня |',
  '|---|---|---|---|',
  ...order.map((b, i) => {
    const cum = order.slice(0, i + 1).reduce((a, x) => a + x.price, 0);
    return `| ${b.id} | ${b.price} | ${cum} | ${afford[b.id] ?? '—'} |`;
  }),
  '',
  '## Предупреждения',
  '',
  ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['Нет.']),
  '',
];
const out = fileURLToPath(new URL('../docs/balance.md', import.meta.url));
writeFileSync(out, lines.join('\n'));
console.log(lines.slice(4).join('\n'));
process.exit(warnings.length ? 1 : 0);
