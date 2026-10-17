import { Routes } from '@angular/router';

export const contentRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@content.home.pageTitle:Nová naděje – nadační fond`,
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'zasady-ochrany-osobnich-udaju',
    title: $localize`:@@content.privacy.pageTitle:Zásady ochrany osobních údajů | Nová naděje – nadační fond`,
    loadComponent: () => import('./privacy-policy/privacy-policy').then((m) => m.PrivacyPolicy),
  },
];
