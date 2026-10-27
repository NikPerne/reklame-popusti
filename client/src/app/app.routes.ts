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
  {
    path: 'nastavitve',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
  },
  {
    path: 'primerjava',
    canActivate: [authGuard],
    loadComponent: () => import('./features/compare/compare-page').then((m) => m.ComparePage),
  },
  {
    path: 'izdelek/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/product/product-page').then((m) => m.ProductPage),
  },
  {
    path: 'skeniraj',
    canActivate: [authGuard],
    loadComponent: () => import('./features/scanner/scanner-page').then((m) => m.ScannerPage),
  },
  { path: '**', redirectTo: '' },
];
