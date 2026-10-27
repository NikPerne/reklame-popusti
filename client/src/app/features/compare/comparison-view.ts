import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ComparedOffer, Comparison } from '../../core/api/models';
import type { Language } from '../../core/i18n/language';
import { ShoppingListService } from '../../core/shopping-list/shopping-list-service';
import { EurPipe } from '../../shared/format';
import { STORE_NAMES } from '../search/offer-card';

/**
 * A price comparison by type: each store's cheapest product per unit (ranked), then every
 * compared product. Used on the comparison page and on a product's page.
 */
@Component({
  selector: 'app-comparison-view',
  imports: [TranslocoDirective, EurPipe, RouterLink],
  templateUrl: './comparison-view.html',
  styleUrl: './comparison-view.scss',
})
export class ComparisonView {
  protected readonly shoppingList = inject(ShoppingListService);
  protected readonly storeNames = STORE_NAMES;

  readonly comparison = input.required<Comparison>();
  readonly lang = input.required<Language>();
  /** The product whose page this is; marked in the lists. */
  readonly currentId = input<string>();
  /** Offer × buttons to take wrong matches out (comparison page only). */
  readonly removable = input(false);
  readonly removed = output<ComparedOffer>();

  /** How much more than the cheapest store, in %. */
  protected percentMore(amount: number, cheapest: number): number {
    return Math.round((amount / cheapest - 1) * 100);
  }
}
