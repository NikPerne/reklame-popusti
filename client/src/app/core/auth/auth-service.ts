import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Session state. The session itself is an httpOnly cookie the app cannot read, so the status
 * is learned from the server (GET /api/auth/me) and from 401 responses.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly statusSignal = signal<AuthStatus>('unknown');

  readonly status = this.statusSignal.asReadonly();

  /** Asks the server once whether the session is valid. */
  async isAuthenticated(): Promise<boolean> {
    if (this.statusSignal() === 'unknown') {
      try {
        await firstValueFrom(this.http.get('/api/auth/me'));
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

  /** Rejects with the HttpErrorResponse (401 wrong password, 429 too many attempts, ...). */
  async login(password: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/login', { password }));
    this.statusSignal.set('authenticated');
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.statusSignal.set('anonymous');
    }
  }

  /** Called when any API request comes back 401. */
  markLoggedOut(): void {
    this.statusSignal.set('anonymous');
  }
}
