import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin-guard';
import { APP_ENTRY_PATH, appEntryGuard } from './core/auth/app-entry-guard';
import { donorGuard } from './core/auth/donor-guard';
import { LOADED_AHEAD } from './core/navigation/tab-preloading';

export const routes: Routes = [
  {
    path: 'darce',
    canActivate: [donorGuard],
    data: { head: 'light', parent: '/', backOnWide: false, logoBesideBack: false },
    loadComponent: () => import('./layout/donor-shell/donor-shell').then((m) => m.DonorShell),
    loadChildren: () => import('./features/donors/donors.routes').then((m) => m.donorsRoutes),
  },
  { path: 'donor', redirectTo: 'darce' },
  { path: APP_ENTRY_PATH, canActivate: [appEntryGuard], children: [] },
  {
    path: 'sprava',
    canActivate: [adminGuard],
    data: { head: 'light', parent: '/', backOnWide: false, logoBesideBack: false },
    loadComponent: () => import('./layout/donor-shell/donor-shell').then((m) => m.DonorShell),
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: '',
    data: LOADED_AHEAD,
    loadComponent: () => import('./layout/public-shell/public-shell').then((m) => m.PublicShell),
    children: [
      {
        path: 'obnova-hesla',
        title: $localize`:@@donor.passwordReset.pageTitle:Nové heslo | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./features/donors/password-reset/password-reset').then((m) => m.PasswordReset),
      },
      {
        path: 'pripojeni',
        data: { tabBar: false },
        title: $localize`:@@donor.connect.pageTitle:Připojení aplikace | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./features/donors/connect-app/connect-app').then((m) => m.ConnectApp),
      },
      {
        path: 'prvni-nastaveni',
        data: { tabBar: false },
        title: $localize`:@@operations.setup.pageTitle:První nastavení | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./features/operations/setup/first-setup').then((m) => m.FirstSetup),
      },
      {
        path: 'potvrzeni-emailu',
        title: $localize`:@@donor.emailVerification.pageTitle:Potvrzení e-mailu | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./features/donors/email-verification/email-verification').then(
            (m) => m.EmailVerification,
          ),
      },
      {
        path: 'overit',
        title: $localize`:@@donor.verify.pageTitle:Ověření potvrzení o daru | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./features/donations/verification/verification-page').then(
            (m) => m.VerificationPage,
          ),
      },
      {
        path: '',
        data: LOADED_AHEAD,
        loadChildren: () =>
          import('./features/content/content.routes').then((m) => m.contentRoutes),
      },
    ],
  },
];
