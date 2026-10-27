import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom, map } from 'rxjs';
import type { ComparedOffer, ComparePreset, Comparison } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import { LanguageService } from '../../core/i18n/language';
import { SettingsService } from '../../core/settings/settings-service';
import { ComparisonView } from './comparison-view';

/** The comparison, kept in the URL: `?q=maslo&exclude=arasidov&skip=<offer ids>`. */
interface CompareState {
  q: string;
  exclude: string[];
  skip: string[];
}

const MIN_QUERY_LENGTH = 2;

function list(map: ParamMap, key: string): string[] {
  return (map.get(key) ?? '').split(',').filter(Boolean);
}

function parseState(map: ParamMap): CompareState {
  return { q: (map.get('q') ?? '').trim(), exclude: list(map, 'exclude'), skip: list(map, 'skip') };
}

type Status = 'idle' | 'loading' | 'ok' | 'error';

/**
 * Price comparison by product type (/primerjava): each store's cheapest butter, cream, ... per
 * kg, l or piece, whatever the brand. Tap a preset or type a product; remove wrong matches with ×.
 */
@Component({
  selector: 'app-compare-page',
  imports: [TranslocoDirective, ComparisonView],
  templateUrl: './compare-page.html',
  styleUrl: './compare-page.scss',
})
export class ComparePage {
  private readonly api = inject(OffersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);
  protected readonly lang = inject(LanguageService).current;
  /** The quick picks, defined on the server (the product page uses them too). */
  protected readonly presets = toSignal(this.api.comparePresets(), {
    initialValue: [] as ComparePreset[],
  });

  protected readonly state = toSignal(this.route.queryParamMap.pipe(map(parseState)), {
    initialValue: parseState(this.route.snapshot.queryParamMap),
  });
  protected readonly activePreset = computed(() => {
    const { q, exclude } = this.state();
    return this.presets().find(
      (p) =>
        p.q === q &&
        p.exclude.length === exclude.length &&
        p.exclude.every((e) => exclude.includes(e)),
    );
  });
  /** Comparing only the preferred stores, when the user has chosen some. */
  protected readonly preferredStores = this.settings.preferredStores;

  protected readonly status = signal<Status>('idle');
  protected readonly result = signal<Comparison | null>(null);
  private request = 0;

  constructor() {
    effect(() => {
      const state = this.state();
      const stores = this.preferredStores();
      untracked(() => void this.load(state, stores));
    });
  }

  private async load(state: CompareState, stores: readonly string[]): Promise<void> {
    const id = ++this.request;
    if (state.q.length < MIN_QUERY_LENGTH) {
      this.status.set('idle');
      this.result.set(null);
      return;
    }
    this.status.set('loading');
    const params: Record<string, string> = { q: state.q };
    if (state.exclude.length) params['exclude'] = state.exclude.join(',');
    if (state.skip.length) params['skip'] = state.skip.join(',');
    if (stores.length) params['store'] = stores.join(',');
    try {
      const result = await firstValueFrom(this.api.compare(params));
      if (id !== this.request) return;
      this.result.set(result);
      this.status.set('ok');
    } catch {
      if (id === this.request) this.status.set('error');
    }
  }

  private navigate(state: CompareState): void {
    void this.router.navigate([], {
      queryParams: {
        q: state.q || null,
        exclude: state.exclude.join(',') || null,
        skip: state.skip.join(',') || null,
      },
    });
  }

  protected submit(event: Event, field: HTMLInputElement): void {
    event.preventDefault();
    // A typed search starts afresh: no preset exclusions, nothing removed.
    this.navigate({ q: field.value.trim(), exclude: [], skip: [] });
  }

  protected choose(preset: ComparePreset): void {
    this.navigate({ q: preset.q, exclude: preset.exclude, skip: [] });
  }

  /** Removes a wrong match (e.g. a flavoured product) from the comparison. */
  protected remove(offer: ComparedOffer): void {
    const state = this.state();
    this.navigate({ ...state, skip: [...state.skip, offer.id] });
  }

  protected restore(): void {
    this.navigate({ ...this.state(), skip: [] });
  }
}
