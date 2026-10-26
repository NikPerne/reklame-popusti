import { Pipe, type PipeTransform } from '@angular/core';
import { localeFor, type Language } from '../core/i18n/language';

const currencyFormats = new Map<string, Intl.NumberFormat>();

function currencyFormat(lang: Language): Intl.NumberFormat {
  const locale = localeFor(lang);
  let format = currencyFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
    currencyFormats.set(locale, format);
  }
  return format;
}

/** `1.85 | eur: lang` -> "1,85 €" (sl) or "€1.85" (en) */
@Pipe({ name: 'eur' })
export class EurPipe implements PipeTransform {
  transform(value: number | null | undefined, lang: Language): string {
    return value == null ? '' : currencyFormat(lang).format(value);
  }
}

/** `'2026-11-03T22:37:52Z' | shortDate: lang` -> "3. 11." (sl) or "3/11" (en), in Ljubljana time. */
@Pipe({ name: 'shortDate' })
export class ShortDatePipe implements PipeTransform {
  transform(value: string | null | undefined, lang: Language): string {
    if (!value) return '';
    return new Intl.DateTimeFormat(localeFor(lang), {
      day: 'numeric',
      month: 'numeric',
      timeZone: 'Europe/Ljubljana',
    }).format(new Date(value));
  }
}
