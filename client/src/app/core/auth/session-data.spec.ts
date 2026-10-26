import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SettingsService } from '../settings/settings-service';
import { ShoppingListService, type ShoppingItem } from '../shopping-list/shopping-list-service';
import { SessionData } from './session-data';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const savedItem: ShoppingItem = {
  id: 'o1',
  store: 'lidl',
  productName: 'Šunka',
  price: 1.29,
  checked: false,
  updatedAt: '2026-10-26T10:00:00.000Z',
};

describe('SessionData', () => {
  let http: HttpTestingController;

  /** A device that already has a list (and maybe the account it belongs to) saved. */
  function setUp(account?: string) {
    localStorage.clear();
    localStorage.setItem(
      'reklame-popusti.shopping-list',
      JSON.stringify({ items: [savedItem], pending: [] }),
    );
    if (account) localStorage.setItem('reklame-popusti.account', account);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return {
      session: TestBed.inject(SessionData),
      list: TestBed.inject(ShoppingListService),
      settings: TestBed.inject(SettingsService),
    };
  }

  afterEach(() => {
    localStorage.clear();
  });

  it('uploads a list kept before accounts existed to the first account that logs in', async () => {
    const { session } = setUp();

    session.loggedIn('nik@example.com');
    await settle();

    const put = http.expectOne('/api/shopping-list/items/o1');
    expect(put.request.body).toMatchObject({ id: 'o1', productName: 'Šunka' });
    expect(localStorage.getItem('reklame-popusti.account')).toBe('nik@example.com');
  });

  it("never shows or uploads the previous account's list to another account", async () => {
    const { session, list } = setUp('nik@example.com');

    session.loggedIn('teja@example.com');

    expect(list.items()).toEqual([]);
    await settle();
    http.expectNone((r) => r.method === 'PUT');
    expect(localStorage.getItem('reklame-popusti.account')).toBe('teja@example.com');
  });

  it('keeps the list when the same account logs in again', () => {
    const { session, list } = setUp('nik@example.com');

    session.loggedIn('nik@example.com');

    expect(list.items()).toEqual([savedItem]);
  });

  it('forgets the list and settings on logout', () => {
    const { session, list, settings } = setUp('nik@example.com');
    settings.save({ preferredStores: ['lidl'] });

    session.loggedOut();

    expect(list.items()).toEqual([]);
    expect(settings.preferredStores()).toEqual([]);
    expect(localStorage.getItem('reklame-popusti.account')).toBeNull();
  });
});
