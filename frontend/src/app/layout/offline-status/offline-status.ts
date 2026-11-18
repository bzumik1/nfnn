/// <reference types="@angular/localize" />

import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { Connectivity } from '../../core/connectivity/connectivity';
import { formatDataTime } from '../../core/connectivity/data-time';
import { ShownAnswers } from '../../core/connectivity/shown-answers';
import { DialogAnnouncer } from '../../shared/ui/dialog/dialog-announcer';
import { keepRoomForOfflinePill } from './offline-pill-room';
import { OfflineSheet } from './offline-sheet';

@Component({
  selector: 'app-offline-status',
  imports: [OfflineSheet],
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
  protected readonly announcement = signal<string | null>(null);
  private readonly pill = viewChild<ElementRef<HTMLElement>>('pill');

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
        }
        wasOffline = offline;
      });
    });
    afterRenderEffect((onCleanup) => {
      const message = this.announcement();
      if (message && !this.sheetOpen() && this.document.querySelector('dialog[open]')) {
        onCleanup(this.dialogAnnouncer.announce(message));
      }
    });
    afterRenderEffect((onCleanup) => {
      const pill = this.pill()?.nativeElement;
      if (pill) {
        onCleanup(keepRoomForOfflinePill(this.document, pill));
      }
    });
  }

  protected openSheet(): void {
    this.sheetOpen.set(true);
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
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
