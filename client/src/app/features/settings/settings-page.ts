import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import {
  CATEGORY_IDS,
  STORE_IDS,
  type CategoryId,
  type StoreId,
  type StoreInfo,
} from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import { isStale, lastSuccess } from '../../core/api/store-status';
import { AuthService } from '../../core/auth/auth-service';
import { LanguageService } from '../../core/i18n/language';
import { SettingsService } from '../../core/settings/settings-service';
import { DateTimePipe } from '../../shared/format';
import { STORE_NAMES } from '../search/offer-card';

/** Stores that have an adapter; dm and Müller are not scraped, so there is nothing to prefer. */
const SELECTABLE_STORES: readonly StoreId[] = STORE_IDS.filter(
  (s) => s !== 'dm' && s !== 'mueller',
);

@Component({
  selector: 'app-settings-page',
  imports: [TranslocoDirective, DateTimePipe],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly settings = inject(SettingsService);
  protected readonly email = inject(AuthService).email;
  protected readonly stores = SELECTABLE_STORES;
  protected readonly categories = CATEGORY_IDS;
  protected readonly storeNames = STORE_NAMES;
  protected readonly lang = inject(LanguageService).current;

  /** undefined while loading, null when the server can't be reached. */
  protected readonly storeInfo = toSignal<StoreInfo[] | null | undefined>(
    inject(OffersApi)
      .stores()
      .pipe(catchError(() => of(null))),
    { initialValue: undefined },
  );
  /** Each scraped store's last refresh, for the "data refresh" section. */
  protected readonly refreshHealth = computed(() =>
    this.storeInfo()
      ?.filter((store) => SELECTABLE_STORES.includes(store.id))
      .map((store) => {
        const failed = store.status?.ok === false;
        return { store, failed, stale: isStale(store), lastSuccess: lastSuccess(store) };
      }),
  );

  constructor() {
    void this.settings.sync();
  }

  protected togglePreferred(store: StoreId): void {
    const current = this.settings.preferredStores();
    this.settings.save({
      preferredStores: current.includes(store)
        ? current.filter((s) => s !== store)
        : [...current, store],
    });
  }

  protected toggleHidden(category: CategoryId): void {
    const current = this.settings.hiddenCategories();
    this.settings.save({
      hiddenCategories: current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    });
  }
}
