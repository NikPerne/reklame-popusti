import { Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { catchError, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';
import type { Offer } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import type { Language } from '../../core/i18n/language';
import { OfferCard } from './offer-card';
import { EMPTY_SEARCH, toApiParams, type SearchPreferences } from './search-params';

const SECTION_SIZE = 12;

interface Sections {
  newThisWeek: Offer[];
  endingSoon: Offer[];
}

/** The start page's rows: offers that started this week and offers ending within two days. */
@Component({
  selector: 'app-home-sections',
  imports: [TranslocoDirective, OfferCard],
  templateUrl: './home-sections.html',
  styleUrl: './home-sections.scss',
})
export class HomeSections {
  private readonly api = inject(OffersApi);

  readonly prefs = input.required<SearchPreferences>();
  readonly lang = input.required<Language>();

  protected readonly sections = toSignal(
    toObservable(this.prefs).pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((prefs) => {
        const base = { ...toApiParams(EMPTY_SEARCH, 1, prefs), pageSize: String(SECTION_SIZE) };
        const load = (extra: Record<string, string>) =>
          this.api.searchOffers({ ...base, ...extra }).pipe(
            map((page) => page.items),
            catchError(() => of<Offer[]>([])),
          );
        return forkJoin({
          newThisWeek: load({ startedWithinDays: '7', sort: 'newest' }),
          endingSoon: load({ endsWithinDays: '2', sort: 'validTo' }),
        });
      }),
    ),
    { initialValue: { newThisWeek: [], endingSoon: [] } satisfies Sections },
  );
}
