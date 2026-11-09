import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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

  // jsdom has no modal dialogs.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlyerLinks, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
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

    const covers = [...element.querySelectorAll<HTMLButtonElement>('.covers button.cover')];
    expect(covers.map((c) => c.querySelector('.title')?.textContent)).toEqual([
      'Lidlov katalog od 5. 11.',
      'Lidlov katalog od 12. 11.',
    ]);
    expect(covers[0]!.querySelector('.meta')?.textContent?.trim()).toBe('5. 11. – 11. 11.');
    expect(chip('Lidl').getAttribute('aria-expanded')).toBe('true');

    chip('Lidl').click();
    await fixture.whenStable();
    expect(element.querySelector('.covers')).toBeNull();
  });

  it('opens a flyer in a popup instead of leaving the app, PDFs too', async () => {
    const { fixture, element, chip } = await render(flyers);

    chip('Tuš').click();
    await fixture.whenStable();
    expect(element.querySelector('.covers a')).toBeNull();
    element.querySelector<HTMLButtonElement>('.covers button.cover')!.click();
    await fixture.whenStable();

    const dialog = element.querySelector('app-flyer-dialog');
    expect(dialog).not.toBeNull();
    http.expectOne('/api/flyers/tus-569');
  });

  it('links Hofer to its website, the one store that cannot be shown in the app', async () => {
    const { chip } = await render(flyers);

    expect(chip('Hofer').getAttribute('href')).toBe(
      'https://www.hofer.si/aktualni-letaki-in-brosure',
    );
    expect(chip('Hofer').getAttribute('target')).toBe('_blank');
  });

  it('falls back to the stores’ flyer pages when the app has no flyers', async () => {
    const { element } = await render('error');

    const chips = [...element.querySelectorAll<HTMLAnchorElement>('a.chip')];
    expect(chips).toHaveLength(6);
    expect(chips.every((a) => a.target === '_blank' && a.href.startsWith('https://'))).toBe(true);
  });
});
