import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

/** pdf.js's worker and data files, copied from pdfjs-dist by angular.json. */
const PDFJS_ASSETS = '/pdfjs/';
/** Bytes per range request: a flyer page is often 0.5–1 MB. */
const RANGE_CHUNK = 1 << 20;
/** Sharp enough on phones without drawing huge canvases. */
const MAX_PIXEL_RATIO = 2;

type Status = 'loading' | 'ok' | 'error';

/**
 * Draws a PDF's pages with pdf.js, each one when it scrolls into view. The PDF is read in
 * ranges, so only the pages looked at are downloaded (Tuš's flyers are about 45 MB).
 */
@Component({
  selector: 'app-pdf-viewer',
  imports: [TranslocoDirective],
  template: `
    <div *transloco="let t; prefix: 'flyers'">
      @switch (status()) {
        @case ('loading') {
          <p class="hint" role="status">{{ t('loading') }}</p>
        }
        @case ('error') {
          <p class="hint" role="alert">{{ t('error') }}</p>
        }
      }
      <ol class="pages">
        @for (page of pages(); track page.n) {
          <li [style.aspect-ratio]="page.ratio">
            <canvas
              #canvas
              [attr.data-page]="page.n"
              role="img"
              [attr.aria-label]="t('page', { n: page.n, count: pages().length })"
            ></canvas>
          </li>
        }
      </ol>
    </div>
  `,
  styles: `
    .pages {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      overflow: hidden;
      border-radius: var(--radius);
      background: var(--surface-muted);
      box-shadow: var(--shadow);
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .hint {
      margin: 0;
      color: var(--muted);
    }
  `,
})
export class PdfViewer {
  readonly src = input.required<string>();

  protected readonly status = signal<Status>('loading');
  /** One entry per page; every page gets the first page's shape until it is drawn. */
  protected readonly pages = signal<{ n: number; ratio: string }[]>([]);
  private readonly canvases = viewChildren<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private task: PDFDocumentLoadingTask | undefined;
  private document: PDFDocumentProxy | undefined;
  private observer: IntersectionObserver | undefined;
  private readonly drawn = new Set<number>();
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.open());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.observer?.disconnect();
      void this.task?.destroy();
    });
  }

  private async open(): Promise<void> {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_ASSETS}build/pdf.worker.min.mjs`;
      this.task = pdfjs.getDocument({
        url: this.src(),
        rangeChunkSize: RANGE_CHUNK,
        disableAutoFetch: true,
        disableStream: true,
        wasmUrl: `${PDFJS_ASSETS}wasm/`,
        cMapUrl: `${PDFJS_ASSETS}cmaps/`,
        standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
      });
      const document = await this.task.promise;
      if (this.destroyed) return;
      this.document = document;
      const first = (await document.getPage(1)).getViewport({ scale: 1 });
      const ratio = `${first.width} / ${first.height}`;
      this.pages.set(Array.from({ length: document.numPages }, (_, i) => ({ n: i + 1, ratio })));
      this.status.set('ok');
      // Wait for the canvases to be rendered, then draw each one as it comes into view.
      setTimeout(() => this.watch());
    } catch {
      if (!this.destroyed) this.status.set('error');
    }
  }

  private watch(): void {
    if (this.destroyed) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) void this.draw(entry.target as HTMLCanvasElement);
        }
      },
      // Start a page a screen before it arrives; the popup scrolls, not the window.
      { root: this.host.nativeElement.closest('dialog'), rootMargin: '100% 0px' },
    );
    for (const canvas of this.canvases()) this.observer.observe(canvas.nativeElement);
  }

  private async draw(canvas: HTMLCanvasElement): Promise<void> {
    const n = Number(canvas.dataset['page']);
    if (!this.document || this.drawn.has(n)) return;
    this.drawn.add(n);
    try {
      const page = await this.document.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const viewport = page.getViewport({
        scale: ((canvas.clientWidth || base.width) * pixelRatio) / base.width,
      });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.parentElement?.style.setProperty('aspect-ratio', `${base.width} / ${base.height}`);
      await page.render({ canvas, viewport }).promise;
    } catch {
      // Try again when it scrolls into view the next time.
      this.drawn.delete(n);
    }
  }
}
