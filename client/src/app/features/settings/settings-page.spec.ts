import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { StoreInfo } from '../../core/api/models';
import { translocoTesting } from '../../../testing/transloco-testing';
import { SettingsPage } from './settings-page';

const settle = () => new Promise((resolve) => setTimeout(resolve));
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const store = (id: StoreInfo['id'], name: string, status: StoreInfo['status']): StoreInfo => ({
  id,
  name,
  website: `https://${id}.si`,
  status,
});

describe('SettingsPage refresh health', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsPage, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  async function render(respond: (r: ReturnType<HttpTestingController['expectOne']>) => void) {
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    respond(http.expectOne('/api/stores'));
    await settle();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const rows = [...element.querySelectorAll('.health li')].map((li) => ({
      problem: li.classList.contains('problem'),
      text: (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }));
    return { element, rows };
  }

  it('lists each store with its last refresh and shows failures', async () => {
    const { rows } = await render((r) =>
      r.flush([
        store('mercator', 'Mercator', {
          lastRunAt: hoursAgo(2),
          lastSuccessAt: hoursAgo(2),
          ok: true,
          offerCount: 16772,
          durationMs: 1,
        }),
        store('hofer', 'Hofer', {
          lastRunAt: hoursAgo(2),
          lastSuccessAt: hoursAgo(26),
          ok: false,
          offerCount: 0,
          durationMs: 1,
          error: 'fetch failed: redirect count exceeded',
        }),
        store('tus', 'Tuš', null),
        store('dm', 'dm', null),
      ]),
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ problem: false });
    expect(rows[0]!.text).toContain('16772 izdelkov');
    expect(rows[1]).toMatchObject({ problem: true });
    expect(rows[1]!.text).toContain('ni uspela');
    expect(rows[1]!.text).toContain('redirect count exceeded');
    expect(rows[1]!.text).toContain('Zadnja uspešna osvežitev');
    expect(rows[2]).toMatchObject({ problem: true });
    expect(rows[2]!.text).toContain('Še ni bilo uspešne osvežitve.');
  });

  it('flags a store whose last success is more than a day old', async () => {
    const { rows } = await render((r) =>
      r.flush([
        store('spar', 'Spar', {
          lastRunAt: hoursAgo(40),
          lastSuccessAt: hoursAgo(40),
          ok: true,
          offerCount: 16045,
          durationMs: 1,
        }),
      ]),
    );

    expect(rows[0]).toMatchObject({ problem: true });
    expect(rows[0]!.text).toContain('Podatki so starejši od enega dne.');
  });

  it('says so when the status cannot be loaded', async () => {
    const { element } = await render((r) =>
      r.flush(null, { status: 503, statusText: 'Unavailable' }),
    );

    expect(element.querySelector('.refresh [role="alert"]')?.textContent).toContain(
      'Stanja ni bilo mogoče naložiti.',
    );
  });
});
