import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { translocoTesting } from '../testing/transloco-testing';
import { App } from './app';
import { LanguageService } from './core/i18n/language';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('switches the language from the header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.brand')?.textContent).toContain('Popusti');

    const english = [...element.querySelectorAll<HTMLButtonElement>('.lang-switch button')].find(
      (b) => b.textContent?.trim() === 'EN',
    )!;
    english.click();
    await fixture.whenStable();

    expect(TestBed.inject(LanguageService).current()).toBe('en');
    expect(element.querySelector('.brand')?.textContent).toContain('Discounts');
    expect(document.documentElement.lang).toBe('en');
  });

  it('hides logout until the user is logged in', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Odjava');
  });
});
