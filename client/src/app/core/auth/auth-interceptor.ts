import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth-service';

/**
 * An expired or missing session on a data request sends the user to the login page.
 * `/api/auth/*` calls are left alone: the guards and the login page handle their 401s.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      const isAuthCall = request.url.startsWith('/api/auth/');
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthCall) {
        auth.markLoggedOut();
        const returnUrl = router.url.startsWith('/login') ? undefined : router.url;
        void router.navigate(['/login'], {
          queryParams: returnUrl && returnUrl !== '/' ? { returnUrl } : {},
        });
      }
      return throwError(() => error);
    }),
  );
};
