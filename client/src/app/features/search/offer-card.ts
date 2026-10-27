import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Offer, StoreId } from '../../core/api/models';
import type { Language } from '../../core/i18n/language';
import { ShoppingListService } from '../../core/shopping-list/shopping-list-service';
import { EurPipe, ShortDatePipe } from '../../shared/format';

export const STORE_NAMES: Record<StoreId, string> = {
  mercator: 'Mercator',
  lidl: 'Lidl',
  hofer: 'Hofer',
  spar: 'Spar',
  dm: 'dm',
  mueller: 'Müller',
  eurospin: 'Eurospin',
  tus: 'Tuš',
};

@Component({
  selector: 'app-offer-card',
  imports: [TranslocoDirective, EurPipe, ShortDatePipe, RouterLink],
  templateUrl: './offer-card.html',
  styleUrl: './offer-card.scss',
})
export class OfferCard {
  private readonly shoppingList = inject(ShoppingListService);

  readonly offer = input.required<Offer>();
  readonly lang = input.required<Language>();
  /** Whether the name links to the product's page (not on that page itself). */
  readonly linked = input(true);

  protected readonly storeNames = STORE_NAMES;
  protected readonly inList = computed(() => this.shoppingList.ids().has(this.offer().id));

  protected toggleList(): void {
    this.shoppingList.toggle(this.offer());
  }
  protected readonly storeName = computed(() => STORE_NAMES[this.offer().store]);

  /** Show "from <date>" for offers that haven't started yet, otherwise "until <date>". */
  protected readonly startsLater = computed(() => {
    const from = this.offer().validFrom;
    return from !== undefined && new Date(from).getTime() > Date.now();
  });

  /** "Spar 1,99 € · Tuš 2,09 €" summary of the same product elsewhere, cheapest first. */
  protected readonly alternatives = computed(() =>
    [...(this.offer().alsoAt ?? [])].sort((a, b) => a.price - b.price),
  );

  protected readonly hasSaving = computed(() => {
    const { price, regularPrice } = this.offer();
    return regularPrice !== undefined && regularPrice > price;
  });
}
