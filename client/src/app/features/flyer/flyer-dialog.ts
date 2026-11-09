import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { FlyerViewer } from './flyer-viewer';

/** Marks the history entry the popup adds, so the phone's back button closes it. */
const HISTORY_KEY = 'flyerPopup';

/**
 * A flyer in a full-screen popup over the start page. Closes with ✕, Escape or the phone's
 * back button (opening it adds a history entry without changing the URL).
 */
@Component({
  selector: 'app-flyer-dialog',
  imports: [TranslocoDirective, FlyerViewer],
  template: `
    <dialog #dialog class="flyer-dialog" (close)="onClosed()">
      <div class="bar" *transloco="let t; prefix: 'flyers'">
        <button type="button" class="close" (click)="close()" [attr.aria-label]="t('close')">
          ✕
        </button>
      </div>
      <app-flyer-viewer [id]="id()" />
    </dialog>
  `,
  styles: `
    .flyer-dialog {
      width: 100%;
      max-width: 56rem;
      height: 100dvh;
      max-height: 100dvh;
      margin: 0 auto;
      padding: 0 var(--space-3) var(--space-4);
      border: none;
      background: var(--bg);
      color: var(--text);
      overscroll-behavior: contain;
    }
    .flyer-dialog::backdrop {
      background: rgb(0 0 0 / 60%);
    }
    .bar {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      justify-content: flex-end;
      padding: var(--space-2) 0;
      background: var(--bg);
    }
    .close {
      width: 2.75rem;
      height: 2.75rem;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--surface);
      color: var(--text);
      font-size: 1.1rem;
      cursor: pointer;
    }
  `,
})
export class FlyerDialog {
  readonly id = input.required<string>();
  /** The popup was closed; the parent removes it. */
  readonly closed = output();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private pushedHistory = false;
  private readonly onPopState = () => {
    this.pushedHistory = false;
    this.close();
  };

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      history.pushState({ ...(history.state as object), [HISTORY_KEY]: true }, '');
      this.pushedHistory = true;
      addEventListener('popstate', this.onPopState);
    });
    inject(DestroyRef).onDestroy(() => removeEventListener('popstate', this.onPopState));
  }

  protected close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
  }

  protected onClosed(): void {
    removeEventListener('popstate', this.onPopState);
    // Closed with ✕ or Escape: take back the history entry the popup added.
    if (this.pushedHistory) {
      this.pushedHistory = false;
      history.back();
    }
    this.closed.emit();
  }
}
