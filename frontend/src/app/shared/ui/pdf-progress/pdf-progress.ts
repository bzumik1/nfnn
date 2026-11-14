import { Component, computed, effect, input, output, signal } from '@angular/core';

export type PdfProgressState =
  | { readonly kind: 'running'; readonly text: string }
  | {
      readonly kind: 'ready' | 'done' | 'cancelled';
      readonly text: string;
      readonly brief: string;
    };

export const PHASE_SHOWN_AFTER_MS = 300;
export const PDF_CANCEL_OFFERED_AFTER_MS = 8000;

@Component({
  selector: 'app-pdf-progress',
  templateUrl: './pdf-progress.html',
  styleUrl: './pdf-progress.scss',
  host: { class: 'pdf-progress', '[class.pdf-progress--compact]': 'compact()' },
})
export class PdfProgress {
  readonly progress = input<PdfProgressState | null>(null);
  readonly compact = input(false);
  readonly cancelled = output<void>();

  protected readonly shown = signal<PdfProgressState | null>(null);
  protected readonly slow = signal(false);
  private readonly running = computed(() => this.progress()?.kind === 'running');
  private readonly phase = computed(() => {
    const progress = this.progress();
    return progress?.kind === 'running' ? progress.text : null;
  });
  private readonly end = computed(() => {
    const progress = this.progress();
    return progress?.kind === 'running' ? undefined : progress;
  });

  constructor() {
    effect(() => {
      const end = this.end();
      if (end !== undefined) {
        this.shown.set(end);
      }
    });
    effect((onCleanup) => {
      const phase = this.phase();
      if (phase === null) {
        return;
      }
      const reveal = setTimeout(
        () => this.shown.set({ kind: 'running', text: phase }),
        PHASE_SHOWN_AFTER_MS,
      );
      onCleanup(() => clearTimeout(reveal));
    });
    effect((onCleanup) => {
      if (!this.running()) {
        return;
      }
      const offer = setTimeout(() => this.slow.set(true), PDF_CANCEL_OFFERED_AFTER_MS);
      onCleanup(() => {
        clearTimeout(offer);
        this.slow.set(false);
      });
    });
  }
}
