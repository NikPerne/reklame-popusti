import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { makeOffer, makePage } from '../../../testing/offers';
import { translocoTesting } from '../../../testing/transloco-testing';
import { ScannerPage } from './scanner-page';

describe('ScannerPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScannerPage, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  async function render() {
    const fixture = TestBed.createComponent(ScannerPage);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  async function typeCode(
    fixture: { whenStable(): Promise<unknown> },
    element: HTMLElement,
    code: string,
  ) {
    element.querySelector<HTMLInputElement>('#manual-code')!.value = code;
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('offers manual entry when there is no camera', async () => {
    const { element } = await render();
    expect(element.querySelector('.hint')?.textContent).toContain('Kamera ni na voljo');
  });

  it('looks up a typed barcode in all stores', async () => {
    const { fixture, element } = await render();

    await typeCode(fixture, element, '3838975531314');
    const request = http.expectOne((r) => r.url === '/api/offers');
    expect(request.request.params.get('ean')).toBe('3838975531314');
    expect(request.request.params.get('upcoming')).toBe('true');
    request.flush(makePage([makeOffer({ id: 'a' }), makeOffer({ id: 'b', store: 'spar' })]));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(element.querySelectorAll('app-offer-card')).toHaveLength(2);
  });

  it('says so when the product is not on offer', async () => {
    const { fixture, element } = await render();

    await typeCode(fixture, element, '5411188141488');
    http.expectOne((r) => r.url === '/api/offers').flush(makePage([]));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(element.querySelector('.none')?.textContent).toContain('ta teden ni v akciji');
  });

  it('rejects codes with a wrong check digit without searching', async () => {
    const { fixture, element } = await render();

    await typeCode(fixture, element, '3838975531315');

    expect(element.querySelector('.invalid')).not.toBeNull();
    http.expectNone((r) => r.url === '/api/offers');
  });
});
