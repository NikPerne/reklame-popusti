import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth-service';

/** Protects every page except login. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  if (await inject(AuthService).isAuthenticated()) return true;
  return router.createUrlTree(['/login'], {
    queryParams: state.url === '/' ? {} : { returnUrl: state.url },
  });
};

/** Sends an already logged-in user from the login page to the app. */
export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  return (await inject(AuthService).isAuthenticated()) ? router.createUrlTree(['/']) : true;
};
