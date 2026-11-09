import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { StoreId } from '../../core/api/models';
import { STORE_NAMES } from './offer-card';

/**
 * Each store's page with its current flyers (letaki, katalogi). The stores' flyer viewers
 * can't be embedded (they forbid framing), so these open the store's site in a new tab.
 */
export const FLYER_URLS: Partial<Record<StoreId, string>> = {
  mercator: 'https://www.mercator.si/katalogi/',
  lidl: 'https://www.lidl.si/c/spletni-katalog/s10019133',
  hofer: 'https://www.hofer.si/aktualni-letaki-in-brosure',
  spar: 'https://www.spar.si/letak',
  tus: 'https://www.tus.si/aktualno/katalogi-in-revije/',
  eurospin: 'https://www.eurospin.si/letak/',
};

/** The start page's top row: a link to every store's current flyers. */
@Component({
  selector: 'app-flyer-links',
  imports: [TranslocoDirective],
  templateUrl: './flyer-links.html',
  styleUrl: './flyer-links.scss',
})
export class FlyerLinks {
  protected readonly flyers = Object.entries(FLYER_URLS).map(([store, url]) => ({
    store: store as StoreId,
    name: STORE_NAMES[store as StoreId],
    url,
  }));
}
