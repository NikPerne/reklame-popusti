import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import type { FlyerSummary, StoreId } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import type { Language } from '../../core/i18n/language';
import { ShortDatePipe } from '../../shared/format';
import { STORE_NAMES } from './offer-card';

/**
 * Each store's page with its current flyers: where a store's chip leads when the app has no
 * flyers for it (before the first refresh, or when reading them failed).
 */
export const FLYER_URLS: Partial<Record<StoreId, string>> = {
  mercator: 'https://www.mercator.si/katalogi/',
  lidl: 'https://www.lidl.si/c/spletni-katalog/s10019133',
  hofer: 'https://www.hofer.si/aktualni-letaki-in-brosure',
  spar: 'https://www.spar.si/letak',
  tus: 'https://www.tus.si/aktualno/katalogi-in-revije/',
  eurospin: 'https://www.eurospin.si/letak/',
};

/** Flyers shown in the app open on /letak/:id; PDFs and links open in a new tab. */
export const opensInApp = (flyer: FlyerSummary) =>
  flyer.viewer === 'pages' || flyer.viewer === 'embed';

/**
 * The start page's top row: a chip per store; tapping one shows that store's current flyers
 * as covers. A store with a single flyer that can't be shown in the app links straight to it.
 */
@Component({
  selector: 'app-flyer-links',
  imports: [TranslocoDirective, RouterLink, NgTemplateOutlet, ShortDatePipe],
  templateUrl: './flyer-links.html',
  styleUrl: './flyer-links.scss',
})
export class FlyerLinks {
  readonly lang = input.required<Language>();

  private readonly flyers = toSignal(
    inject(OffersApi)
      .flyers()
      .pipe(catchError(() => of<FlyerSummary[]>([]))),
    { initialValue: [] },
  );

  protected readonly stores = computed(() =>
    (Object.keys(FLYER_URLS) as StoreId[]).map((store) => {
      const flyers = this.flyers().filter((f) => f.store === store);
      const only = flyers.length === 1 && !opensInApp(flyers[0]!) ? flyers[0] : undefined;
      return {
        store,
        name: STORE_NAMES[store],
        flyers,
        /** Opens a page outside the app instead of showing covers. */
        externalUrl: flyers.length === 0 ? FLYER_URLS[store] : (only?.url ?? only?.sourceUrl),
      };
    }),
  );

  protected readonly selected = signal<StoreId | null>(null);
  protected readonly selectedStore = computed(() =>
    this.stores().find((s) => s.store === this.selected()),
  );

  protected readonly opensInApp = opensInApp;

  protected toggle(store: StoreId): void {
    this.selected.update((current) => (current === store ? null : store));
  }
}
