/// <reference types="@angular/localize" />

import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  inputBinding,
  outputBinding,
  signal,
  Type,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';

import { Connectivity } from '../../core/connectivity/connectivity';
import { formatDataTime } from '../../core/connectivity/data-time';
import { ShownAnswers } from '../../core/connectivity/shown-answers';
import { ChunkLoadRecovery } from '../../core/reload/chunk-load-recovery';
import { DialogAnnouncer } from '../../shared/ui/dialog/dialog-announcer';
import { keepRoomForOfflinePill } from './offline-pill-room';
import type { OfflineSheet } from './offline-sheet';

const loadSheet = (): Promise<Type<OfflineSheet>> =>
  import('./offline-sheet').then((loaded) => loaded.OfflineSheet);

function whenIdle(view: Window | null, run: () => void): void {
  if (view?.requestIdleCallback) {
    view.requestIdleCallback(run);
  } else {
    setTimeout(run);
  }
}

@Component({
  selector: 'app-offline-status',
  templateUrl: './offline-status.html',
  styleUrl: './offline-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineStatus {
  protected readonly connectivity = inject(Connectivity);
  private readonly shown = inject(ShownAnswers);
  private readonly document = inject(DOCUMENT);
  private readonly dialogAnnouncer = inject(DialogAnnouncer);
  private readonly chunkLoadRecovery = inject(ChunkLoadRecovery);

  protected readonly sheetOpen = signal(false);
  protected readonly announcement = signal<string | null>(null);
  private readonly pill = viewChild<ElementRef<HTMLElement>>('pill');
  private readonly sheetHost = viewChild.required('sheetHost', { read: ViewContainerRef });
  private readonly sheetView = signal<Type<OfflineSheet> | null>(null);
  private sheetLoading: Promise<Type<OfflineSheet>> | null = null;

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
    afterNextRender(() =>
      whenIdle(this.document.defaultView, () => this.fetchSheet().catch(() => undefined)),
    );
    effect(() => {
      const host = this.sheetHost();
      const view = this.sheetView();
      const open = this.sheetOpen();
      untracked(() => {
        host.clear();
        if (open && view !== null) {
          host.createComponent(view, {
            bindings: [
              inputBinding('dataTime', this.dataTime),
              outputBinding('closed', () => this.closeSheet()),
            ],
          });
        }
      });
    });
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
    if (this.sheetView() !== null) {
      this.sheetOpen.set(true);
      return;
    }
    this.fetchSheet().then(
      () => this.sheetOpen.set(true),
      (error: unknown) => this.chunkLoadRecovery.handleImportFailure(error),
    );
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
  }

  private fetchSheet(): Promise<Type<OfflineSheet>> {
    this.sheetLoading ??= loadSheet().then(
      (view) => {
        this.sheetView.set(view);
        return view;
      },
      (error: unknown) => {
        this.sheetLoading = null;
        throw error;
      },
    );
    return this.sheetLoading;
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
