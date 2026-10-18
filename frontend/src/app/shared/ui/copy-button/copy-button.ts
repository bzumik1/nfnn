/// <reference types="@angular/localize" />

import { Component, DestroyRef, inject, input, signal } from '@angular/core';

const CONFIRMATION_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

@Component({
  selector: 'app-copy-button',
  templateUrl: './copy-button.html',
  styleUrl: './copy-button.scss',
  host: { '[class.has-failed]': "state() === 'failed'" },
})
export class CopyButton {
  readonly value = input.required<string>();
  readonly what = input.required<string>();

  protected readonly state = signal<CopyState>('idle');
  private reset: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.reset));
  }

  protected status(): string {
    switch (this.state()) {
      case 'copied':
        return $localize`:@@ui.copy.copied:Zkopírováno.`;
      case 'failed':
        return $localize`:@@ui.copy.failed:Zkopírovat se nepodařilo, opište si údaj prosím ručně.`;
      default:
        return '';
    }
  }

  protected async copy(): Promise<void> {
    clearTimeout(this.reset);
    try {
      await navigator.clipboard.writeText(this.value());
      this.state.set('copied');
      this.reset = setTimeout(() => this.state.set('idle'), CONFIRMATION_MS);
    } catch {
      this.state.set('failed');
    }
  }
}
