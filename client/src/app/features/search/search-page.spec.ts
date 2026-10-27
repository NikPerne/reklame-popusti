import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { makeOffer, makePage } from '../../../testing/offers';
import { translocoTesting } from '../../../testing/transloco-testing';
import { SearchPage } from './search-page';

const isSectionRequest = (r: { url: string; params: { has(name: string): boolean } }) =>
  r.url === '/api/offers' && (r.params.has('startedWithinDays') || r.params.has('endsWithinDays'));

describe('SearchPage', () => {
  let http: HttpTestingController;
  let queryParams: BehaviorSubject<Record<string, string>>;

  beforeEach(async () => {
    queryParams = new BehaviorSubject<Record<string, string>>({});
    await TestBed.configureTestingModule({
      imports: [SearchPage, translocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: new BehaviorSubject(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    const route = TestBed.inject(ActivatedRoute) as unknown as {
      queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
    };
    queryParams.subscribe((p) => route.queryParamMap.next(convertToParamMap(p)));
    http = TestBed.inject(HttpTestingController);
  });

  async function create() {
    const fixture = TestBed.createComponent(SearchPage);
    await fixture.whenStable();
    http.match('/api/stores').forEach((r) => r.flush([]));
    http.match('/api/categories').forEach((r) => r.flush([]));
    // The start page's "new this week" / "ending soon" rows.
    http.match(isSectionRequest).forEach((r) => r.flush(makePage([])));
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element };
  }

  function expectOffers(params: Record<string, string>) {
    return http.expectOne(
      (r) =>
        r.url === '/api/offers' &&
        !isSectionRequest(r) &&
        Object.entries(params).every(([k, v]) => r.params.get(k) === v),
    );
  }

  it('loads the biggest discounts when there is no search', async () => {
    const { fixture, element } = await create();

    expectOffers({ page: '1', pageSize: '24' }).flush(makePage([makeOffer()], 1));
    await fixture.whenStable();

    expect(element.querySelectorAll('app-offer-card')).toHaveLength(1);
    expect(element.querySelector('h2')?.textContent).toContain('Največji popusti');
  });

  it('searches with the filters from the URL', async () => {
    queryParams.next({ q: 'kava', store: 'mercator', minDiscount: '30', sort: 'unitPrice' });
    const { fixture, element } = await create();

    expectOffers({ q: 'kava', store: 'mercator', minDiscount: '30', sort: 'unitPrice' }).flush(
      makePage([], 0),
    );
    await fixture.whenStable();

    expect(element.textContent).toContain('Ni ponudb, ki bi ustrezale iskanju.');
  });

  it('appends the next page on "Show more"', async () => {
    const { fixture, element } = await create();
    expectOffers({ page: '1' }).flush(makePage([makeOffer({ id: 'a' })], 30));
    await fixture.whenStable();

    element.querySelector<HTMLButtonElement>('.more button')!.click();
    expectOffers({ page: '2' }).flush(makePage([makeOffer({ id: 'b' })], 30, 2));
    await fixture.whenStable();

    expect(element.querySelectorAll('app-offer-card')).toHaveLength(2);
  });

  it('shows a retry button when loading fails', async () => {
    const { fixture, element } = await create();

    expectOffers({ page: '1' }).flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(element.textContent).toContain('Ponudb ni bilo mogoče naložiti.');

    element.querySelector<HTMLButtonElement>('.message button')!.click();
    expectOffers({ page: '1' }).flush(makePage([makeOffer()]));
    await fixture.whenStable();
    expect(element.querySelectorAll('app-offer-card')).toHaveLength(1);
  });

  it('shows the start page rows only without a search', async () => {
    const { fixture, element } = await create();
    expectOffers({ page: '1' }).flush(makePage([]));
    await fixture.whenStable();
    expect(element.querySelector('app-home-sections')).not.toBeNull();

    queryParams.next({ q: 'kava' });
    await fixture.whenStable();
    expectOffers({ q: 'kava' }).flush(makePage([]));
    await fixture.whenStable();
    expect(element.querySelector('app-home-sections')).toBeNull();
  });

  it('warns about stores without fresh data', async () => {
    const fixture = TestBed.createComponent(SearchPage);
    await fixture.whenStable();
    const status = (hoursAgo: number) => ({
      lastRunAt: new Date().toISOString(),
      ok: hoursAgo < 30,
      offerCount: 10,
      durationMs: 1,
      lastSuccessAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    });
    http.expectOne('/api/stores').flush([
      { id: 'mercator', name: 'Mercator', website: '', status: status(2) },
      { id: 'lidl', name: 'Lidl', website: '', status: status(40) },
      { id: 'dm', name: 'dm', website: '', status: null },
    ]);
    http.match('/api/categories').forEach((r) => r.flush([]));
    http.match(isSectionRequest).forEach((r) => r.flush(makePage([])));
    expectOffers({ page: '1' }).flush(makePage([]));
    await fixture.whenStable();

    const warnings = (fixture.nativeElement as HTMLElement).querySelectorAll('.stale-warning li');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.textContent).toContain('Lidl: ni novih podatkov od');
  });

  it('writes filter changes to the URL', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const { fixture } = await create();
    expectOffers({ page: '1' }).flush(makePage([]));

    (fixture.componentInstance as unknown as { update(c: object): void }).update({
      minDiscount: 40,
    });

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: {
        q: null,
        store: null,
        category: null,
        minDiscount: 40,
        sort: null,
        upcoming: null,
        deals: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
  });
});
