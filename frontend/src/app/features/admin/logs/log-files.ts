/// <reference types="@angular/localize" />

import { LogFileResponse } from '../admin-api';

export interface LogFileGroup {
  readonly series: string;
  readonly files: readonly LogFileResponse[];
}

export const LOG_FILES_PATH = '/sprava/logy/soubory';
export const LOG_FILE_PATH = '/sprava/logy/soubor';

export function logFileQuery(name: string): { nazev: string } {
  return { nazev: name };
}

const SERIES_NAME = /^(.+?\.log)(?:\.|$)/;
const SERIES_ORDER = ['backend.log', 'nginx-access.log', 'backup.log', 'mcp.log'];

export function logSeries(name: string): string {
  return SERIES_NAME.exec(name)?.[1] ?? name;
}

export function logSeriesLabel(series: string): string | null {
  switch (series) {
    case 'backend.log':
      return $localize`:@@admin.logs.series.backend:Aplikace`;
    case 'nginx-access.log':
      return $localize`:@@admin.logs.series.nginx:Požadavky na web`;
    case 'backup.log':
      return $localize`:@@admin.logs.series.backup:Zálohy`;
    case 'mcp.log':
      return $localize`:@@admin.logs.series.mcp:Konektor`;
    default:
      return null;
  }
}

export function currentLogFiles(files: readonly LogFileResponse[]): LogFileResponse[] {
  return files
    .filter((file) => isCurrent(file))
    .sort((left, right) => bySeries(left.name, right.name));
}

export function olderLogFileGroups(files: readonly LogFileResponse[]): LogFileGroup[] {
  const groups = new Map<string, LogFileResponse[]>();
  for (const file of files.filter((candidate) => !isCurrent(candidate))) {
    const series = logSeries(file.name);
    groups.set(series, [...(groups.get(series) ?? []), file]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => bySeries(left, right))
    .map(([series, members]) => ({ series, files: members.sort(newestFirst) }));
}

function isCurrent(file: LogFileResponse): boolean {
  return logSeries(file.name) === file.name;
}

function bySeries(left: string, right: string): number {
  return seriesRank(left) - seriesRank(right) || left.localeCompare(right);
}

function seriesRank(name: string): number {
  const rank = SERIES_ORDER.indexOf(logSeries(name));
  return rank === -1 ? SERIES_ORDER.length : rank;
}

function newestFirst(left: LogFileResponse, right: LogFileResponse): number {
  return (
    Date.parse(right.changedAt) - Date.parse(left.changedAt) || right.name.localeCompare(left.name)
  );
}
