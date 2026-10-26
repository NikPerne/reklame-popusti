import { DOCUMENT, Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';

export const LANGUAGES = ['sl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'sl';

const STORAGE_KEY = 'reklame-popusti.lang';

function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}

/** Intl locale for number and date formatting. */
export function localeFor(lang: Language): string {
  return lang === 'sl' ? 'sl-SI' : 'en-GB';
}

/** Active UI language: Slovenian by default, the choice is remembered in this browser. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  readonly current = toSignal(
    this.transloco.langChanges$.pipe(map((lang) => (isLanguage(lang) ? lang : DEFAULT_LANGUAGE))),
    { initialValue: DEFAULT_LANGUAGE },
  );

  /** Applies the stored language (if any). Call once at startup. */
  restore(): void {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode); fall back to the default.
    }
    this.apply(isLanguage(stored) ? stored : DEFAULT_LANGUAGE);
  }

  set(lang: Language): void {
    this.apply(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Not remembered, but still switched for this session.
    }
  }

  private apply(lang: Language): void {
    this.transloco.setActiveLang(lang);
    this.document.documentElement.lang = lang;
  }
}
