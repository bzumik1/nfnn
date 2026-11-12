/// <reference types="@angular/localize" />

import { LogLevelName } from './log-lines';

export function levelLabel(level: LogLevelName | null): string {
  switch (level) {
    case 'ERROR':
      return $localize`:@@admin.logs.reader.level.error:Chyba`;
    case 'WARN':
      return $localize`:@@admin.logs.reader.level.warn:Varování`;
    case 'INFO':
      return $localize`:@@admin.logs.reader.level.info:Info`;
    case 'DEBUG':
      return $localize`:@@admin.logs.reader.level.debug:Ladění`;
    case 'TRACE':
      return $localize`:@@admin.logs.reader.level.trace:Trasování`;
    case null:
      return '';
  }
}
