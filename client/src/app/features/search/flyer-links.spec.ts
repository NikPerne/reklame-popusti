import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FlyerSummary } from '../../core/api/models';
import { translocoTesting } from '../../../testing/transloco-testing';
import { FlyerLinks } from './flyer-links';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const flyers: FlyerSummary[] = [
  {
    id: 'lidl-lidlov-katalog-2026-kw45',
    store: 'lidl',
    title: 'Lidlov katalog od 5. 11.',
    validFrom: '2026-11-04T23:00:00.000Z',
    validTo: '2026-11-11T22:59:59.000Z',
    coverUrl: 'https://imgproxy.leaflets.schwarz/cover.jpg',
    sourceUrl: 'https://www.lidl.si/l/sl/katalog/lidlov-katalog-2026-kw45',
    viewer: 'pages',
    pageCount: 70,
  },
  {
    id: 'lidl-lidlov-katalog-2026-kw46',
    store: 'lidl',
    title: 'Lidlov katalog od 12. 11.',
    sourceUrl: 'https://www.lidl.si/l/sl/katalog/lidlov-katalog-2026-kw46',
    viewer: 'pages',
  },
  {
    id: 'hofer-letaki',
    store: 'hofer',
    title: 'Letaki in brošure',
    sourceUrl: 'https://www.hofer.si/aktualni-letaki-in-brosure',
    viewer: 'link',
    url: 'https://www.hofer.si/aktualni-letaki-in-brosure',
  },
  {
    id: 'tus-569',
    store: 'tus',
    title: 'Akcijski katalog',
    validTo: '2026-11-10T22:59:59.000Z',
    sourceUrl: 'https://www.tus.si/katalogi/?uid=569',
    viewer: 'pdf',
    url: 'https://www.tus.si/app/uploads/catalogues/a44.pdf',
  },
  {
    id: 'tus-571',
    store: 'tus',
    title: 'Akcijski katalog',
    sourceUrl: 'https://www.tus.si/katalogi/?uid=571',
    viewer: 'pdf',
    url: 'https://www.tus.si/app/uploads/catalogues/a45.pdf',
  },
];

describe('FlyerLinks', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlyerLinks, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  async function render(response: FlyerSummary[] | 'error') {
    const fixture = TestBed.createComponent(FlyerLinks);
    fixture.componentRef.setInput('lang', 'sl');
    await fixture.whenStable();
    const request = http.expectOne('/api/flyers');
    if (response === 'error') request.flush(null, { status: 500, statusText: 'Error' });
    else request.flush(response);
    await settle();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const chip = (name: string) =>
      [...element.querySelectorAll<HTMLElement>('.chip')].find((c) =>
        c.textContent?.includes(name),
      )!;
    return { fixture, element, chip };
  }

  it('shows a chip per store and the covers of the one tapped', async () => {
    const { fixture, element, chip } = await render(flyers);

    expect([...element.querySelectorAll('.chip')].map((c) => c.textContent?.trim())).toEqual([
      'Mercator ↗',
      'Lidl 2',
      'Hofer ↗',
      'Spar ↗',
      'Tuš 2',
      'Eurospin ↗',
    ]);
    expect(element.querySelector('.covers')).toBeNull();

    chip('Lidl').click();
    await fixture.whenStable();

    const covers = [...element.querySelectorAll<HTMLAnchorElement>('.covers a')];
    expect(covers.map((a) => a.getAttribute('href'))).toEqual([
      '/letak/lidl-lidlov-katalog-2026-kw45',
      '/letak/lidl-lidlov-katalog-2026-kw46',
    ]);
    expect(covers[0]!.querySelector('.meta')?.textContent?.trim()).toBe('5. 11. – 11. 11.');
    expect(chip('Lidl').getAttribute('aria-expanded')).toBe('true');

    chip('Lidl').click();
    await fixture.whenStable();
    expect(element.querySelector('.covers')).toBeNull();
  });

  it('opens PDFs in a new tab and links a store with one outside flyer directly', async () => {
    const { fixture, element, chip } = await render(flyers);

    expect(chip('Hofer').getAttribute('href')).toBe(
      'https://www.hofer.si/aktualni-letaki-in-brosure',
    );

    chip('Tuš').click();
    await fixture.whenStable();
    const pdf = element.querySelector<HTMLAnchorElement>('.covers a')!;
    expect(pdf.getAttribute('href')).toBe('https://www.tus.si/app/uploads/catalogues/a44.pdf');
    expect(pdf.target).toBe('_blank');
    expect(pdf.querySelector('.meta')?.textContent).toContain('do 10. 11.');
    expect(pdf.querySelector('.meta')?.textContent).toContain('PDF');
  });

  it('falls back to the stores’ flyer pages when the app has no flyers', async () => {
    const { element } = await render('error');

    const chips = [...element.querySelectorAll<HTMLAnchorElement>('a.chip')];
    expect(chips).toHaveLength(6);
    expect(chips.every((a) => a.target === '_blank' && a.href.startsWith('https://'))).toBe(true);
  });
});
