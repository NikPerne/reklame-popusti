import { describe, expect, it } from 'vitest';
import { computeGroups, type GroupingInput } from '../../src/domain/grouping.js';

const offer = (overrides: Partial<GroupingInput> & { id: string }): GroupingInput => ({
  store: 'mercator',
  productName: 'Izdelek',
  price: 1,
  ...overrides,
});

describe('computeGroups', () => {
  it('groups offers that share a barcode across stores', () => {
    const groups = computeGroups([
      offer({ id: 'm1', store: 'mercator', eans: ['3850104048036'] }),
      offer({ id: 's1', store: 'spar', eans: ['3850104274619', '3850104048036'] }),
      offer({ id: 't1', store: 'tus', eans: ['5411188141488'] }),
    ]);

    expect(groups.get('m1')).toBe('ean:3850104048036');
    expect(groups.get('s1')).toBe('ean:3850104048036');
    expect(groups.has('t1')).toBe(false);
  });

  it('links chains of shared barcodes into one group', () => {
    const groups = computeGroups([
      offer({ id: 'a', store: 'mercator', eans: ['11111111'] }),
      offer({ id: 'b', store: 'spar', eans: ['11111111', '22222222'] }),
      offer({ id: 'c', store: 'tus', eans: ['22222222'] }),
    ]);

    expect(new Set(['a', 'b', 'c'].map((id) => groups.get(id)))).toEqual(new Set(['ean:11111111']));
  });

  it('groups duplicate listings of one store with the same name and price', () => {
    const groups = computeGroups([
      offer({ id: 'x', productName: 'Trajno mleko, 1 l', price: 0.89 }),
      offer({ id: 'y', productName: 'Trajno  MLEKO, 1 l', price: 0.89 }),
      offer({ id: 'z', productName: 'Trajno mleko, 1 l', price: 0.99 }),
      offer({ id: 'w', store: 'spar', productName: 'Trajno mleko, 1 l', price: 0.89 }),
    ]);

    expect(groups.get('x')).toBe('id:x');
    expect(groups.get('y')).toBe('id:x');
    expect(groups.has('z')).toBe(false); // different price
    expect(groups.has('w')).toBe(false); // other store, no barcode
  });

  it('gives single offers no group', () => {
    expect(computeGroups([offer({ id: 'only' })]).size).toBe(0);
  });
});
