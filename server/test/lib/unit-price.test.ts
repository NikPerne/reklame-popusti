import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../../src/lib/html.js';
import { parseUnitPriceText, unitPriceFromName } from '../../src/lib/unit-price.js';

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

  it("reads Eurospin's 'za kg' form", () => {
    expect(parseUnitPriceText('150 g - za kg 7,00 €')).toEqual({ amount: 7, unit: 'kg' });
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

describe('unitPriceFromName', () => {
  it.each([
    ['Jogurt MU Athentikos, naravni, 430 g', 2.15, { amount: 5, unit: 'kg' }],
    ['Alpsko mleko, polnomastno, 1 l', 0.99, { amount: 0.99, unit: 'l' }],
    ['Detergent Nila, gel, 50 pranj 2,7 l', 8.1, { amount: 3, unit: 'l' }],
    ['Desert Balconi, Rollino Cacao, 6 x 37 g', 2.22, { amount: 10, unit: 'kg' }],
    ['Papirnati robčki, 3-slojni, 100 kosov', 1, { amount: 0.01, unit: 'piece' }],
    ['Pivo Union, 4,9 % alkohola, 6 x 0,5 l', 6, { amount: 2, unit: 'l' }],
  ])('%s at %d €', (name, price, expected) => {
    expect(unitPriceFromName(price, name)).toEqual(expected);
  });

  it('returns undefined without a size', () => {
    expect(unitPriceFromName(1, 'Šopek krizantem')).toBeUndefined();
  });
});
