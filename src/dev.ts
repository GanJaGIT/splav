/**
 * DEV-02: window.__game for tests; DEV-03: the ?dev=1 panel. Loaded only in dev and e2e builds
 * (`__DEV_HOOKS__`), so the release bundle has none of it. Developer texts are not game texts.
 */

import type Phaser from 'phaser';
import type { App } from './app';
import type { BotKind } from './config';
import { levelOrder } from './content/levels';
import type { LocalPlatform } from './platform/LocalPlatform';
import type { Platform } from './platform/Platform';
import type { AudioService, Sfx } from './services/audio';
import type { GameplayState } from './services/gameplay-state';
import type { ProgressService } from './services/progress';
import type { SaveData } from './services/SaveData';
import {
  cloneState,
  decide,
  type Action,
  type Decision,
  type LevelData,
  type SimState,
} from './sim';
import type { FieldScene } from './game/FieldScene';

export interface UiRect {
  ui: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface DevState {
  screen: 'village' | 'level';
  level: string | null;
  status: string | null;
  tick: number;
  paused: boolean;
  timeStopped: boolean;
  window: string | null;
  audible: boolean;
  silenced: string[];
  playing: boolean;
  lives: number;
  lost: number;
  coins: number;
  combo: number;
  hand: number | null;
  boostersUsed: number;
  stepIndex: number;
  tutorial: boolean;
  field: { cols: number; rows: number; cell: number } | null;
}

export interface DevHooks {
  platform: Platform;
  game: Phaser.Game;
  isReady(): boolean;
  state(): DevState;
  sim(): SimState | null;
  act(actions: Action[]): void;
  /** Runs ticks right now, also while the clock is stopped. */
  tick(n?: number): void;
  stopTime(): void;
  resumeTime(): void;
  setSpeed(x: number): void;
  openLevel(level: string | LevelData): void;
  decide(): Decision | null;
  cellClient(col: number, row: number): { x: number; y: number };
  slotClient(slot: number): { x: number; y: number };
  bot(kind: BotKind | null): void;
  debugUI(): UiRect[];
  played(): Sfx[];
  calls(): string[];
  /** The saved progress (a copy). */
  save(): SaveData;
  /** Adds coins and saves. */
  grant(coins: number): void;
  /** PERF-03: Phaser draws frames (false in the village, where the field is hidden). */
  rendering(): boolean;
  /** Marks a level as passed with these stars and saves. */
  win(id: string, stars: number): void;
  village(): void;
}

declare global {
  interface Window {
    __game?: DevHooks;
  }
}

export interface DevDeps {
  app: App;
  platform: Platform;
  game: Phaser.Game;
  scene: FieldScene;
  audio: AudioService;
  gameplay: GameplayState;
  progress: ProgressService;
  stage: HTMLElement;
  isReady(): boolean;
}

export function installDevHooks(d: DevDeps): void {
  const { app, scene } = d;
  const toClient = (p: { x: number; y: number }): { x: number; y: number } => {
    const r = d.stage.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  };
  window.__game = {
    platform: d.platform,
    game: d.game,
    isReady: d.isReady,
    rendering: () => d.game.loop.running,
    state: () => {
      const s = app.session?.state;
      const l = scene.getLayout();
      return {
        screen: app.village.visible() ? 'village' : 'level',
        level: app.levelId,
        status: s?.status ?? null,
        tick: s?.tick ?? 0,
        paused: app.session?.paused ?? false,
        timeStopped: app.session?.timeStopped ?? false,
        window: app.modals.current(),
        audible: d.audio.audible(),
        silenced: d.audio.silenceReasons(),
        playing: d.gameplay.isPlaying(),
        lives: s?.lives ?? 0,
        lost: s?.lost ?? 0,
        coins: s?.coins ?? 0,
        combo: s?.combo ?? 0,
        hand: s?.hand?.item.id ?? null,
        boostersUsed: s?.boostersUsed ?? 0,
        stepIndex: s?.stepIndex ?? 0,
        tutorial: app.tutorial.visible(),
        field: s ? { cols: s.cols, rows: s.rows, cell: l.cell } : null,
      };
    },
    sim: () => (app.session ? cloneState(app.session.state) : null),
    act: (actions) => app.session?.queue(...actions),
    tick: (n = 1) => {
      for (let i = 0; i < n; i++) app.session?.tick();
    },
    stopTime: () => {
      if (app.session) app.session.timeStopped = true;
    },
    resumeTime: () => {
      if (app.session) app.session.timeStopped = false;
    },
    setSpeed: (x) => {
      if (app.session) app.session.speed = x;
    },
    openLevel: (level) => app.startLevel(level),
    decide: () => (app.session ? decide(app.session.state) : null),
    cellClient: (col, row) => toClient(scene.cellCenter(col, row)),
    slotClient: (slot) => toClient(scene.slotCenter(slot)),
    bot: (kind) => app.startBot(kind),
    debugUI: () =>
      Array.from(document.querySelectorAll<HTMLElement>('#ui [data-ui]')).map((e) => {
        const r = e.getBoundingClientRect();
        return {
          ui: e.dataset.ui ?? '',
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          visible: e.offsetParent !== null && !e.closest('[hidden]'),
        };
      }),
    played: () => [...d.audio.played],
    calls: () => [...((d.platform as Partial<LocalPlatform>).calls ?? [])],
    save: () => JSON.parse(JSON.stringify(d.progress.data)) as SaveData,
    grant: (coins) => {
      d.progress.data.coins += coins;
      d.progress.setSettings({});
      app.renderVillage();
    },
    win: (id, stars) => {
      d.progress.win(id, stars, 0);
      app.renderVillage();
    },
    village: () => app.showVillage(),
  };
  if (new URLSearchParams(window.location.search).get('dev') === '1') mountPanel(app);
}

/** DEV-03: level choice, bots and the player's tempo (LD-08). */
function mountPanel(app: App): void {
  const panel = document.createElement('div');
  panel.className = 'dev-panel';
  const select = document.createElement('select');
  for (const id of levelOrder) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    select.appendChild(o);
  }
  select.addEventListener('change', () => app.startLevel(select.value));
  panel.appendChild(select);
  for (const kind of ['novice', 'normal', 'deft', null] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = kind ? `bot ${kind}` : 'bot off';
    b.addEventListener('click', () => app.startBot(kind));
    panel.appendChild(b);
  }
  const coins = document.createElement('button');
  coins.type = 'button';
  coins.textContent = '+1000';
  coins.addEventListener('click', () => window.__game?.grant(1000));
  panel.appendChild(coins);
  const tempo = document.createElement('span');
  panel.appendChild(tempo);
  window.setInterval(() => {
    tempo.textContent = `actions/s: ${app.tempo().toFixed(2)}`;
    if (app.levelId && select.value !== app.levelId) select.value = app.levelId;
  }, 500);
  document.body.appendChild(panel);
}
