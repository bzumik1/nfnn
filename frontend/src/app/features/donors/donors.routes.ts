/// <reference types="@angular/localize" />

import { Routes } from '@angular/router';

export const donorsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./dashboard/donor-area').then((m) => m.DonorArea),
    children: [
      {
        path: 'prehled',
        title: $localize`:@@donor.dashboard.pageTitle:Můj přehled | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./dashboard/overview/donor-overview').then((m) => m.DonorOverview),
      },
      {
        path: 'dary',
        title: $localize`:@@donor.gifts.pageTitle:Moje dary | Nová naděje – nadační fond`,
        loadComponent: () => import('./dashboard/gifts/donor-gifts').then((m) => m.DonorGifts),
      },
      {
        path: 'potvrzeni',
        title: $localize`:@@donor.receipts.pageTitle:Potvrzení o daru | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./dashboard/receipts/donor-receipts').then((m) => m.DonorReceipts),
      },
      {
        path: 'ucty',
        title: $localize`:@@donor.bankAccountsPage.pageTitle:Bankovní účty | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./dashboard/bank-accounts/donor-bank-accounts').then((m) => m.DonorBankAccounts),
      },
      {
        path: 'udaje',
        title: $localize`:@@donor.details.pageTitle:Údaje a zabezpečení | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./dashboard/details/donor-details').then((m) => m.DonorDetails),
      },
      { path: '', redirectTo: 'prehled', pathMatch: 'full' },
    ],
  },
];
