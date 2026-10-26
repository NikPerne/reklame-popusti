import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SettingsService, type Settings } from './settings-service';

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('SettingsService', () => {
  let http: HttpTestingController;
  let settings: SettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    settings = TestBed.inject(SettingsService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('applies a change at once and saves it on the server', async () => {
    settings.save({ preferredStores: ['lidl'] });

    expect(settings.preferredStores()).toEqual(['lidl']);
    await settle();
    const put = http.expectOne('/api/settings');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toMatchObject({ preferredStores: ['lidl'], hiddenCategories: [] });
    put.flush(put.request.body as Settings);
  });

  it('keeps the change locally when offline', async () => {
    settings.save({ hiddenCategories: ['oblacila'] });
    await settle();
    http.expectOne('/api/settings').error(new ProgressEvent('offline'));
    await settle();

    expect(settings.hiddenCategories()).toEqual(['oblacila']);
    expect(JSON.parse(localStorage.getItem('reklame-popusti.settings') ?? '{}')).toMatchObject({
      dirty: true,
    });
  });

  it('takes the server copy when there is nothing to send', async () => {
    const sync = settings.sync();
    await settle();
    http.expectOne('/api/settings').flush({
      preferredStores: ['spar'],
      hiddenCategories: [],
      updatedAt: '2026-10-26T10:00:00.000Z',
    });
    await sync;

    expect(settings.preferredStores()).toEqual(['spar']);
  });
});
