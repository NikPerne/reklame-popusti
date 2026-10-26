import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth-service';

type Mode = 'login' | 'signup';

type LoginError =
  | 'wrongPassword'
  | 'wrongCode'
  | 'emailTaken'
  | 'invalid'
  | 'tooManyAttempts'
  | 'offline'
  | 'error';

function errorKey(error: unknown): LoginError {
  if (!(error instanceof HttpErrorResponse)) return 'error';
  switch (error.status) {
    case 400:
      return 'invalid';
    case 401:
      return 'wrongPassword';
    case 403:
      return 'wrongCode';
    case 409:
      return 'emailTaken';
    case 429:
      return 'tooManyAttempts';
    case 0:
      return 'offline';
    default:
      return 'error';
  }
}

/** Login, and signup with an invite code. */
@Component({
  selector: 'app-login-page',
  imports: [TranslocoDirective],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from the `returnUrl` query parameter. */
  readonly returnUrl = input<string>();

  protected readonly mode = signal<Mode>('login');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly code = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<LoginError | null>(null);

  protected onInput(field: 'email' | 'password' | 'code', event: Event): void {
    this[field].set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected switchMode(): void {
    this.mode.update((m) => (m === 'login' ? 'signup' : 'login'));
    this.error.set(null);
  }

  protected canSubmit(): boolean {
    const filled = this.email().trim() !== '' && this.password() !== '';
    return filled && (this.mode() === 'login' || this.code().trim() !== '') && !this.submitting();
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.error.set(null);
    const email = this.email().trim();
    try {
      if (this.mode() === 'login') {
        await this.auth.login(email, this.password());
      } else {
        await this.auth.signup(email, this.password(), this.code().trim());
      }
      const target = this.returnUrl();
      // Only follow in-app paths, never a full URL.
      await this.router.navigateByUrl(
        target?.startsWith('/') && !target.startsWith('//') ? target : '/',
      );
    } catch (error) {
      const key = errorKey(error);
      this.error.set(key);
      if (key === 'wrongPassword') this.password.set('');
      if (key === 'emailTaken') this.mode.set('login');
    } finally {
      this.submitting.set(false);
    }
  }
}
