import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { makeOffer } from '../../../testing/offers';
import { ShoppingListService, type ShoppingItem } from './shopping-list-service';

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ShoppingListService', () => {
  let http: HttpTestingController;
  let list: ShoppingListService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    list = TestBed.inject(ShoppingListService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  async function answerSync(serverItems: ShoppingItem[] = []) {
    await settle();
    for (const req of http.match((r) => r.method !== 'GET')) req.flush({});
    await settle();
    http.expectOne('/api/shopping-list').flush({ items: serverItems });
    await settle();
  }

  it('adds an offer at once, keeps a copy of it and saves it on the server', async () => {
    list.toggle(makeOffer({ id: 'o1', price: 3.59 }));

    expect(list.has('o1')).toBe(true);
    expect(list.items()[0]).toMatchObject({
      id: 'o1',
      store: 'mercator',
      price: 3.59,
      checked: false,
    });

    await settle();
    const put = http.expectOne('/api/shopping-list/items/o1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toMatchObject({
      id: 'o1',
      productName: 'Mleta kava Classic, Barcaffe, 200 g',
    });
    put.flush({ result: 'saved' });
    await settle();
    http.expectOne('/api/shopping-list').flush({ items: [put.request.body as ShoppingItem] });
    await settle();
    expect(list.pendingCount()).toBe(0);
  });

  it('toggling an offer that is on the list removes it', async () => {
    list.toggle(makeOffer({ id: 'o1' }));
    await answerSync([...list.items()]);
    list.toggle(makeOffer({ id: 'o1' }));

    expect(list.has('o1')).toBe(false);
    await settle();
    expect(http.expectOne('/api/shopping-list/items/o1').request.method).toBe('DELETE');
  });

  it('keeps changes while offline and sends them when back online', async () => {
    list.toggle(makeOffer({ id: 'o1' }));
    await settle();
    http.expectOne('/api/shopping-list/items/o1').error(new ProgressEvent('offline'));
    await settle();

    expect(list.pendingCount()).toBe(1);
    expect(list.has('o1')).toBe(true);
    expect(JSON.parse(localStorage.getItem('reklame-popusti.shopping-list') ?? '{}')).toMatchObject(
      {
        pending: [{ kind: 'put' }],
      },
    );

    window.dispatchEvent(new Event('online'));
    await settle();
    http.expectOne('/api/shopping-list/items/o1').flush({ result: 'saved' });
    await settle();
    http.expectOne('/api/shopping-list').flush({ items: [] });
    await settle();
    expect(list.pendingCount()).toBe(0);
  });

  it('drops a change the server rejects instead of retrying it forever', async () => {
    list.toggle(makeOffer({ id: 'o1' }));
    await settle();
    http
      .expectOne('/api/shopping-list/items/o1')
      .flush({ error: 'invalid' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    http.expectOne('/api/shopping-list').flush({ items: [] });
    await settle();

    expect(list.pendingCount()).toBe(0);
  });

  it('crosses items off and clears the bought ones', async () => {
    list.toggle(makeOffer({ id: 'a' }));
    list.toggle(makeOffer({ id: 'b' }));
    list.setChecked('a', true);

    expect(list.openCount()).toBe(1);
    list.clearChecked();
    expect(list.items().map((i) => i.id)).toEqual(['b']);
  });

  it('takes the server copy (from other devices) after syncing', async () => {
    const fromOtherDevice: ShoppingItem = {
      id: 'x',
      store: 'lidl',
      productName: 'Šunka',
      price: 1.29,
      checked: false,
      updatedAt: '2026-10-26T10:00:00.000Z',
    };

    const sync = list.sync();
    await settle();
    http.expectOne('/api/shopping-list').flush({ items: [fromOtherDevice] });
    await sync;

    expect(list.items().map((i) => i.id)).toEqual(['x']);
  });
});
