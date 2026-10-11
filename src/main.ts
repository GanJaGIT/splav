import { createGame } from './game/createGame';
import { dictionaries, supportedLangs } from './i18n';
import { createPlatform } from './platform';
import { I18n, resolveLang } from './services/I18n';
import { Hud } from './ui/hud';
import { computeLayout, type FieldGeometry } from './ui/layout';
import { LoadingScreen } from './ui/loading';
import { installInputGuards, Stage } from './ui/stage';
import './ui/styles.css';

/** Stage 0: an empty 5×8 field (5 lanes + 2 banks, 8 rows). Levels arrive in Stage 1. */
const FIELD: FieldGeometry = { cols: 7, rows: 8, backwater: 5 };

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

  const hud = new Hud(byId('ui'), i18n);
  const stage = new Stage(byId('viewport'), byId('stage'), platform.isDesktop());
  stage.onResize((w, h) => hud.applyLayout(computeLayout(w, h, FIELD)));
  stage.fit();
  loading.progress(0.7);

  // YG-02: LoadingAPI.ready() exactly once, when the first interactive screen is drawn.
  let readySent = false;
  const game = createGame(byId('canvas-host'), FIELD, () => {
    if (readySent) return;
    readySent = true;
    loading.done();
    platform.gameReady();
  });
  stage.onResize(() => game.scale.refresh());

  if (__DEV_HOOKS__) {
    const { installDevHooks } = await import('./dev');
    installDevHooks({ platform, game });
  }
}

void main();
