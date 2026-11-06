import { signal } from '@angular/core';
import type { StoredDraft } from '../../device/store/account-store';
import { DRAFT_KEEP_DELAY_MS, DRAFT_SHELF, type DraftCopy, type DraftShelf } from '../draft-shelf';
import { stableJson } from '../form-draft';

export class MemoryDraftShelf implements DraftShelf {
  private readonly opened = signal<ReadonlySet<DraftCopy>>(new Set(['administration', 'donor']));
  readonly stored = new Map<DraftCopy, Map<string, StoredDraft>>();
  readonly kept: StoredDraft[] = [];
  readonly dropped: string[] = [];

  private readonly accounts = signal<Readonly<Record<DraftCopy, string>>>({
    administration: 'administration-copy',
    donor: 'donor-copy',
  });

  holder(copy: DraftCopy): string | null {
    return this.opened().has(copy) ? this.accounts()[copy] : null;
  }

  switchAccount(copy: DraftCopy, holder: string): void {
    this.accounts.update((accounts) => ({ ...accounts, [copy]: holder }));
    this.stored.delete(copy);
  }

  setOpen(copy: DraftCopy, open: boolean): void {
    this.opened.update((copies) => {
      const next = new Set(copies);
      if (open) {
        next.add(copy);
      } else {
        next.delete(copy);
      }
      return next;
    });
  }

  seed(copy: DraftCopy, draft: StoredDraft): void {
    this.shelfOf(copy).set(draft.key, structuredClone(draft));
  }

  draftOf(copy: DraftCopy, key: string): StoredDraft | null {
    return this.stored.get(copy)?.get(key) ?? null;
  }

  async list(copy: DraftCopy, holder: string): Promise<readonly StoredDraft[]> {
    return this.holds(copy, holder) ? structuredClone([...this.shelfOf(copy).values()]) : [];
  }

  async keep(copy: DraftCopy, holder: string, draft: StoredDraft): Promise<boolean> {
    if (!this.holds(copy, holder)) {
      return false;
    }
    this.kept.push(structuredClone(draft));
    this.shelfOf(copy).set(draft.key, structuredClone(draft));
    return true;
  }

  async drop(copy: DraftCopy, holder: string, key: string): Promise<void> {
    if (this.holds(copy, holder)) {
      this.dropped.push(key);
      this.shelfOf(copy).delete(key);
    }
  }

  private holds(copy: DraftCopy, holder: string): boolean {
    return this.holder(copy) === holder;
  }

  private shelfOf(copy: DraftCopy): Map<string, StoredDraft> {
    let shelf = this.stored.get(copy);
    if (shelf === undefined) {
      shelf = new Map();
      this.stored.set(copy, shelf);
    }
    return shelf;
  }
}

export function memoryDraftShelfProviders(shelf: MemoryDraftShelf) {
  return [
    { provide: DRAFT_SHELF, useValue: shelf },
    { provide: DRAFT_KEEP_DELAY_MS, useValue: 0 },
  ];
}

export async function valuesBase(values: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(stableJson(values)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'));
  return `values:${hex.join('')}`;
}
