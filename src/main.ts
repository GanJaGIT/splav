import { App } from './app';
import { config } from './config';
import { boosters, buildings, residents, shopProducts } from './content';
import { levelOrder, levels } from './content/levels';
import { createGame, resizeGame } from './game/createGame';
import { dictionaries, supportedLangs } from './i18n';
import { createPlatform } from './platform';
import { AdService } from './services/ads';
import { AudioService } from './services/audio';
import { GameplayState } from './services/gameplay-state';
import { I18n, resolveLang } from './services/I18n';
import { LeaderboardService } from './services/leaderboard';
import { Lifecycle } from './services/lifecycle';
import { ProgressService } from './services/progress';
import { SaveService } from './services/save';
import { ShopService } from './services/shop';
import { LoadingScreen } from './ui/loading';
import { installInputGuards, Stage } from './ui/stage';
import './ui/styles.css';

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing in index.html`);
  return node;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  installInputGuards();
  const loading = new LoadingScreen();

  // YG-14: purchases behind the flag; dev and e2e builds may turn them on with ?iap=1.
  const iap =
    config.features.iap ||
    (__DEV_HOOKS__ && new URLSearchParams(window.location.search).get('iap') === '1');
  const { platform, local } = await createPlatform(iap);
  await platform.init();
  loading.progress(0.3);

  // YG-07: the fresher of the local and the cloud copy.
  const save = new SaveService(platform, storage());
  await save.load();
  const progress = new ProgressService(save, { order: levelOrder, levels, buildings, boosters });
  loading.progress(0.5);

  // YG-06: the language the player chose wins over the platform's.
  const lang = resolveLang(save.data.settings.lang ?? platform.lang(), supportedLangs);
  const i18n = new I18n(dictionaries, lang);
  document.documentElement.lang = i18n.lang;
  document.title = i18n.t('game.title');

  const audio = new AudioService();
  // SND-03: sound starts after the first touch or key, wherever it lands.
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, () => audio.unlock(), { capture: true, once: true });
  }
  const gameplay = new GameplayState(platform);
  // YG-20: on a phone, fullscreen on the first touch if the platform did not turn it on.
  window.addEventListener('pointerdown', () => platform.requestFullscreen(), {
    capture: true,
    once: true,
  });
  // The lifecycle needs the app (it pauses the level); ads need the lifecycle to go silent.
  let lifecycleRef: Lifecycle | null = null;
  const ads = new AdService(platform, { setAd: (on) => lifecycleRef?.setAd(on) }, progress);
  const boards = new LeaderboardService(platform);
  const shop = new ShopService(platform, progress, shopProducts, iap, () => ads.refreshBanner());
  const stageEl = byId('stage');
  const stage = new Stage(byId('viewport'), stageEl, platform.isDesktop());

  // PERF-03: in the village the field is hidden and Phaser sleeps (no frames, no battery);
  // it wakes when a level shows the field. Only after the first frame (YG-02 waits for it).
  const fieldHost = byId('canvas-host');
  const syncLoop = (): void => {
    if (!ready) return;
    if (fieldHost.hidden) {
      game.loop.sleep();
    } else if (!game.loop.running) {
      // No catch-up for the time asleep: the river starts from where it stands.
      game.loop.resetDelta();
      game.loop.wake();
    }
  };
  new MutationObserver(syncLoop).observe(fieldHost, {
    attributes: true,
    attributeFilter: ['hidden'],
  });

  // YG-02: LoadingAPI.ready() exactly once, when the first interactive screen is drawn.
  let ready = false;
  const { game, scene } = createGame(fieldHost, residents, () => {
    if (ready) return;
    ready = true;
    loading.done();
    platform.gameReady();
    syncLoop();
  });
  const app = new App({
    platform,
    audio,
    gameplay,
    scene,
    progress,
    ads,
    boards,
    shop,
    i18n,
    ui: byId('ui'),
    field: byId('canvas-host'),
  });
  const lifecycle = new Lifecycle(audio, gameplay, () => app.interrupt());
  lifecycle.attach(platform);
  app.lifecycle = lifecycle;
  lifecycleRef = lifecycle;
  // YG-09: after the account selection dialog the chosen progress is read and the village opens.
  platform.onAccountChange(() => {
    void save.reloadFromCloud().then(() => {
      boards.reset();
      app.accountChanged();
    });
  });
  // YG-14, 1.13.1: purchases the game has not applied yet, at every launch.
  void shop.init().then(() => app.renderVillage());
  // YG-08: what the cloud has not got yet goes when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save.flush();
  });
  window.addEventListener('pagehide', () => save.flush());

  stage.onResize((w, h) => {
    resizeGame(game, scene, w, h);
    app.stageResized(w, h);
  });
  stage.fit();
  loading.progress(0.7);

  const asked = __DEV_HOOKS__ ? new URLSearchParams(window.location.search).get('level') : null;
  app.boot(asked);

  if (__DEV_HOOKS__) {
    const { installDevHooks } = await import('./dev');
    installDevHooks({
      app,
      platform,
      game,
      scene,
      audio,
      gameplay,
      progress,
      local,
      stage: stageEl,
      isReady: () => ready,
    });
  }
}

void main();
