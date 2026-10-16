<!-- Конспект документации SDK Яндекс Игр (прочитано 2026-10-16) для Этапа 4. Перед правками SDK-кода всё равно сверяйтесь со страницами по ссылкам. -->

# Yandex Games SDK — condensed reference (HTML5 / TypeScript)

Read 2026-10-16 from the Russian docs. Each section names its source page. Quotes in «…» are copied word for word. I read every page with WebFetch. WebFetch's summarizer will not quote verbatim and drops `<script>` tags, so I also fetched the same `.md` (and, for sdk-about, the HTML) pages with plain `curl` to stdout and checked every signature, number and quote against that raw text. I did not fill anything in from memory.

---

## 1. Connecting and init — sdk-about
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-about.md

```html
<!-- Archive uploaded via Console (recommended): RELATIVE path -->
<script src="/sdk.js"></script>
<!-- or non-blocking -->
<script async src="/sdk.js" onload="initSDK()"></script>
<!-- Own domain (iframe integration) only: ABSOLUTE path -->
<script src="https://sdk.games.s3.yandex.net/sdk.js"></script>
```
```js
// dynamic loading
const script = document.createElement('script');
script.src = '/sdk.js';
script.async = true;
script.onload = initSDK;
document.body.append(script);
```
```ts
YaGames.init(opts?: { signed?: boolean }): Promise<SDK>   // const ysdk = await YaGames.init();
```
- `signed` (default `false`): with `true`, `payments.purchase()` and `payments.getPurchases()` return data only as an encrypted `signature`. Use it only when purchases are processed on your own server. You can also pass it to `ysdk.getPayments()`.
- Rules:
  - «Скрипт `/sdk.js` должен быть подключен до выполнения YaGames.init()».
  - For moderation, give the current path: relative for an archive upload («Это рекомендуемый вариант»), absolute for your own domain.
  - «Скачивать файл sdk.js не нужно»: during development, proxy it with the local server (§12).
- Checking it: open with `?debug-mode=16`. The loader indicator in the bottom-left shows `W` (waiting for init), `IT` (loader initialised correctly) or `IF` (old loader; reconnect the SDK as the docs describe).
- Errors: `YaGames is not defined` means the script order is wrong. `ysdk is not defined` means a method was called before init.

## 2. Game Ready and gameplay markup — sdk-game-events
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-game-events.md

```ts
ysdk.features.LoadingAPI?.ready(): void
ysdk.features.GameplayAPI?.start(): void
ysdk.features.GameplayAPI?.stop(): void
```
(Every example uses optional chaining. The page gives no return types and says nothing about calling `ready()` more than once.)
- `ready()`: «Метод нужно вызывать, когда игра загрузила все ресурсы и готова к взаимодействию с пользователем». At the moment of the call, all elements must be ready for the player and there must be no loading screens.
- `start()`: call it when a level starts, a menu closes, the game is unpaused, the game resumes after an ad, or the player returns to the tab. «Убедитесь, что после отправки события `GameplayAPI.start()` игровой процесс сразу запущен.»
- `stop()`: call it when a level is passed or lost, a menu opens, the game pauses, a fullscreen or rewarded ad shows, or the player leaves the tab. «Убедитесь, что после отправки события `GameplayAPI.stop()` игровой процесс остановлен.»
- Warning: «В момент возобновления игрового процесса снова вызовите метод `ysdk.features.GameplayAPI.start()`.»

## 3. Events — sdk-events
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-events.md

```ts
enum ESdkEventName { EXIT='EXIT', HISTORY_BACK='HISTORY_BACK',
  ACCOUNT_SELECTION_DIALOG_OPENED='ACCOUNT_SELECTION_DIALOG_OPENED',
  ACCOUNT_SELECTION_DIALOG_CLOSED='ACCOUNT_SELECTION_DIALOG_CLOSED' }
ysdk.EVENTS: { EXIT, HISTORY_BACK, ACCOUNT_SELECTION_DIALOG_OPENED, ACCOUNT_SELECTION_DIALOG_CLOSED }
ysdk.on(eventName, listener: Function): () => void      // the returned fn is undocumented (presumably unsubscribe)
ysdk.off(eventName, listener)                           // usage only, no typed signature
ysdk.dispatchEvent(eventName: ESdkEventName, detail?: object): Promise<unknown>
```
**Pause and resume:** subscribe with the plain strings `'game_api_pause'` and `'game_api_resume'`, which are not in `ysdk.EVENTS`.
```js
ysdk.on('game_api_pause', pauseCallback);  ysdk.off('game_api_pause', pauseCallback);
ysdk.on('game_api_resume', resumeCallback); ysdk.off('game_api_resume', resumeCallback);
```
- They fire when a fullscreen or rewarded ad shows or closes, the purchase window opens or closes, the player switches browser tabs, or the browser window is minimised or restored.
- **The platform calls `GameplayAPI.stop()` on `game_api_pause` and `GameplayAPI.start()` on `game_api_resume`.** If the game already called `stop()` before the pause (for example, a menu was open), the platform does not call `start()` on resume.
- Handlers in the example: pause should stop «игровой цикл и музыку», and resume should restart them.
- Games that support these events «могут быть дополнительно дистрибутированы на внешние площадки».

**Startup fullscreen ad:** «Платформа автоматически показывает полноэкранную рекламу на старте всех игр.» It has no callbacks. On `game_api_pause`, «выключите звук из игры и поставьте геймплей на паузу», then wait for `game_api_resume`. The page's example starts sound and the game loop only after resume if a pause arrived first.

**TV:**
- `HISTORY_BACK` — «Событие доступно только в случае, если игра запущена на телевизоре». Usage: `ysdk.on(ysdk.EVENTS.HISTORY_BACK, cb)`.
- `EXIT` — if the user confirmed exit in the game's own dialog, «игра должна отправить событие выхода»: `ysdk.dispatchEvent(ysdk.EVENTS.EXIT)`.

**Account selection dialog:** «Платформа сохраняет игровой прогресс как авторизованных, так и неавторизованных игроков.» After a guest logs in, the platform shows its own dialog for choosing which progress to keep.
- On `ACCOUNT_SELECTION_DIALOG_OPENED`: pause regular player-data sync.
- On `ACCOUNT_SELECTION_DIALOG_CLOSED`: go to the main menu or restart, then call `await ysdk.getPlayer()` and `player.getData()` again.

## 4. Player — sdk-player
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-player.md

```ts
ysdk.getPlayer(opts?: { signed?: boolean }): Promise<Player>   // wrap in try/catch
player.signature: string            // with signed:true → "<подпись>.<данные профиля>" (2× base64)
player.isAuthorized(): boolean      // «возвращает `true | false`»
player.getMode(): 'lite' | ''       // DEPRECATED
ysdk.auth.openAuthDialog(): Promise // awaited in example; then call getPlayer() again
player.setData(data: object, flush: boolean): Promise<void>   // flush default false
player.getData(keys?: string[]): Promise<object>
player.setStats(stats?: object): Promise<void>                // values must be numbers
player.incrementStats(increments: object): Promise<object>   // returns changed+added pairs
player.getStats(keys?: string[]): Promise<object>
player.getUniqueID(): string
player.getID()                      // DEPRECATED, console warning
player.getIDsPerGame(): Promise<Array<{ appID: number, userID: string }>>  // authorised only
player.getName(): string
player.getPhoto(size: 'small'|'medium'|'large'): string
player.getPayingStatus(): 'paying'|'partially_paying'|'not_paying'|'unknown'
ysdk.getStorage(): Promise<Storage-like safeStorage>
ysdk.isAvailableMethod(name: string): Promise<Boolean>   // e.g. 'player.getIDsPerGame'
```
- `getPlayer()` passes the user ID for everyone, the avatar and name for authorised players, and platform purchase data (games with purchases, players from Russia only). If the player denied access to personal data, the response contains only the ID.
- `signed: true`: send `player.signature` to your own server to verify the player. The key becomes available after in-app purchases are connected.
- `getMode` deprecation: «Метод `player.getMode(): 'lite' | ''` устарел и позже будет удален из интерфейса.» Use `isAuthorized()`.
- Auth dialog: «Проинформируйте пользователя о преимуществах, которые дает авторизация.» Example flow: `if (!player.isAuthorized()) { await ysdk.auth.openAuthDialog(); player = await ysdk.getPlayer(); }`.
- `setData`:
  - Limit: «Максимальный размер данных на игрока — 200 КБ».
  - `flush: true` means «данные будут отправлены на сервер немедленно». `false` (the default) queues the request.
  - With `flush:false`, the promise only reports whether the data is valid. `getData()` returns the latest `setData()` values even before they are sent.
- `setStats`/`incrementStats`: limit 10 KB of numeric data per player. The page recommends `setStats` «для часто изменяемых числовых значений» instead of `setData`.
- `getUniqueID` vs `getID`: the two values may differ. If you bound data to `getID()`, migrate it to `getUniqueID()` (support can do a bulk migration).
- `getPayingStatus`:
  - `paying` — bought more than 500 ₽ of portal currency in the last month;
  - `partially_paying` — at least one real-money purchase in the last year;
  - `not_paying` — none in the last year;
  - `unknown` — the user is not from Russia or did not allow sharing this.
- **Rate limits** (all with «иначе он будет отклонен с ошибкой»):

  | Methods | Limit |
  |---|---|
  | `getPlayer` | 20 per 5 min |
  | `setData`, `getData` | 100 per 5 min |
  | `setStats`, `getStats`, `incrementStats` | 60 per 1 min |

- iOS on your own domain: `localStorage` may be reset, so use `safeStorage = await ysdk.getStorage()`. You can override globally with `Object.defineProperty(window,'localStorage',{get:()=>safeStorage})`; «Убедитесь, что `localStorage` не используется до переопределения.» For archive uploads, «ничего делать не нужно» (the SDK wrapper makes `localStorage` reliable).
- Reset progress: write empty data with `setData` and `setStats`. Debug panel button: «☁️ Clear cloud data».

## 5. Ads — sdk-adv
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-adv.md

```ts
// Page signature (flat):
showFullscreenAdv(callbacks?: { onOpen?(): void; onClose?(wasShown: boolean): void; onError?(error: object): void }): void
showRewardedVideo(callbacks?: { onOpen?(); onRewarded?(); onClose?(wasShown: boolean); onError?(error: object) }): void
// …but EVERY example on the page wraps them in a `callbacks` key:
ysdk.adv.showFullscreenAdv({ callbacks: { onOpen, onClose: (wasShown) => {}, onError } });
ysdk.adv.showRewardedVideo({ callbacks: { onOpen, onRewarded, onClose: (wasShown) => {}, onError } });

ysdk.adv.getBannerAdvStatus(): Promise<{ stickyAdvIsShowing: boolean; reason?: 'ADV_IS_NOT_CONNECTED'|'UNKNOWN' }>
ysdk.adv.showBannerAdv():      Promise<{ stickyAdvIsShowing: boolean; reason?: 'ADV_IS_NOT_CONNECTED'|'UNKNOWN' }>
ysdk.adv.hideBannerAdv():      Promise<{ stickyAdvIsShowing: boolean }>
```
- Fullscreen `onClose(wasShown)` is called «при закрытии рекламы, после ошибки, а также, если реклама не открылась по причине слишком частого вызова».
- Rewarded `onRewarded`: «Укажите в этой функции, какую награду пользователь получит после просмотра». `onClose` (rewarded) is described only as «Вызывается при закрытии видеорекламы». There is **no `onOffline`** on the page.
- Frequency:
  - Rewarded: «не ограничена».
  - Fullscreen: «управляется платформой». No number is given; a call that is too frequent does not open the ad and calls `onClose(false)`.
- Placement guidance:
  - Show ads after a user action, or on a timer only if a level takes more than 5 minutes.
  - Make it clear the block is an ad, not part of the game.
  - Alert: accidental clicks count as ad fraud, so «не вызывайте показ рекламы, когда пользователь активно взаимодействует с игрой». Wrong-example: `setInterval(() => ysdk.adv.showFullscreenAdv(), 180000);`.
- Sticky banner:
  - Set it up in Console → Реклама → Sticky-баннеры. Mobile portrait: Внизу or Вверху. Mobile landscape: Внизу, Вверху or Справа. Desktop: «Sticky-баннер на десктопе» (shows on the right).
  - By default it appears at game start and stays for the whole session. SDK control works only after you enable «Использовать API для показа sticky-баннера».
  - `reason` is present only when no banner is showing: `ADV_IS_NOT_CONNECTED` (banners not connected), `UNKNOWN` (error on Yandex's side).
- The page says nothing about muting or pausing during ads. That rule is 4.7 (§17).

## 6. In-app purchases — sdk-purchases
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-purchases.md

```ts
ysdk.payments                       // direct access; lazily initialised on first method call (first call slower)
ysdk.getPayments(opts?: { signed?: boolean }): Promise<Payments>   // preloads; throws if purchases unavailable
interface IProduct { id; title; description; imageURI; price /* "<цена> <код валюты>" */;
  priceValue /* "<цена>" */; priceCurrencyCode: string;
  getPriceCurrencyImage(size: 'small'|'medium'|'svg'): string /* small = default */ }
payments.getCatalog(): Promise<IProduct[]>
payments.purchase(data: { id: string; developerPayload?: string }): Promise<IPurchase | ISign>
interface IPurchase { productID: string; purchaseToken: string; developerPayload: string }
interface ISign { signature: string }
payments.getPurchases(): Promise<IPurchase[] | ISign>        // error: PAYMENT_FAILURE
payments.consumePurchase(purchaseToken: string): Promise<void>
```
- Connect purchases as early as possible: «без этого игра не пройдет модерацию». If `getPayments()` fails: enable monetisation, then check that the Console has a table with at least one product and shows «Покупки подключены».
- `purchase()` opens the payment-gateway frame. It resolves on success and rejects if the player closed the window. It can also fail because the id is unknown, the player is not authorised, the time ran out or funds were insufficient. «Пользователь может совершить покупку без авторизации, но мы рекомендуем предлагать ему войти в аккаунт заранее или при совершении покупки.»
- Alert: an unstable connection can leave a purchase unprocessed, so use the unprocessed-purchase check and `consumePurchase`. «Отказ от следования этим инструкциям может привести к отключению инап-покупок в приложении или снятию его с публикации.»
- **Unprocessed purchases:** «Эта проверка обязательна для прохождения модерации (пункт 1.13.1)». Call `getPurchases()` «например, при каждом запуске игры». «Тестировать покупки можно только после подключения их консумирования.»
- Purchase types:
  - Permanent (e.g. `disable_ads`): check ownership with `getPurchases().some(p => p.productID === 'disable_ads')`. Do not consume.
  - Consumable (e.g. currency): credit first, then `consumePurchase(token)`. «После вызова метода `payments.consumePurchase()` обработанная покупка удаляется без возможности восстановления», so modify player data first (`setData`, `setStats` or `incrementStats`).
- Currency warning: «Портальная валюта должна определяться автоматически (пункт 1.13.2). Для этого берите ее название и иконку из свойств `IProduct`.»
- Server-side verification:
  - `signature` = `<подпись>.<JSON с данными о покупке>` (base64), signed with HMAC-SHA256 using the per-game secret key (Console → Инап-покупки → Настройки).
  - `getPurchases()` signature: `data` is an **array**. `purchase()` signature: `data` is one object (fields `token`, `status`, `product{id,title,description,price{code,value},imagePrefix}`, `developerPayload`).
- The page lists no rate limits.

## 7. Leaderboards — sdk-leaderboard
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-leaderboard.md

```ts
ysdk.leaderboards.getDescription(leaderboardName: string): Promise<ILeaderboardDescription>
  // { appID: string; default: boolean; name: string; title: Record<Locale,string>;
  //   description: { invert_sort_order: boolean; sort_order: 'DESC'|'ASC' (string);
  //                  score_format: { type: 'numeric'|'time'; options: { decimal_offset: number } } } }
ysdk.leaderboards.setScore(leaderboardName: string, score: number, extraData?: string): Promise<void>
ysdk.leaderboards.getPlayerEntry(leaderboardName: string): Promise<ILeaderboardEntry>
  // { score: number; rank: number; extraData: string;
  //   player: { publicName; uniqueID; getAvatarSrc(size?); getAvatarSrcSet(size?) } } size: 'small'|'medium'|'large'
ysdk.leaderboards.getEntries(leaderboardName: string,
  options: { includeUser?: boolean; quantityAround?: number; quantityTop?: number }): Promise<ILeaderboardEntries>
  // { leaderboard: ILeaderboardDescription; ranges: {start:number; size:number}[]; userRank: number; entries: ILeaderboardEntry[] }
```
- Old API is deprecated: «Инициализация объекта `lb` с помощью метода `ysdk.getLeaderboards()` устарела.» Mapping:

  | Old | New |
  |---|---|
  | `lb.getLeaderboardDescription` | `getDescription` |
  | `lb.setLeaderboardScore` | `setScore` |
  | `lb.getLeaderboardPlayerEntry` | `getPlayerEntry` |
  | `lb.getLeaderboardEntries` | `getEntries` |

- `setScore` and `getPlayerEntry` are «доступен только для авторизованных пользователей». Check first with `ysdk.isAvailableMethod('leaderboards.setScore')` or `'leaderboards.getPlayerEntry'`.
- `score`: «Не может быть отрицательным». For `time` leaderboards, «значение необходимо передавать в миллисекундах».
- `getPlayerEntry` with no entry fails with `err.code === 'LEADERBOARD_PLAYER_NOT_PRESENT'`.
- `getEntries` options:
  - `includeUser`: default `false`.
  - `quantityAround`: 1–10, default 5.
  - `quantityTop`: 1–20, default 5.
  - `ranges.start` is 0-based. `userRank` = 0 if absent or not included.
- **Limits:**

  | Method | Limit | Auth |
  |---|---|---|
  | `setScore` | 1 per 1 s | required |
  | `getPlayerEntry` | 60 per 5 min | required |
  | `getEntries` | 20 per 5 min | optional |
  | other requests | 20 per 5 min | — |

- No leaderboard with that «Техническое название» in the Console gives a 404. The page recommends a custom leaderboard in code if unauthorised players should be included.

## 8. Review — sdk-review
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-review.md
```ts
ysdk.feedback.canReview(): Promise<{ value: boolean; reason?: 'NO_AUTH'|'GAME_RATED'|'REVIEW_ALREADY_REQUESTED'|'REVIEW_WAS_REQUESTED'|'UNKNOWN' }>
ysdk.feedback.requestReview(): Promise<{ feedbackSent: boolean }>   // true = rated, false = closed popup
```
- «Запросить оценку игры можно только один раз за сессию. Обязательно используйте метод `ysdk.feedback.canReview()` перед выполнением запроса.» Without it, `feedbackSent:false` may come with the error `use canReview before requestReview`.
- Requires an authorised user who has not rated the game yet.

## 9. Desktop shortcut — sdk-shortcut
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-shortcut.md
```ts
ysdk.shortcut.canShowPrompt(): Promise<{ canShow: boolean }>
ysdk.shortcut.showPrompt(): Promise<{ outcome: 'accepted' | … }>   // only 'accepted' shown
```
- Availability depends on the device, the browser's rules and platform limits. Show the button only if `canShow`.
- The first call creates a shortcut to the Yandex Games catalog. If that already exists, it creates a shortcut to the game itself.
- The example comment allows a reward when `outcome === 'accepted'`. The page sets no rules about rewards.

## 10. Environment — sdk-environment
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-environment.md
```ts
ysdk.environment: {
  app: { id: string };
  i18n: { lang: string };            // ISO 639-1 language of the Yandex Games UI
  payload?: string;                  // ?payload=… from game URL
  referrer?: { type: 'promo'; promoId: string; intent?: string; inappId?: string }; // undefined unless opened from a promo deeplink
}
```
- `i18n.lang`: «Этот параметр нужно использовать для автоматического определения языка пользователя в игре (пункт 2.14)».
- `referrer` comes from a deeplink: `?referrer=promo&promo_id=…&promo_intent=…&inapp_id=…`. `inappId` is used only for discount promos and opens the platform purchase dialog.
- `browser.lang` and `i18n.tld` are **not documented** on the page.

## 11. Server time — sdk-server-time
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-server-time.md
```ts
ysdk.serverTime(): number   // ms timestamp, server-synchronised; called synchronously in examples
```
- It has the same format as `Date.now()`, but «устойчив к накрутке системного времени». «Вызывайте его каждый раз, когда вам требуется получить актуальное время.»
- Examples: a 24 h reward, and a once-per-UTC-day reward (`new Date(serverTime).toISOString()` date stored via `setData`).

## 12. Other SDK objects — sdk-params
Source: https://yandex.ru/dev/games/doc/ru/sdk/sdk-params.md
```ts
ysdk.screen.fullscreen: { STATUS_ON: 'on'; STATUS_OFF: 'off'; status: 'on'|'off'; request(): Promise<void>; exit(): Promise<void> }
ysdk.clipboard.writeText(text: string)
ysdk.deviceInfo: { type: 'desktop'|'mobile'|'tablet'|'tv'; isMobile(); isDesktop(); isTablet(); isTV() } // booleans
```
- «многие браузеры запрещают переключать режим без команды пользователя». Yandex Games already has a fullscreen button (top-right), so use `screen.fullscreen` only for buttons inside the game.
- `isAvailableMethod` and `getFlags` are **not** on this page. `isAvailableMethod(name): Promise<Boolean>` is documented in §4 and §7. Remote config lives on `sdk-config.md`, which I did not read.

## 13. Local launch — concepts/local-launch
Source: https://yandex.ru/dev/games/doc/ru/concepts/local-launch.md
```console
npm install -g @yandex-games/sdk-dev-proxy
npx @yandex-games/sdk-dev-proxy -h <Адрес локального сервера>          # proxy to a dev server (e.g. webpack/vite)
npx @yandex-games/sdk-dev-proxy -p <Путь до папки с игрой>             # serve a folder
npx @yandex-games/sdk-dev-proxy -p <path> --app-id=<ID игры>          # opens the draft on yandex.ru/games
… --dev-mode=true                                                     # dev environment (all SDK mocked)
```
- Flags:

  | Flag | Meaning |
  |---|---|
  | `--help` | help |
  | `--host`/`-h` | host of the local game server |
  | `--path`/`-p` | folder with game resources |
  | `--port` | port (default 8080) |
  | `--app-id`/`-i` | draft ID |
  | `--csp`/`-c` | adds the same CSP meta as the service's `index.html` |
  | `--log`/`-l` | logs requests (on by default) |
  | `--tld` | domain (default `ru`) |
  | `--dev-mode` | `true` = dev environment (default `false` = prod) |

- The package «проксирует запросы до ресурсов SDK на том же сервере, на котором будет расположена ваша игра».
- **Prod environment** needs registration and a draft:
  - Real ads, real Passport login, server-side data.
  - External hosts must be added to the CSP rules.
  - Debug panel via `&debug-mode=16`.
  - Manual setup without the package: open the draft and add `?game_url=https://localhost` (only `localhost` is allowed).
- **Dev environment**:
  - Opens at `https://localhost` with no CSP limits.
  - Ad stubs, and «все callback-функции отрабатывают аналогично prod-окружению».
  - Login through a mock dialog. Player and leaderboard data and purchases go to `localStorage`. Every SDK call is logged by module.
- Mock flags in the URL:
  ```ts
  interface SDKMocks { canShowPrompt?: boolean; isAuthorized?: boolean; lockedOrientation?: 'landscape'|'none'|'portrait' }
  // localhost:8080?mocks={"canShowPrompt":true,"isAuthorized":true,"lockedOrientation":"landscape"}
  ```
- **Purchase catalog stub** (dev mode): a file named `purchases-catalog.json` **in the project root**, holding a JSON array. A purchase opens a mock dialog with success and cancel options.
  ```json
  [{ "description": "Well styled modern avatar image", "id": "avatar", "imageURI": "{path-to-image}",
     "price": "100 RUB", "priceCurrencyCode": "RUB", "priceValue": "100", "title": "Premium avatar",
     "getPriceCurrencyImage": "return ''" }]
  ```
  (For `getPriceCurrencyImage`, the page says «В `''` можно подставить путь до изображения».)

## 14. TypeScript — sdk/typescript
Source: https://yandex.ru/dev/games/doc/ru/sdk/typescript.md
```console
npm install --save @types/ysdk
```
```ts
import type { SDK, Player } from 'ysdk';
const ysdk: SDK = await YaGames.init();
const player: Player = await ysdk.getPlayer();
```
- The page gives **no version** and says nothing about tsconfig `types` or globals.
- From the npm registry (not the page): `@types/ysdk` latest is **1.2.0** (modified 2026-10-04, `nonNpm: true`, `types: index.d.ts`); `@yandex-games/sdk-dev-proxy` latest is **0.0.2**.

## 15. Requirement 1.9 — saving progress
Source: https://yandex.ru/dev/games/doc/ru/requirements/1/9.md
- Rule: «изменения сохраняются сразу после действия игрока или по специальной кнопке. После обновления страницы или смены ориентации экрана на мобильном устройстве прогресс не теряется.» Any other save mechanic «должны быть описаны в комментарии разработчика».
- Save («Сохранять прогресс нужно»): right after a user action or a button press; «независимо от того, авторизован пользователь или нет»; on orientation change (mobile).
- Saving is mandate («Обязательно») in games with records or achievements (win, pass a level, get an item).
- Where to save:
  - Yandex servers via the SDK (recommended). Tick cloud saves in the draft (1.11).
  - Your own server.
  - localStorage or IndexedDB «только для простых игр без инап-покупок».
  - Cloud saves are «обязательны для игр с инап-покупками (пункт 1.13.3)».
- Violations: «Прогресс сохраняется периодически»; not restored after refresh or rotation; «Результаты пользователя сохраняются только в лидерборде»; an undocumented save mechanic.

## 16. Requirement 1.19 — SDK methods
Source: https://yandex.ru/dev/games/doc/ru/requirements/1/19.md
- **1.19.1** «SDK инициализируется строго так, как указано на странице Подключение и использование. Чтобы требование считалось выполненным, должен использоваться актуальный лоадер.» Check: the debug panel shows `IT` («Is loader: true»), not `IF`.
- **1.19.2** Call `LoadingAPI.ready()` when the user can start playing. It «должен вызываться в корректный момент».
  - The indicator must turn from purple to green **within 90 seconds**. Red after 90 s means `"ready" called on timeout`; staying purple means `SDK is not initialized`.
  - «вызов `LoadingAPI.ready()` нужно привязать к реальной готовности игры, а не к конкретному моменту времени». Moderation also checks «загрузочный экран не пропускается кликом».
  - Counts as ready: controls become available, a menu or «Нажмите, чтобы начать» appears, a countdown starts, a popup appears (privacy, login, daily bonus), a cutscene or intro starts, or settings or level select become available.
  - The game's own loading screen is reviewed: third-party links or other people's logos lead to rejection.
- **1.19.3** If start/stop are used, «моменты отправки событий строго соответствуют» the Gameplay section. Moderation checks the gamepad indicator (green while playing, red while paused) in these scenarios:
  - level start and end;
  - opening and closing the game menu;
  - opening and closing the purchase menu;
  - an ad starting and closing;
  - losing and regaining focus.
- **1.19.4** (numbered in the full list `concepts/requirements.md`): if `ysdk.on()`/`ysdk.off()` handle `game_api_pause`/`game_api_resume`, the logic must match the «Пауза и возобновление игры» section.

## 17. Requirement 4.4 — ad placement
Source: https://yandex.ru/dev/games/doc/ru/requirements/4/4.md
- **4.4** «Реклама не мешает взаимодействовать с игрой и показывается только в логических паузах.»
- Outside gameplay, ads are allowed at game start (footnote: «рекламу нужно показывать после срабатывания Game Ready») and after a non-game action (menu, settings, level select, «Новый уровень», «Магазин»). «Максимальная допустимая задержка между действием пользователя и началом рекламы — 2 секунды.»
- «Условно-пошаговые» games — «тесты, викторины, пазлы и игры с механикой слияния»: show the ad right after an in-game action, «без предупреждения», with at most a 2 s delay.
- Real-time games:
  - Levels under 5 min: no ads inside a level.
  - Levels over 5 min: allowed anywhere, after a pause plus a warning. The warning must be noticeable, last 2 s, and appear once per ad.
  - «Во время предупреждения о рекламе и самой рекламы игра должна быть на паузе» (animations may keep running).
- Modal window:
  - Opened by the user: the out-of-gameplay rules apply.
  - Opened by the game: the opening counts as gameplay, and everything after it (including closing) counts as out-of-gameplay.
  - Non-modal window: the in-gameplay rules apply.
- Frequency: «Частота показа полноэкранной рекламы управляется платформой». Calls that are too frequent produce a console warning.
- Delay: only a consistently reproduced delay over 2 s counts as a violation.
- If the game sells ad removal, no ads may show after the purchase.
- Test ads in the prod environment or in draft mode.

## 18. Requirement 1.13 — in-app purchases
Source: https://yandex.ru/dev/games/doc/ru/requirements/1/13.md
- **1.13.1** Consumption is connected. Check: buy, do not press «Хорошо», refresh, and the purchase must be kept. Test purchases made before consumption existed can block moderation.
- **1.13.2** Currency name and icon come from the SDK: `IProduct.price`, `priceCurrencyCode`, `getPriceCurrencyImage('small'|'medium'|'svg')`. Check: debug panel → «SDK mocks» ⚒️ → currency icon («Currency mock is enabled») → wait 5 s and reload. The text must become **TST** and the icon **¥**; otherwise «Такую игру модераторы отклонят».
- **1.13.3** «Покупки, сделанные с одного аккаунта, должны сохраняться на сервере (либо Яндекс Игр, либо внешнем) и быть доступны независимо от смены устройства или браузера.» «У игры должна быть запущена одна сессия.»
- **1.13.4** (full list): «Все покупки внутри игры имеют обозначенную цифрами стоимость и указание портальной валюты.»
- **1.13.5** The image, name, contents and characteristics must match the offer. Ad removal must remove fullscreen ads and sticky banners. The startup fullscreen ad and rewarded ads are exempt. «Если после покупки продолжает отображаться хотя бы один вид рекламы … игра будет отклонена.»
- General: progress is saved on the server for one user across devices. The in-game product list matches the Console (active products present, inactive or empty ones absent).

## 19. Requirement 1.2 — authorization
Source: https://yandex.ru/dev/games/doc/ru/requirements/1/2.md
- **1.2** «Для запуска и использования игры не требуется регистрация или авторизация на сторонних сервисах. Допустима только авторизация с Яндекс ID.» Guest play must exist, «Прогресс игрока при этом сохраняется».
- **1.2.1** «Авторизация происходит только после осознанного действия пользователя.» A clearly labelled button (e.g. «Авторизоваться») must state the benefits: cloud progress, news and promo notifications, purchases available in any browser. The user can decline and keep playing.
- Violations:
  - login required to play;
  - insistent or frequent prompts;
  - the prompt still shown after login;
  - the login page opened from unrelated buttons such as «Лидерборд» or «Оценить игру»;
  - no benefits explained;
  - no way to decline.

## Cross-refs from the full list (https://yandex.ru/dev/games/doc/ru/concepts/requirements.md)
- **1.3** «При потере фокуса звук из игры останавливается.»
- **1.7** «в программном коде не используются абсолютные URL, ссылающиеся на серверы S3 Яндекса.»
- **4.7** «При показе полноэкранной рекламы (interstitial или rewarded video) звук в игре и игровой процесс должны ставиться на паузу.»

---

## Differences to watch

1. **Ad call shape.** Both ad signatures are written flat (`showFullscreenAdv(callbacks?: {onOpen,…})`), but every example passes `{ callbacks: { onOpen, onClose, onError } }`. Use the wrapped form, and keep the platform adapter strict about it.
2. **No `onOffline`.** Neither ad method documents it. Rewarded `onClose(wasShown)` is in the signature, but its description does not explain `wasShown`.
3. **Fullscreen frequency is platform-controlled.** No number is documented. A call that is too frequent does **not** fire `onOpen` and goes straight to `onClose(false)`, plus a console warning. A 180 s `setInterval` is the page's own "wrong" example. Our "180 s, only after Дальше / В деревню" cap is our own extra rule.
4. **Startup ad has no callbacks.** The platform shows a fullscreen ad at every game start. The only signal is `game_api_pause` then `game_api_resume`. The page wants sound and gameplay held until resume, and audio must not start before that.
5. **The platform calls `GameplayAPI` for you.** It calls `stop()` on `game_api_pause` and `start()` on `game_api_resume`. The only documented exception is when the game had already called `stop()` *before* the pause event.
   - Our flow conflicts with this: the level stays on the Pause window after resume until «Продолжить», and our own `stop()` comes *in response to* the pause.
   - So the platform's automatic `start()` on resume may turn the gameplay indicator green while the river is still paused.
   - Check this in the debug panel. If it happens, call `stop()` again after resume while the Pause window is shown.
6. **New account-selection events.**
   - The platform keeps guest **and** logged-in progress and shows its own dialog after login.
   - Handle `ysdk.EVENTS.ACCOUNT_SELECTION_DIALOG_OPENED` (pause sync) and `…_CLOSED` (go to menu or reload, then call `getPlayer()` and `getData()` again).
   - This overlaps with our own "newest by `updatedAt`" merge. Do not let the old in-memory state overwrite the save the player picked.
7. **Event API details.** `ysdk.on()` returns `() => void`. `ysdk.off(name, cb)` also exists. `ysdk.dispatchEvent(name, detail?): Promise<unknown>`. `game_api_pause`/`game_api_resume` are plain strings and **not** members of `ysdk.EVENTS`. `HISTORY_BACK`/`EXIT` are TV-only, and `EXIT` «должна» be dispatched after a custom exit dialog.
8. **Deprecated calls.**
   - `player.getMode()`: use `isAuthorized()`.
   - `player.getID()`: use `getUniqueID()`.
   - `ysdk.getLeaderboards()` / `lb.*`: use `ysdk.leaderboards.getDescription|setScore|getPlayerEntry|getEntries`.
9. **Payments init.** `ysdk.payments` can be used directly (lazy init). `getPayments()` is optional preloading and is **not** deprecated.
10. **Doc bugs not to copy.**
    - Purchases examples call `ysdk.player.incrementStats(...)`. `ysdk.player` is not documented anywhere else; use `await ysdk.getPlayer()`.
    - The client example for unprocessed purchases is broken (`.then(p => p.forEach(consumePurchase))`).
    - The `getCatalog` example actually calls `getPurchases()`.
    - The review example reads `sentFeedback` without `await`; the real key is `feedbackSent`.
11. **Players without login.** Requirement 1.9 says progress must be saved «независимо от того, авторизован пользователь или нет», and the events page says the platform stores guest progress too. Leaderboard `setScore` and `getPlayerEntry`, and `requestReview`, still need authorisation.
12. **`environment` changed.** New `referrer` (promo deeplinks: `promoId`, `intent`, `inappId`). Only `app.id`, `i18n.lang`, `payload` and `referrer` are documented; `browser.lang` and `i18n.tld` are not on the page anymore.
13. **New or less familiar APIs.**
    - `ysdk.serverTime()`: synchronous ms timestamp; use it for "Река дня" and daily logic instead of the device clock.
    - `ysdk.getStorage()` (safeStorage): own-domain iOS only; archive uploads are auto-wrapped.
    - `player.getIDsPerGame()`.
    - `ysdk.isAvailableMethod('…'): Promise<Boolean>`.
14. **Merge games are «условно-пошаговые».** Requirement 4.4 lists «игры с механикой слияния» explicitly. Ads right after an in-game action are allowed without a warning, with a 2 s max delay. Our real-time river may be judged as real-time; our stricter "only after Дальше / В деревню" placement is the safe reading.
15. **Game Ready within 90 s.** It must be tied to real readiness (not a timer). Moderation also checks «загрузочный экран не пропускается кликом». A purple-to-green change within 90 s on the debug panel is the pass condition.
16. **1.13.2 currency mock test.** Prices must switch to **TST** with a **¥** icon after the debug-panel Currency mock. Never hard-code «ян» or the currency icon; always use `priceValue`/`price` + `priceCurrencyCode` + `getPriceCurrencyImage()`.
17. **1.13.5 ad removal.** An "отключение рекламы" purchase must also hide the **sticky banner**. Only the startup fullscreen ad and rewarded ads are exempt.
18. **Requirement numbering.** The 1.19 page shows only 1.19.1–1.19.3 as headed items, and the 1.13 page skips 1.13.4. Both exist in the full list (1.19.4 = pause/resume handling, 1.13.4 = price in digits + portal currency). Our TZ's «п. 1.19.4» is valid.
19. **Local stub file.** `purchases-catalog.json` must sit in the **project root** for `--dev-mode=true`. In it, `getPriceCurrencyImage` is a string (`"return ''"`). Keep excluding it from the release archive.
20. **Dev-mode mocks** via the URL `?mocks={"isAuthorized":true,"canShowPrompt":true,"lockedOrientation":"landscape"}`. In dev mode, ad placeholders fire the same callbacks as prod.
21. **Types package.** The docs give `@types/ysdk` with **no version** and `import type { SDK, Player } from 'ysdk'`. npm latest is 1.2.0 (updated 2026-10-04, after the TZ was written), so re-check our typings against it. `@yandex-games/sdk-dev-proxy` latest is 0.0.2.
22. **Sticky banner SDK control is off by default.** `showBannerAdv`/`hideBannerAdv` work only after you enable «Использовать API для показа sticky-баннера» in the Console. Without it, the banner shows all session, including in levels, which would break our YG-12 rule.
