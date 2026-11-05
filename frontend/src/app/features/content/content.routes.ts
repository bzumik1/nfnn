import { Routes } from '@angular/router';
import { RouteChromeData } from '../../core/navigation/route-chrome';
import { oldSectionRedirect } from './landing/old-section-redirect';
import { NOT_FOUND_TITLE } from './not-found/not-found';

const LANDING: RouteChromeData = { head: 'photo', landing: true };
const LIGHT_HEAD: RouteChromeData = { head: 'light' };

export const contentRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: $localize`:@@content.home.pageTitle:Nová naděje – nadační fond`,
    canActivate: [oldSectionRedirect],
    runGuardsAndResolvers: 'always',
    data: LANDING,
    loadComponent: () => import('./landing/landing').then((m) => m.Landing),
  },
  {
    path: 'o-nas',
    title: $localize`:@@content.about.pageTitle:O nás | Nová naděje – nadační fond`,
    data: { ...LIGHT_HEAD, phoneFooter: true },
    loadComponent: () => import('./about-page/about-page').then((m) => m.AboutPage),
  },
  {
    path: 'prispet',
    title: $localize`:@@content.donate.pageTitle:Přispět | Nová naděje – nadační fond`,
    data: LIGHT_HEAD,
    loadComponent: () => import('./donate-page/donate-page').then((m) => m.DonatePage),
  },
  {
    path: 'zasady-ochrany-osobnich-udaju',
    title: $localize`:@@content.privacy.pageTitle:Zásady ochrany osobních údajů | Nová naděje – nadační fond`,
    data: { parent: '/o-nas' } satisfies RouteChromeData,
    loadComponent: () => import('./privacy-policy/privacy-policy').then((m) => m.PrivacyPolicy),
  },
  {
    path: 'aktuality',
    title: $localize`:@@content.newsList.pageTitle:Aktuality | Nová naděje – nadační fond`,
    data: LIGHT_HEAD,
    loadComponent: () => import('./news-page/news-page').then((m) => m.NewsPage),
  },
  {
    path: 'projekty',
    title: $localize`:@@content.projectList.pageTitle:Kde pomáháme | Nová naděje – nadační fond`,
    data: LIGHT_HEAD,
    loadComponent: () => import('./projects-page/projects-page').then((m) => m.ProjectsPage),
  },
  {
    path: 'aktuality/:slug',
    title: $localize`:@@content.newsDetail.pageTitle:Aktualita | Nová naděje – nadační fond`,
    data: { kind: 'news', parent: '/aktuality' },
    loadComponent: () => import('./detail/content-detail').then((m) => m.ContentDetail),
  },
  {
    path: 'projekty/:slug',
    title: $localize`:@@content.projectDetail.pageTitle:Projekt | Nová naděje – nadační fond`,
    data: { kind: 'project', parent: '/projekty' },
    loadComponent: () => import('./detail/content-detail').then((m) => m.ContentDetail),
  },
  {
    path: '**',
    title: NOT_FOUND_TITLE,
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
  },
];
