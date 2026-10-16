import type { Page } from '@playwright/test';
import type { DevHooks } from '../../src/dev';
import type { Ref, SimState } from '../../src/sim';

declare global {
  interface Window {
    __game?: DevHooks;
  }
}

export type Point = { x: number; y: number };

export async function openGame(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__game?.isReady() === true);
}

/** TUT-02: a "New" card opens before some levels; it waits for "Got it". */
export async function skipIntro(page: Page): Promise<void> {
  const ok = page.locator('[data-ui="intro-ok"]');
  if ((await ok.count()) > 0) await ok.click();
}

export async function state(page: Page): Promise<ReturnType<DevHooks['state']>> {
  const s = await page.evaluate(() => window.__game?.state());
  if (!s) throw new Error('no game');
  return s;
}

export async function sim(page: Page): Promise<SimState> {
  const s = await page.evaluate(() => window.__game?.sim());
  if (!s) throw new Error('no level');
  return s;
}

/** Client coordinates of a cell or backwater slot centre. */
export async function point(page: Page, ref: Ref): Promise<Point> {
  const p = await page.evaluate(
    (r) =>
      r.at === 'cell' ? window.__game?.cellClient(r.col, r.row) : window.__game?.slotClient(r.slot),
    ref,
  );
  if (!p) throw new Error('no field');
  return p;
}

/** Runs ticks and lets the drawing catch up (items glide for ~180 ms). */
export async function tick(page: Page, n = 1): Promise<void> {
  await page.evaluate((k) => window.__game?.tick(k), n);
  await page.waitForTimeout(260);
}

export async function mouseDrag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

export async function mouseTap(page: Page, p: Point): Promise<void> {
  await page.mouse.click(p.x, p.y);
}

/**
 * A finger drag: touch Pointer Events on the field, the way a phone sends them. The item is drawn
 * 28 px above the finger (INP-01), so the finger ends 28 px below the target.
 */
export async function touchDrag(page: Page, from: Point, to: Point): Promise<void> {
  await page.evaluate(
    ([a, b]) => {
      const field = document.getElementById('canvas-host');
      if (!field || !a || !b) throw new Error('no field');
      const fire = (type: string, p: { x: number; y: number }): void => {
        field.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: p.x,
            clientY: p.y,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        );
      };
      const end = { x: b.x, y: b.y + 28 };
      fire('pointerdown', a);
      for (let i = 1; i <= 6; i++) {
        fire('pointermove', { x: a.x + ((end.x - a.x) * i) / 6, y: a.y + ((end.y - a.y) * i) / 6 });
      }
      fire('pointerup', end);
    },
    [from, to],
  );
}

/** Where the bot's next decision goes: the grab and the drop target. */
export async function nextMove(page: Page): Promise<{ from: Point; to: Point } | null> {
  const d = await page.evaluate(() => window.__game?.decide() ?? null);
  if (!d) return null;
  const s = await sim(page);
  let to: Ref | null = null;
  if (d.plan.kind === 'deliver') {
    const pier = s.piers[d.plan.pierId];
    if (pier) to = { at: 'cell', col: pier.col, row: pier.row };
  } else if (d.plan.kind === 'merge') {
    const id = d.plan.targetId;
    const i = s.grid.findIndex((c) => c.kind === 'item' && c.item.id === id);
    if (i >= 0) to = { at: 'cell', col: i % s.cols, row: Math.floor(i / s.cols) };
  } else {
    to = d.plan.to;
  }
  if (!to) return null;
  return { from: await point(page, d.grab), to: await point(page, to) };
}

/** Plays the open level to the end with the given kind of drag; time is stopped meanwhile. */
export async function playThrough(
  page: Page,
  drag: (page: Page, from: Point, to: Point) => Promise<void>,
  maxMoves = 80,
): Promise<string> {
  await page.evaluate(() => window.__game?.stopTime());
  for (let i = 0; i < maxMoves; i++) {
    const st = await state(page);
    if (st.status !== 'playing') return st.status ?? 'none';
    const move = await nextMove(page);
    if (!move) {
      await tick(page, 10);
      continue;
    }
    await drag(page, move.from, move.to);
    await tick(page, 2);
  }
  return (await state(page)).status ?? 'none';
}

/** A save written before the game loads (only if there is none yet). */
export async function presetSave(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.addInitScript((data) => {
    if (!localStorage.getItem('splav.save')) {
      localStorage.setItem('splav.save', JSON.stringify({ v: 1, updatedAt: 1, ...data }));
    }
  }, save);
}

/** Levels c1-01 … c1-<n> passed with 2 stars. */
export function passed(n: number): Record<string, { stars: number }> {
  const levels: Record<string, { stars: number }> = {};
  for (let i = 1; i <= n; i++) levels[`c1-${String(i).padStart(2, '0')}`] = { stars: 2 };
  return levels;
}

/** A level won with one delivery: the "Level complete" window opens at once. */
export async function quickWin(page: Page, id = 'c1-91'): Promise<void> {
  await page.evaluate((levelId) => {
    window.__game?.openLevel({
      id: levelId,
      chapter: 1,
      lanes: 3,
      rows: 7,
      stepTicks: 2,
      seed: 5,
      waitFirstMerge: true,
      spawn: { perStep: [3, 3], weights: [{ chain: 'garden', level: 1, w: 1 }] },
      initial: [
        { col: 3, row: 2, chain: 'wood', level: 1 },
        { col: 0, row: 3, chain: 'wood', level: 1 },
        { col: 0, row: 4, chain: 'wood', level: 1 },
      ],
      script: [],
      piers: [{ col: 4, row: 2, resident: 'fisher', orders: [{ chain: 'wood', level: 1 }] }],
      obstacles: [],
      backwater: 1,
      lives: 3,
      intro: null,
      gift: null,
    });
    window.__game?.stopTime();
    // A merge first (coins), then the delivery wins.
    window.__game?.act([
      { type: 'grab', ref: { at: 'cell', col: 0, row: 3 } },
      { type: 'drop', ref: { at: 'cell', col: 0, row: 4 } },
    ]);
    window.__game?.tick(1);
    window.__game?.act([
      { type: 'grab', ref: { at: 'cell', col: 3, row: 2 } },
      { type: 'drop', ref: { at: 'cell', col: 4, row: 2 } },
    ]);
    window.__game?.tick(1);
  }, id);
  await page.locator('[data-ui="level-complete"]').waitFor();
}
