/// <reference types="@angular/localize" />

import { problemOf } from '../../core/auth/api-problem';
import { SettingName } from './setup/setup-api';

export const SETTING_LABELS: Readonly<Record<SettingName, string>> = {
  PUBLIC_URL: $localize`:@@operations.setting.PUBLIC_URL:Adresa webu`,
  MAIL_HOST: $localize`:@@operations.setting.MAIL_HOST:Server pro odesílání (SMTP)`,
  MAIL_PORT: $localize`:@@operations.setting.MAIL_PORT:Port`,
  MAIL_USERNAME: $localize`:@@operations.setting.MAIL_USERNAME:Přihlašovací jméno`,
  MAIL_PASSWORD: $localize`:@@operations.setting.MAIL_PASSWORD:Heslo nebo klíč SMTP`,
  MAIL_AUTH: $localize`:@@operations.setting.MAIL_AUTH:Server vyžaduje přihlášení`,
  MAIL_STARTTLS: $localize`:@@operations.setting.MAIL_STARTTLS:Šifrované spojení (STARTTLS)`,
  MAIL_FROM: $localize`:@@operations.setting.MAIL_FROM:Odesílatel e-mailů`,
  CONTACT_RECIPIENT: $localize`:@@operations.setting.CONTACT_RECIPIENT:Kam chodí zprávy z kontaktního formuláře`,
  FIO_TOKEN: $localize`:@@operations.setting.FIO_TOKEN:Token Fio API (jen pro čtení)`,
  FIO_HISTORY_FROM: $localize`:@@operations.setting.FIO_HISTORY_FROM:Stáhnout platby od data`,
  PAIRING_EXCLUDED_ACCOUNTS: $localize`:@@operations.setting.PAIRING_EXCLUDED_ACCOUNTS:Účty, podle kterých se nepáruje`,
  RECEIPT_SIGNATORY_NAME: $localize`:@@operations.setting.RECEIPT_SIGNATORY_NAME:Kdo podepisuje potvrzení`,
  RECEIPT_SIGNATORY_ROLE: $localize`:@@operations.setting.RECEIPT_SIGNATORY_ROLE:Jeho funkce`,
  RECEIPT_FIRST_YEAR: $localize`:@@operations.setting.RECEIPT_FIRST_YEAR:Potvrzení na webu od roku`,
  ADMIN_EMAILS: $localize`:@@operations.setting.ADMIN_EMAILS:E-mail prvního správce`,
};

export function settingLabel(name: string): string {
  return SETTING_LABELS[name as SettingName] ?? '';
}

export function settingErrors(failure: unknown): string[] {
  return (problemOf(failure)?.errors ?? [])
    .filter((error) => error.message !== '')
    .map((error) => {
      const label = settingLabel(error.field);
      return label === '' ? error.message : `${label}: ${error.message}`;
    });
}
