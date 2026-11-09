import { describe, expect, it } from 'vitest';
import type { Flyer } from '../../src/domain/flyer.js';
import type { StoreId } from '../../src/domain/stores.js';
import type { FlyerSource } from '../../src/flyers/flyer-sources.js';
import { EUROSPIN_FLYER, HOFER_FLYER } from '../../src/flyers/parse-flyers.js';
import { refreshFlyers } from '../../src/jobs/flyer-refresh.js';
import type { HttpClient } from '../../src/scraping/polite-http-client.js';
import { FakeFlyerRepository, silentLogger } from '../helpers.js';

const http: HttpClient = {
  fetchText: () => Promise.reject(new Error('no network in tests')),
  fetchJson: () => Promise.reject(new Error('no network in tests')),
};

const source = (store: StoreId, fetchFlyers: () => Promise<Flyer[]>): FlyerSource => ({
  store,
  fetchFlyers,
});

describe('refreshFlyers', () => {
  it('replaces each store’s flyers and keeps them when a store fails', async () => {
    const repository = new FakeFlyerRepository();
    repository.flyers = [{ ...HOFER_FLYER, id: 'hofer-old' }, EUROSPIN_FLYER];

    const results = await refreshFlyers({
      sources: [
        source('hofer', async () => [HOFER_FLYER]),
        source('eurospin', () => Promise.reject(new Error('site changed'))),
      ],
      repository,
      http,
      log: silentLogger,
    });

    expect(results).toEqual([
      { store: 'hofer', ok: true, count: 1 },
      { store: 'eurospin', ok: false, count: 0, error: 'site changed' },
    ]);
    expect(repository.flyers.map((f) => f.id).sort()).toEqual(['eurospin-letak', 'hofer-letaki']);
  });

  it('drops invalid flyers and keeps the previous ones when nothing valid is left', async () => {
    const repository = new FakeFlyerRepository();
    repository.flyers = [EUROSPIN_FLYER];

    const results = await refreshFlyers({
      sources: [
        source('eurospin', async () => [{ ...EUROSPIN_FLYER, url: 'https://evil.example/' }]),
      ],
      repository,
      http,
      log: silentLogger,
    });

    expect(results[0]).toMatchObject({ ok: false });
    expect(repository.flyers).toEqual([EUROSPIN_FLYER]);
  });
});
