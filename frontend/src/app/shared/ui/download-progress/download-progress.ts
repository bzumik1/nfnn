import { Component, computed, effect, input, output, signal } from '@angular/core';

export interface DownloadProgressState {
  readonly kind: 'running' | 'ready' | 'done';
  readonly step: number;
  readonly steps: number;
  readonly text: string;
}

export const CANCEL_OFFERED_AFTER_MS = 8000;

@Component({
  selector: 'app-download-progress',
  templateUrl: './download-progress.html',
  styleUrl: './download-progress.scss',
  host: { class: 'download-progress' },
})
export class DownloadProgress {
  readonly progress = input<DownloadProgressState | null>(null);
  readonly openLabel = input.required<string>();
  readonly cancelled = output<void>();
  readonly opened = output<void>();

  protected readonly slow = signal(false);
  private readonly running = computed(() => this.progress()?.kind === 'running');

  constructor() {
    effect((onCleanup) => {
      if (!this.running()) {
        return;
      }
      const offer = setTimeout(() => this.slow.set(true), CANCEL_OFFERED_AFTER_MS);
      onCleanup(() => {
        clearTimeout(offer);
        this.slow.set(false);
      });
    });
  }
}
