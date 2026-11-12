import type { RegistryEntry } from '../crypto/device-registry';
import type { DeviceStorage, StorageChange, StoredRecord } from './device-storage';

export class MemoryDeviceStorage implements DeviceStorage {
  readonly kind = 'memory';
  private salt: string | null = null;
  private readonly copies = new Map<string, RegistryEntry>();
  private readonly sessionKeys = new Map<string, CryptoKey>();
  private readonly copyRecords = new Map<string, readonly StoredRecord[]>();
  private readonly copyDrafts = new Map<string, Map<string, StoredRecord>>();

  async deviceSalt(): Promise<string | null> {
    return this.salt;
  }

  async entries(): Promise<readonly RegistryEntry[]> {
    return [...this.copies.values()].map((entry) => structuredClone(entry));
  }

  async sessionKey(copyId: string): Promise<CryptoKey | null> {
    return this.sessionKeys.get(copyId) ?? null;
  }

  async records(copyId: string): Promise<readonly StoredRecord[]> {
    return structuredClone(this.copyRecords.get(copyId) ?? []);
  }

  async drafts(copyId: string): Promise<readonly StoredRecord[]> {
    return structuredClone([...(this.copyDrafts.get(copyId)?.values() ?? [])]);
  }

  async write(change: StorageChange): Promise<void> {
    const entries = structuredClone(change.putEntries ?? []);
    const replacement =
      change.replaceRecords === undefined ? undefined : structuredClone(change.replaceRecords);
    if (replacement?.records.some((record) => record.copyId !== replacement.copyId)) {
      throw new RangeError('A replacement holds records of its own copy only');
    }
    const drafts = structuredClone(change.putDrafts ?? []);
    const deleted = new Set(change.deleteCopies ?? []);
    if (drafts.some((draft) => deleted.has(draft.copyId) || !this.holds(draft.copyId, entries))) {
      throw new RangeError('A draft belongs to a copy the registry holds');
    }
    if (change.deviceSalt !== undefined) {
      this.salt = change.deviceSalt;
    }
    for (const copyId of change.deleteCopies ?? []) {
      this.copies.delete(copyId);
      this.sessionKeys.delete(copyId);
      this.copyRecords.delete(copyId);
      this.copyDrafts.delete(copyId);
    }
    for (const entry of entries) {
      this.copies.set(entry.copyId, entry);
    }
    for (const copyId of change.deleteSessionKeys ?? []) {
      this.sessionKeys.delete(copyId);
    }
    for (const { copyId, key } of change.putSessionKeys ?? []) {
      this.sessionKeys.set(copyId, key);
    }
    if (replacement !== undefined) {
      this.copyRecords.set(replacement.copyId, replacement.records);
    }
    for (const { copyId, recordId } of change.deleteDrafts ?? []) {
      this.copyDrafts.get(copyId)?.delete(recordId);
    }
    for (const draft of drafts) {
      const shelf = this.copyDrafts.get(draft.copyId) ?? new Map<string, StoredRecord>();
      shelf.set(draft.recordId, draft);
      this.copyDrafts.set(draft.copyId, shelf);
    }
  }

  private holds(copyId: string, entries: readonly RegistryEntry[]): boolean {
    return this.copies.has(copyId) || entries.some((entry) => entry.copyId === copyId);
  }

  async destroy(): Promise<void> {
    this.salt = null;
    this.copies.clear();
    this.sessionKeys.clear();
    this.copyRecords.clear();
    this.copyDrafts.clear();
  }

  close(): void {
    return;
  }
}
