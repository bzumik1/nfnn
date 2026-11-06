import { inject, InjectionToken } from '@angular/core';
import type { AccountStore, StoredDraft } from '../device/store/account-store';
import { DeviceVault } from '../device/store/device-vault';

export type DraftCopy = 'administration' | 'donor';

export interface DraftShelf {
  open(copy: DraftCopy): boolean;
  list(copy: DraftCopy): Promise<readonly StoredDraft[]>;
  keep(copy: DraftCopy, draft: StoredDraft): Promise<boolean>;
  drop(copy: DraftCopy, key: string): Promise<void>;
}

export class VaultDraftShelf implements DraftShelf {
  constructor(private readonly vault: DeviceVault) {}

  open(copy: DraftCopy): boolean {
    const store = this.storeOf(copy);
    return store !== null && this.vault.stores(store);
  }

  async list(copy: DraftCopy): Promise<readonly StoredDraft[]> {
    const store = this.storeOf(copy);
    return store === null ? [] : this.vault.drafts(store);
  }

  async keep(copy: DraftCopy, draft: StoredDraft): Promise<boolean> {
    const store = this.storeOf(copy);
    return store === null ? false : this.vault.keepDraft(store, draft);
  }

  async drop(copy: DraftCopy, key: string): Promise<void> {
    const store = this.storeOf(copy);
    if (store !== null) {
      await this.vault.dropDraft(store, key);
    }
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
