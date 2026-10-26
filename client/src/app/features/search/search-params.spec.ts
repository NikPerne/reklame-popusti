import { convertToParamMap } from '@angular/router';
import {
  EMPTY_SEARCH,
  hasFilters,
  parseSearchParams,
  toApiParams,
  toQueryParams,
  type SearchParams,
} from './search-params';

describe('search params', () => {
  it('parses the URL and ignores unknown values', () => {
    const params = parseSearchParams(
      convertToParamMap({
        q: '  kava ',
        store: 'lidl,konzum,mercator',
        category: 'shramba',
        minDiscount: '30',
        sort: 'unitPrice',
      }),
    );

    expect(params).toEqual({
      q: 'kava',
      stores: ['lidl', 'mercator'],
      category: 'shramba',
      minDiscount: 30,
      sort: 'unitPrice',
    });
    expect(
      parseSearchParams(convertToParamMap({ category: 'nope', minDiscount: '500', sort: 'x' })),
    ).toEqual(EMPTY_SEARCH);
  });

  it('turns empty values into null so the router removes them from the URL', () => {
    expect(toQueryParams({ ...EMPTY_SEARCH, q: 'mleko' })).toEqual({
      q: 'mleko',
      store: null,
      category: null,
      minDiscount: null,
      sort: null,
    });
  });

  it('builds API parameters', () => {
    const params: SearchParams = {
      q: 'kava',
      stores: ['lidl', 'dm'],
      category: 'shramba',
      minDiscount: 20,
      sort: 'price',
    };

    expect(toApiParams(params, 2)).toEqual({
      q: 'kava',
      store: 'lidl,dm',
      category: 'shramba',
      minDiscount: '20',
      sort: 'price',
      page: '2',
      pageSize: '24',
    });
  });

  it('leaves out a one-letter query and "best match" without a query', () => {
    expect(toApiParams({ ...EMPTY_SEARCH, q: 'k', sort: 'relevance' }, 1)).toEqual({
      page: '1',
      pageSize: '24',
    });
  });

  it('knows when filters are active', () => {
    expect(hasFilters({ ...EMPTY_SEARCH, q: 'kava' })).toBe(false);
    expect(hasFilters({ ...EMPTY_SEARCH, minDiscount: 10 })).toBe(true);
  });
});
