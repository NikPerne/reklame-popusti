import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
  provideRouter,
} from '@angular/router';
import { authGuard, guestGuard } from './auth-guards';
import { authInterceptor } from './auth-interceptor';
import { AuthService } from './auth-service';

describe('auth', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
  });

  function runGuard(guard: typeof authGuard, url: string) {
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  }

  async function answerMe(status: number) {
    await Promise.resolve();
    const request = http.expectOne('/api/auth/me');
    if (status === 0) request.error(new ProgressEvent('error'));
    else
      request.flush(status === 200 ? { email: 'nik@example.com' } : {}, {
        status,
        statusText: String(status),
      });
  }

  describe('authGuard', () => {
    it('lets a logged-in user through', async () => {
      const result = runGuard(authGuard, '/');
      await answerMe(200);
      expect(await result).toBe(true);
    });

    it('sends an anonymous user to login and remembers where they were going', async () => {
      const result = runGuard(authGuard, '/?q=kava');
      await answerMe(401);
      expect(router.serializeUrl((await result) as UrlTree)).toBe(
        '/login?returnUrl=%2F%3Fq%3Dkava',
      );
    });

    it('lets the user in while offline so cached results can show', async () => {
      const result = runGuard(authGuard, '/');
      await answerMe(0);
      expect(await result).toBe(true);
    });

    it('asks the server only once', async () => {
      const first = runGuard(authGuard, '/');
      await answerMe(200);
      await first;

      expect(await runGuard(authGuard, '/')).toBe(true);
      http.expectNone('/api/auth/me');
    });
  });

  it('guestGuard sends a logged-in user away from the login page', async () => {
    const result = runGuard(guestGuard, '/login');
    await answerMe(200);
    expect(router.serializeUrl((await result) as UrlTree)).toBe('/');
  });

  describe('authInterceptor', () => {
    it('logs out and redirects to login when an API call returns 401', async () => {
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const auth = TestBed.inject(AuthService);

      TestBed.inject(HttpClient)
        .get('/api/offers')
        .subscribe({ error: () => undefined });
      http.expectOne('/api/offers').flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(auth.status()).toBe('anonymous');
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: {} });
    });

    it('leaves the session check to the guard', async () => {
      const navigate = vi.spyOn(router, 'navigate');

      const result = runGuard(authGuard, '/');
      await answerMe(401);
      await result;

      expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves a failed login attempt to the login page', () => {
      const navigate = vi.spyOn(router, 'navigate');

      TestBed.inject(HttpClient)
        .post('/api/auth/login', {})
        .subscribe({ error: () => undefined });
      http.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
