import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { Flyer } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import { LanguageService } from '../../core/i18n/language';
import { ShortDatePipe } from '../../shared/format';
import { STORE_NAMES } from '../search/offer-card';
import { PdfViewer } from './pdf-viewer';

/**
 * Store flyer viewers that may be framed. The server only stores these, and the app's CSP
 * (frame-src) allows only them; checked here too before Angular is told the URL is safe.
 */
export const EMBED_HOSTS = ['letak.spar.si', 'katalogi.mercator.si', 'www.eurospin.si'];

export function isEmbeddable(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && EMBED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

type Status = 'loading' | 'ok' | 'not-found' | 'error';

/**
 * One flyer, shown in the app: Lidl's page images one under another, the store's own viewer
 * (Spar, Mercator, Eurospin) in a frame, or a PDF drawn with pdf.js (Tuš). Used by the popup
 * on the start page and by /letak/:id.
 */
@Component({
  selector: 'app-flyer-viewer',
  imports: [TranslocoDirective, ShortDatePipe, PdfViewer],
  templateUrl: './flyer-viewer.html',
  styleUrl: './flyer-viewer.scss',
})
export class FlyerViewer {
  private readonly api = inject(OffersApi);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly lang = inject(LanguageService).current;
  protected readonly storeNames = STORE_NAMES;

  readonly id = input.required<string>();

  protected readonly status = signal<Status>('loading');
  protected readonly flyer = signal<Flyer | null>(null);
  protected readonly frameUrl = computed<SafeResourceUrl | null>(() => {
    const flyer = this.flyer();
    return flyer?.viewer === 'embed' && isEmbeddable(flyer.url)
      ? this.sanitizer.bypassSecurityTrustResourceUrl(flyer.url)
      : null;
  });
  /** Tuš's PDFs come through the app's server (tus.si allows no framing or cross-origin reads). */
  protected readonly pdfUrl = computed(() => {
    const flyer = this.flyer();
    return flyer?.viewer === 'pdf' ? `/api/flyers/${encodeURIComponent(flyer.id)}/pdf` : null;
  });
  private request = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    const request = ++this.request;
    this.status.set('loading');
    try {
      const flyer = await firstValueFrom(this.api.flyer(id));
      if (request !== this.request) return;
      this.flyer.set(flyer);
      this.status.set('ok');
    } catch (error) {
      if (request !== this.request) return;
      this.status.set((error as { status?: number }).status === 404 ? 'not-found' : 'error');
    }
  }
}
