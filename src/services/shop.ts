/**
 * YG-14: in-app purchases behind config.features.iap. "no_ads" is permanent: no fullscreen ads
 * and no sticky banner, plus 5 boosters once. "boosters_10" is a consumable: 3 dams, 3 hooks,
 * 3 drops and 1 net. At every launch the platform's purchases are applied (requirement 1.13.1):
 * grant, save to the cloud at once, then consume — a lost connection never loses a purchase.
 * What each product gives lives in src/content/shop.json.
 */

import { BOOSTER_IDS, type BoosterId } from '../config';
import type { Platform, Product } from '../platform/Platform';
import type { ProgressService } from './progress';

export interface ShopProductDef {
  id: string;
  permanent: boolean;
  noAds: boolean;
  boosters: Partial<Record<BoosterId, number>>;
}

export type BuyResult = 'ok' | 'failed';

export class ShopService {
  products: Product[] = [];

  constructor(
    private readonly platform: Platform,
    private readonly progress: ProgressService,
    private readonly defs: readonly ShopProductDef[],
    readonly enabled: boolean,
    /** "No ads" turned on: the banner goes away at once. */
    private readonly onNoAds: () => void,
  ) {}

  /** At launch: the catalog and every purchase the game has not applied yet. */
  async init(): Promise<void> {
    if (!this.enabled) return;
    try {
      const catalog = await this.platform.purchases.catalog();
      // YG-14: only products the game knows and the console offers.
      this.products = catalog.filter((p) => this.defs.some((d) => d.id === p.id));
      for (const p of await this.platform.purchases.owned())
        await this.apply(p.productID, p.purchaseToken);
    } catch {
      // Purchases are unavailable now; the game works without them.
    }
  }

  async buy(id: string): Promise<BuyResult> {
    try {
      const p = await this.platform.purchases.buy(id);
      await this.apply(p.productID, p.purchaseToken);
      return 'ok';
    } catch {
      // Cancelled, failed or no connection: the player sees "the purchase was not completed".
      return 'failed';
    }
  }

  private async apply(productId: string, token: string): Promise<void> {
    const def = this.defs.find((d) => d.id === productId);
    if (!def) return;
    if (def.permanent) {
      // The platform keeps a permanent purchase, so it is never consumed: its effect follows
      // the platform at every launch, its boosters come once.
      if (def.noAds && !this.progress.data.noAds) {
        this.progress.data.noAds = true;
        this.onNoAds();
      }
      if (!this.progress.seen(`purchase:${def.id}`)) {
        this.grantBoosters(def);
        this.progress.markSeen(`purchase:${def.id}`);
      }
      this.progress.commitImportant();
      return;
    }
    this.grantBoosters(def);
    this.progress.commitImportant();
    await this.platform.purchases.consume(token);
  }

  private grantBoosters(def: ShopProductDef): void {
    for (const id of BOOSTER_IDS) {
      const n = def.boosters[id] ?? 0;
      if (n > 0) this.progress.data.boosters[id] += n;
    }
  }
}
