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
    path: 'darci',
    title: $localize`:@@admin.donors.pageTitle:Dárci | Správa | Nová naděje – nadační fond`,
    loadComponent: () => import('./donors/admin-donors').then((m) => m.AdminDonors),
  },
  {
    path: 'darci/:id',
    title: $localize`:@@admin.donorDetail.pageTitle:Dárce | Správa | Nová naděje – nadační fond`,
    loadComponent: () =>
      import('./donor-detail/admin-donor-detail').then((m) => m.AdminDonorDetail),
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
    path: 'prehledy',
    title: $localize`:@@admin.report.pageTitle:Měsíční přehled | Správa | Nová naděje – nadační fond`,
    loadComponent: () => import('./report/admin-report').then((m) => m.AdminReport),
  },
  {
    path: 'historie',
    title: $localize`:@@admin.actions.pageTitle:Historie správy | Správa | Nová naděje – nadační fond`,
    loadComponent: () => import('./actions/admin-actions').then((m) => m.AdminActions),
  },
];
