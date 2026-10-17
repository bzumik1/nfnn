import { Routes } from '@angular/router';
import { donorGuard } from './core/auth/donor-guard';

export const routes: Routes = [
  {
    path: 'donor',
    canActivate: [donorGuard],
    loadComponent: () =>
      import('./layout/donor-shell/donor-shell').then((m) => m.DonorShell),
    loadChildren: () =>
      import('./features/donors/donors.routes').then((m) => m.donorsRoutes),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/public-shell/public-shell').then((m) => m.PublicShell),
    loadChildren: () =>
      import('./features/content/content.routes').then((m) => m.contentRoutes),
  },
  { path: '**', redirectTo: '' },
];
