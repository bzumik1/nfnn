/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CopyButton } from '../../../shared/ui/copy-button/copy-button';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { saveBlob } from '../../donations/file-download';
import { backupKeyWords } from './backup-key-words';
import { offerToPasswordManager } from './password-manager';

export const BACKUP_KEY_FILE_NAME = 'nfnn-klic-k-zaloham.txt';

const WORDS_PER_LINE = 12;

export const BACKUP_KEY_USERNAME = $localize`:@@operations.backupKey.passwordManager.username:Klíč k zálohám`;

function numberedWords(words: readonly string[], from: number): string {
  return words
    .slice(from, from + WORDS_PER_LINE)
    .map((word, index) => `${from + index + 1}. ${word}`)
    .join('  ');
}

export function backupKeyFile(key: string): string {
  const words = backupKeyWords(key);
  return [
    $localize`:@@operations.backupKey.file.title:# Klíč k zálohám webu nfnn.cz (Nadační fond Nová naděje)`,
    $localize`:@@operations.backupKey.file.keep:# Bez tohoto klíče nejde žádnou zálohu obnovit. Uložte ho mimo server.`,
    $localize`:@@operations.backupKey.file.restore:# Obnova: v prvním nastavení nového serveru vyberte zálohu .dump.age a vložte klíč.`,
    $localize`:@@operations.backupKey.file.manual:# Ručně: age -d -i nfnn-klic-k-zaloham.txt zaloha.dump.age > zaloha.dump`,
    $localize`:@@operations.backupKey.file.words:# Stejný klíč jako 24 slov (obnova je přijme místo klíče):`,
    `# ${numberedWords(words, 0)}`,
    `# ${numberedWords(words, WORDS_PER_LINE)}`,
    key,
    '',
  ].join('\n');
}

@Component({
  selector: 'app-backup-key-panel',
  imports: [CopyButton, LiveNotice],
  templateUrl: './backup-key-panel.html',
  styleUrl: './backup-key-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupKeyPanel {
  private readonly document = inject(DOCUMENT);

  readonly key = input.required<string>();

  protected readonly words = computed(() => backupKeyWords(this.key()));
  protected readonly what = $localize`:@@operations.backupKey.copyWhat:klíč k zálohám`;
  protected readonly notice = signal<Notice | null>(null);

  protected download(): void {
    saveBlob({
      blob: new Blob([backupKeyFile(this.key())], { type: 'text/plain;charset=utf-8' }),
      fileName: BACKUP_KEY_FILE_NAME,
    });
  }

  protected saveToPasswordManager(): void {
    this.notice.set({
      kind: 'status',
      text: $localize`:@@operations.backupKey.passwordManager.offered:Pokud prohlížeč nabídl uložení, potvrďte ho. Když se nic neukázalo, klíč zkopírujte a vložte do správce hesel sami.`,
    });
    offerToPasswordManager(this.document, BACKUP_KEY_USERNAME, this.key()).catch(() =>
      this.notice.set({
        kind: 'alert',
        text: $localize`:@@operations.backupKey.passwordManager.failed:Prohlížeč uložení do správce hesel nenabídl. Klíč prosím zkopírujte a vložte do správce hesel sami.`,
      }),
    );
  }
}
