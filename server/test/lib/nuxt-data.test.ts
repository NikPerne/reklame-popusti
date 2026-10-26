import { describe, expect, it } from 'vitest';
import { extractNuxtData, hydrateDevalue } from '../../src/lib/nuxt-data.js';

describe('hydrateDevalue', () => {
  it('resolves references and Nuxt wrapper tags', () => {
    const flat = [
      ['ShallowReactive', 1],
      { pinia: 2, when: 6, tags: 7, missing: -1 },
      ['Reactive', 3],
      { name: 4, count: 5 },
      'kava',
      3,
      ['Date', '2026-10-26T08:00:00.000Z'],
      ['Set', 4, 5],
    ];

    expect(hydrateDevalue(flat)).toEqual({
      pinia: { name: 'kava', count: 3 },
      when: new Date('2026-10-26T08:00:00.000Z'),
      tags: ['kava', 3],
      missing: undefined,
    });
  });

  it('keeps shared references shared', () => {
    const result = hydrateDevalue([{ a: 1, b: 1 }, { x: 2 }, 'y']) as { a: object; b: object };
    expect(result.a).toBe(result.b);
  });

  it('rejects unknown tags instead of guessing', () => {
    expect(() => hydrateDevalue([['Mystery', 1], 'x'])).toThrow(/Mystery/);
  });
});

describe('extractNuxtData', () => {
  it('reads the payload script from a page', () => {
    const html =
      '<html><script type="application/json" id="__NUXT_DATA__" data-ssr="true">[{"a":1},"b"]</script></html>';
    expect(extractNuxtData(html)).toEqual({ a: 'b' });
  });

  it('returns undefined when the page has no payload', () => {
    expect(extractNuxtData('<html></html>')).toBeUndefined();
  });
});
