import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth-guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'seznam',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/shopping-list/shopping-list-page').then((m) => m.ShoppingListPage),
  },
  { path: '**', redirectTo: '' },
];
