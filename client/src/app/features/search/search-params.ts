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
  /** null = no store filter in the URL, so the preferred stores apply; [] = explicitly all. */
  stores: StoreId[] | null;
  category: CategoryId | null;
  minDiscount: number | null;
  /** null = the API default (relevance when searching, otherwise discount). */
  sort: OfferSort | null;
  /** Also show offers that start later (e.g. next week's flyer). */
  upcoming: boolean;
  /** Leave out everyday prices (searches include them by default to compare prices). */
  onlyDeals: boolean;
}

export const EMPTY_SEARCH: SearchParams = {
  q: '',
  stores: null,
  category: null,
  minDiscount: null,
  sort: null,
  upcoming: false,
  onlyDeals: false,
};

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;
}

/** Reads the URL leniently: unknown values are ignored rather than breaking the page. */
export function parseSearchParams(map: ParamMap): SearchParams {
  const minDiscount = Number(map.get('minDiscount'));
  return {
    q: (map.get('q') ?? '').trim(),
    stores: map.has('store')
      ? (map.get('store') ?? '')
          .split(',')
          .map((s) => oneOf(STORE_IDS, s))
          .filter((s): s is StoreId => s !== null)
      : null,
    category: oneOf(CATEGORY_IDS, map.get('category')),
    minDiscount: minDiscount > 0 && minDiscount <= 100 ? minDiscount : null,
    sort: oneOf(OFFER_SORTS, map.get('sort')),
    upcoming: map.get('upcoming') === '1',
    onlyDeals: map.get('deals') === '1',
  };
}

/** URL query parameters; null removes a parameter when merged by the router. */
export function toQueryParams(params: SearchParams): Params {
  return {
    q: params.q || null,
    // "?store=" (empty) keeps "all stores" from falling back to the preferred ones.
    store: params.stores === null ? null : params.stores.join(','),
    category: params.category,
    minDiscount: params.minDiscount,
    sort: params.sort,
    upcoming: params.upcoming ? '1' : null,
    deals: params.onlyDeals ? '1' : null,
  };
}

/** The user's settings that shape every search. */
export interface SearchPreferences {
  preferredStores: readonly StoreId[];
  hiddenCategories: readonly CategoryId[];
}

export const NO_PREFERENCES: SearchPreferences = { preferredStores: [], hiddenCategories: [] };

/** The stores actually searched: the URL's, else the preferred ones (empty = all). */
export function effectiveStores(params: SearchParams, prefs: SearchPreferences): StoreId[] {
  return params.stores ?? [...prefs.preferredStores];
}

/** Parameters for GET /api/offers. */
export function toApiParams(
  params: SearchParams,
  page: number,
  prefs: SearchPreferences = NO_PREFERENCES,
): Record<string, string> {
  const api: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
  if (params.q.length >= MIN_QUERY_LENGTH) api['q'] = params.q;
  const stores = effectiveStores(params, prefs);
  if (stores.length) api['store'] = stores.join(',');
  if (params.category) api['category'] = params.category;
  else if (prefs.hiddenCategories.length) api['excludeCategory'] = prefs.hiddenCategories.join(',');
  if (params.minDiscount) api['minDiscount'] = String(params.minDiscount);
  if (params.upcoming) api['upcoming'] = 'true';
  if (params.onlyDeals) api['deals'] = 'only';
  // "Best match" only means something with a search text.
  if (params.sort && (params.sort !== 'relevance' || api['q'])) api['sort'] = params.sort;
  return api;
}

export function sameSearch(a: SearchParams, b: SearchParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasFilters(params: SearchParams): boolean {
  return (
    params.stores !== null ||
    params.category !== null ||
    params.minDiscount !== null ||
    params.sort !== null ||
    params.upcoming ||
    params.onlyDeals
  );
}
