import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../../src/lib/html.js';
import { parseUnitPriceText } from '../../src/lib/unit-price.js';

describe('parseUnitPriceText', () => {
  it.each([
    ['1 kg = 0,90', { amount: 0.9, unit: 'kg' }],
    ['1 l = 2,35', { amount: 2.35, unit: 'l' }],
    ['1 kos = 0,22', { amount: 0.22, unit: 'piece' }],
    ['100 g = 1,25', { amount: 12.5, unit: 'kg' }],
    ['100 ml = 0,80', { amount: 8, unit: 'l' }],
    ['1,90 €/1 kg', { amount: 1.9, unit: 'kg' }],
    ['0,59 €/100 g', { amount: 5.9, unit: 'kg' }],
    ['2,50 €/kos', { amount: 2.5, unit: 'piece' }],
  ])('%s', (text, expected) => {
    expect(parseUnitPriceText(text)).toEqual(expected);
  });

  it.each([undefined, '', 'cena na kos', '1 m = 2,00'])('ignores %s', (text) => {
    expect(parseUnitPriceText(text)).toBeUndefined();
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeHtmlEntities('&quot;Feta&quot; &amp; &#39;sir&#39; &#x27;x&#x27; &lt;b&gt;')).toBe(
      `"Feta" & 'sir' 'x' <b>`,
    );
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;');
  });
});
