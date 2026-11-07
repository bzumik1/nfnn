/// <reference types="@angular/localize" />

import { DiagnosticsResponse } from '../admin-api';

export type ServerHealthKind = 'ok' | 'attention' | 'failure';

export interface ServerHealth {
  readonly kind: ServerHealthKind;
  readonly findings: readonly string[];
}

export const HEAP_ATTENTION_SHARE = 0.9;
export const DISK_ATTENTION_FREE_SHARE = 0.1;

const PERCENT = new Intl.NumberFormat('cs-CZ', { style: 'percent', maximumFractionDigits: 0 });

export function serverHealth(diagnostics: DiagnosticsResponse): ServerHealth {
  const failures = failuresOf(diagnostics);
  const attention = attentionOf(diagnostics);
  const kind: ServerHealthKind =
    failures.length > 0 ? 'failure' : attention.length > 0 ? 'attention' : 'ok';
  return { kind, findings: [...failures, ...attention] };
}

export function formatShare(share: number): string {
  return PERCENT.format(share);
}

function failuresOf({ database, disks }: DiagnosticsResponse): string[] {
  const findings: string[] = [];
  if (!database.reachable) {
    findings.push($localize`:@@admin.logs.health.databaseDown:Databáze neodpovídá.`);
  }
  for (const disk of disks.filter((candidate) => !candidate.mounted)) {
    findings.push(
      $localize`:@@admin.logs.health.diskMissing:Složka ${disk.path}:path: není připojená.`,
    );
  }
  return findings;
}

function attentionOf({ jvm, database, disks }: DiagnosticsResponse): string[] {
  const findings: string[] = [];
  const heapShare = jvm.heapMaxBytes > 0 ? jvm.heapUsedBytes / jvm.heapMaxBytes : 0;
  if (heapShare >= HEAP_ATTENTION_SHARE) {
    findings.push(
      $localize`:@@admin.logs.health.heapFull:Paměť je skoro plná (${formatShare(heapShare)}:share:).`,
    );
  }
  if (database.reachable && database.waitingThreads > 0) {
    findings.push(
      $localize`:@@admin.logs.health.databaseWaiting:Na spojení s databází čekají vlákna (${database.waitingThreads}:count:).`,
    );
  }
  for (const disk of disks.filter((candidate) => candidate.mounted && candidate.totalBytes > 0)) {
    const freeShare = disk.freeBytes / disk.totalBytes;
    if (freeShare < DISK_ATTENTION_FREE_SHARE) {
      findings.push(
        $localize`:@@admin.logs.health.diskShort:Ve složce ${disk.path}:path: zbývá málo místa (${formatShare(freeShare)}:share:).`,
      );
    }
  }
  return findings;
}
