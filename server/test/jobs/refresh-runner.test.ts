import { describe, expect, it, vi } from 'vitest';
import type { StoreAdapter } from '../../src/adapters/store-adapter.js';
import type { ScrapedOffer } from '../../src/domain/offer.js';
import type { StoreId } from '../../src/domain/stores.js';
import { RefreshTrigger, runRefresh } from '../../src/jobs/refresh-runner.js';
import type { HttpClient } from '../../src/scraping/polite-http-client.js';
import { FakeOfferRepository, offer, scrapedOffer, silentLogger } from '../helpers.js';

const http: HttpClient = {
  fetchText: () => Promise.reject(new Error('no network in tests')),
  fetchJson: () => Promise.reject(new Error('no network in tests')),
};

function adapter(store: StoreId, fetchOffers: () => Promise<ScrapedOffer[]>): StoreAdapter {
  return { store, fetchOffers };
}

describe('runRefresh', () => {
  it('keeps going when one store fails and records each status', async () => {
    const repository = new FakeOfferRepository();

    const summary = await runRefresh({
      adapters: [
        adapter('lidl', () => Promise.reject(new Error('site changed'))),
        adapter('dm', async () => [
          scrapedOffer({ externalId: 'a' }),
          scrapedOffer({ externalId: 'b' }),
        ]),
      ],
      repository,
      http,
      log: silentLogger,
    });

    expect(summary.results).toMatchObject([
      { store: 'lidl', ok: false, error: 'site changed' },
      { store: 'dm', ok: true, offerCount: 2 },
    ]);
    expect(repository.replaceCalls.map((c) => c.store)).toEqual(['dm']);
    expect(repository.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ store: 'lidl', ok: false }),
        expect.objectContaining({ store: 'dm', ok: true, offerCount: 2 }),
      ]),
    );
  });

  it('skips invalid offers but stores the valid ones', async () => {
    const repository = new FakeOfferRepository();

    const summary = await runRefresh({
      adapters: [
        adapter('spar', async () => [scrapedOffer(), scrapedOffer({ externalId: 'x', price: -1 })]),
      ],
      repository,
      http,
      log: silentLogger,
    });

    expect(summary.results[0]).toMatchObject({ ok: true, offerCount: 1, invalidCount: 1 });
    expect(repository.regroupCalls).toBe(1);
  });

  it('does not regroup when no store was refreshed', async () => {
    const repository = new FakeOfferRepository();

    await runRefresh({
      adapters: [adapter('lidl', () => Promise.reject(new Error('down')))],
      repository,
      http,
      log: silentLogger,
    });

    expect(repository.regroupCalls).toBe(0);
  });

  it("keeps a store's previous offers when it returns nothing valid", async () => {
    const repository = new FakeOfferRepository();
    repository.offers = [offer('hofer')];

    const summary = await runRefresh({
      adapters: [adapter('hofer', async () => [])],
      repository,
      http,
      log: silentLogger,
    });

    expect(summary.results[0]?.ok).toBe(false);
    expect(repository.replaceCalls).toHaveLength(0);
    expect(repository.offers).toHaveLength(1);
  });

  it('survives a failing status write', async () => {
    const repository = new FakeOfferRepository();
    repository.saveStoreStatus = () => Promise.reject(new Error('db down'));

    const summary = await runRefresh({
      adapters: [adapter('dm', async () => [scrapedOffer()])],
      repository,
      http,
      log: silentLogger,
    });

    expect(summary.results[0]?.ok).toBe(true);
  });
});

describe('RefreshTrigger', () => {
  it('refuses to start a second run while one is running', async () => {
    let finish: () => void = () => undefined;
    const trigger = new RefreshTrigger(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve({ startedAt: new Date(), finishedAt: new Date(), results: [] });
          };
        }),
      silentLogger,
    );

    expect(trigger.start()).toBe(true);
    expect(trigger.start()).toBe(false);
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    expect(trigger.running).toBe(false);
    expect(trigger.start()).toBe(true);
  });
});

describe('runRefresh with visiting hours', () => {
  it('skips a store outside its allowed window without touching its offers or status', async () => {
    const repository = new FakeOfferRepository();
    repository.offers = [offer('spar')];
    const fetchOffers = vi.fn(async () => [scrapedOffer()]);

    const summary = await runRefresh({
      adapters: [{ store: 'spar', fetchOffers, isAllowedAt: () => false }],
      repository,
      http,
      log: silentLogger,
    });

    expect(summary.results[0]).toMatchObject({ store: 'spar', ok: true, skipped: true });
    expect(fetchOffers).not.toHaveBeenCalled();
    expect(repository.offers).toHaveLength(1);
    expect(repository.statuses).toHaveLength(0);
  });

  it('with onlyStaleAfterHours, skips stores refreshed recently and refreshes the rest', async () => {
    const now = new Date('2026-10-30T05:05:00Z');
    const repository = new FakeOfferRepository();
    const status = (store: StoreId, lastSuccessAt: string) => ({
      store,
      lastRunAt: new Date(lastSuccessAt),
      lastSuccessAt: new Date(lastSuccessAt),
      ok: true,
      offerCount: 1,
      durationMs: 1,
    });
    repository.statuses = [
      status('mercator', '2026-10-30T04:20:00Z'), // this morning's earlier run
      status('lidl', '2026-10-29T10:50:00Z'), // yesterday
    ];
    const mercator = vi.fn(async () => [scrapedOffer()]);
    const lidl = vi.fn(async () => [scrapedOffer()]);
    const spar = vi.fn(async () => [scrapedOffer()]); // never refreshed yet

    const summary = await runRefresh({
      adapters: [adapter('mercator', mercator), adapter('lidl', lidl), adapter('spar', spar)],
      repository,
      http,
      log: silentLogger,
      now: () => now,
      onlyStaleAfterHours: 12,
    });

    expect(mercator).not.toHaveBeenCalled();
    expect(lidl).toHaveBeenCalled();
    expect(spar).toHaveBeenCalled();
    expect(summary.results.map((r) => [r.store, r.skipped ?? false])).toEqual([
      ['mercator', true],
      ['lidl', false],
      ['spar', false],
    ]);
  });
});
