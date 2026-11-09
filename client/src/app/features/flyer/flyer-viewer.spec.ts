import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Flyer } from '../../core/api/models';
import { translocoTesting } from '../../../testing/transloco-testing';
import { FlyerViewer, isEmbeddable } from './flyer-viewer';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const lidl: Flyer = {
  id: 'lidl-lidlov-katalog-2026-kw45',
  store: 'lidl',
  title: 'Lidlov katalog od 5. 11.',
  validFrom: '2026-11-04T23:00:00.000Z',
  validTo: '2026-11-11T22:59:59.000Z',
  sourceUrl: 'https://www.lidl.si/l/sl/katalog/lidlov-katalog-2026-kw45',
  viewer: 'pages',
  pages: [
    {
      image: 'https://imgproxy.leaflets.schwarz/p1.jpg',
      zoom: 'https://imgproxy.leaflets.schwarz/z1.jpg',
      width: 1416,
      height: 2400,
    },
    { image: 'https://imgproxy.leaflets.schwarz/p2.jpg' },
  ],
};

const spar: Flyer = {
  id: 'spar-katalog-4626',
  store: 'spar',
  title: 'Katalog 46/26',
  sourceUrl: 'https://www.spar.si/letak/katalog-4626',
  viewer: 'embed',
  url: 'https://letak.spar.si/katalog-4626/',
};

const tus: Flyer = {
  id: 'tus-571',
  store: 'tus',
  title: 'Akcijski katalog',
  sourceUrl: 'https://www.tus.si/katalogi/?uid=571',
  viewer: 'pdf',
  url: 'https://www.tus.si/app/uploads/catalogues/a45.pdf',
};

describe('isEmbeddable', () => {
  it('allows only the stores’ flyer viewers over https', () => {
    expect(isEmbeddable('https://letak.spar.si/katalog-4626/')).toBe(true);
    expect(isEmbeddable('https://katalogi.mercator.si/mercator/x/')).toBe(true);
    expect(isEmbeddable('http://letak.spar.si/katalog-4626/')).toBe(false);
    expect(isEmbeddable('https://evil.example/')).toBe(false);
    expect(isEmbeddable('javascript:alert(1)')).toBe(false);
    expect(isEmbeddable(undefined)).toBe(false);
  });
});

describe('FlyerViewer', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlyerViewer, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  async function open(
    id: string,
    respond: (r: ReturnType<HttpTestingController['expectOne']>) => void,
  ) {
    const fixture = TestBed.createComponent(FlyerViewer);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    respond(http.expectOne(`/api/flyers/${id}`));
    await settle();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows Lidl’s pages one under another, sharp enough to read', async () => {
    const element = await open(lidl.id, (r) => r.flush(lidl));

    expect(element.querySelector('h1')?.textContent).toBe('Lidlov katalog od 5. 11.');
    expect(element.querySelector('.dates')?.textContent?.trim()).toBe('5. 11. – 11. 11.');
    const images = [...element.querySelectorAll<HTMLImageElement>('.pages img')];
    expect(images.map((i) => i.getAttribute('src'))).toEqual([
      'https://imgproxy.leaflets.schwarz/z1.jpg',
      'https://imgproxy.leaflets.schwarz/p2.jpg',
    ]);
    expect(images[0]!.alt).toBe('Stran 1 od 2');
    expect(element.querySelector('iframe')).toBeNull();
    // Nothing leaves the app.
    expect(element.querySelector('a')).toBeNull();
  });

  it('frames the store’s own viewer', async () => {
    const element = await open(spar.id, (r) => r.flush(spar));

    expect(element.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://letak.spar.si/katalog-4626/',
    );
  });

  it('draws a PDF from the app’s own server', async () => {
    const element = await open(tus.id, (r) => r.flush(tus));

    expect(element.querySelector('app-pdf-viewer')).not.toBeNull();
    expect(element.querySelector('iframe')).toBeNull();
  });

  it('does not frame a viewer on another host', async () => {
    const element = await open(spar.id, (r) => r.flush({ ...spar, url: 'https://evil.example/' }));

    expect(element.querySelector('iframe')).toBeNull();
    expect(element.querySelector('.hint')?.textContent).toContain(
      'Tega letaka ni mogoče prikazati v aplikaciji.',
    );
  });

  it('says so when the flyer is gone', async () => {
    const element = await open('spar-old', (r) =>
      r.flush(null, { status: 404, statusText: 'Not Found' }),
    );

    expect(element.querySelector('.hint')?.textContent).toContain('Tega letaka ni več.');
  });
});
