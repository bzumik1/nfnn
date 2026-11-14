/// <reference types="@angular/localize" />

import { Component, computed, input } from '@angular/core';

export type PdfButtonState = 'idle' | 'running' | 'ready' | 'failed';

const RETRY_LABEL = $localize`:@@ui.pdfButton.retry:Zkusit znovu`;

@Component({
  selector: 'app-pdf-button-face',
  templateUrl: './pdf-button-face.html',
  styleUrl: './pdf-button-face.scss',
  host: { class: 'pdf-button', '[class.pdf-button--failed]': "state() === 'failed'" },
})
export class PdfButtonFace {
  readonly state = input.required<PdfButtonState>();
  readonly downloadLabel = input.required<string>();
  readonly preparingLabel = input.required<string>();
  readonly openLabel = input.required<string>();

  private readonly labels = computed<Readonly<Record<PdfButtonState, string>>>(() => ({
    idle: this.downloadLabel(),
    running: this.preparingLabel(),
    ready: this.openLabel(),
    failed: RETRY_LABEL,
  }));

  protected readonly label = computed(() => this.labels()[this.state()]);
  protected readonly reserves = computed(() =>
    Object.entries(this.labels())
      .filter(([state]) => state !== this.state())
      .map(([, label]) => label),
  );
}
