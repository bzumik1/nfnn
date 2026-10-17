/// <reference types="@angular/localize" />

import { Routes } from '@angular/router';

export const donorsRoutes: Routes = [
  {
    path: 'prehled',
    title: $localize`:@@donor.dashboard.pageTitle:Můj přehled | Nová naděje – nadační fond`,
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.DonorDashboard),
  },
  { path: '', redirectTo: 'prehled', pathMatch: 'full' },
];
