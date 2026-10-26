import { hash } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv, type Env } from '../src/config/env.js';
import type { CategoryId } from '../src/domain/categories.js';
import { finalizeOffer, type Offer, type ScrapedOffer } from '../src/domain/offer.js';
import type { StoreId } from '../src/domain/stores.js';
import type { RefreshSummary } from '../src/jobs/refresh-runner.js';
import type {
  OfferPage,
  OfferQuery,
  OfferRepository,
  ReplaceResult,
  StoreStatus,
} from '../src/repositories/offer-repository.js';

export const TEST_PASSWORD = 'correct horse battery staple';
export const TEST_REFRESH_TOKEN = 'r'.repeat(40);

export async function testEnv(overrides: Partial<Record<keyof Env, string>> = {}): Promise<Env> {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    MONGODB_URI: 'mongodb://localhost/test',
    APP_PASSWORD_HASH: await hash(TEST_PASSWORD),
    JWT_SECRET: 'j'.repeat(40),
    REFRESH_TOKEN: TEST_REFRESH_TOKEN,
    ...overrides,
  });
}

export function scrapedOffer(overrides: Partial<ScrapedOffer> = {}): ScrapedOffer {
  return {
    externalId: 'p1',
    productName: 'Mleta kava',
    brand: 'Barcaffe',
    category: 'shramba',
    price: 3.99,
    regularPrice: 5.99,
    validFrom: new Date('2026-10-20T00:00:00Z'),
    validTo: new Date('2026-10-30T00:00:00Z'),
    ...overrides,
  };
}

export function offer(store: StoreId, overrides: Partial<ScrapedOffer> = {}): Offer {
  return finalizeOffer(store, scrapedOffer(overrides), new Date('2026-10-25T00:00:00Z'));
}

/** In-memory OfferRepository that records calls; search is a plain substring match. */
export class FakeOfferRepository implements OfferRepository {
  offers: Offer[] = [];
  statuses: StoreStatus[] = [];
  queries: OfferQuery[] = [];
  replaceCalls: { store: StoreId; offers: Offer[] }[] = [];

  async find(query: OfferQuery): Promise<OfferPage> {
    this.queries.push(query);
    const items = this.offers
      .filter((o) => !query.text || o.searchText.includes(query.text.toLowerCase()))
      .map(({ searchText: _s, expiresAt: _e, ...rest }) => ({ id: rest.externalId, ...rest }));
    return { items, total: items.length };
  }

  async categoryCounts(): Promise<{ category: CategoryId; count: number }[]> {
    return [];
  }

  async replaceStoreOffers(store: StoreId, offers: Offer[]): Promise<ReplaceResult> {
    this.replaceCalls.push({ store, offers });
    const removed = this.offers.filter((o) => o.store === store).length;
    this.offers = [...this.offers.filter((o) => o.store !== store), ...offers];
    return { upserted: offers.length, removed };
  }

  async saveStoreStatus(status: StoreStatus): Promise<void> {
    this.statuses = [...this.statuses.filter((s) => s.store !== status.store), status];
  }

  async storeStatuses(): Promise<StoreStatus[]> {
    return this.statuses;
  }
}

export interface TestApp {
  app: FastifyInstance;
  repository: FakeOfferRepository;
  refreshCalls: number;
}

export async function buildTestApp(env?: Env, clientRoot?: string): Promise<TestApp> {
  const repository = new FakeOfferRepository();
  const result: TestApp = {
    app: undefined as unknown as FastifyInstance,
    repository,
    refreshCalls: 0,
  };
  result.app = await buildApp({
    env: env ?? (await testEnv()),
    repository,
    refresh: async (): Promise<RefreshSummary> => {
      result.refreshCalls++;
      return { startedAt: new Date(), finishedAt: new Date(), results: [] };
    },
    ...(clientRoot !== undefined && { clientRoot }),
  });
  return result;
}

/** Logs in and returns the Cookie header value for authenticated requests. */
export async function login(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: TEST_PASSWORD },
  });
  const cookie = response.cookies.find((c) => c.name === 'session');
  if (!cookie) throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  return `session=${cookie.value}`;
}

export const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
