import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';

import { BusyAnnouncement } from './busy-announcement';

@Component({
  selector: 'app-busy-label',
  templateUrl: './busy-label.html',
  styleUrl: './busy-label.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusyLabel {
  readonly busy = input(false);
  private readonly delayMs = loadingDelayMs(inject(DOCUMENT));
  private readonly delayOver = linkedSignal({ source: this.busy, computation: () => false });
  protected readonly showsBusy = computed(
    () => this.busy() && (this.delayMs === 0 || this.delayOver()),
  );
  private readonly busyFace = viewChild.required<ElementRef<HTMLElement>>('busyFace');
  private readonly announcement = inject(BusyAnnouncement, { optional: true });
  protected readonly namesByBusyLabel = this.announcement === null;

  constructor() {
    const host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
    const destroyRef = inject(DestroyRef);
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
    effect(() => {
      const button = host.closest('button');
      if (this.busy() && !this.namesByBusyLabel) {
        button?.setAttribute('aria-busy', 'true');
      } else {
        button?.removeAttribute('aria-busy');
      }
    });
    if (this.announcement !== null) {
      const remove = this.announcement.add({
        showsBusy: this.showsBusy,
        busyText: () => (this.busyFace().nativeElement.textContent ?? '').trim(),
      });
      destroyRef.onDestroy(remove);
    }
    destroyRef.onDestroy(() => {
      stopTimer();
      host.closest('button')?.removeAttribute('aria-busy');
    });
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
