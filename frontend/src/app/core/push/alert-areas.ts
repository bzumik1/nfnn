/// <reference types="@angular/localize" />

import { pluralCategory } from '../i18n/plural-category';

import { ALERTS_PAGE } from './alert-routes';
import { OpenAlert, OpenAlertArea } from './open-alerts-api';

export const ALERT_AREA_NAMES: Record<OpenAlertArea, string> = {
  bankImport: $localize`:@@admin.alerts.area.bankImport:Import plateb z banky`,
  backups: $localize`:@@admin.alerts.area.backups:Zálohy`,
  mail: $localize`:@@admin.alerts.area.mail:Odesílání e-mailů`,
};

export const ALERT_AREA_ROUTES: Record<OpenAlertArea, string> = {
  bankImport: '/sprava',
  backups: '/sprava/zalohy',
  mail: '/sprava/nastaveni',
};

export function faultRoute(alerts: readonly OpenAlert[]): string {
  return alerts.length === 1 ? ALERT_AREA_ROUTES[alerts[0].area] : ALERTS_PAGE;
}

export function faultDescription(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@layout.account.faults.one:${count}:count: porucha`;
    case 'few':
      return $localize`:@@layout.account.faults.few:${count}:count: poruchy`;
    default:
      return $localize`:@@layout.account.faults.other:${count}:count: poruch`;
  }
}
