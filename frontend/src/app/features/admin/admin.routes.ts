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
  {
    path: 'spravci',
    title: $localize`:@@admin.administrators.pageTitle:Správci | Správa | Nová naděje – nadační fond`,
    loadComponent: () =>
      import('./administrators/admin-administrators').then((m) => m.AdminAdministrators),
  },
  {
    path: 'starsi-symboly',
    title: $localize`:@@admin.symbolClaims.pageTitle:Starší symboly | Správa | Nová naděje – nadační fond`,
    loadComponent: () =>
      import('./symbol-claims/admin-symbol-claims').then((m) => m.AdminSymbolClaims),
  },
  {
    path: 'historie',
    title: $localize`:@@admin.actions.pageTitle:Historie správy | Správa | Nová naděje – nadační fond`,
    loadComponent: () => import('./actions/admin-actions').then((m) => m.AdminActions),
  },
];
