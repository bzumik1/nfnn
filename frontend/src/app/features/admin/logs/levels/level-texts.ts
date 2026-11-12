/// <reference types="@angular/localize" />

import { formatBankTime } from '../../../donations/donation-date';

const OWN_CODE = 'cz.novanadeje.app';
const MINUTE = 60_000;

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  ROOT: $localize`:@@admin.logs.level.describe.root:Vše ostatní`,
  'cz.novanadeje.app': $localize`:@@admin.logs.level.describe.app:Aplikace`,
  'io.github.bzumik1.fio': $localize`:@@admin.logs.level.describe.fio:Import z Fio`,
  'org.springframework.web': $localize`:@@admin.logs.level.describe.web:Požadavky na API`,
  'org.springframework.security': $localize`:@@admin.logs.level.describe.security:Přihlašování a oprávnění`,
  'org.hibernate.SQL': $localize`:@@admin.logs.level.describe.sql:Dotazy do databáze, bez hodnot`,
  liquibase: $localize`:@@admin.logs.level.describe.liquibase:Změny schématu databáze`,
  'org.springframework.mail': $localize`:@@admin.logs.level.describe.mail:Odesílání e-mailů`,
};

export function loggerDescription(logger: string): string | null {
  return DESCRIPTIONS[logger] ?? null;
}

export function canTrace(logger: string): boolean {
  return logger === OWN_CODE || logger.startsWith(`${OWN_CODE}.`);
}

export function remainingText(until: string, now: number): string {
  const minutes = Math.ceil((Date.parse(until) - now) / MINUTE);
  if (minutes <= 0) {
    return $localize`:@@admin.logs.level.goingBack:vrací se právě teď`;
  }
  const end = formatBankTime(until);
  if (minutes < 60) {
    return $localize`:@@admin.logs.level.remainingMinutes:vrátí se samo za ${minutes}:minutes: min (${end}:end:)`;
  }
  return $localize`:@@admin.logs.level.remainingHours:vrátí se samo za ${Math.floor(minutes / 60)}:hours: h ${minutes % 60}:minutes: min (${end}:end:)`;
}
