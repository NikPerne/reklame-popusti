import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AccountResponse {
  email: string;
}

/**
 * Session state. The session itself is an httpOnly cookie the app cannot read, so the status
 * is learned from the server (GET /api/auth/me) and from 401 responses.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly statusSignal = signal<AuthStatus>('unknown');
  private readonly emailSignal = signal<string | null>(null);

  readonly status = this.statusSignal.asReadonly();
  /** The logged-in account; null until known (e.g. when the app started offline). */
  readonly email = this.emailSignal.asReadonly();

  /** Asks the server once whether the session is valid. */
  async isAuthenticated(): Promise<boolean> {
    if (this.statusSignal() === 'unknown') {
      try {
        const { email } = await firstValueFrom(this.http.get<AccountResponse>('/api/auth/me'));
        this.emailSignal.set(email);
        this.statusSignal.set('authenticated');
      } catch (error) {
        // Only a 401 means "logged out". When offline or the server is down, let the user in
        // so the app can show cached results; data requests will 401 later if needed.
        const loggedOut = error instanceof HttpErrorResponse && error.status === 401;
        this.statusSignal.set(loggedOut ? 'anonymous' : 'authenticated');
      }
    }
    return this.statusSignal() === 'authenticated';
  }

  /** Rejects with the HttpErrorResponse (401 wrong email or password, 429 too many attempts, ...). */
  async login(email: string, password: string): Promise<void> {
    this.loggedIn(
      await firstValueFrom(this.http.post<AccountResponse>('/api/auth/login', { email, password })),
    );
  }

  /** Creates an account with an invite code (403 wrong code, 409 email taken, ...). */
  async signup(email: string, password: string, code: string): Promise<void> {
    this.loggedIn(
      await firstValueFrom(
        this.http.post<AccountResponse>('/api/auth/signup', { email, password, code }),
      ),
    );
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.markLoggedOut();
    }
  }

  private loggedIn({ email }: AccountResponse): void {
    this.emailSignal.set(email);
    this.statusSignal.set('authenticated');
  }

  /** Called when any API request comes back 401. */
  markLoggedOut(): void {
    this.emailSignal.set(null);
    this.statusSignal.set('anonymous');
  }
}
