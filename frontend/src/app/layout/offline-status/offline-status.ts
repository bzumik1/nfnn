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
  Injector,
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

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const PULSE = 'motion-pulse';

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
  private readonly injector = inject(Injector);

  protected readonly sheetOpen = signal(false);
  protected readonly announcement = signal<string | null>(null);
  protected readonly pulsing = signal(false);
  private readonly pill = viewChild<ElementRef<HTMLElement>>('pill');
  private readonly sheetHost = viewChild.required('sheetHost', { read: ViewContainerRef });
  private readonly sheetView = signal<Type<OfflineSheet> | null>(null);
  private sheetLoading: Promise<Type<OfflineSheet>> | null = null;
  private pulseDelay: ReturnType<typeof setTimeout> | undefined;
  private oneBreathTaken = false;
  private endsAfterBreath = false;

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
          this.stopPulse(true);
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
      this.showSheet();
      return;
    }
    if (this.sheetLoading === null) {
      this.startPulse();
    }
    this.fetchSheet().then(
      () => {
        this.stopPulse(true);
        this.showSheet();
      },
      (error: unknown) => this.sheetFailedToLoad(error),
    );
  }

  protected breathTaken(event: AnimationEvent): void {
    if (event.animationName !== PULSE) {
      return;
    }
    this.oneBreathTaken = true;
    if (this.endsAfterBreath) {
      this.pulsing.set(false);
    }
  }

  protected pulseEnded(event: AnimationEvent): void {
    if (event.animationName === PULSE) {
      this.pulsing.set(false);
    }
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
  }

  private showSheet(): void {
    this.chunkLoadRecovery.importRecovered();
    this.sheetOpen.set(true);
  }

  private sheetFailedToLoad(error: unknown): void {
    this.stopPulse(false);
    if (this.connectivity.cause() === 'network') {
      this.announceAgain(this.offlineAnnouncement(false));
    } else {
      this.chunkLoadRecovery.handleImportFailure(error);
    }
  }

  private announceAgain(message: string): void {
    this.announcement.set(null);
    afterNextRender(
      () => {
        const view = this.document.defaultView;
        const nextFrame = view?.requestAnimationFrame?.bind(view) ?? setTimeout;
        nextFrame(() => this.announcement.set(message));
      },
      { injector: this.injector },
    );
  }

  private startPulse(): void {
    if (this.pulsing() || this.pulseDelay !== undefined || this.asksForLessMotion()) {
      return;
    }
    if (this.connectivity.cause() === 'network') {
      this.beginPulse();
      return;
    }
    this.pulseDelay = setTimeout(() => {
      this.pulseDelay = undefined;
      this.beginPulse();
    }, this.loadingDelayMs());
  }

  private beginPulse(): void {
    this.oneBreathTaken = false;
    this.endsAfterBreath = false;
    this.pulsing.set(true);
  }

  private stopPulse(atOnce: boolean): void {
    clearTimeout(this.pulseDelay);
    this.pulseDelay = undefined;
    if (!this.pulsing()) {
      return;
    }
    if (atOnce || this.oneBreathTaken) {
      this.pulsing.set(false);
    } else {
      this.endsAfterBreath = true;
    }
  }

  private asksForLessMotion(): boolean {
    return this.document.defaultView?.matchMedia?.(LESS_MOTION).matches ?? false;
  }

  private loadingDelayMs(): number {
    const token =
      this.document.defaultView
        ?.getComputedStyle(this.document.documentElement)
        .getPropertyValue('--delay-loading')
        .trim() ?? '';
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return token.endsWith('ms') ? value : value * 1000;
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
