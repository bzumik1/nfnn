/// <reference types="@angular/localize" />

import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@admin.home.pageTitle:Správa | Nová naděje – nadační fond`,
    loadComponent: () => import('./home/admin-home').then((m) => m.AdminHome),
  },
  {
    path: 'platby',
    title: $localize`:@@admin.payments.pageTitle:Platby z banky | Správa | Nová naděje – nadační fond`,
    loadComponent: () => import('./payments/admin-payments').then((m) => m.AdminPayments),
  },
];
