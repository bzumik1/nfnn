/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { saveBlob } from '../../donations/file-download';

export const BACKUP_KEY_FILE_NAME = 'nfnn-klic-k-zaloham.txt';

export function backupKeyFile(key: string): string {
  return [
    $localize`:@@operations.backupKey.file.title:# Klíč k zálohám webu nfnn.cz (Nadační fond Nová naděje)`,
    $localize`:@@operations.backupKey.file.keep:# Bez tohoto klíče nejde žádnou zálohu obnovit. Uložte ho mimo server.`,
    $localize`:@@operations.backupKey.file.restore:# Obnova: v prvním nastavení nového serveru vyberte zálohu .dump.age a vložte klíč.`,
    $localize`:@@operations.backupKey.file.manual:# Ručně: age -d -i nfnn-klic-k-zaloham.txt zaloha.dump.age > zaloha.dump`,
    key,
    '',
  ].join('\n');
}

@Component({
  selector: 'app-backup-key-panel',
  imports: [CopyButton],
  templateUrl: './backup-key-panel.html',
  styleUrl: './backup-key-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupKeyPanel {
  readonly key = input.required<string>();

  protected readonly what = $localize`:@@operations.backupKey.copyWhat:klíč k zálohám`;

  protected download(): void {
    saveBlob({
      blob: new Blob([backupKeyFile(this.key())], { type: 'text/plain;charset=utf-8' }),
      fileName: BACKUP_KEY_FILE_NAME,
    });
  }
}
