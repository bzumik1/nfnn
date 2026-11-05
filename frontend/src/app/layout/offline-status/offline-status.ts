import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { Connectivity } from '../../core/connectivity/connectivity';
import { formatDataTime } from '../../core/connectivity/data-time';
import { ShownAnswers } from '../../core/connectivity/shown-answers';
import { Dialog } from '../../shared/ui/dialog/dialog';
import { DialogAnnouncer } from '../../shared/ui/dialog/dialog-announcer';

type TryOutcome = 'trying' | 'reached' | 'still-offline';

@Component({
  selector: 'app-offline-status',
  imports: [Dialog],
  templateUrl: './offline-status.html',
  styleUrl: './offline-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineStatus {
  protected readonly connectivity = inject(Connectivity);
  private readonly shown = inject(ShownAnswers);
  private readonly document = inject(DOCUMENT);
  private readonly dialogAnnouncer = inject(DialogAnnouncer);

  protected readonly sheetOpen = signal(false);
  protected readonly tryOutcome = signal<TryOutcome | null>(null);
  protected readonly announcement = signal<string | null>(null);

  protected readonly dataTime = computed(() => {
    const oldest = this.shown.oldest();
    return oldest === null ? null : formatDataTime(oldest, this.connectivity.serverNow());
  });

  protected readonly label = computed(() => {
    const time = this.dataTime();
    return time === null
      ? $localize`:@@layout.offline.label:Offline`
      : $localize`:@@layout.offline.labelWithTime:Offline · údaje z ${time}:time:`;
  });

  constructor() {
    let wasOffline = false;
    effect(() => {
      const offline = this.connectivity.offline();
      const cause = this.connectivity.cause();
      untracked(() => {
        if (offline) {
          this.announcement.set(this.offlineAnnouncement(cause === 'server'));
        } else if (wasOffline) {
          this.announcement.set($localize`:@@layout.offline.backOnline:Připojení je zpět.`);
          this.tryOutcome.set(this.sheetOpen() ? 'reached' : null);
        }
        wasOffline = offline;
      });
    });
    afterRenderEffect((onCleanup) => {
      const message = this.announcement();
      if (message && this.document.querySelector('dialog[open]')) {
        onCleanup(this.dialogAnnouncer.announce(message));
      }
    });
  }

  protected openSheet(): void {
    this.tryOutcome.set(null);
    this.sheetOpen.set(true);
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
  }

  protected tryAgain(): void {
    this.tryOutcome.set('trying');
    this.connectivity.tryAgain().subscribe((reached) => {
      if (!reached || this.connectivity.offline()) {
        this.tryOutcome.set('still-offline');
      } else {
        this.tryOutcome.set('reached');
      }
    });
  }

  private offlineAnnouncement(serverDown: boolean): string {
    const time = this.dataTime();
    if (serverDown) {
      return time === null
        ? $localize`:@@layout.offline.announceServer:Server fondu teď neodpovídá.`
        : $localize`:@@layout.offline.announceServerWithTime:Server fondu teď neodpovídá. Zobrazujeme údaje z ${time}:time:.`;
    }
    return time === null
      ? $localize`:@@layout.offline.announce:Jste offline.`
      : $localize`:@@layout.offline.announceWithTime:Jste offline. Zobrazujeme údaje z ${time}:time:.`;
  }
}
