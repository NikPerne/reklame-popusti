import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { FlyerViewer } from './flyer-viewer';

/** A flyer on its own page (/letak/:id), e.g. from a shared link; the start page uses a popup. */
@Component({
  selector: 'app-flyer-page',
  imports: [TranslocoDirective, RouterLink, FlyerViewer],
  template: `
    <section class="page" *transloco="let t; prefix: 'flyers'">
      <a class="back" routerLink="/">← {{ t('back') }}</a>
      <app-flyer-viewer [id]="id()" />
    </section>
  `,
  styles: `
    .page {
      display: grid;
      gap: var(--space-3);
      max-width: 56rem;
      margin: 0 auto;
    }
    .back {
      justify-self: start;
      font-size: 0.9rem;
      color: var(--accent);
    }
  `,
})
export class FlyerPage {
  /** Bound from the route parameter. */
  readonly id = input.required<string>();
}
