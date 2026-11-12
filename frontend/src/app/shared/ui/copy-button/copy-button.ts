/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

const CONFIRMATION_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

@Component({
  selector: 'app-copy-button',
  templateUrl: './copy-button.html',
  styleUrl: './copy-button.scss',
  host: {
    '[class.has-failed]': "state() === 'failed'",
    '[class.is-start]': "align() === 'start'",
    '[class.is-on-dark]': "tone() === 'dark'",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyButton {
  readonly value = input.required<string>();
  readonly what = input.required<string>();
  readonly label = input<string | null>(null);
  readonly labelDetail = input<string | null>(null);
  readonly copiedStatus = input<string | null>(null);
  readonly failedStatus = input<string | null>(null);
  readonly align = input<'start' | 'end'>('end');
  readonly tone = input<'light' | 'dark'>('light');
  readonly copied = output<void>();

  protected readonly state = signal<CopyState>('idle');
  private reset: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.reset));
  }

  protected status(): string {
    switch (this.state()) {
      case 'copied':
        return this.copiedStatus() ?? $localize`:@@ui.copy.copied:Zkopírováno.`;
      case 'failed':
        return (
          this.failedStatus() ??
          $localize`:@@ui.copy.failed:Zkopírovat se nepodařilo, opište si údaj prosím ručně.`
        );
      default:
        return '';
    }
  }

  protected async copy(): Promise<void> {
    clearTimeout(this.reset);
    try {
      await navigator.clipboard.writeText(this.value());
      this.state.set('copied');
      this.copied.emit();
      this.reset = setTimeout(() => this.state.set('idle'), CONFIRMATION_MS);
    } catch {
      this.state.set('failed');
    }
  }
}
