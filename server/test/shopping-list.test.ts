import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, login, signup, TEST_EMAIL, testEnv, type TestApp } from './helpers.js';

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'offer-1',
  store: 'lidl',
  productName: 'Šunka, 200 g',
  price: 1.29,
  regularPrice: 2.19,
  condition: { kind: 'loyalty-card', text: 'Lidl Plus' },
  validTo: '2026-10-28T22:59:59.000Z',
  checked: false,
  updatedAt: '2026-10-26T10:00:00.000Z',
  ...overrides,
});

describe('shopping list API', () => {
  let t: TestApp;
  let cookie: string;

  beforeEach(async () => {
    t = await buildTestApp();
    cookie = await login(t.app);
  });

  afterEach(async () => {
    await t.app.close();
  });

  const put = (body: Record<string, unknown>, id = String(body.id)) =>
    t.app.inject({
      method: 'PUT',
      url: `/api/shopping-list/items/${id}`,
      headers: { cookie },
      payload: body,
    });
  const list = async () =>
    (await t.app.inject({ method: 'GET', url: '/api/shopping-list', headers: { cookie } })).json<{
      items: { id: string; checked: boolean }[];
    }>().items;

  it('needs a session', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/shopping-list' });
    expect(response.statusCode).toBe(401);
  });

  it('saves items and lists them', async () => {
    expect((await put(item())).json()).toEqual({ result: 'saved' });

    expect(await list()).toEqual([
      expect.objectContaining({ id: 'offer-1', productName: 'Šunka, 200 g', checked: false }),
    ]);
  });

  it('ignores an older write so late offline edits cannot undo newer ones', async () => {
    await put(item({ checked: true, updatedAt: '2026-10-26T12:00:00.000Z' }));

    const stale = await put(item({ checked: false, updatedAt: '2026-10-26T11:00:00.000Z' }));

    expect(stale.json()).toEqual({ result: 'stale' });
    expect((await list())[0]?.checked).toBe(true);
  });

  it('rejects invalid items and mismatched ids', async () => {
    expect((await put(item({ price: -1 }))).statusCode).toBe(400);
    expect((await put(item({ store: 'konzum' }))).statusCode).toBe(400);
    expect((await put(item(), 'other-id')).statusCode).toBe(400);
  });

  it('removes items and clears the checked ones', async () => {
    await put(item({ id: 'a', checked: true }));
    await put(item({ id: 'b' }));
    await put(item({ id: 'c', checked: true }));

    await t.app.inject({
      method: 'DELETE',
      url: '/api/shopping-list/items/b',
      headers: { cookie },
    });
    const cleared = await t.app.inject({
      method: 'POST',
      url: '/api/shopping-list/clear-checked',
      headers: { cookie },
    });

    expect(cleared.json()).toEqual({ removed: 2 });
    expect(await list()).toEqual([]);
  });

  it('treats deleting a missing item as done (safe to retry)', async () => {
    const response = await t.app.inject({
      method: 'DELETE',
      url: '/api/shopping-list/items/missing',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(204);
  });
});

describe('shared shopping lists', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await buildTestApp(testEnv({ SHARED_LISTS: `${TEST_EMAIL},teja@example.com` }));
  });

  afterEach(async () => {
    await t.app.close();
  });

  const putAs = (cookie: string, id: string) =>
    t.app.inject({
      method: 'PUT',
      url: `/api/shopping-list/items/${id}`,
      headers: { cookie },
      payload: item({ id }),
    });
  const getAs = async (cookie: string) =>
    (await t.app.inject({ method: 'GET', url: '/api/shopping-list', headers: { cookie } })).json<{
      items: { id: string }[];
      sharedWith: string[];
    }>();

  it('gives the accounts in a group one list, and tells each who else sees it', async () => {
    const nik = await login(t.app);
    const teja = await signup(t.app, 'teja@example.com');

    await putAs(nik, 'kava');
    await putAs(teja, 'mleko');

    expect((await getAs(nik)).items.map((i) => i.id).sort()).toEqual(['kava', 'mleko']);
    expect((await getAs(teja)).items.map((i) => i.id).sort()).toEqual(['kava', 'mleko']);
    expect((await getAs(nik)).sharedWith).toEqual(['teja@example.com']);
    expect((await getAs(teja)).sharedWith).toEqual([TEST_EMAIL]);
  });

  it('keeps everyone else on their own private list', async () => {
    const nik = await login(t.app);
    const other = await signup(t.app, 'other@example.com');

    await putAs(nik, 'kava');
    await putAs(other, 'kruh');

    expect((await getAs(nik)).items.map((i) => i.id)).toEqual(['kava']);
    expect(await getAs(other)).toEqual({
      items: [expect.objectContaining({ id: 'kruh' })],
      sharedWith: [],
    });
  });
});
