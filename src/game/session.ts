/**
 * One attempt at a level: the simulation state, the clock (SIM-02) and the action queue.
 * The interface queues actions; they are applied at the start of the next tick (SIM-10).
 */

import { config } from '../config';
import {
  applyActions,
  createState,
  step,
  type Action,
  type LevelData,
  type SimEvent,
  type SimOptions,
  type SimState,
} from '../sim';

export type TickListener = (events: readonly SimEvent[], state: SimState) => void;

export class LevelSession {
  readonly state: SimState;
  /** The game is paused: a window is open or the player left (SIM-03). */
  paused = false;
  /** DEV-02: tests stop the clock and advance it tick by tick. */
  timeStopped = false;
  /** DEV-02: clock speed. */
  speed = 1;
  private acc = 0;
  private pending: Action[] = [];
  private readonly listeners: TickListener[] = [];

  constructor(
    readonly level: LevelData,
    readonly attempt: number,
    opts: SimOptions,
  ) {
    this.state = createState(level, opts);
  }

  onTick(cb: TickListener): void {
    this.listeners.push(cb);
  }

  queue(...actions: Action[]): void {
    this.pending.push(...actions);
  }

  /** Drops queued actions (pause: a grab the player made must not happen later). */
  clearPending(): void {
    this.pending = [];
  }

  /** DEV-02: a bot (or a test) adds actions right before every tick. */
  driver: ((state: SimState) => Action[]) | null = null;

  /** SIM-02: whole ticks from real time, at most 5 per frame; the rest is dropped. */
  advance(ms: number): void {
    if (this.paused || this.timeStopped) {
      this.acc = 0;
      return;
    }
    this.acc += ms * this.speed;
    let n = Math.floor(this.acc / config.tickMs);
    this.acc -= n * config.tickMs;
    if (n > config.maxTicksPerFrame * Math.max(1, this.speed)) {
      n = config.maxTicksPerFrame * Math.max(1, this.speed);
      this.acc = 0;
    }
    for (let i = 0; i < n; i++) this.tick();
  }

  /** Part of the current tick already elapsed, 0…1, for smooth drawing. */
  tickProgress(): number {
    return this.paused || this.timeStopped ? 0 : Math.min(1, this.acc / config.tickMs);
  }

  tick(): void {
    if (this.driver) this.pending.push(...this.driver(this.state));
    const actions = this.pending;
    this.pending = [];
    step(this.state, actions);
    this.emit();
  }

  /** Actions applied right away without a tick (pause, continue — YG-04, GD-52). */
  applyNow(actions: Action[]): void {
    applyActions(this.state, actions);
    this.emit();
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.state.events, this.state);
  }
}
