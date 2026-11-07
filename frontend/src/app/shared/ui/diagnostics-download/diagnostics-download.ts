/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth-store';
import { Diagnostics, PreparedDiagnostics } from '../../../core/diagnostics/diagnostics';
import type { DiagnosticSource } from '../../../core/diagnostics/diagnostics-schema';
import { LiveNotice, type Notice } from '../live-notice/live-notice';

const PREPARE_FAILED = $localize`:@@ui.diagnostics.failed:Soubor se nepodařilo připravit. Napište nám prosím i bez něj, v jakém prohlížeči a na které stránce potíže máte.`;
const READY_TO_SHARE = $localize`:@@ui.diagnostics.readyToShare:Soubor je připravený. Klepnutím na Sdílet diagnostický soubor ho pošlete e‑mailem na info@nfnn.cz.`;
const READY_TO_SHARE_UNDER_RECEIPT = $localize`:@@ui.diagnostics.readyToShareUnderReceipt:Soubor je připravený. Klepnutím na Sdílet diagnostický soubor ho pošlete e‑mailem.`;

function savedText(fileName: string, underReceipt: boolean): string {
  return underReceipt
    ? $localize`:@@ui.diagnostics.savedUnderReceipt:Soubor ${fileName}:fileName: je ve stažených souborech. Přiložte ho prosím k e‑mailu.`
    : $localize`:@@ui.diagnostics.saved:Soubor ${fileName}:fileName: je ve stažených souborech. Přiložte ho prosím k e‑mailu na info@nfnn.cz.`;
}

@Component({
  selector: 'app-diagnostics-download',
  imports: [LiveNotice],
  templateUrl: './diagnostics-download.html',
  styleUrl: './diagnostics-download.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagnosticsDownload {
  private readonly diagnostics = inject(Diagnostics);

  readonly source = input.required<DiagnosticSource>();

  protected readonly onSharedComputer = inject(AuthStore).storesNothing;
  protected readonly preparing = signal(false);
  protected readonly sharing = signal(false);
  protected readonly readyToShare = signal<PreparedDiagnostics | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = computed(() => this.preparing() || this.sharing());
  protected readonly underReceipt = computed(() => this.source() === 'receipt-pdf');

  press(): void {
    if (this.busy()) {
      return;
    }
    const prepared = this.readyToShare();
    if (prepared === null) {
      this.prepare();
    } else {
      this.share(prepared);
    }
  }

  private prepare(): void {
    this.preparing.set(true);
    this.notice.set(null);
    this.diagnostics.prepare(this.source()).then(
      (prepared) => {
        this.preparing.set(false);
        if (this.diagnostics.needsSecondTap(prepared)) {
          this.readyToShare.set(prepared);
          this.notice.set({
            kind: 'status',
            text: this.underReceipt() ? READY_TO_SHARE_UNDER_RECEIPT : READY_TO_SHARE,
          });
          return;
        }
        this.save(prepared);
      },
      () => {
        this.preparing.set(false);
        this.notice.set({ kind: 'alert', text: PREPARE_FAILED });
      },
    );
  }

  private share(prepared: PreparedDiagnostics): void {
    this.sharing.set(true);
    void this.diagnostics.share(prepared).then((outcome) => {
      this.sharing.set(false);
      if (outcome === 'dismissed') {
        return;
      }
      this.readyToShare.set(null);
      if (outcome === 'shared') {
        this.notice.set(null);
        return;
      }
      this.save(prepared);
    });
  }

  private save(prepared: PreparedDiagnostics): void {
    try {
      this.diagnostics.save(prepared);
      this.notice.set({ kind: 'status', text: savedText(prepared.fileName, this.underReceipt()) });
    } catch {
      this.notice.set({ kind: 'alert', text: PREPARE_FAILED });
    }
  }
}
