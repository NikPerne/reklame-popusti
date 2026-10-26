import { Component, DestroyRef, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { STORE_IDS, type StoreId } from '../../core/api/models';
import { LanguageService } from '../../core/i18n/language';
import {
  ShoppingListService,
  type ShoppingItem,
} from '../../core/shopping-list/shopping-list-service';
import { EurPipe } from '../../shared/format';
import { STORE_NAMES } from '../search/offer-card';

const REFRESH_INTERVAL_MS = 30_000;

interface StoreGroup {
  store: StoreId;
  items: ShoppingItem[];
  /** Sum of the items still to buy. */
  openTotal: number;
}

@Component({
  selector: 'app-shopping-list-page',
  imports: [TranslocoDirective, EurPipe],
  templateUrl: './shopping-list-page.html',
  styleUrl: './shopping-list-page.scss',
})
export class ShoppingListPage {
  protected readonly list = inject(ShoppingListService);
  protected readonly lang = inject(LanguageService).current;
  protected readonly storeNames = STORE_NAMES;

  /** Items grouped by store (in the usual store order); bought items sink to the bottom. */
  protected readonly groups = computed<StoreGroup[]>(() =>
    STORE_IDS.map((store) => {
      const items = this.list
        .items()
        .filter((i) => i.store === store)
        .sort(
          (a, b) =>
            Number(a.checked) - Number(b.checked) ||
            a.productName.localeCompare(b.productName, 'sl'),
        );
      const openTotal = items.filter((i) => !i.checked).reduce((sum, i) => sum + i.price, 0);
      return { store, items, openTotal };
    }).filter((g) => g.items.length > 0),
  );

  protected readonly openTotal = computed(() =>
    this.groups().reduce((sum, g) => sum + g.openTotal, 0),
  );
  protected readonly hasChecked = computed(() => this.list.items().some((i) => i.checked));

  constructor() {
    void this.list.sync();
    // Pick up the other person's ticks on a shared list while shopping together.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.list.sync();
    }, REFRESH_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected isExpired(item: ShoppingItem): boolean {
    return item.validTo !== undefined && new Date(item.validTo).getTime() < Date.now();
  }

  protected toggle(item: ShoppingItem): void {
    this.list.setChecked(item.id, !item.checked);
  }
}
