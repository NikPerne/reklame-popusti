import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import type { Offer, StoreInfo } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import { LanguageService } from '../../core/i18n/language';
import { ShortDatePipe } from '../../shared/format';
import { OfferCard } from './offer-card';
import { SearchFilters } from './search-filters';
import {
  EMPTY_SEARCH,
  MIN_QUERY_LENGTH,
  parseSearchParams,
  sameSearch,
  toApiParams,
  toQueryParams,
  type SearchParams,
} from './search-params';

type LoadStatus = 'loading' | 'ready' | 'error' | 'offline';

interface PageRequest {
  params: SearchParams;
  page: number;
}

const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-search-page',
  imports: [TranslocoDirective, OfferCard, SearchFilters, ShortDatePipe],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  private readonly api = inject(OffersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly lang = inject(LanguageService).current;

  protected readonly params = signal<SearchParams>(EMPTY_SEARCH);
  protected readonly items = signal<Offer[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly status = signal<LoadStatus>('loading');
  protected readonly hasMore = computed(() => this.items().length < this.total());
  /** Filters start collapsed on phones, where they would push the results off the screen. */
  protected readonly filtersOpen =
    typeof matchMedia === 'function' && matchMedia('(min-width: 40rem)').matches;

  protected readonly stores = toSignal(
    this.api.stores().pipe(catchError(() => of<StoreInfo[]>([]))),
    {
      initialValue: [],
    },
  );
  protected readonly categories = toSignal(this.api.categories().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
  protected readonly refreshedStores = computed(() => this.stores().filter((s) => s.status));

  private readonly requests = new Subject<PageRequest>();
  private readonly queryInput = new Subject<string>();

  constructor() {
    // switchMap drops the answer to an outdated search when a newer one starts.
    this.requests
      .pipe(
        switchMap((request) => {
          this.status.set('loading');
          return this.api.searchOffers(toApiParams(request.params, request.page)).pipe(
            map((result) => ({ request, result, error: null })),
            catchError((error: unknown) => of({ request, result: null, error })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ request, result, error }) => {
        if (!result) {
          const offline = error instanceof HttpErrorResponse && error.status === 0;
          this.status.set(offline ? 'offline' : 'error');
          return;
        }
        this.items.update((items) =>
          request.page === 1 ? result.items : [...items, ...result.items],
        );
        this.total.set(result.total);
        this.page.set(request.page);
        this.status.set('ready');
      });

    this.route.queryParamMap
      .pipe(map(parseSearchParams), distinctUntilChanged(sameSearch), takeUntilDestroyed())
      .subscribe((params) => {
        this.params.set(params);
        this.requests.next({ params, page: 1 });
      });

    this.queryInput
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => {
        // One letter isn't searchable; keep showing the previous results meanwhile.
        if (q.length > 0 && q.length < MIN_QUERY_LENGTH) return;
        this.update({ q });
      });
  }

  protected onQueryInput(event: Event): void {
    this.queryInput.next((event.target as HTMLInputElement).value.trim());
  }

  protected clearQuery(input: HTMLInputElement): void {
    input.value = '';
    this.queryInput.next('');
    input.focus();
  }

  protected update(change: Partial<SearchParams>): void {
    const next = { ...this.params(), ...change };
    // "Best match" makes no sense without a search text.
    if (!next.q && next.sort === 'relevance') next.sort = null;
    void this.router.navigate([], {
      queryParams: toQueryParams(next),
      queryParamsHandling: 'merge',
      replaceUrl: change.q !== undefined,
    });
  }

  protected resetFilters(): void {
    this.update({ stores: [], category: null, minDiscount: null, sort: null });
  }

  protected loadMore(): void {
    this.requests.next({ params: this.params(), page: this.page() + 1 });
  }

  protected retry(): void {
    this.requests.next({ params: this.params(), page: 1 });
  }
}
