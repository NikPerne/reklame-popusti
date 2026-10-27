import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ComparedOffer, ComparePreset, Comparison } from '../../core/api/models';
import { makeOffer } from '../../../testing/offers';
import { translocoTesting } from '../../../testing/transloco-testing';
import { ComparePage } from './compare-page';

const PRESETS: ComparePreset[] = [
  { id: 'butter', q: 'maslo', exclude: ['arasidov', 'kakav'] },
  { id: 'cream', q: 'sladka smetana', exclude: ['sprej'] },
];

const settle = () => new Promise((resolve) => setTimeout(resolve));

function compared(overrides: Partial<ComparedOffer>): ComparedOffer {
  return { ...makeOffer(), unitPrice: { amount: 9.56, unit: 'kg' }, ...overrides } as ComparedOffer;
}

const lidl = compared({
  id: 'l1',
  store: 'lidl',
  productName: 'Irsko maslo, 250 g',
  price: 1.55,
  unitPrice: { amount: 6.2, unit: 'kg' },
  condition: { kind: 'loyalty-card', text: 'Lidl Plus' },
});
const mercator = compared({
  id: 'm1',
  store: 'mercator',
  productName: 'Maslo, Mila, 250 g',
  price: 2.39,
  regular: true,
});
const comparison: Comparison = {
  unit: 'kg',
  stores: [
    { store: 'lidl', cheapest: lidl, count: 1 },
    { store: 'mercator', cheapest: mercator, count: 3 },
  ],
  items: [lidl, mercator],
  total: 2,
  notComparable: 1,
};

describe('ComparePage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ComparePage, translocoTesting()],
      providers: [
        provideRouter([{ path: 'primerjava', component: ComparePage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  async function open(url: string) {
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(ComparePage);
    await fixture.whenStable();
    http.expectOne('/api/compare/presets').flush(PRESETS);
    await settle();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const text = (selector: string) =>
      [...element.querySelectorAll(selector)].map((e) =>
        (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
    return { fixture, element, text };
  }

  async function answer(fixture: { whenStable(): Promise<unknown> }, body: Comparison) {
    http.expectOne((r) => r.url === '/api/compare').flush(body);
    await settle();
    await fixture.whenStable();
  }

  it('asks to pick a product when there is none in the URL', async () => {
    const { text } = await open('/primerjava');

    expect(text('.hint')[0]).toContain('Izberi izdelek');
    http.expectNone((r) => r.url === '/api/compare');
  });

  it('ranks the stores by price per unit, with how much more the others cost', async () => {
    const { fixture, text } = await open('/primerjava?q=maslo&exclude=arasidov');
    const request = http.expectOne((r) => r.url === '/api/compare');
    expect(request.request.params.get('q')).toBe('maslo');
    expect(request.request.params.get('exclude')).toBe('arasidov');
    request.flush(comparison);
    await settle();
    await fixture.whenStable();

    expect(text('h2')[0]).toBe('Najceneje na kg');
    expect(text('.ranking .store')).toEqual(['Lidl', 'Mercator']);
    expect(text('.ranking .unit-price')).toEqual(['6,20 €/kg', '9,56 €/kg']);
    expect(text('.ranking .more')).toEqual(['+54 %']);
    expect(text('.ranking .condition')[0]).toBe('Lidl Plus');
    expect(text('.ranking .everyday')[0]).toBe('Redna cena');
    expect(text('.note').join(' ')).toContain('Brez primerljive cene na enoto (niso vključeni): 1');
  });

  it('shows the quick picks and sends the chosen one with its exclusions', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const { element, text } = await open('/primerjava');

    expect(text('.chip')).toEqual(['Maslo', 'Sladka smetana']);
    element.querySelector<HTMLButtonElement>('.chip')!.click();

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { q: 'maslo', exclude: 'arasidov,kakav', skip: null },
    });
  });

  it('highlights the quick pick that is open', async () => {
    const { fixture, element } = await open('/primerjava?q=maslo&exclude=arasidov,kakav');
    await answer(fixture, comparison);

    expect(element.querySelector('.chip.active')?.textContent?.trim()).toBe('Maslo');
  });

  it('links each product to its page', async () => {
    const { fixture, element } = await open('/primerjava?q=maslo');
    await answer(fixture, comparison);

    expect(element.querySelector('.ranking a.name')?.getAttribute('href')).toBe('/izdelek/l1');
  });

  it('removes a wrong match through the URL', async () => {
    const { fixture, element } = await open('/primerjava?q=maslo');
    await answer(fixture, comparison);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    element.querySelector<HTMLButtonElement>('.all .remove')!.click();

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { q: 'maslo', exclude: null, skip: 'l1' },
    });
  });

  it('adds the cheapest product of a store to the shopping list', async () => {
    const { fixture, element } = await open('/primerjava?q=maslo');
    await answer(fixture, comparison);

    element.querySelector<HTMLButtonElement>('.ranking .add')!.click();
    await fixture.whenStable();

    expect(element.querySelector('.ranking .add')?.textContent?.trim()).toBe('✓');
  });

  it('says so when nothing matches', async () => {
    const { fixture, text } = await open('/primerjava?q=xyz');
    await answer(fixture, { stores: [], items: [], total: 0, notComparable: 0 });

    expect(text('.none')[0]).toBe('Za »xyz« ni izdelkov s ceno na enoto.');
  });
});
