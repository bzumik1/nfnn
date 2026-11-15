import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { keepRoomForFloatingNotice } from '../../../../shared/ui/floating-notice/floating-notice-room';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { DonorCopyLink } from '../../../donations/device-copy/donor-copy';

export const FIRST_SYNC_NOTICE_DELAY_MS = 1000;
export const STORED_NOTICE_MS = 4000;

type Shown = 'saving' | 'stored' | 'failed' | null;

@Component({
  selector: 'app-first-sync-notice',
  imports: [NeedsConnection],
  templateUrl: './first-sync-notice.html',
  styleUrl: './first-sync-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstSyncNotice {
  private readonly copy = inject(DonorCopyLink).copy;
  private readonly document = inject(DOCUMENT);
  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');
  private readonly saving = computed(() => {
    const copy = this.copy();
    return copy !== null && copy.keepsOnDevice() && copy.firstSync();
  });

  protected readonly shown = signal<Shown>(null);

  constructor() {
    afterRenderEffect((onCleanup) => {
      const bar = this.bar()?.nativeElement;
      if (bar) {
        onCleanup(keepRoomForFloatingNotice(this.document, bar));
      }
    });
    effect((onCleanup) => {
      if (this.saving()) {
        if (untracked(this.shown) === 'failed') {
          this.shown.set('saving');
          return;
        }
        const timer = setTimeout(() => this.shown.set('saving'), FIRST_SYNC_NOTICE_DELAY_MS);
        onCleanup(() => clearTimeout(timer));
        return;
      }
      const shown = untracked(this.shown);
      if (shown !== 'saving' && shown !== 'failed') {
        return;
      }
      const copy = untracked(this.copy);
      if (untracked(() => copy?.view() ?? null) === null) {
        this.shown.set(untracked(() => copy?.open() && copy.keepsOnDevice()) ? 'failed' : null);
        return;
      }
      this.shown.set('stored');
      const timer = setTimeout(() => this.shown.set(null), STORED_NOTICE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected retry(): void {
    void this.copy()?.sync();
  }
}
