import { hash } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv, type Env } from '../src/config/env.js';
import type { CategoryId } from '../src/domain/categories.js';
import { finalizeOffer, type Offer, type ScrapedOffer } from '../src/domain/offer.js';
import type { StoreId } from '../src/domain/stores.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/domain/settings.js';
import type { ShoppingItem } from '../src/domain/shopping-list.js';
import type { User } from '../src/domain/account.js';
import type { SettingsRepository } from '../src/repositories/settings-repository.js';
import type { UserRepository } from '../src/repositories/user-repository.js';
import type { RefreshSummary } from '../src/jobs/refresh-runner.js';
import type {
  SaveResult,
  ShoppingListRepository,
} from '../src/repositories/shopping-list-repository.js';
import type {
  OfferPage,
  OfferQuery,
  OfferRepository,
  ReplaceResult,
  StoreStatus,
} from '../src/repositories/offer-repository.js';

export const TEST_EMAIL = 'nik@example.com';
export const TEST_PASSWORD = 'correct horse battery staple';
export const TEST_SIGNUP_CODE = 'invite-code-123';
export const TEST_REFRESH_TOKEN = 'r'.repeat(40);

const testPasswordHash = hash(TEST_PASSWORD);

export function testEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    MONGODB_URI: 'mongodb://localhost/test',
    SIGNUP_CODE: TEST_SIGNUP_CODE,
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

  regroupCalls = 0;

  async regroup(): Promise<number> {
    this.regroupCalls++;
    return 0;
  }

  async saveStoreStatus(status: StoreStatus): Promise<void> {
    const previous = this.statuses.find((s) => s.store === status.store);
    const lastSuccessAt = status.ok ? status.lastRunAt : previous?.lastSuccessAt;
    this.statuses = [
      ...this.statuses.filter((s) => s.store !== status.store),
      { ...status, ...(lastSuccessAt && { lastSuccessAt }) },
    ];
  }

  async storeStatuses(): Promise<StoreStatus[]> {
    return this.statuses;
  }
}

export class FakeUserRepository implements UserRepository {
  users: User[] = [];

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((u) => u.email === email);
  }

  async create(user: Omit<User, 'id'>): Promise<User | 'exists'> {
    if (this.users.some((u) => u.email === user.email)) return 'exists';
    const created = { id: `user-${this.users.length + 1}`, ...user };
    this.users.push(created);
    return created;
  }
}

/** In-memory shopping lists with the same "newer write wins" rule as the Mongo one. */
export class FakeShoppingListRepository implements ShoppingListRepository {
  lists = new Map<string, Map<string, ShoppingItem>>();

  private items(listId: string): Map<string, ShoppingItem> {
    let items = this.lists.get(listId);
    if (!items) this.lists.set(listId, (items = new Map<string, ShoppingItem>()));
    return items;
  }

  async list(listId: string): Promise<ShoppingItem[]> {
    return [...this.items(listId).values()];
  }

  async has(listId: string, id: string): Promise<boolean> {
    return this.items(listId).has(id);
  }

  async count(listId: string): Promise<number> {
    return this.items(listId).size;
  }

  async save(listId: string, item: ShoppingItem): Promise<SaveResult> {
    const existing = this.items(listId).get(item.id);
    if (existing && existing.updatedAt > item.updatedAt) return 'stale';
    this.items(listId).set(item.id, item);
    return 'saved';
  }

  async remove(listId: string, id: string): Promise<void> {
    this.items(listId).delete(id);
  }

  async removeChecked(listId: string): Promise<number> {
    const checked = [...this.items(listId).values()].filter((i) => i.checked);
    for (const item of checked) this.items(listId).delete(item.id);
    return checked.length;
  }
}

export class FakeSettingsRepository implements SettingsRepository {
  stored = new Map<string, Settings>();

  async get(userId: string): Promise<Settings> {
    return this.stored.get(userId) ?? DEFAULT_SETTINGS;
  }

  async save(userId: string, settings: Settings): Promise<Settings> {
    const current = await this.get(userId);
    if (current.updatedAt > settings.updatedAt) return current;
    this.stored.set(userId, settings);
    return settings;
  }
}

export interface TestApp {
  app: FastifyInstance;
  repository: FakeOfferRepository;
  users: FakeUserRepository;
  shoppingList: FakeShoppingListRepository;
  settings: FakeSettingsRepository;
  refreshCalls: number;
}

export async function buildTestApp(env?: Env, clientRoot?: string): Promise<TestApp> {
  const repository = new FakeOfferRepository();
  const users = new FakeUserRepository();
  // One account exists from the start; tests sign up others through the API.
  await users.create({
    email: TEST_EMAIL,
    passwordHash: await testPasswordHash,
    createdAt: new Date(),
  });
  const shoppingList = new FakeShoppingListRepository();
  const settings = new FakeSettingsRepository();
  const result: TestApp = {
    app: undefined as unknown as FastifyInstance,
    repository,
    users,
    shoppingList,
    settings,
    refreshCalls: 0,
  };
  result.app = await buildApp({
    env: env ?? testEnv(),
    repository,
    users,
    shoppingList,
    settings,
    refresh: async (): Promise<RefreshSummary> => {
      result.refreshCalls++;
      return { startedAt: new Date(), finishedAt: new Date(), results: [] };
    },
    ...(clientRoot !== undefined && { clientRoot }),
  });
  return result;
}

function sessionCookie(response: { cookies: { name: string; value: string }[] }) {
  const cookie = response.cookies.find((c) => c.name === 'session');
  return cookie && `session=${cookie.value}`;
}

/** Logs in and returns the Cookie header value for authenticated requests. */
export async function login(app: FastifyInstance, email = TEST_EMAIL): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: TEST_PASSWORD },
  });
  const cookie = sessionCookie(response);
  if (!cookie) throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  return cookie;
}

/** Creates an account through the API and returns its session cookie. */
export async function signup(app: FastifyInstance, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password: TEST_PASSWORD, code: TEST_SIGNUP_CODE },
  });
  const cookie = sessionCookie(response);
  if (!cookie) throw new Error(`signup failed: ${response.statusCode} ${response.body}`);
  return cookie;
}

export const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
