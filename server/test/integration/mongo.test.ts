/**
 * Runs the real MongoDB queries against an in-memory MongoDB (mongodb-memory-server), so
 * aggregation mistakes that unit tests of the pipeline's shape can't see are caught.
 * Atlas Search itself can't run here; the "basic" search mode is used instead.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/db/connect.js';
import { OfferModel } from '../../src/db/models.js';
import { finalizeOffer, type ScrapedOffer } from '../../src/domain/offer.js';
import type { StoreId } from '../../src/domain/stores.js';
import type { Flyer } from '../../src/domain/flyer.js';
import { EUROSPIN_FLYER } from '../../src/flyers/parse-flyers.js';
import { FlyerModel, MongoFlyerRepository } from '../../src/repositories/flyer-repository.js';
import { MongoOfferRepository } from '../../src/repositories/mongo-offer-repository.js';
import type { OfferQuery } from '../../src/repositories/offer-repository.js';
import {
  MongoPriceHistoryRepository,
  PriceHistoryModel,
} from '../../src/repositories/price-history-repository.js';
import { MongoSettingsRepository } from '../../src/repositories/settings-repository.js';
import { MongoShoppingListRepository } from '../../src/repositories/shopping-list-repository.js';
import { MongoUserRepository } from '../../src/repositories/user-repository.js';
import { scrapedOffer } from '../helpers.js';

let server: MongoMemoryServer;
const now = new Date('2026-10-26T08:00:00Z');
const repository = new MongoOfferRepository('basic');

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await connectDatabase(server.getUri('integration'));
  // Unique indexes (e.g. one account per email) must exist before the tests rely on them.
  await mongoose.connection.syncIndexes();
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

  it('compares a discount with an everyday price elsewhere, or hides everyday prices', async () => {
    // Spar sells the coffee at its everyday price, cheaper than Mercator's discount.
    await seed('spar', [
      {
        productName: 'Mleta kava classic barcaffe 200g',
        price: 3.19,
        regularPrice: undefined,
        regular: true,
        eans: ['3838975531314'],
      },
    ]);
    await repository.regroup();

    const all = await repository.find(query({ text: 'kava' }));
    expect(all.items[0]).toMatchObject({ store: 'spar', price: 3.19, regular: true });
    expect(all.items[0]?.alsoAt).toEqual([expect.objectContaining({ store: 'mercator' })]);

    const deals = await repository.find(query({ text: 'kava', onlyDeals: true }));
    expect(deals.items).toHaveLength(1);
    expect(deals.items[0]).toMatchObject({ store: 'mercator', price: 3.59 });
    expect(deals.items[0]?.alsoAt).toBeUndefined();
  });

  it('finds comparison candidates by word, ungrouped and with every listing', async () => {
    const candidates = await repository.findCandidates({ text: 'mleko', now, limit: 50 });

    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => typeof c.id === 'string' && !('groupKey' in c))).toBe(true);
    expect(
      await repository.findCandidates({ text: 'mleko', stores: ['spar'], now, limit: 50 }),
    ).toEqual([]);
  });

  it('finds one offer by id and lists the names in a category', async () => {
    const [first] = (await repository.find(query({ text: 'majica' }))).items;

    expect(await repository.findById(first!.id)).toMatchObject({ productName: 'Majica' });
    expect(await repository.findById('000000000000000000000000')).toBeUndefined();
    expect(await repository.findById('not-an-id')).toBeUndefined();
    expect((await repository.productNames('mlecni-izdelki')).sort()).toEqual([
      'Trajno mleko, 1 l',
      'Trajno mleko, 1 l',
    ]);
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
    expect(await list.save('user:a', item(true, '2026-10-26T12:00:00Z'))).toBe('saved');
    expect(await list.save('user:a', item(false, '2026-10-26T11:00:00Z'))).toBe('stale');
    expect(await list.list('user:a')).toEqual([
      expect.objectContaining({ id: 'offer-1', checked: true }),
    ]);
    expect(await list.has('user:a', 'offer-1')).toBe(true);

    expect(await list.removeChecked('user:a')).toBe(1);
    expect(await list.count('user:a')).toBe(0);
  });

  it('keeps lists apart even when they hold the same offer', async () => {
    await list.save('user:a', item(false, '2026-10-26T12:00:00Z'));
    await list.save('user:b', item(true, '2026-10-26T12:00:00Z'));

    await list.remove('user:b', 'offer-1');

    expect(await list.list('user:a')).toHaveLength(1);
    expect(await list.list('user:b')).toHaveLength(0);
    expect(await list.has('user:b', 'offer-1')).toBe(false);
  });
});

describe('MongoUserRepository (real MongoDB)', () => {
  it('creates users and refuses a second account with the same email', async () => {
    const users = new MongoUserRepository();
    await users.create({ email: 'a@x.si', passwordHash: 'h', createdAt: now });

    const created = await users.findByEmail('a@x.si');
    expect(created).toMatchObject({ email: 'a@x.si', passwordHash: 'h' });
    expect(created?.id).toMatch(/^[0-9a-f]{24}$/);
    expect(await users.create({ email: 'a@x.si', passwordHash: 'h2', createdAt: now })).toBe(
      'exists',
    );
    expect(await users.findByEmail('b@x.si')).toBeUndefined();
  });
});

describe('MongoSettingsRepository (real MongoDB)', () => {
  it('stores settings and keeps the newer copy', async () => {
    const settings = new MongoSettingsRepository();
    await settings.save('u1', {
      preferredStores: ['lidl'],
      hiddenCategories: [],
      updatedAt: new Date('2026-10-26T12:00:00Z'),
    });
    const result = await settings.save('u1', {
      preferredStores: [],
      hiddenCategories: [],
      updatedAt: new Date('2026-10-26T11:00:00Z'),
    });

    expect(result.preferredStores).toEqual(['lidl']);
    expect((await settings.get('u1')).preferredStores).toEqual(['lidl']);
    expect((await settings.get('u2')).preferredStores).toEqual([]);
  });
});

describe('date filters and "newest" (real MongoDB)', () => {
  const day = 86_400_000;
  const at = (days: number) => new Date(now.getTime() + days * day);

  beforeAll(async () => {
    await OfferModel.deleteMany({});
    await seed('lidl', [
      { productName: 'Started long ago', validFrom: at(-20), validTo: at(10) },
      { productName: 'Started this week', validFrom: at(-2), validTo: at(5) },
      { productName: 'Ends tomorrow', validFrom: at(-5), validTo: at(1) },
      { productName: 'Next week', validFrom: at(3), validTo: at(9) },
    ]);
    await seed(
      'tus',
      [{ productName: 'No dates' }].map((o) => ({ ...o, validFrom: undefined })),
    );
    await repository.regroup();
  });

  const names = async (overrides: Partial<OfferQuery>) =>
    (await repository.find(query(overrides))).items.map((i) => i.productName).sort();

  it("hides next week's offers unless asked", async () => {
    expect(await names({})).not.toContain('Next week');
    expect(await names({ upcoming: true })).toContain('Next week');
  });

  it('finds offers that started recently or end soon', async () => {
    expect(await names({ startedWithinDays: 7 })).toEqual(['Ends tomorrow', 'Started this week']);
    expect(await names({ endsWithinDays: 2 })).toEqual(['Ends tomorrow']);
  });

  it('sorts newest first with undated offers last', async () => {
    const page = await repository.find(query({ sort: 'newest' }));
    expect(page.items.map((i) => i.productName)).toEqual([
      'Started this week',
      'Ends tomorrow',
      'Started long ago',
      'No dates',
    ]);
  });
});

describe('store status (real MongoDB)', () => {
  it('keeps the last successful refresh when a later run fails', async () => {
    const base = { store: 'lidl' as const, offerCount: 10, durationMs: 1000 };
    await repository.saveStoreStatus({
      ...base,
      ok: true,
      lastRunAt: new Date('2026-10-26T04:17:00Z'),
    });
    await repository.saveStoreStatus({
      ...base,
      ok: false,
      offerCount: 0,
      error: 'site changed',
      lastRunAt: new Date('2026-10-26T10:17:00Z'),
    });

    const [failed] = await repository.storeStatuses();
    expect(failed).toMatchObject({
      ok: false,
      error: 'site changed',
      lastSuccessAt: new Date('2026-10-26T04:17:00Z'),
    });

    await repository.saveStoreStatus({
      ...base,
      ok: true,
      lastRunAt: new Date('2026-10-26T16:17:00Z'),
    });
    const [recovered] = await repository.storeStatuses();
    expect(recovered).toMatchObject({ ok: true, lastSuccessAt: new Date('2026-10-26T16:17:00Z') });
    expect(recovered).not.toHaveProperty('error');
  });
});

describe('MongoPriceHistoryRepository', () => {
  const history = new MongoPriceHistoryRepository();
  const day = (d: number) => new Date(Date.UTC(2026, 10, d, 4, 10));
  const spar = (price: number, regularPrice?: number) =>
    finalizeOffer('spar', scrapedOffer({ externalId: '334863', price, regularPrice }), now);

  beforeEach(async () => {
    await PriceHistoryModel.deleteMany({});
  });

  it('extends the last point while the price stays and adds one when it changes', async () => {
    await history.record('spar', [spar(1.49)], day(1));
    await history.record('spar', [spar(1.49)], day(2));
    await history.record('spar', [spar(1.09, 1.49)], day(3));
    await history.record('spar', [spar(1.09, 1.49)], day(4));
    await history.record('spar', [spar(1.49)], day(5));

    expect(await history.find('spar', '334863')).toEqual([
      { price: 1.49, from: day(1), to: day(2) },
      { price: 1.09, regularPrice: 1.49, from: day(3), to: day(4) },
      { price: 1.49, from: day(5), to: day(5) },
    ]);
    expect(await history.find('spar', 'other')).toEqual([]);
  });

  it('keeps stores apart and skips offers that have not started', async () => {
    const upcoming = finalizeOffer(
      'spar',
      scrapedOffer({ externalId: 'next-week', validFrom: day(10) }),
      now,
    );
    await history.record('spar', [spar(1.49), upcoming], day(1));
    await history.record('mercator', [{ ...spar(2), store: 'mercator' }], day(1));

    expect(await history.find('spar', '334863')).toHaveLength(1);
    expect(await history.find('mercator', '334863')).toEqual([
      { price: 2, from: day(1), to: day(1) },
    ]);
    expect(await history.find('spar', 'next-week')).toEqual([]);
  });
});

describe('MongoFlyerRepository', () => {
  const flyers = new MongoFlyerRepository();
  const lidl: Flyer = {
    id: 'lidl-lidlov-katalog-2026-kw45',
    store: 'lidl',
    title: 'Lidlov katalog od 5. 11.',
    validFrom: new Date('2026-11-04T23:00:00Z'),
    validTo: new Date('2026-11-11T22:59:59Z'),
    sourceUrl: 'https://www.lidl.si/l/sl/katalog/lidlov-katalog-2026-kw45',
    viewer: 'pages',
    pages: [
      { image: 'https://imgproxy.leaflets.schwarz/p1.jpg', width: 1416, height: 2400 },
      { image: 'https://imgproxy.leaflets.schwarz/p2.jpg' },
    ],
  };

  beforeEach(async () => {
    await FlyerModel.deleteMany({});
  });

  it('replaces a store’s flyers and lists them without pages', async () => {
    await flyers.replaceStore('lidl', [{ ...lidl, id: 'lidl-old' }, lidl]);
    await flyers.replaceStore('eurospin', [EUROSPIN_FLYER]);
    await flyers.replaceStore('lidl', [lidl]);

    const list = await flyers.list();
    expect(list.map((f) => f.id).sort()).toEqual(['eurospin-letak', lidl.id]);
    const { pages: _pages, ...summary } = lidl;
    expect(list.find((f) => f.id === lidl.id)).toEqual({ ...summary, pageCount: 2 });
    expect(list.find((f) => f.id === 'eurospin-letak')).toEqual(EUROSPIN_FLYER);
    expect(await flyers.findById(lidl.id)).toEqual(lidl);
    expect(await flyers.findById('nope')).toBeUndefined();
  });
});
