import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Offer } from '../../core/api/models';
import { OffersApi } from '../../core/api/offers-api';
import { LanguageService } from '../../core/i18n/language';
import { OfferCard } from '../search/offer-card';
import { isValidEan, startScanning, toEan13 } from './barcode';

type ScanState = 'starting' | 'scanning' | 'no-camera' | 'loading' | 'results' | 'error';

@Component({
  selector: 'app-scanner-page',
  imports: [TranslocoDirective, OfferCard],
  templateUrl: './scanner-page.html',
  styleUrl: './scanner-page.scss',
})
export class ScannerPage {
  private readonly api = inject(OffersApi);
  protected readonly lang = inject(LanguageService).current;
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly state = signal<ScanState>('starting');
  protected readonly code = signal('');
  protected readonly offers = signal<Offer[]>([]);
  protected readonly invalidCode = signal(false);
  private stop: (() => void) | undefined;

  constructor() {
    afterNextRender(() => void this.scan());
    inject(DestroyRef).onDestroy(() => this.stopCamera());
  }

  protected async scan(): Promise<void> {
    const video = this.video()?.nativeElement;
    this.offers.set([]);
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      this.state.set('no-camera');
      return;
    }
    this.state.set('starting');
    try {
      this.stop = await startScanning(video, (code) => {
        this.stopCamera();
        void this.lookUp(code);
      });
      this.state.set('scanning');
    } catch {
      // Permission denied, no camera, or not a secure context.
      this.state.set('no-camera');
    }
  }

  protected submitManual(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const code = input.value.replace(/\s/g, '');
    if (!isValidEan(code)) {
      this.invalidCode.set(true);
      return;
    }
    this.invalidCode.set(false);
    this.stopCamera();
    void this.lookUp(toEan13(code));
  }

  private async lookUp(code: string): Promise<void> {
    this.code.set(code);
    this.state.set('loading');
    try {
      const page = await firstValueFrom(
        this.api.searchOffers({ ean: code, upcoming: 'true', sort: 'price', pageSize: '24' }),
      );
      // The same product may be grouped into one result; show every store's offer.
      this.offers.set(page.items);
      this.state.set('results');
    } catch {
      this.state.set('error');
    }
  }

  private stopCamera(): void {
    this.stop?.();
    this.stop = undefined;
  }
}
