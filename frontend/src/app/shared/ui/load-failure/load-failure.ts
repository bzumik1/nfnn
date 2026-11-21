import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { PageFocus } from '../../../core/navigation/page-focus';
import { BusyButton } from '../busy-button/busy-button';
import { BusyAnnouncement } from '../busy-label/busy-announcement';
import { BusyLabel } from '../busy-label/busy-label';
import { NeedsConnection } from '../needs-connection/needs-connection';
import { LOADING_TIMINGS } from '../skeleton/loading-view';

@Component({
  selector: 'app-load-failure',
  providers: [BusyAnnouncement],
  imports: [NeedsConnection, BusyButton, BusyLabel],
  templateUrl: './load-failure.html',
  styleUrl: './load-failure.scss',
  host: { class: 'load-failure' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadFailure {
  readonly retrying = input(false);
  readonly compact = input(false);
  readonly retry = output<void>();

  protected readonly busyAnnouncement = inject(BusyAnnouncement);
  private readonly holding = signal(false);
  protected readonly busy = computed(() => this.retrying() || this.holding());
  protected readonly failures = linkedSignal<boolean, number>({
    source: this.busy,
    computation: (busy, previous) =>
      previous === undefined ? 0 : previous.value + (previous.source && !busy ? 1 : 0),
  });

  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly environment = inject(EnvironmentInjector);
  private readonly pageFocus = inject(PageFocus);
  private readonly timings = inject(LOADING_TIMINGS);
  private readonly retryButton = viewChild.required<ElementRef<HTMLButtonElement>>('retryButton');
  private places: readonly HTMLElement[] = [];
  private holdTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const keepFocusOnPressedRetry = (event: Event) => {
      const button = this.retryButton().nativeElement;
      if (event.target instanceof Node && button.contains(event.target)) {
        this.pageFocus.keepOnPressed(button);
      }
    };
    this.host.addEventListener('click', keepFocusOnPressedRetry, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('click', keepFocusOnPressedRetry, { capture: true });
      clearTimeout(this.holdTimer);
      const places = this.places;
      if (places.length > 0) {
        afterNextRender(() => this.pageFocus.keepNear(places), {
          injector: this.environment,
        });
      }
    });
  }

  protected pressed(): void {
    const places: HTMLElement[] = [];
    for (let at = this.host.parentElement; at !== null; at = at.parentElement) {
      places.push(at);
    }
    this.places = places;
    this.holdBusy();
    this.retry.emit();
  }

  private holdBusy(): void {
    const timings = this.timings();
    if (timings === null) {
      return;
    }
    clearTimeout(this.holdTimer);
    this.holding.set(true);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = undefined;
      this.holding.set(false);
    }, timings.delayMs + timings.minimumMs);
  }
}
