import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PriceHistory, PricePoint } from '../../core/api/models';
import { translocoTesting } from '../../../testing/transloco-testing';
import { CHART_WIDTH, PriceHistoryView, buildHistoryChart } from './price-history';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const point = (price: number, from: string, to: string, regularPrice?: number): PricePoint => ({
  price,
  ...(regularPrice !== undefined && { regularPrice }),
  from: `${from}T04:10:00.000Z`,
  to: `${to}T04:10:00.000Z`,
});

const points = [
  point(1.49, '2026-10-01', '2026-10-10'),
  point(0.99, '2026-10-11', '2026-10-17', 1.49),
  point(1.59, '2026-10-18', '2026-10-31'),
];

describe('buildHistoryChart', () => {
  it('spreads the points over time and puts higher prices higher', () => {
    const chart = buildHistoryChart(points)!;

    expect(chart.segments[0]!.x1).toBe(0);
    expect(chart.segments[2]!.x2).toBe(CHART_WIDTH);
    const [regular, sale, highest] = chart.segments.map((s) => s.y);
    expect(highest).toBeLessThan(regular!);
    expect(regular).toBeLessThan(sale!);
    expect(chart.segments.map((s) => s.sale)).toEqual([false, true, false]);
    expect(chart).toMatchObject({ lowest: 0.99, highest: 1.59 });
    expect(chart.steps.match(/M/g)).toHaveLength(2);
  });

  it('draws nothing for less than a day of data', () => {
    expect(buildHistoryChart([point(1.49, '2026-10-01', '2026-10-01')])).toBeUndefined();
    expect(buildHistoryChart([])).toBeUndefined();
  });
});

describe('PriceHistoryView', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PriceHistoryView, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  async function render(history: PriceHistory) {
    const fixture = TestBed.createComponent(PriceHistoryView);
    fixture.componentRef.setInput('offerId', 'spar:334863');
    fixture.componentRef.setInput('storeName', 'Spar');
    fixture.componentRef.setInput('lang', 'sl');
    await fixture.whenStable();
    http.expectOne('/api/offers/spar%3A334863/history').flush(history);
    await settle();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const text = (selector: string) =>
      [...element.querySelectorAll(selector)].map((e) =>
        (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
    return { element, text };
  }

  it('shows the chart and when it was last cheaper', async () => {
    const { element, text } = await render({
      points,
      summary: {
        trackedSince: points[0]!.from,
        lowest: 0.99,
        highest: 1.59,
        current: 1.59,
        lastLower: { price: 0.99, on: points[1]!.to },
      },
    });

    expect(text('h2')).toEqual(['Zgodovina cene (Spar)']);
    expect(element.querySelectorAll('svg line')).toHaveLength(3);
    expect(element.querySelectorAll('svg line.sale')).toHaveLength(1);
    expect(text('.facts li')).toEqual([
      'Nazadnje ceneje 17. 10.: 0,99 €',
      'Najnižja 0,99 € · najvišja 1,59 €',
    ]);
    expect(text('.hint')).toEqual(['Ceno spremljamo od 1. 10..']);
  });

  it('says when the current price is the lowest so far', async () => {
    const { text } = await render({
      points: points.slice(0, 2),
      summary: { trackedSince: points[0]!.from, lowest: 0.99, highest: 1.49, current: 0.99 },
    });

    expect(text('.facts .good')).toEqual(['Najnižja cena, odkar jo spremljamo.']);
  });

  it('says tracking has just started when there is no history', async () => {
    const { element, text } = await render({ points: [], summary: null });

    expect(element.querySelector('svg')).toBeNull();
    expect(text('.hint')).toEqual(['Zgodovino cene za ta izdelek šele začenjamo beležiti.']);
  });
});
