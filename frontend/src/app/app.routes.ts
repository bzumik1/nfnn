import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin-guard';
import { donorGuard } from './core/auth/donor-guard';

export const routes: Routes = [
  {
    path: 'darce',
    canActivate: [donorGuard],
    loadComponent: () => import('./layout/donor-shell/donor-shell').then((m) => m.DonorShell),
    loadChildren: () => import('./features/donors/donors.routes').then((m) => m.donorsRoutes),
  },
  { path: 'donor', redirectTo: 'darce' },
  {
    path: 'sprava',
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/donor-shell/donor-shell').then((m) => m.DonorShell),
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: '',
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
        title: $localize`:@@donor.connect.pageTitle:Připojení aplikace | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./features/donors/connect-app/connect-app').then((m) => m.ConnectApp),
      },
      {
        path: 'prvni-nastaveni',
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
        loadChildren: () =>
          import('./features/content/content.routes').then((m) => m.contentRoutes),
      },
    ],
  },
];
