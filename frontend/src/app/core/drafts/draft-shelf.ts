import { inject, InjectionToken } from '@angular/core';
import { AuthStore } from '../auth/auth-store';
import { userHandleOf } from '../auth/session-device';
import type { AccountStore, StoredDraft } from '../device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../device/store/device-vault';

export type DraftCopy = 'administration' | 'donor';

export interface DraftShelf {
  account(): string | null;
  holder(copy: DraftCopy, account: string): string | null;
  list(copy: DraftCopy, holder: string): Promise<readonly StoredDraft[]>;
  keep(copy: DraftCopy, holder: string, draft: StoredDraft): Promise<boolean>;
  drop(copy: DraftCopy, holder: string, key: string): Promise<void>;
}

export class VaultDraftShelf implements DraftShelf {
  constructor(
    private readonly vault: DeviceVault,
    private readonly signedIn: () => string | null,
  ) {}

  account(): string | null {
    return this.signedIn();
  }

  holder(copy: DraftCopy, account: string): string | null {
    const opened = this.openedCopy(copy);
    return opened !== null &&
      opened.account.userHandle === account &&
      this.signedIn() === account &&
      this.vault.stores(opened.store)
      ? opened.store.copyId
      : null;
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
    return this.openedCopy(copy)?.store ?? null;
  }

  private openedCopy(copy: DraftCopy): OpenedCopy | null {
    return copy === 'administration' ? this.vault.administration() : this.vault.opened();
  }
}

export const DRAFT_SHELF = new InjectionToken<DraftShelf>('DRAFT_SHELF', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(AuthStore);
    return new VaultDraftShelf(inject(DeviceVault), () => {
      const donor = auth.donor();
      return donor === null ? null : userHandleOf(donor.id);
    });
  },
});

export const DRAFT_KEEP_DELAY_MS = new InjectionToken<number>('DRAFT_KEEP_DELAY_MS', {
  providedIn: 'root',
  factory: () => 1_000,
});
