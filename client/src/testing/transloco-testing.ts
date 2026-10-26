import { TranslocoTestingModule, type TranslocoTestingOptions } from '@jsverse/transloco';
import en from '../../public/i18n/en.json';
import sl from '../../public/i18n/sl.json';

/** Real translations, loaded synchronously, for component tests. */
export function translocoTesting(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: { sl, en },
    translocoConfig: {
      availableLangs: ['sl', 'en'],
      defaultLang: 'sl',
      reRenderOnLangChange: true,
    },
    preloadLangs: true,
    ...options,
  });
}
