import { Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  OFFER_SORTS,
  type CategoryCount,
  type CategoryId,
  type OfferSort,
  type StoreId,
  type StoreInfo,
} from '../../core/api/models';
import { STORE_NAMES } from './offer-card';
import { DISCOUNT_STEPS, hasFilters, type SearchParams } from './search-params';

@Component({
  selector: 'app-search-filters',
  imports: [TranslocoDirective],
  templateUrl: './search-filters.html',
  styleUrl: './search-filters.scss',
})
export class SearchFilters {
  readonly params = input.required<SearchParams>();
  readonly stores = input<StoreInfo[]>([]);
  readonly categories = input<CategoryCount[]>([]);

  readonly changed = output<Partial<SearchParams>>();
  readonly resetRequested = output();

  protected readonly discountSteps = DISCOUNT_STEPS;
  protected readonly storeNames = STORE_NAMES;

  /** Only stores that have been refreshed at least once have offers to filter on. */
  protected readonly storeIds = computed<StoreId[]>(() =>
    this.stores()
      .filter((s) => s.status !== null)
      .map((s) => s.id),
  );

  protected readonly sorts = computed<OfferSort[]>(() =>
    OFFER_SORTS.filter((s) => s !== 'relevance' || this.params().q.length > 0),
  );

  protected readonly filtered = computed(() => hasFilters(this.params()));

  protected toggleStore(store: StoreId): void {
    const current = this.params().stores ?? [];
    this.changed.emit({
      stores: current.includes(store) ? current.filter((s) => s !== store) : [...current, store],
    });
  }

  protected onCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.changed.emit({ category: (value || null) as CategoryId | null });
  }

  protected onMinDiscount(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.changed.emit({ minDiscount: value > 0 ? value : null });
  }

  protected onSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.changed.emit({ sort: (value || null) as OfferSort | null });
  }
}
