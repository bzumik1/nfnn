/// <reference types="@angular/localize" />

import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@admin.home.pageTitle:Správa | Nová naděje – nadační fond`,
    loadComponent: () => import('./home/admin-home').then((m) => m.AdminHome),
  },
];
