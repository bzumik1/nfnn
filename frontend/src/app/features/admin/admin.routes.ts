/// <reference types="@angular/localize" />

import { Routes } from '@angular/router';
import { unsavedChangesGuard } from './unsaved-changes/unsaved-changes-guard';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/admin-shell').then((m) => m.AdminShell),
    children: [
      {
        path: '',
        title: $localize`:@@admin.home.pageTitle:Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./home/admin-home').then((m) => m.AdminHome),
      },
      {
        path: 'platby',
        title: $localize`:@@admin.payments.pageTitle:Platby z banky | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./payments/admin-payments').then((m) => m.AdminPayments),
      },
      {
        path: 'darci',
        title: $localize`:@@admin.donors.pageTitle:Dárci | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./donors/admin-donors').then((m) => m.AdminDonors),
      },
      {
        path: 'darci/:id',
        title: $localize`:@@admin.donorDetail.pageTitle:Dárce | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./donor-detail/admin-donor-detail').then((m) => m.AdminDonorDetail),
      },
      {
        path: 'spravci',
        title: $localize`:@@admin.administrators.pageTitle:Správci | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./administrators/admin-administrators').then((m) => m.AdminAdministrators),
      },
      {
        path: 'starsi-symboly',
        title: $localize`:@@admin.symbolClaims.pageTitle:Odpovědi o starších symbolech | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./symbol-claims/admin-symbol-claims').then((m) => m.AdminSymbolClaims),
      },
      {
        path: 'prehledy',
        title: $localize`:@@admin.report.pageTitle:Měsíční e-mail | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./report/admin-report').then((m) => m.AdminReport),
      },
      {
        path: 'aktuality',
        title: $localize`:@@admin.news.pageTitle:Aktuality | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./news/admin-news').then((m) => m.AdminNews),
      },
      {
        path: 'aktuality/nova',
        title: $localize`:@@admin.newsEditor.pageTitle.new:Nová aktualita | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./news/admin-news-editor').then((m) => m.AdminNewsEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'aktuality/:id',
        title: $localize`:@@admin.newsEditor.pageTitle.edit:Úprava aktuality | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./news/admin-news-editor').then((m) => m.AdminNewsEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'projekty',
        title: $localize`:@@admin.projects.pageTitle:Projekty | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./projects/admin-projects').then((m) => m.AdminProjects),
      },
      {
        path: 'projekty/nova',
        title: $localize`:@@admin.projectEditor.pageTitle.new:Nový projekt | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./projects/admin-project-editor').then((m) => m.AdminProjectEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'projekty/:id',
        title: $localize`:@@admin.projectEditor.pageTitle.edit:Úprava projektu | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./projects/admin-project-editor').then((m) => m.AdminProjectEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'o-nas',
        title: $localize`:@@admin.about.pageTitle:Fotka v sekci O nás | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./about/admin-about').then((m) => m.AdminAbout),
      },
      {
        path: 'zalohy',
        title: $localize`:@@admin.backups.pageTitle:Zálohy | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./backups/admin-backups').then((m) => m.AdminBackups),
      },
      {
        path: 'logy',
        title: $localize`:@@admin.logs.pageTitle:Logy a diagnostika | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./logs/admin-logs').then((m) => m.AdminLogs),
      },
      {
        path: 'nastaveni',
        title: $localize`:@@admin.settings.pageTitle:Nastavení | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./settings/admin-settings').then((m) => m.AdminSettings),
      },
      {
        path: 'historie',
        title: $localize`:@@admin.actions.pageTitle:Historie změn | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./actions/admin-actions').then((m) => m.AdminActions),
      },
    ],
  },
];
