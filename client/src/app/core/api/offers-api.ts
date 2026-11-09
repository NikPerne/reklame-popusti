import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CategoryCount,
  ComparePreset,
  Comparison,
  Flyer,
  FlyerSummary,
  OfferPage,
  PriceHistory,
  RelatedOffers,
  StoreInfo,
} from './models';

@Injectable({ providedIn: 'root' })
export class OffersApi {
  private readonly http = inject(HttpClient);

  /** `params` are the query parameters documented in the README (q, store, category, ...). */
  searchOffers(params: Record<string, string>): Observable<OfferPage> {
    return this.http.get<OfferPage>('/api/offers', { params });
  }

  /** Price comparison by product type: `q`, optional `exclude`, `skip` and `store` lists. */
  compare(params: Record<string, string>): Observable<Comparison> {
    return this.http.get<Comparison>('/api/compare', { params });
  }

  comparePresets(): Observable<ComparePreset[]> {
    return this.http.get<ComparePreset[]>('/api/compare/presets');
  }

  /** One offer with products of the same type in all stores (the product page). */
  related(id: string): Observable<RelatedOffers> {
    return this.http.get<RelatedOffers>(`/api/offers/${encodeURIComponent(id)}/related`);
  }

  /** The offer's price over time (product page chart). */
  history(id: string): Observable<PriceHistory> {
    return this.http.get<PriceHistory>(`/api/offers/${encodeURIComponent(id)}/history`);
  }

  stores(): Observable<StoreInfo[]> {
    return this.http.get<StoreInfo[]>('/api/stores');
  }

  /** Every store's current flyers (the start page's top row). */
  flyers(): Observable<FlyerSummary[]> {
    return this.http.get<FlyerSummary[]>('/api/flyers');
  }

  flyer(id: string): Observable<Flyer> {
    return this.http.get<Flyer>(`/api/flyers/${encodeURIComponent(id)}`);
  }

  categories(): Observable<CategoryCount[]> {
    return this.http.get<CategoryCount[]>('/api/categories');
  }
}
