import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { RelatedOffers } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import { LanguageService } from '../../core/i18n/language';
import { ComparisonView } from '../compare/comparison-view';
import { OfferCard } from '../search/offer-card';

type Status = 'loading' | 'ok' | 'not-found' | 'error';

/**
 * A product's page (/izdelek/:id): the offer, and products of the same type (e.g. other
 * butter) in all stores, compared per unit like on the comparison page.
 */
@Component({
  selector: 'app-product-page',
  imports: [TranslocoDirective, RouterLink, OfferCard, ComparisonView],
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
})
export class ProductPage {
  private readonly api = inject(OffersApi);
  protected readonly lang = inject(LanguageService).current;

  /** Bound from the route parameter. */
  readonly id = input.required<string>();

  protected readonly status = signal<Status>('loading');
  protected readonly data = signal<RelatedOffers | null>(null);
  private request = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    const request = ++this.request;
    this.status.set('loading');
    try {
      const data = await firstValueFrom(this.api.related(id));
      if (request !== this.request) return;
      this.data.set(data);
      this.status.set('ok');
    } catch (error) {
      if (request !== this.request) return;
      this.status.set((error as { status?: number }).status === 404 ? 'not-found' : 'error');
    }
  }

  /** Query parameters to open this comparison on the comparison page (to adjust it). */
  protected compareParams(query: NonNullable<RelatedOffers['query']>): Record<string, string> {
    return query.exclude.length
      ? { q: query.text, exclude: query.exclude.join(',') }
      : { q: query.text };
  }
}
