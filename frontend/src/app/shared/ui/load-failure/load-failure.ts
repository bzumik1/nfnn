import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  EnvironmentInjector,
  inject,
  input,
  output,
} from '@angular/core';

import { BusyButton } from '../busy-button/busy-button';
import { BusyLabel } from '../busy-label/busy-label';
import { NeedsConnection } from '../needs-connection/needs-connection';

const PAGE_HEADING = 'h1[tabindex="-1"]';
const FOCUS_TARGET = '[tabindex="-1"]';

@Component({
  selector: 'app-load-failure',
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

  private readonly document = inject(DOCUMENT);
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly environment = inject(EnvironmentInjector);
  private places: readonly HTMLElement[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      const places = this.places;
      if (places.length > 0) {
        afterNextRender(() => this.keepFocusNear(places), { injector: this.environment });
      }
    });
  }

  protected pressed(): void {
    const places: HTMLElement[] = [];
    for (let at = this.host.parentElement; at !== null; at = at.parentElement) {
      places.push(at);
    }
    this.places = places;
    this.retry.emit();
  }

  private keepFocusNear(places: readonly HTMLElement[]): void {
    const active = this.document.activeElement;
    if (active !== null && active !== this.document.body) {
      return;
    }
    for (const at of places.filter((place) => place.isConnected)) {
      const heading = at.querySelector<HTMLElement>(PAGE_HEADING);
      if (heading !== null) {
        heading.focus();
        return;
      }
      if (at.matches(FOCUS_TARGET)) {
        at.focus();
        return;
      }
    }
  }
}
