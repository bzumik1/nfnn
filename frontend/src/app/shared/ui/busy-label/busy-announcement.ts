import { computed, Injectable, Signal, signal } from '@angular/core';

export interface AnnouncedBusyLabel {
  readonly showsBusy: Signal<boolean>;
  readonly busyText: () => string;
}

@Injectable()
export class BusyAnnouncement {
  private readonly labels = signal<readonly AnnouncedBusyLabel[]>([]);
  readonly text = computed(
    () =>
      this.labels()
        .find((label) => label.showsBusy())
        ?.busyText() ?? '',
  );

  add(label: AnnouncedBusyLabel): () => void {
    this.labels.update((labels) => [...labels, label]);
    return () => this.labels.update((labels) => labels.filter((other) => other !== label));
  }
}
