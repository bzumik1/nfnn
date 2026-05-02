import { Routes } from '@angular/router';

export const contentRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
];
