import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth-store';
import { Connectivity } from '../../../core/connectivity/connectivity';
import type { CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../core/device/store/device-vault';
import { AdministrationCopyDownload } from './administration-copy-download';
import {
  isVisitMark,
  markOf,
  visitChanges,
  type VisitChanges,
  type VisitMark,
} from './visit-changes';

export type VisitState =
  | { readonly kind: 'closed' | 'checking' | 'failed' | 'not-kept' | 'first' }
  | { readonly kind: 'ready'; readonly seenAt: string; readonly changes: VisitChanges };

interface Baseline {
  readonly copy: OpenedCopy;
  readonly mark: VisitMark | null;
}

const CLOSED: VisitState = { kind: 'closed' };
const CHECKING: VisitState = { kind: 'checking' };
const FAILED: VisitState = { kind: 'failed' };
const NOT_KEPT: VisitState = { kind: 'not-kept' };
const FIRST: VisitState = { kind: 'first' };

@Injectable({ providedIn: 'root' })
export class AdministrationVisit {
  private readonly vault = inject(DeviceVault);
  private readonly download = inject(AdministrationCopyDownload);
  private readonly connectivity = inject(Connectivity);
  private readonly auth = inject(AuthStore);
  private readonly failedFor = signal<OpenedCopy | null>(null);
  private readonly keptFor = signal<OpenedCopy | null>(null);
  private readonly dismissedFor = signal<OpenedCopy | null>(null);
  private baseline: Baseline | null = null;
  private markedFrom: CopyContents | null = null;

  private readonly compared = computed<VisitState>(() => {
    const opened = this.vault.administration();
    if (opened === null) {
      return CLOSED;
    }
    if (!this.vault.stores(opened.store)) {
      return NOT_KEPT;
    }
    const contents = opened.store.contents();
    const offline = this.connectivity.offline();
    if (contents === null || (this.download.checkedAt() === null && !offline)) {
      return this.failedFor() === opened || (contents === null && offline) ? FAILED : CHECKING;
    }
    const mark = this.baselineOf(opened, contents).mark;
    if (mark === null) {
      return FIRST;
    }
    return {
      kind: 'ready',
      seenAt: mark.at,
      changes: visitChanges(mark, contents, this.auth.donor()?.id ?? ''),
    };
  });

  readonly opened = computed(() => this.vault.administration());
  readonly dismissed = computed(() => {
    const opened = this.vault.administration();
    return opened !== null && this.dismissedFor() === opened;
  });

  readonly state = computed<VisitState>(() => {
    const state = this.compared();
    return (state.kind === 'ready' || state.kind === 'first') &&
      this.keptFor() !== this.vault.administration()
      ? CHECKING
      : state;
  });

  dismiss(): void {
    this.dismissedFor.set(this.vault.administration());
  }

  async check(): Promise<void> {
    const opened = this.vault.administration();
    if (opened === null) {
      return;
    }
    if (this.download.checkedAt() === null && !this.connectivity.offline()) {
      this.failedFor.set(null);
      const outcome = await this.download.refresh();
      if (this.vault.administration() !== opened) {
        return;
      }
      if (outcome !== 'stored' && outcome !== 'unchanged' && !this.connectivity.offline()) {
        this.failedFor.set(opened);
        return;
      }
    }
    try {
      await this.keepMark();
    } finally {
      if (this.vault.administration() === opened) {
        this.keptFor.set(opened);
      }
    }
  }

  async keepMark(): Promise<void> {
    const kind = this.compared().kind;
    const opened = this.vault.administration();
    if ((kind !== 'ready' && kind !== 'first') || opened === null) {
      return;
    }
    const store = opened.store;
    await this.vault.withCopyLock(store, async () => {
      const contents = store.contents();
      if (contents === null || contents === this.markedFrom) {
        return;
      }
      this.baselineOf(opened, contents);
      const stored = await this.vault.replaceContents(store, {
        ...contents,
        seen: markOf(contents, new Date().toISOString()),
      });
      this.markedFrom = stored ? store.contents() : null;
    });
  }

  private baselineOf(opened: OpenedCopy, contents: CopyContents): Baseline {
    if (this.baseline?.copy !== opened) {
      this.baseline = { copy: opened, mark: isVisitMark(contents.seen) ? contents.seen : null };
    }
    return this.baseline;
  }
}
