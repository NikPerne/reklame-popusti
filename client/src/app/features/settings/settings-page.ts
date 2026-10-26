import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { CATEGORY_IDS, STORE_IDS, type CategoryId, type StoreId } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth-service';
import { SettingsService } from '../../core/settings/settings-service';
import { STORE_NAMES } from '../search/offer-card';

/** Stores that have an adapter; dm and Müller are not scraped, so there is nothing to prefer. */
const SELECTABLE_STORES = STORE_IDS.filter((s) => s !== 'dm' && s !== 'mueller');

@Component({
  selector: 'app-settings-page',
  imports: [TranslocoDirective],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly settings = inject(SettingsService);
  protected readonly email = inject(AuthService).email;
  protected readonly stores = SELECTABLE_STORES;
  protected readonly categories = CATEGORY_IDS;
  protected readonly storeNames = STORE_NAMES;

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
