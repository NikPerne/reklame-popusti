import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { makeOffer } from '../../../testing/offers';
import { translocoTesting } from '../../../testing/transloco-testing';
import { ShoppingListService } from '../../core/shopping-list/shopping-list-service';
import { ShoppingListPage } from './shopping-list-page';

describe('ShoppingListPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ShoppingListPage, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
  });

  async function render() {
    const fixture = TestBed.createComponent(ShoppingListPage);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('groups items by store with the sum still to buy', async () => {
    const list = TestBed.inject(ShoppingListService);
    list.toggle(makeOffer({ id: 'a', store: 'lidl', productName: 'Šunka', price: 1.29 }));
    list.toggle(makeOffer({ id: 'b', store: 'mercator', productName: 'Kava', price: 3.59 }));
    list.toggle(makeOffer({ id: 'c', store: 'lidl', productName: 'Brokoli', price: 1.19 }));

    const { element } = await render();
    const groups = [...element.querySelectorAll('.store-group')];

    expect(groups.map((g) => text(g.querySelector('.store-name')))).toEqual(['Mercator', 'Lidl']);
    expect(text(groups[1]!.querySelector('.subtotal'))).toBe('2,48 €');
    expect([...groups[1]!.querySelectorAll('.name')].map(text)).toEqual(['Brokoli', 'Šunka']);
    expect(text(element.querySelector('.total strong'))).toBe('6,07 €');
  });

  it('crosses an item off when tapped and moves it to the bottom of its store', async () => {
    const list = TestBed.inject(ShoppingListService);
    list.toggle(makeOffer({ id: 'a', store: 'lidl', productName: 'Brokoli', price: 1.19 }));
    list.toggle(makeOffer({ id: 'b', store: 'lidl', productName: 'Šunka', price: 1.29 }));
    const { fixture, element } = await render();

    element.querySelector<HTMLButtonElement>('.item')!.click();
    await fixture.whenStable();

    const rows = [...element.querySelectorAll('li')];
    expect(rows.map((r) => text(r.querySelector('.name')))).toEqual(['Šunka', 'Brokoli']);
    expect(rows[1]!.classList).toContain('checked');
    expect(rows[1]!.querySelector('.item')!.getAttribute('aria-checked')).toBe('true');
    expect(text(element.querySelector('.subtotal'))).toBe('1,29 €');
  });

  it('shows an empty state', async () => {
    const { element } = await render();
    expect(text(element.querySelector('.empty'))).toContain('Seznam je prazen');
  });
});
