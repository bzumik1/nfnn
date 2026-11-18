import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';

@Component({
  selector: 'app-busy-label',
  templateUrl: './busy-label.html',
  styleUrl: './busy-label.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusyLabel {
  readonly busy = input.required<boolean>();
  private readonly delayMs = loadingDelayMs(inject(DOCUMENT));
  private readonly delayOver = linkedSignal({ source: this.busy, computation: () => false });
  protected readonly showsBusy = computed(
    () => this.busy() && (this.delayMs === 0 || this.delayOver()),
  );

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopTimer = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    effect(() => {
      stopTimer();
      if (this.busy() && this.delayMs > 0) {
        timer = setTimeout(() => this.delayOver.set(true), this.delayMs);
      }
    });
    inject(DestroyRef).onDestroy(stopTimer);
  }
}

function loadingDelayMs(document: Document): number {
  const token =
    document.defaultView
      ?.getComputedStyle(document.documentElement)
      .getPropertyValue('--delay-loading')
      .trim() ?? '';
  const value = Number.parseFloat(token);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return token.endsWith('ms') ? value : value * 1000;
}
