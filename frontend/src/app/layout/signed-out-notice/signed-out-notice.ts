import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from '../../core/auth/auth-store';
import { SignedOutNotice as SignedOutNoticeState } from '../../core/auth/signed-out-notice';
import { ScrollHold } from '../../core/navigation/scroll-hold';
import { keepRoomForFloatingNotice } from '../../shared/ui/floating-notice/floating-notice-room';
import { LeavingNotice } from '../../shared/ui/leaving-notice/leaving-notice';

@Component({
  selector: 'app-signed-out-notice',
  imports: [LeavingNotice],
  templateUrl: './signed-out-notice.html',
  styleUrl: './signed-out-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignedOutNotice {
  protected readonly notice = inject(SignedOutNoticeState);
  protected readonly auth = inject(AuthStore);
  private readonly document = inject(DOCUMENT);
  private readonly scrollHold = inject(ScrollHold);
  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.notice.dismiss());
    effect(() => {
      if (this.auth.signedIn()) {
        this.notice.dismiss();
      }
    });
    afterRenderEffect((onCleanup) => {
      const bar = this.bar()?.nativeElement;
      if (bar) {
        onCleanup(keepRoomForFloatingNotice(this.document, bar, this.scrollHold));
      }
    });
  }

  protected close(): void {
    this.notice.dismiss();
    this.document.getElementById('obsah')?.focus({ preventScroll: true });
  }
}
