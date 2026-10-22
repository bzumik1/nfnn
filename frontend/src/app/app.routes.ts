import { Routes } from '@angular/router';
import { donorGuard } from './core/auth/donor-guard';

export const routes: Routes = [
  {
    path: 'donor',
    canActivate: [donorGuard],
    loadComponent: () => import('./layout/donor-shell/donor-shell').then((m) => m.DonorShell),
    loadChildren: () => import('./features/donors/donors.routes').then((m) => m.donorsRoutes),
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
        path: 'potvrzeni-emailu',
        title: $localize`:@@donor.emailVerification.pageTitle:Potvrzení e-mailu | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./features/donors/email-verification/email-verification').then(
            (m) => m.EmailVerification,
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
