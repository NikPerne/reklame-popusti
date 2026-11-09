import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { translocoTesting } from '../../../testing/transloco-testing';
import { FlyerDialog } from './flyer-dialog';

describe('FlyerDialog', () => {
  beforeAll(() => {
    // jsdom has no modal dialogs.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlyerDialog, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  async function open() {
    const fixture = TestBed.createComponent(FlyerDialog);
    fixture.componentRef.setInput('id', 'lidl-lidlov-katalog-2026-kw45');
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, closed: () => closed };
  }

  it('opens as a modal popup with the flyer', async () => {
    const { element } = await open();

    expect(element.querySelector('dialog')?.open).toBe(true);
    expect(element.querySelector('dialog app-flyer-viewer')).not.toBeNull();
  });

  it('closes with ✕ and takes back its history entry', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    const { element, closed } = await open();

    element.querySelector<HTMLButtonElement>('.close')!.click();

    expect(element.querySelector('dialog')?.open).toBe(false);
    expect(closed()).toBe(1);
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('closes when the phone’s back button is pressed', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    const { element, closed } = await open();

    dispatchEvent(new PopStateEvent('popstate'));

    expect(element.querySelector('dialog')?.open).toBe(false);
    expect(closed()).toBe(1);
    // The back button already removed the entry.
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });
});
