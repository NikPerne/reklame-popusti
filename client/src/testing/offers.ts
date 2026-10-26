import type { Offer, OfferPage } from '../app/core/api/models';

export function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: '1',
    store: 'mercator',
    externalId: '1395879',
    productName: 'Mleta kava Classic, Barcaffe, 200 g',
    brand: 'Barcaffe',
    category: 'shramba',
    price: 3.59,
    regularPrice: 4.79,
    discountPercent: 25,
    unitPrice: { amount: 17.95, unit: 'kg' },
    condition: { kind: 'multi-buy', text: 'Ob nakupu 2 ali več' },
    validFrom: '2026-10-24T22:28:37.000Z',
    validTo: '2026-11-04T23:28:37.000Z',
    imageUrl: 'https://mercatoronline.si/img/kava.jpg',
    sourceUrl: 'https://mercatoronline.si/izdelek/1395879/mleta-kava-classic-barcaffe-200-g',
    scrapedAt: '2026-10-26T08:00:00.000Z',
    ...overrides,
  };
}

export function makePage(items: Offer[], total = items.length, page = 1): OfferPage {
  return { items, total, page, pageSize: 24 };
}
