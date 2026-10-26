import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { CategoryCount, OfferPage, StoreInfo } from './models';

@Injectable({ providedIn: 'root' })
export class OffersApi {
  private readonly http = inject(HttpClient);

  /** `params` are the query parameters documented in the README (q, store, category, ...). */
  searchOffers(params: Record<string, string>): Observable<OfferPage> {
    return this.http.get<OfferPage>('/api/offers', { params });
  }

  stores(): Observable<StoreInfo[]> {
    return this.http.get<StoreInfo[]>('/api/stores');
  }

  categories(): Observable<CategoryCount[]> {
    return this.http.get<CategoryCount[]>('/api/categories');
  }
}
