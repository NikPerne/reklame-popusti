import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth-service';

type LoginError = 'wrongPassword' | 'tooManyAttempts' | 'offline' | 'error';

function errorKey(error: unknown): LoginError {
  if (!(error instanceof HttpErrorResponse)) return 'error';
  switch (error.status) {
    case 401:
      return 'wrongPassword';
    case 429:
      return 'tooManyAttempts';
    case 0:
      return 'offline';
    default:
      return 'error';
  }
}

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

  protected readonly password = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<LoginError | null>(null);

  protected onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.password() || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.password());
      const target = this.returnUrl();
      // Only follow in-app paths, never a full URL.
      await this.router.navigateByUrl(
        target?.startsWith('/') && !target.startsWith('//') ? target : '/',
      );
    } catch (error) {
      this.error.set(errorKey(error));
      this.password.set('');
    } finally {
      this.submitting.set(false);
    }
  }
}
