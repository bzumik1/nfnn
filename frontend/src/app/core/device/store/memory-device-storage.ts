import type { RegistryEntry } from '../crypto/device-registry';
import type { DeviceStorage, StorageChange, StoredRecord } from './device-storage';

export class MemoryDeviceStorage implements DeviceStorage {
  readonly kind = 'memory';
  private salt: string | null = null;
  private readonly copies = new Map<string, RegistryEntry>();
  private readonly sessionKeys = new Map<string, CryptoKey>();
  private readonly copyRecords = new Map<string, readonly StoredRecord[]>();

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

  async write(change: StorageChange): Promise<void> {
    const entries = structuredClone(change.putEntries ?? []);
    const replacement =
      change.replaceRecords === undefined ? undefined : structuredClone(change.replaceRecords);
    if (replacement?.records.some((record) => record.copyId !== replacement.copyId)) {
      throw new RangeError('A replacement holds records of its own copy only');
    }
    if (change.deviceSalt !== undefined) {
      this.salt = change.deviceSalt;
    }
    for (const copyId of change.deleteCopies ?? []) {
      this.copies.delete(copyId);
      this.sessionKeys.delete(copyId);
      this.copyRecords.delete(copyId);
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
  }

  async destroy(): Promise<void> {
    this.salt = null;
    this.copies.clear();
    this.sessionKeys.clear();
    this.copyRecords.clear();
  }

  close(): void {
    return;
  }
}
