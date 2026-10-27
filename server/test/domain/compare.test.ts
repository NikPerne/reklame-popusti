import { describe, expect, it } from 'vitest';
import { presetFor } from '../../src/domain/compare-presets.js';
import {
  compareByType,
  countTypeWords,
  deriveTypeQuery,
  matchesProductType,
  typeWords,
  type Comparable,
} from '../../src/domain/compare.js';

describe('matchesProductType', () => {
  it.each([
    'Maslo, Mercator, 250 g',
    'Slovensko surovo maslo, Pomurske mlekarne, 250 g',
    'Maslo president 250g',
    'Maslo z zelišči, Meggle, 125 g',
  ])('finds butter in "%s"', (name) => {
    expect(matchesProductType(name, { text: 'maslo' })).toBe(true);
  });

  it.each([
    // Only after a preposition: the product is something else.
    'Margarina Margo z maslom, Zvijezda, 225 g',
    'Piškoti z maslom, 200 g',
    // Only in a later part of the name.
    'Skyr, stracciatella ali arašidovo maslo z banano, Yopro, 160 g',
  ])('does not take "%s" for butter', (name) => {
    expect(matchesProductType(name, { text: 'maslo' })).toBe(false);
  });

  it('ignores case and diacritics and needs every search word', () => {
    expect(matchesProductType('SLADKA SMETANA 35% 500ML', { text: 'sladka smetana' })).toBe(true);
    expect(matchesProductType('Kisla smetana, 12 %', { text: 'sladka smetana' })).toBe(false);
    expect(matchesProductType('Dolgozrnati beli riž, 1 kg', { text: 'riz' })).toBe(true);
  });

  it('allows Slovenian endings but not longer derived words', () => {
    expect(matchesProductType('Jogurti, sadni, 4 x 150 g', { text: 'jogurt' })).toBe(true);
    expect(matchesProductType('Riževa čokolada, 200 g', { text: 'riz' })).toBe(false);
  });

  it('leaves out excluded words anywhere in the name', () => {
    const query = { text: 'maslo', exclude: ['arasidov'] };
    expect(matchesProductType('Arašidovo maslo, kremno, 1 kg', query)).toBe(false);
    expect(matchesProductType('Maslo, Mila, 250 g', query)).toBe(true);
  });

  it('reads the type from the first part of the name, up to a preposition', () => {
    expect(typeWords('Jajca M iz hlevske reje, Mercator, 10/1')).toEqual(['jajca', 'm']);
  });
});

describe('compareByType', () => {
  let n = 0;
  const offer = (overrides: Partial<Comparable>): Comparable => ({
    id: `o${++n}`,
    store: 'mercator',
    productName: 'Maslo, 250 g',
    price: 2.29,
    unitPrice: { amount: 9.16, unit: 'kg' },
    ...overrides,
  });

  it('gives each store its cheapest product per unit, cheapest store first', () => {
    const offers = [
      offer({
        store: 'mercator',
        productName: 'Maslo, Planika, 250 g',
        unitPrice: { amount: 18.76, unit: 'kg' },
      }),
      offer({
        store: 'mercator',
        productName: 'Maslo, Mila, 250 g',
        unitPrice: { amount: 9.56, unit: 'kg' },
      }),
      offer({
        store: 'lidl',
        productName: 'Irsko maslo, 250 g',
        unitPrice: { amount: 6.2, unit: 'kg' },
      }),
      offer({
        store: 'spar',
        productName: 'Arašidovo maslo 1kg',
        unitPrice: { amount: 5, unit: 'kg' },
      }),
    ];

    const result = compareByType(offers, { text: 'maslo', exclude: ['arasidov'] });

    expect(result.unit).toBe('kg');
    expect(result.stores.map((s) => [s.store, s.cheapest.productName, s.count])).toEqual([
      ['lidl', 'Irsko maslo, 250 g', 1],
      ['mercator', 'Maslo, Mila, 250 g', 2],
    ]);
    expect(result.items.map((i) => i.unitPrice.amount)).toEqual([6.2, 9.56, 18.76]);
  });

  it('compares in the unit most matches use and counts the rest as not comparable', () => {
    const result = compareByType(
      [
        offer({ price: 2.25, unitPrice: { amount: 9, unit: 'kg' } }),
        offer({ price: 2, unitPrice: { amount: 8, unit: 'kg' } }),
        offer({ price: 0.5, unitPrice: { amount: 0.5, unit: 'piece' } }),
        offer({ price: 3, unitPrice: undefined }),
      ],
      { text: 'maslo' },
    );

    expect(result.unit).toBe('kg');
    expect(result.items).toHaveLength(2);
    expect(result.notComparable).toBe(2);
  });

  it('drops products removed by hand and listings that repeat', () => {
    const a = offer({ productName: 'Maslo, Mila, 250 g', price: 2.39 });
    const twin = offer({ productName: 'Maslo, Mila, 250 g', price: 2.39 });
    const b = offer({ productName: 'Maslo, Planika, 250 g', price: 4.69 });

    const result = compareByType([a, twin, b], { text: 'maslo', skip: [b.id] });

    expect(result.items.map((i) => i.id)).toEqual([a.id]);
  });

  it('returns no unit and no rows without matches', () => {
    expect(compareByType([offer({})], { text: 'jajca' })).toEqual({
      stores: [],
      items: [],
      notComparable: 0,
    });
  });
});

describe('deriveTypeQuery', () => {
  const counts = countTypeWords([
    'Maslo, Mila, 250 g',
    'Maslo, Planika, 250 g',
    'Slovensko surovo maslo, Pomurske mlekarne, 250 g',
    'Slovensko čajno maslo, 250 g',
    'Maslo Premium, Meggle, 125 g',
    'Sladka smetana, 35 % m.m., Mercator, 0,5 l',
    'Sladka smetana, Mu Cusine, 250 ml',
    'Sladka smetana v spreju, Meggle, 250 ml',
    'Kisla smetana, 20 % m.m., Mercator, 180 g',
    'Trajno polnomastno Alpsko mleko, 3,5 % m.m., 1 l',
  ]);

  it('takes the common noun, not the adjectives in front of it', () => {
    expect(deriveTypeQuery('Slovensko surovo maslo, Pomurske mlekarne', undefined, counts)).toBe(
      'maslo',
    );
  });

  it('keeps a common adjective that makes it a different product', () => {
    expect(deriveTypeQuery('Sladka smetana, 36 % m.m., Mercator', undefined, counts)).toBe(
      'sladka smetana',
    );
  });

  it('ignores capitalized product-line names and the brand', () => {
    expect(deriveTypeQuery('Maslo Premium, Meggle, 250 g', 'Meggle', counts)).toBe('maslo');
    expect(deriveTypeQuery('Maslo Mila 250g', 'Mila', counts)).toBe('maslo');
  });

  it('returns undefined when no word can name a type', () => {
    expect(deriveTypeQuery('XL 5, 250 g', undefined, counts)).toBeUndefined();
  });
});

describe('presetFor', () => {
  it('finds the quick pick a product belongs to, respecting its exclusions', () => {
    expect(presetFor('Maslo, Mila, 250 g')?.id).toBe('butter');
    expect(presetFor('Arašidovo maslo, 1 kg')).toBeUndefined();
    expect(presetFor('Trajno polnomastno Alpsko mleko, 1 l')?.id).toBe('milk');
    expect(presetFor('Čokoladno mleko, 200 ml')).toBeUndefined();
  });
});
