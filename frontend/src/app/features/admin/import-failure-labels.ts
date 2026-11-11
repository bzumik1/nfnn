/// <reference types="@angular/localize" />

import { ImportFailureKind } from './admin-api';

export const IMPORT_FAILURE_LABELS: Record<ImportFailureKind, string> = {
  RATE_LIMITED: $localize`:@@admin.home.import.failure.rateLimited:Fio odmítlo příliš častý dotaz`,
  HISTORY_LOCKED: $localize`:@@admin.home.import.failure.historyLocked:Historie starší než 90 dní je ve Fio zamčená`,
  UNAUTHORIZED: $localize`:@@admin.home.import.failure.unauthorized:Fio odmítlo token (chybí, ještě neplatí nebo vypršel)`,
  TRANSPORT: $localize`:@@admin.home.import.failure.transport:Fio nebylo dostupné`,
  INVALID_RESPONSE: $localize`:@@admin.home.import.failure.invalidResponse:Fio poslalo odpověď, které web nerozumí`,
  UNEXPECTED: $localize`:@@admin.home.import.failure.unexpected:Neočekávaná chyba`,
};
