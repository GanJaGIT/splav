import { App } from './app';
import { residents } from './content';
import { levelOrder, levels } from './content/levels';
import { createGame, resizeGame } from './game/createGame';
import { dictionaries, supportedLangs } from './i18n';
import { createPlatform } from './platform';
import { AudioService } from './services/audio';
import { GameplayState } from './services/gameplay-state';
import { I18n, resolveLang } from './services/I18n';
import { Lifecycle } from './services/lifecycle';
import { LoadingScreen } from './ui/loading';
import { installInputGuards, Stage } from './ui/stage';
import './ui/styles.css';

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing in index.html`);
  return node;
}

async function main(): Promise<void> {
  installInputGuards();
  const loading = new LoadingScreen();

  const platform = createPlatform();
  await platform.init();
  loading.progress(0.4);

  const i18n = new I18n(dictionaries, resolveLang(platform.lang(), supportedLangs));
  document.documentElement.lang = i18n.lang;
  document.title = i18n.t('game.title');

  const audio = new AudioService();
  // SND-03: sound starts after the first touch or key, wherever it lands.
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, () => audio.unlock(), { capture: true, once: true });
  }
  const gameplay = new GameplayState(platform);
  const stageEl = byId('stage');
  const stage = new Stage(byId('viewport'), stageEl, platform.isDesktop());

  // YG-02: LoadingAPI.ready() exactly once, when the first interactive screen is drawn.
  let ready = false;
  const { game, scene } = createGame(byId('canvas-host'), residents, () => {
    if (ready) return;
    ready = true;
    loading.done();
    platform.gameReady();
  });
  const app = new App({
    platform,
    audio,
    gameplay,
    scene,
    i18n,
    ui: byId('ui'),
    field: byId('canvas-host'),
  });
  const lifecycle = new Lifecycle(audio, gameplay, () => app.interrupt());
  lifecycle.attach(platform);
  app.lifecycle = lifecycle;

  stage.onResize((w, h) => {
    resizeGame(game, scene, w, h);
    app.stageResized(w, h);
  });
  stage.fit();
  loading.progress(0.7);

  // UI-02: the first launch goes straight to level 1 (the village arrives in Stage 3).
  const asked = __DEV_HOOKS__ ? new URLSearchParams(window.location.search).get('level') : null;
  app.startLevel(asked && levels[asked] ? asked : (levelOrder[0] ?? 'c1-01'));

  if (__DEV_HOOKS__) {
    const { installDevHooks } = await import('./dev');
    installDevHooks({
      app,
      platform,
      game,
      scene,
      audio,
      gameplay,
      stage: stageEl,
      isReady: () => ready,
    });
  }
}

void main();
