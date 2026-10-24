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
  {
    path: 'aktuality',
    title: $localize`:@@content.newsList.pageTitle:Aktuality | Nová naděje – nadační fond`,
    data: { kind: 'news' },
    loadComponent: () => import('./list/content-list').then((m) => m.ContentList),
  },
  {
    path: 'projekty',
    title: $localize`:@@content.projectList.pageTitle:Projekty | Nová naděje – nadační fond`,
    data: { kind: 'project' },
    loadComponent: () => import('./list/content-list').then((m) => m.ContentList),
  },
  {
    path: 'aktuality/:slug',
    title: $localize`:@@content.newsDetail.pageTitle:Aktualita | Nová naděje – nadační fond`,
    data: { kind: 'news' },
    loadComponent: () => import('./detail/content-detail').then((m) => m.ContentDetail),
  },
  {
    path: 'projekty/:slug',
    title: $localize`:@@content.projectDetail.pageTitle:Projekt | Nová naděje – nadační fond`,
    data: { kind: 'project' },
    loadComponent: () => import('./detail/content-detail').then((m) => m.ContentDetail),
  },
  {
    path: '**',
    title: $localize`:@@content.notFound.pageTitle:Stránka nenalezena | Nová naděje – nadační fond`,
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
  },
];
