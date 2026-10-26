import { Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Offer, StoreId } from '../../core/api/models';
import type { Language } from '../../core/i18n/language';
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
  imports: [TranslocoDirective, EurPipe, ShortDatePipe],
  templateUrl: './offer-card.html',
  styleUrl: './offer-card.scss',
})
export class OfferCard {
  readonly offer = input.required<Offer>();
  readonly lang = input.required<Language>();

  protected readonly storeName = computed(() => STORE_NAMES[this.offer().store]);

  /** Show "from <date>" for offers that haven't started yet, otherwise "until <date>". */
  protected readonly startsLater = computed(() => {
    const from = this.offer().validFrom;
    return from !== undefined && new Date(from).getTime() > Date.now();
  });

  protected readonly hasSaving = computed(() => {
    const { price, regularPrice } = this.offer();
    return regularPrice !== undefined && regularPrice > price;
  });
}
