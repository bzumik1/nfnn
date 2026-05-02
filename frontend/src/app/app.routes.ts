import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./features/content/content.routes').then((m) => m.contentRoutes),
  },
  {
    path: 'donor',
    loadChildren: () =>
      import('./features/donors/donors.routes').then((m) => m.donorsRoutes),
  },
  { path: '**', redirectTo: '' },
];
