import { Routes } from '@angular/router';

export const donorsRoutes: Routes = [
  {
    path: 'prehled',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.DonorDashboard),
  },
  { path: '', redirectTo: 'prehled', pathMatch: 'full' },
];
