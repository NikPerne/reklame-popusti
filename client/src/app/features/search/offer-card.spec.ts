import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { Offer } from '../../core/api/models';
import type { Language } from '../../core/i18n/language';
import { makeOffer } from '../../../testing/offers';
import { translocoTesting } from '../../../testing/transloco-testing';
import { OfferCard } from './offer-card';

describe('OfferCard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OfferCard, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  async function render(offer: Offer, lang: Language = 'sl') {
    const fixture = TestBed.createComponent(OfferCard);
    fixture.componentRef.setInput('offer', offer);
    fixture.componentRef.setInput('lang', lang);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const text = (selector: string) =>
      element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    return { element, text };
  }

  it('shows prices, discount, unit price, condition and validity in Slovenian', async () => {
    const { text } = await render(makeOffer());

    expect(text('.name')).toBe('Mleta kava Classic, Barcaffe, 200 g');
    expect(text('.store')).toBe('Mercator');
    expect(text('.price')).toBe('3,59 €');
    expect(text('.regular')).toBe('Prej 4,79 €');
    expect(text('.discount')).toBe('−25 %');
    expect(text('.unit-price')).toBe('17,95 €/kg');
    expect(text('.condition')).toBe('Ob nakupu 2 ali več');
    expect(text('.validity')).toBe('do 5. 11.');
  });

  it('formats for English', async () => {
    TestBed.inject(TranslocoService).setActiveLang('en');
    const { text } = await render(makeOffer({ unitPrice: { amount: 0.89, unit: 'piece' } }), 'en');

    expect(text('.price')).toBe('€3.59');
    expect(text('.unit-price')).toBe('€0.89/piece');
  });

  it('shows the start date for offers that have not started yet', async () => {
    const { text } = await render(makeOffer({ validFrom: '2099-01-10T00:00:00Z' }));

    expect(text('.validity')).toBe('od 10. 1.');
  });

  it('marks an everyday price from the online shop, without a sale colour or discount', async () => {
    const everyday = makeOffer({ price: 1.19, regular: true });
    delete everyday.regularPrice;
    delete everyday.discountPercent;
    delete everyday.condition;

    const { element, text } = await render(everyday);

    expect(text('.everyday')).toBe('Redna cena');
    expect(element.querySelector('.card')?.classList).toContain('everyday-price');
    expect(element.querySelector('.discount')).toBeNull();
  });

  it('does not mark discounts as everyday prices', async () => {
    const { element } = await render(makeOffer());

    expect(element.querySelector('.everyday')).toBeNull();
  });

  it('leaves out what the store does not provide', async () => {
    const minimal = makeOffer();
    delete minimal.regularPrice;
    delete minimal.discountPercent;
    delete minimal.unitPrice;
    delete minimal.condition;
    delete minimal.validFrom;
    delete minimal.validTo;
    delete minimal.imageUrl;
    delete minimal.sourceUrl;

    const { element } = await render(minimal);

    for (const selector of [
      '.regular',
      '.discount',
      '.unit-price',
      '.condition',
      '.validity',
      'img',
      'a',
    ]) {
      expect(element.querySelector(selector), selector).toBeNull();
    }
  });

  it('opens the store page in a new tab without leaking the opener', async () => {
    const { element } = await render(makeOffer());
    const link = element.querySelector('a')!;

    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });
});

describe('OfferCard alternatives', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OfferCard, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('lists the same product at other stores, cheapest first', async () => {
    const fixture = TestBed.createComponent(OfferCard);
    fixture.componentRef.setInput(
      'offer',
      makeOffer({
        alsoAt: [
          { id: 'b', store: 'tus', productName: 'Kava', price: 2.09 },
          { id: 'a', store: 'spar', productName: 'Kava', price: 1.99 },
          { id: 'c', store: 'mercator', productName: 'Kava', price: 2.29 },
        ],
      }),
    );
    fixture.componentRef.setInput('lang', 'sl');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('.also-at summary')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('Tudi: Spar 1,99 € · Tuš 2,09 € +1');
    expect(element.querySelectorAll('.also-at li')).toHaveLength(3);
  });

  it('shows nothing when the product is only at one store', async () => {
    const fixture = TestBed.createComponent(OfferCard);
    fixture.componentRef.setInput('offer', makeOffer());
    fixture.componentRef.setInput('lang', 'sl');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.also-at')).toBeNull();
  });
});

describe('OfferCard shopping list button', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OfferCard, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('adds the offer to the list and shows it is there', async () => {
    const fixture = TestBed.createComponent(OfferCard);
    fixture.componentRef.setInput('offer', makeOffer({ id: 'o1' }));
    fixture.componentRef.setInput('lang', 'sl');
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.add')!;
    expect(button.getAttribute('aria-label')).toBe('Dodaj na seznam');

    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent?.trim()).toBe('✓');
    localStorage.clear();
  });
});
