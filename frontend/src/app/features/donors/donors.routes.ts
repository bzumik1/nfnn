import { Routes } from '@angular/router';

export const donorsRoutes: Routes = [
  {
    path: 'prihlaseni',
    loadComponent: () => import('./login/login').then((m) => m.DonorLogin),
  },
  {
    path: 'prehled',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.DonorDashboard),
  },
  { path: '', redirectTo: 'prihlaseni', pathMatch: 'full' },
];
