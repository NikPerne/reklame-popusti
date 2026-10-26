import { Component, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { fromEvent, map, merge } from 'rxjs';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from './core/auth/auth-service';
import { SessionData } from './core/auth/session-data';
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
  private readonly sessionData = inject(SessionData);

  protected readonly languages = LANGUAGES;
  protected readonly year = new Date().getFullYear();
  protected readonly authStatus = this.auth.status;

  /** While offline, the service worker serves the last saved results; tell the user. */
  protected readonly online = toSignal(
    merge(fromEvent(window, 'online'), fromEvent(window, 'offline')).pipe(
      map(() => navigator.onLine),
    ),
    { initialValue: navigator.onLine },
  );

  constructor() {
    // Load the account's list and settings (and send offline changes) once logged in.
    effect(() => {
      if (this.authStatus() !== 'authenticated') return;
      const email = this.auth.email();
      untracked(() => this.sessionData.loggedIn(email));
    });
  }

  protected setLanguage(lang: Language): void {
    this.language.set(lang);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    this.sessionData.loggedOut();
    await this.router.navigate(['/login']);
  }
}
