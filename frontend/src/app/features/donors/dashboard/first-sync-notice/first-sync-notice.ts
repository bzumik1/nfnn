import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DonorCopyLink } from '../../../donations/device-copy/donor-copy';

export const FIRST_SYNC_NOTICE_DELAY_MS = 1000;
export const STORED_NOTICE_MS = 4000;

type Shown = 'saving' | 'stored' | null;

@Component({
  selector: 'app-first-sync-notice',
  templateUrl: './first-sync-notice.html',
  styleUrl: './first-sync-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstSyncNotice {
  private readonly copy = inject(DonorCopyLink).copy;
  private readonly saving = computed(() => {
    const copy = this.copy();
    return copy !== null && copy.keepsOnDevice() && copy.firstSync();
  });

  protected readonly shown = signal<Shown>(null);

  constructor() {
    effect((onCleanup) => {
      if (this.saving()) {
        const timer = setTimeout(() => this.shown.set('saving'), FIRST_SYNC_NOTICE_DELAY_MS);
        onCleanup(() => clearTimeout(timer));
        return;
      }
      if (untracked(this.shown) !== 'saving') {
        return;
      }
      if (untracked(() => this.copy()?.view() ?? null) === null) {
        this.shown.set(null);
        return;
      }
      this.shown.set('stored');
      const timer = setTimeout(() => this.shown.set(null), STORED_NOTICE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
