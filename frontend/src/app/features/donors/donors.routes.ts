/// <reference types="@angular/localize" />

import { Type } from '@angular/core';
import { Routes } from '@angular/router';

export const DONOR_SECTION_PAGES: Readonly<Record<string, () => Promise<Type<unknown>>>> = {
  '/darce/prehled': () =>
    import('./dashboard/overview/donor-overview').then((m) => m.DonorOverview),
  '/darce/dary': () => import('./dashboard/gifts/donor-gifts').then((m) => m.DonorGifts),
  '/darce/potvrzeni': () =>
    import('./dashboard/receipts/donor-receipts').then((m) => m.DonorReceipts),
  '/darce/ucty': () =>
    import('./dashboard/bank-accounts/donor-bank-accounts').then((m) => m.DonorBankAccounts),
  '/darce/udaje': () => import('./dashboard/details/donor-details').then((m) => m.DonorDetails),
};

export const donorsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./dashboard/donor-area').then((m) => m.DonorArea),
    children: [
      {
        path: 'prehled',
        title: $localize`:@@donor.dashboard.pageTitle:Můj přehled | Nová naděje – nadační fond`,
        loadComponent: DONOR_SECTION_PAGES['/darce/prehled'],
      },
      {
        path: 'dary',
        title: $localize`:@@donor.gifts.pageTitle:Moje dary | Nová naděje – nadační fond`,
        loadComponent: DONOR_SECTION_PAGES['/darce/dary'],
      },
      {
        path: 'potvrzeni',
        title: $localize`:@@donor.receipts.pageTitle:Potvrzení o daru | Nová naděje – nadační fond`,
        loadComponent: DONOR_SECTION_PAGES['/darce/potvrzeni'],
      },
      {
        path: 'ucty',
        title: $localize`:@@donor.bankAccountsPage.pageTitle:Bankovní účty | Nová naděje – nadační fond`,
        loadComponent: DONOR_SECTION_PAGES['/darce/ucty'],
      },
      {
        path: 'udaje',
        title: $localize`:@@donor.details.pageTitle:Údaje a zabezpečení | Nová naděje – nadační fond`,
        loadComponent: DONOR_SECTION_PAGES['/darce/udaje'],
      },
      { path: '', redirectTo: 'prehled', pathMatch: 'full' },
    ],
  },
];
