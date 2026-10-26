import { Component, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { fromEvent, map, merge } from 'rxjs';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from './core/auth/auth-service';
import { LANGUAGES, LanguageService, type Language } from './core/i18n/language';
import { ShoppingListService } from './core/shopping-list/shopping-list-service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, TranslocoDirective],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly language = inject(LanguageService);
  protected readonly shoppingList = inject(ShoppingListService);

  protected readonly languages = LANGUAGES;
  protected readonly authStatus = this.auth.status;

  /** While offline, the service worker serves the last saved results; tell the user. */
  protected readonly online = toSignal(
    merge(fromEvent(window, 'online'), fromEvent(window, 'offline')).pipe(
      map(() => navigator.onLine),
    ),
    { initialValue: navigator.onLine },
  );

  constructor() {
    // Load the shared list (and send offline changes) once the user is known to be logged in.
    effect(() => {
      if (this.authStatus() === 'authenticated') void untracked(() => this.shoppingList.sync());
    });
  }

  protected setLanguage(lang: Language): void {
    this.language.set(lang);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.router.navigate(['/login']);
  }
}
