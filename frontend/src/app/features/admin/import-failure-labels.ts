/// <reference types="@angular/localize" />

import { ImportFailureKind } from './admin-api';

export const IMPORT_FAILURE_LABELS: Record<ImportFailureKind, string> = {
  RATE_LIMITED: $localize`:@@admin.home.import.failure.rateLimited:Fio odmítlo příliš častý dotaz`,
  HISTORY_LOCKED: $localize`:@@admin.home.import.failure.historyLocked:Historie starší než 89 dní je ve Fio zamčená`,
  UNAUTHORIZED: $localize`:@@admin.home.import.failure.unauthorized:Fio odmítlo token (chybí, ještě neplatí nebo vypršel)`,
  TRANSPORT: $localize`:@@admin.home.import.failure.transport:Fio nebylo dostupné`,
  INVALID_RESPONSE: $localize`:@@admin.home.import.failure.invalidResponse:Fio poslalo odpověď, které web nerozumí`,
  UNEXPECTED: $localize`:@@admin.home.import.failure.unexpected:Neočekávaná chyba`,
};

export type ImportNextStepLink = 'settings' | 'logs' | 'history' | null;

export interface ImportNextStep {
  readonly text: string;
  readonly link: ImportNextStepLink;
}

export const IMPORT_NEXT_STEPS: Record<ImportFailureKind, ImportNextStep> = {
  RATE_LIMITED: {
    text: $localize`:@@admin.home.import.next.rateLimited:Banka teď odmítá příliš časté dotazy. Web to zkusí znovu sám, nic dělat nemusíte.`,
    link: null,
  },
  HISTORY_LOCKED: {
    text: $localize`:@@admin.home.import.next.historyLocked:Odemkněte historii v internetovém bankovnictví Fio (Nastavení → API, ikona zámku) a do 10 minut stiskněte níže „Načíst starší platby“.`,
    link: 'history',
  },
  UNAUTHORIZED: {
    text: $localize`:@@admin.home.import.next.unauthorized:V internetovém bankovnictví Fio (Nastavení → API) vytvořte nový token typu „Sledování účtu“ (platí 180 dní) a vložte ho v Nastavení jako Token Fio API.`,
    link: 'settings',
  },
  TRANSPORT: {
    text: $localize`:@@admin.home.import.next.transport:Banka teď neodpovídá. Web to zkouší znovu sám každou hodinu; pokud to trvá déle, zkontrolujte připojení serveru k internetu.`,
    link: null,
  },
  INVALID_RESPONSE: {
    text: $localize`:@@admin.home.import.next.invalidResponse:Podrobnosti jsou v logu backendu; může jít o změnu Fio API.`,
    link: 'logs',
  },
  UNEXPECTED: {
    text: $localize`:@@admin.home.import.next.unexpected:Podrobnosti jsou v logu backendu.`,
    link: 'logs',
  },
};

export const HISTORY_NEXT_STEPS: Record<ImportFailureKind, ImportNextStep> = {
  ...IMPORT_NEXT_STEPS,
  RATE_LIMITED: {
    text: $localize`:@@admin.home.history.next.rateLimited:Banka teď odmítá příliš časté dotazy. Starší platby se samy znovu nenačtou: za pár minut stiskněte „Načíst starší platby“ znovu.`,
    link: null,
  },
  TRANSPORT: {
    text: $localize`:@@admin.home.history.next.transport:Banka teď neodpovídá. Starší platby se samy znovu nenačtou: za chvíli stiskněte „Načíst starší platby“ znovu; pokud to trvá déle, zkontrolujte připojení serveru k internetu.`,
    link: null,
  },
  INVALID_RESPONSE: {
    text: $localize`:@@admin.home.history.next.invalidResponse:Za chvíli stiskněte „Načíst starší platby“ znovu; když se to opakuje, může jít o změnu na straně Fio a technik najde podrobnosti v logu.`,
    link: 'logs',
  },
  UNEXPECTED: {
    text: $localize`:@@admin.home.history.next.unexpected:Starší platby se samy znovu nenačtou: za chvíli stiskněte „Načíst starší platby“ znovu. Když se chyba opakuje, pošlete technikovi čas z této zprávy; podrobnosti najde v logu.`,
    link: 'logs',
  },
};
