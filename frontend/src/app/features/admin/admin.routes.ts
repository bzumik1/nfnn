/// <reference types="@angular/localize" />

import { inject, signal } from '@angular/core';
import { Routes } from '@angular/router';
import { AdministrationLockPanel } from './lock/administration-lock-panel';
import { AdministrationLockService } from './lock/administration-lock-service';
import { ADMINISTRATION_LOCK, type AdministrationLock } from './shell/administration-lock';
import { ADMIN_HOME_PATH, ADMIN_LOGS_PATH, ADMIN_MORE_PATH } from './shell/admin-sections';
import { unsavedChangesGuard } from './unsaved-changes/unsaved-changes-guard';

export const adminRoutes: Routes = [
  {
    path: '',
    providers: [{ provide: ADMINISTRATION_LOCK, useFactory: administrationLock }],
    loadComponent: () => import('./shell/admin-shell').then((m) => m.AdminShell),
    children: [
      {
        path: '',
        title: $localize`:@@admin.home.pageTitle:Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./home/admin-home').then((m) => m.AdminHome),
      },
      {
        path: 'vice',
        data: { parent: ADMIN_HOME_PATH },
        title: $localize`:@@admin.more.pageTitle:Občas a pro technika | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./more/admin-more').then((m) => m.AdminMore),
      },
      {
        path: 'platby',
        data: { parent: ADMIN_HOME_PATH },
        title: $localize`:@@admin.payments.pageTitle:Platby z banky | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./payments/admin-payments').then((m) => m.AdminPayments),
      },
      {
        path: 'darci',
        data: { parent: ADMIN_HOME_PATH },
        title: $localize`:@@admin.donors.pageTitle:Dárci | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./donors/admin-donors').then((m) => m.AdminDonors),
      },
      {
        path: 'darci/:id',
        data: { parent: '/sprava/darci' },
        title: $localize`:@@admin.donorDetail.pageTitle:Dárce | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./donor-detail/admin-donor-detail').then((m) => m.AdminDonorDetail),
      },
      {
        path: 'darci/:id/:section',
        data: { parent: '/sprava/darci/:id' },
        title: $localize`:@@admin.donorDetail.pageTitle:Dárce | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./donor-detail/admin-donor-detail').then((m) => m.AdminDonorDetail),
      },
      {
        path: 'hromadna-potvrzeni',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.yearlyReceipts.pageTitle:Hromadná potvrzení | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./yearly-receipts/admin-yearly-receipts').then((m) => m.AdminYearlyReceipts),
      },
      {
        path: 'spravci',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.administrators.pageTitle:Správci | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./administrators/admin-administrators').then((m) => m.AdminAdministrators),
      },
      {
        path: 'starsi-symboly',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.symbolClaims.pageTitle:Odpovědi o starších symbolech | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./symbol-claims/admin-symbol-claims').then((m) => m.AdminSymbolClaims),
      },
      {
        path: 'prehledy',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.report.pageTitle:Měsíční e-mail | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./report/admin-report').then((m) => m.AdminReport),
      },
      {
        path: 'aktuality',
        data: { parent: ADMIN_HOME_PATH },
        title: $localize`:@@admin.news.pageTitle:Aktuality | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./news/admin-news').then((m) => m.AdminNews),
      },
      {
        path: 'aktuality/nova',
        data: { parent: '/sprava/aktuality' },
        title: $localize`:@@admin.newsEditor.pageTitle.new:Nová aktualita | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./news/admin-news-editor').then((m) => m.AdminNewsEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'aktuality/:id',
        data: { parent: '/sprava/aktuality' },
        title: $localize`:@@admin.newsEditor.pageTitle.edit:Úprava aktuality | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./news/admin-news-editor').then((m) => m.AdminNewsEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'projekty',
        data: { parent: ADMIN_HOME_PATH },
        title: $localize`:@@admin.projects.pageTitle:Projekty | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./projects/admin-projects').then((m) => m.AdminProjects),
      },
      {
        path: 'projekty/nova',
        data: { parent: '/sprava/projekty' },
        title: $localize`:@@admin.projectEditor.pageTitle.new:Nový projekt | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./projects/admin-project-editor').then((m) => m.AdminProjectEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'projekty/:id',
        data: { parent: '/sprava/projekty' },
        title: $localize`:@@admin.projectEditor.pageTitle.edit:Úprava projektu | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./projects/admin-project-editor').then((m) => m.AdminProjectEditor),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'o-nas',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.about.pageTitle:Fotka v sekci O nás | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./about/admin-about').then((m) => m.AdminAbout),
      },
      {
        path: 'lide-fondu',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.people.pageTitle:Lidé fondu | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./people/admin-people').then((m) => m.AdminPeople),
      },
      {
        path: 'zalohy',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.backups.pageTitle:Zálohy | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./backups/admin-backups').then((m) => m.AdminBackups),
      },
      {
        path: 'upozorneni',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.alerts.pageTitle:Upozornění | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./alerts/admin-alerts').then((m) => m.AdminAlerts),
      },
      {
        path: 'logy',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.logs.pageTitle:Logy a diagnostika | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./logs/admin-logs').then((m) => m.AdminLogs),
      },
      {
        path: 'logy/soubory',
        data: { parent: ADMIN_LOGS_PATH },
        title: $localize`:@@admin.logs.files.pageTitle:Starší soubory logu | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./logs/files/admin-log-files').then((m) => m.AdminLogFiles),
      },
      {
        path: 'logy/soubor',
        data: { parent: ADMIN_LOGS_PATH },
        title: $localize`:@@admin.logs.reader.pageTitle:Soubor logu | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./logs/reader/admin-log-reader').then((m) => m.AdminLogReader),
      },
      {
        path: 'logy/urovne',
        data: { parent: ADMIN_LOGS_PATH },
        title: $localize`:@@admin.logs.levels.pageTitle:Úrovně logování | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./logs/levels/admin-log-levels').then((m) => m.AdminLogLevels),
      },
      {
        path: 'logy/stav',
        data: { parent: ADMIN_LOGS_PATH },
        title: $localize`:@@admin.logs.state.pageTitle:Stav serveru | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./logs/state/admin-server-state').then((m) => m.AdminServerState),
      },
      {
        path: 'logy/vlakna',
        data: { parent: ADMIN_LOGS_PATH },
        title: $localize`:@@admin.logs.threads.pageTitle:Výpis vláken | Správa | Nová naděje – nadační fond`,
        loadComponent: () =>
          import('./logs/threads/admin-thread-dump').then((m) => m.AdminThreadDump),
      },
      {
        path: 'nastaveni',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.settings.pageTitle:Nastavení | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./settings/admin-settings').then((m) => m.AdminSettings),
      },
      {
        path: 'historie',
        data: { parent: ADMIN_MORE_PATH },
        title: $localize`:@@admin.actions.pageTitle:Historie změn | Správa | Nová naděje – nadační fond`,
        loadComponent: () => import('./actions/admin-actions').then((m) => m.AdminActions),
      },
    ],
  },
];

function administrationLock(): AdministrationLock {
  const lock = inject(AdministrationLockService);
  return {
    locked: lock.locked,
    panel: signal(AdministrationLockPanel).asReadonly(),
    keepsPage: lock.keepsPage,
    firstDownload: lock.firstDownload,
  };
}
