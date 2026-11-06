import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth-store';
import { Diagnostics } from '../../../core/diagnostics/diagnostics';
import type { DiagnosticSource } from '../../../core/diagnostics/diagnostics-schema';
import { LiveNotice, type Notice } from '../live-notice/live-notice';

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
  protected readonly notice = signal<Notice | null>(null);

  download(): void {
    if (this.preparing()) {
      return;
    }
    this.preparing.set(true);
    this.notice.set(null);
    this.diagnostics.download(this.source()).then(
      () => this.preparing.set(false),
      () => {
        this.preparing.set(false);
        this.notice.set({
          kind: 'alert',
          text: $localize`:@@ui.diagnostics.failed:Soubor se nepodařilo připravit. Napište nám prosím i bez něj, v jakém prohlížeči a na které stránce potíže máte.`,
        });
      },
    );
  }
}
