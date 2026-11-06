import { inject, InjectionToken } from '@angular/core';
import type { AccountStore, StoredDraft } from '../device/store/account-store';
import { DeviceVault } from '../device/store/device-vault';

export type DraftCopy = 'administration' | 'donor';

export interface DraftShelf {
  holder(copy: DraftCopy): string | null;
  list(copy: DraftCopy, holder: string): Promise<readonly StoredDraft[]>;
  keep(copy: DraftCopy, holder: string, draft: StoredDraft): Promise<boolean>;
  drop(copy: DraftCopy, holder: string, key: string): Promise<void>;
}

export class VaultDraftShelf implements DraftShelf {
  constructor(private readonly vault: DeviceVault) {}

  holder(copy: DraftCopy): string | null {
    const store = this.storeOf(copy);
    return store !== null && this.vault.stores(store) ? store.copyId : null;
  }

  async list(copy: DraftCopy, holder: string): Promise<readonly StoredDraft[]> {
    const store = this.heldBy(copy, holder);
    return store === null ? [] : this.vault.drafts(store);
  }

  async keep(copy: DraftCopy, holder: string, draft: StoredDraft): Promise<boolean> {
    const store = this.heldBy(copy, holder);
    return store === null ? false : this.vault.keepDraft(store, draft);
  }

  async drop(copy: DraftCopy, holder: string, key: string): Promise<void> {
    const store = this.heldBy(copy, holder);
    if (store !== null) {
      await this.vault.dropDraft(store, key);
    }
  }

  private heldBy(copy: DraftCopy, holder: string): AccountStore | null {
    const store = this.storeOf(copy);
    return store !== null && store.copyId === holder ? store : null;
  }

  private storeOf(copy: DraftCopy): AccountStore | null {
    return (
      (copy === 'administration' ? this.vault.administration() : this.vault.opened())?.store ?? null
    );
  }
}

export const DRAFT_SHELF = new InjectionToken<DraftShelf>('DRAFT_SHELF', {
  providedIn: 'root',
  factory: () => new VaultDraftShelf(inject(DeviceVault)),
});

export const DRAFT_KEEP_DELAY_MS = new InjectionToken<number>('DRAFT_KEEP_DELAY_MS', {
  providedIn: 'root',
  factory: () => 1_000,
});
