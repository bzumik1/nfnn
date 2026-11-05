import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { SignedOutNotice } from '../../core/auth/signed-out-notice';
import { ExternalNavigation } from '../../core/navigation/external-navigation';
import { ChunkLoadRecovery } from '../../core/reload/chunk-load-recovery';
import { ServerVersion } from '../../core/version/server-version';
import { DialogAnnouncer } from '../../shared/ui/dialog/dialog-announcer';
import { keepRoomForFloatingNotice } from '../../shared/ui/floating-notice/floating-notice-room';

@Component({
  selector: 'app-update-notice',
  templateUrl: './update-notice.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateNotice {
  private readonly version = inject(ServerVersion);
  private readonly recovery = inject(ChunkLoadRecovery);
  private readonly signedOut = inject(SignedOutNotice);
  private readonly navigation = inject(ExternalNavigation);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly dialogAnnouncer = inject(DialogAnnouncer);
  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');
  private readonly message = viewChild<ElementRef<HTMLElement>>('message');

  protected readonly shown = computed(
    () => this.version.mustUpdate() && this.recovery.failure() === null && !this.signedOut.shown(),
  );

  constructor() {
    afterRenderEffect((onCleanup) => {
      const bar = this.bar()?.nativeElement;
      if (bar) {
        onCleanup(keepRoomForFloatingNotice(this.document, bar));
      }
    });
    afterRenderEffect((onCleanup) => {
      const message = this.message()?.nativeElement.textContent?.replace(/\s+/g, ' ').trim();
      if (message && this.document.querySelector('dialog[open]')) {
        onCleanup(this.dialogAnnouncer.announce(message));
      }
    });
  }

  protected loadNewVersion(): void {
    this.navigation.loadFromServer(this.router.url);
  }
}
