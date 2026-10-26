import type { ParamMap, Params } from '@angular/router';
import {
  CATEGORY_IDS,
  OFFER_SORTS,
  STORE_IDS,
  type CategoryId,
  type OfferSort,
  type StoreId,
} from '../../core/api/models';

export const PAGE_SIZE = 24;
/** The API rejects shorter search texts. */
export const MIN_QUERY_LENGTH = 2;
export const DISCOUNT_STEPS = [10, 20, 30, 40, 50] as const;

/** The search state, kept in the URL so back/forward and bookmarks work. */
export interface SearchParams {
  q: string;
  stores: StoreId[];
  category: CategoryId | null;
  minDiscount: number | null;
  /** null = the API default (relevance when searching, otherwise discount). */
  sort: OfferSort | null;
}

export const EMPTY_SEARCH: SearchParams = {
  q: '',
  stores: [],
  category: null,
  minDiscount: null,
  sort: null,
};

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;
}

/** Reads the URL leniently: unknown values are ignored rather than breaking the page. */
export function parseSearchParams(map: ParamMap): SearchParams {
  const minDiscount = Number(map.get('minDiscount'));
  return {
    q: (map.get('q') ?? '').trim(),
    stores: (map.get('store') ?? '')
      .split(',')
      .map((s) => oneOf(STORE_IDS, s))
      .filter((s): s is StoreId => s !== null),
    category: oneOf(CATEGORY_IDS, map.get('category')),
    minDiscount: minDiscount > 0 && minDiscount <= 100 ? minDiscount : null,
    sort: oneOf(OFFER_SORTS, map.get('sort')),
  };
}

/** URL query parameters; null removes a parameter when merged by the router. */
export function toQueryParams(params: SearchParams): Params {
  return {
    q: params.q || null,
    store: params.stores.length ? params.stores.join(',') : null,
    category: params.category,
    minDiscount: params.minDiscount,
    sort: params.sort,
  };
}

/** Parameters for GET /api/offers. */
export function toApiParams(params: SearchParams, page: number): Record<string, string> {
  const api: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
  if (params.q.length >= MIN_QUERY_LENGTH) api['q'] = params.q;
  if (params.stores.length) api['store'] = params.stores.join(',');
  if (params.category) api['category'] = params.category;
  if (params.minDiscount) api['minDiscount'] = String(params.minDiscount);
  // "Best match" only means something with a search text.
  if (params.sort && (params.sort !== 'relevance' || api['q'])) api['sort'] = params.sort;
  return api;
}

export function sameSearch(a: SearchParams, b: SearchParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasFilters(params: SearchParams): boolean {
  return (
    params.stores.length > 0 ||
    params.category !== null ||
    params.minDiscount !== null ||
    params.sort !== null
  );
}
