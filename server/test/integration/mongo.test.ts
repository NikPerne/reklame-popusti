/**
 * Runs the real MongoDB queries against an in-memory MongoDB (mongodb-memory-server), so
 * aggregation mistakes that unit tests of the pipeline's shape can't see are caught.
 * Atlas Search itself can't run here; the "basic" search mode is used instead.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/db/connect.js';
import { OfferModel } from '../../src/db/models.js';
import { finalizeOffer, type ScrapedOffer } from '../../src/domain/offer.js';
import type { StoreId } from '../../src/domain/stores.js';
import { MongoOfferRepository } from '../../src/repositories/mongo-offer-repository.js';
import type { OfferQuery } from '../../src/repositories/offer-repository.js';
import { MongoSettingsRepository } from '../../src/repositories/settings-repository.js';
import { MongoShoppingListRepository } from '../../src/repositories/shopping-list-repository.js';
import { scrapedOffer } from '../helpers.js';

let server: MongoMemoryServer;
const now = new Date('2026-10-26T08:00:00Z');
const repository = new MongoOfferRepository('basic');

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await connectDatabase(server.getUri('integration'));
  await OfferModel.syncIndexes();
}, 180_000);

afterAll(async () => {
  await disconnectDatabase();
  await server.stop();
});

async function seed(store: StoreId, offers: Partial<ScrapedOffer>[]) {
  await repository.replaceStoreOffers(
    store,
    offers.map((o, i) =>
      finalizeOffer(store, scrapedOffer({ externalId: `${store}-${i}`, ...o }), now),
    ),
    now,
  );
}

const query = (overrides: Partial<OfferQuery> = {}): OfferQuery => ({
  sort: 'price',
  page: 1,
  pageSize: 24,
  now,
  ...overrides,
});

describe('MongoOfferRepository (real MongoDB)', () => {
  beforeEach(async () => {
    await OfferModel.deleteMany({});
    await seed('mercator', [
      { productName: 'Mleta kava Classic, Barcaffe, 200 g', price: 3.59, eans: ['3838975531314'] },
      { productName: 'Trajno mleko, 1 l', price: 0.89, category: 'mlecni-izdelki' },
      { productName: 'Trajno mleko, 1 l', price: 0.89, category: 'mlecni-izdelki' },
      { productName: 'Majica', price: 4.99, regularPrice: 9.99, category: 'oblacila' },
    ]);
    await seed('spar', [
      { productName: 'Mleta kava classic barcaffe 200g', price: 3.29, eans: ['3838975531314'] },
    ]);
    await repository.regroup();
  });

  it('collapses the same product into one result with the cheapest first', async () => {
    const page = await repository.find(query({ text: 'kava' }));

    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ store: 'spar', price: 3.29 });
    expect(page.items[0]?.alsoAt).toEqual([
      expect.objectContaining({
        store: 'mercator',
        price: 3.59,
        productName: expect.stringContaining('Barcaffe') as unknown,
      }),
    ]);
    expect(typeof page.items[0]?.id).toBe('string');
    expect(page.items[0]).not.toHaveProperty('groupKey');
    expect(page.items[0]).not.toHaveProperty('searchText');
  });

  it('merges duplicate listings of one store and counts groups, not offers', async () => {
    const page = await repository.find(query({ stores: ['mercator'] }));

    expect(page.total).toBe(3); // kava, mleko (2 listings), majica
    expect(page.items.map((i) => i.productName)).toEqual([
      'Trajno mleko, 1 l',
      'Mleta kava Classic, Barcaffe, 200 g',
      'Majica',
    ]);
    expect(page.items[0]?.alsoAt).toHaveLength(1);
  });

  it('applies the filters: barcode, hidden categories, minimum discount', async () => {
    expect((await repository.find(query({ ean: '3838975531314' }))).total).toBe(1);
    expect(
      (await repository.find(query({ excludeCategories: ['oblacila'] }))).items.map(
        (i) => i.productName,
      ),
    ).not.toContain('Majica');
    // Discounts against the €5.99 test default: milk 85 %, shirt 50 %, coffee 40–45 %.
    expect(
      (await repository.find(query({ minDiscount: 60 }))).items.map((i) => i.productName),
    ).toEqual(['Trajno mleko, 1 l']);
  });

  it('sorts by unit price and paginates', async () => {
    const first = await repository.find(query({ sort: 'unitPrice', pageSize: 2 }));
    const second = await repository.find(query({ sort: 'unitPrice', pageSize: 2, page: 2 }));

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
  });

  it('removes a stale group key when a product loses its twin', async () => {
    // A later Spar refresh no longer has the coffee.
    await repository.replaceStoreOffers('spar', [], new Date(now.getTime() + 60_000));
    await repository.regroup();

    expect(await OfferModel.countDocuments({ groupKey: 'ean:3838975531314' })).toBe(0);
  });

  it('counts categories of current offers', async () => {
    const counts = await repository.categoryCounts(now);
    expect(counts).toContainEqual({ category: 'mlecni-izdelki', count: 2 });
  });
});

describe('MongoShoppingListRepository (real MongoDB)', () => {
  const list = new MongoShoppingListRepository();
  const item = (checked: boolean, updatedAt: string) => ({
    id: 'offer-1',
    store: 'lidl' as const,
    productName: 'Šunka',
    price: 1.29,
    checked,
    updatedAt: new Date(updatedAt),
  });

  it('keeps the newer copy and clears checked items', async () => {
    expect(await list.save(item(true, '2026-10-26T12:00:00Z'))).toBe('saved');
    expect(await list.save(item(false, '2026-10-26T11:00:00Z'))).toBe('stale');
    expect((await list.list())[0]).toMatchObject({ id: 'offer-1', checked: true });

    expect(await list.removeChecked()).toBe(1);
    expect(await list.count()).toBe(0);
  });
});

describe('MongoSettingsRepository (real MongoDB)', () => {
  it('stores settings and keeps the newer copy', async () => {
    const settings = new MongoSettingsRepository();
    await settings.save({
      preferredStores: ['lidl'],
      hiddenCategories: [],
      updatedAt: new Date('2026-10-26T12:00:00Z'),
    });
    const result = await settings.save({
      preferredStores: [],
      hiddenCategories: [],
      updatedAt: new Date('2026-10-26T11:00:00Z'),
    });

    expect(result.preferredStores).toEqual(['lidl']);
    expect((await settings.get()).preferredStores).toEqual(['lidl']);
  });
});
