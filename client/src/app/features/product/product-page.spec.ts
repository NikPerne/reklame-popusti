import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ComparedOffer, RelatedOffers } from '../../core/api/models';
import { makeOffer } from '../../../testing/offers';
import { translocoTesting } from '../../../testing/transloco-testing';
import { ProductPage } from './product-page';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const butter = {
  ...makeOffer({ id: 'm1', productName: 'Maslo, Mila, 250 g', price: 2.39, regular: true }),
  unitPrice: { amount: 9.56, unit: 'kg' },
} as ComparedOffer;
const lidlButter = {
  ...makeOffer({ id: 'l1', store: 'lidl', productName: 'Irsko maslo, 250 g', price: 1.55 }),
  unitPrice: { amount: 6.2, unit: 'kg' },
} as ComparedOffer;

const related: RelatedOffers = {
  offer: butter,
  query: { text: 'maslo', exclude: ['arasidov'], presetId: 'butter' },
  comparison: {
    unit: 'kg',
    stores: [
      { store: 'lidl', cheapest: lidlButter, count: 1 },
      { store: 'mercator', cheapest: butter, count: 1 },
    ],
    items: [lidlButter, butter],
    total: 2,
    notComparable: 0,
  },
};

describe('ProductPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductPage, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  async function open(
    id: string,
    respond: (r: ReturnType<HttpTestingController['expectOne']>) => void,
  ) {
    const fixture = TestBed.createComponent(ProductPage);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    respond(http.expectOne(`/api/offers/${id}/related`));
    await settle();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const text = (selector: string) =>
      [...element.querySelectorAll(selector)].map((e) =>
        (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
    return { element, text };
  }

  it('shows the product and the same type of product in all stores', async () => {
    const { element, text } = await open('m1', (r) => r.flush(related));

    expect(text('app-offer-card .name')[0]).toBe('Maslo, Mila, 250 g');
    // The product's own card does not link to itself.
    expect(element.querySelector('app-offer-card a.name-link')).toBeNull();
    expect(text('h1')[0]).toBe('Primerjava: Maslo');
    expect(text('.ranking .store')).toEqual(['Lidl', 'Mercator']);
    expect(text('.ranking .this')).toEqual(['Ta izdelek']);
    expect(element.querySelector('.adjust')?.getAttribute('href')).toBe(
      '/primerjava?q=maslo&exclude=arasidov',
    );
  });

  it('names a guessed type as it is', async () => {
    const { text } = await open('m1', (r) =>
      r.flush({ ...related, query: { text: 'ajvar', exclude: [] } }),
    );

    expect(text('h1')[0]).toBe('Primerjava: ajvar');
  });

  it('says so when no similar products can be found', async () => {
    const { text } = await open('m1', (r) =>
      r.flush({ ...related, query: null, comparison: null }),
    );

    expect(text('.hint')[0]).toBe('Za ta izdelek ni bilo mogoče najti podobnih izdelkov.');
  });

  it('says so when the offer is gone', async () => {
    const { text } = await open('gone', (r) =>
      r.flush({}, { status: 404, statusText: 'Not Found' }),
    );

    expect(text('.hint')[0]).toBe('Te ponudbe ni več (morda je potekla).');
  });
});
