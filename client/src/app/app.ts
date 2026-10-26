import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from './core/auth/auth-service';
import { LANGUAGES, LanguageService, type Language } from './core/i18n/language';

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

  protected readonly languages = LANGUAGES;
  protected readonly authStatus = this.auth.status;

  protected setLanguage(lang: Language): void {
    this.language.set(lang);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.router.navigate(['/login']);
  }
}
