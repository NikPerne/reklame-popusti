import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { PriceHistory, PricePoint } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import type { Language } from '../../core/i18n/language';
import { EurPipe, ShortDatePipe } from '../../shared/format';

/** Size of the chart's coordinate system; the SVG stretches to the available width. */
export const CHART_WIDTH = 300;
export const CHART_HEIGHT = 100;
const DAY_MS = 86_400_000;
/** A one-day price would be a dot; give it some width so it can be seen. */
const MIN_SEGMENT = 3;

export interface ChartSegment {
  x1: number;
  x2: number;
  y: number;
  sale: boolean;
}

export interface HistoryChart {
  segments: ChartSegment[];
  /** Thin lines joining one price to the next. */
  steps: string;
  lowest: number;
  highest: number;
  from: string;
  to: string;
}

/**
 * Lays the points out as a step chart: a horizontal line per price over the days it held,
 * on a price axis from the lowest to the highest price. Undefined for less than a day of data.
 */
export function buildHistoryChart(points: readonly PricePoint[]): HistoryChart | undefined {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return undefined;
  const start = Date.parse(first.from);
  const end = Date.parse(last.to);
  if (end - start < DAY_MS) return undefined;

  const prices = points.map((p) => p.price);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  // A flat line sits in the middle rather than on an edge.
  const range = highest - lowest || 1;
  const pad = 8;
  const x = (iso: string) => ((Date.parse(iso) - start) / (end - start)) * CHART_WIDTH;
  const y = (price: number) =>
    highest === lowest
      ? CHART_HEIGHT / 2
      : pad + ((highest - price) / range) * (CHART_HEIGHT - 2 * pad);

  const segments = points.map((p) => {
    const x1 = Math.min(x(p.from), CHART_WIDTH - MIN_SEGMENT);
    return {
      x1,
      x2: Math.max(x(p.to), x1 + MIN_SEGMENT),
      y: y(p.price),
      sale: p.regularPrice !== undefined,
    };
  });
  const steps = segments
    .slice(1)
    .map((s, i) => {
      const previous = segments[i]!;
      return `M${previous.x2} ${previous.y}H${s.x1}V${s.y}`;
    })
    .join('');

  return { segments, steps, lowest, highest, from: first.from, to: last.to };
}

type Status = 'loading' | 'ok' | 'error';

/** The product page's price history: a chart of the store's price and what it means. */
@Component({
  selector: 'app-price-history',
  imports: [TranslocoDirective, EurPipe, ShortDatePipe],
  templateUrl: './price-history.html',
  styleUrl: './price-history.scss',
})
export class PriceHistoryView {
  private readonly api = inject(OffersApi);

  readonly offerId = input.required<string>();
  readonly storeName = input.required<string>();
  readonly lang = input.required<Language>();

  protected readonly status = signal<Status>('loading');
  protected readonly history = signal<PriceHistory | null>(null);
  protected readonly chart = computed(() => buildHistoryChart(this.history()?.points ?? []));
  protected readonly width = CHART_WIDTH;
  protected readonly height = CHART_HEIGHT;
  private request = 0;

  constructor() {
    effect(() => {
      const id = this.offerId();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    const request = ++this.request;
    this.status.set('loading');
    try {
      const history = await firstValueFrom(this.api.history(id));
      if (request !== this.request) return;
      this.history.set(history);
      this.status.set('ok');
    } catch {
      if (request === this.request) this.status.set('error');
    }
  }
}
