import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import type { DeviceAccount, SessionDevice, SignInSecret } from '../../auth/session-device';
import { TAB_LOCKS } from '../../auth/session-tabs';
import { ErrorReporter } from '../../errors/error-reporter';
import {
  CopyRefused,
  generateSessionKey,
  type KeyWrap,
  OpenCopy,
  openWithPassword,
  openWithPrf,
  openWithSessionKey,
} from '../crypto/copy-keys';
import {
  lookupTag,
  newDeviceSalt,
  type RegistryEntry,
  userHandleTag,
} from '../crypto/device-registry';
import {
  type PasswordKeyDerivation,
  PasswordKeyFailure,
  WorkerPasswordKeyDerivation,
} from '../crypto/password-key';
import { prfInput, type PrfReading } from '../crypto/prf';
import { AccountStore, type CopyContents } from './account-store';
import type { DeviceStorage, StorageChange } from './device-storage';
import { idbDeviceStoragePresent, openIdbDeviceStorage } from './idb-device-storage';
import { MemoryDeviceStorage } from './memory-device-storage';

export const DONOR_FEED = 'donor';
export const VAULT_LOCK_NAME = 'nfnn.device-vault';
export const COPY_CHANNEL_PREFIX = 'nfnn.device-copy.';
export const COPY_LOCK_PREFIX = 'nfnn.device-copy-write.';
export const DEVICE_COPY_MARKER_KEY = 'nfnn.device-copy';
export const COPY_MESSAGE_VERSION = 1;

export type DeviceStorageOpener = () => Promise<DeviceStorage>;
export type CopyChannel = Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'close'>;
export type CopyChannelFactory = (name: string) => CopyChannel | null;

export const DEVICE_STORAGE_OPENER = new InjectionToken<DeviceStorageOpener>(
  'DEVICE_STORAGE_OPENER',
  { providedIn: 'root', factory: () => () => openIdbDeviceStorage() },
);

export const DEVICE_STORAGE_PRESENT = new InjectionToken<() => Promise<boolean>>(
  'DEVICE_STORAGE_PRESENT',
  { providedIn: 'root', factory: () => idbDeviceStoragePresent },
);

export const PASSWORD_KEY_DERIVATION = new InjectionToken<PasswordKeyDerivation>(
  'PASSWORD_KEY_DERIVATION',
  { providedIn: 'root', factory: () => new WorkerPasswordKeyDerivation() },
);

export const COPY_CHANNELS = new InjectionToken<CopyChannelFactory>('COPY_CHANNELS', {
  providedIn: 'root',
  factory: () => (name) =>
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name),
});

export const STORAGE_PERSISTENCE = new InjectionToken<() => void>('STORAGE_PERSISTENCE', {
  providedIn: 'root',
  factory: () => () => {
    if (typeof navigator === 'undefined' || /firefox\//i.test(navigator.userAgent)) {
      return;
    }
    void navigator.storage?.persist?.().catch(() => undefined);
  },
});

export type OpenReason = 'sign-in' | 'restored' | 'empty';

export interface OpenedCopy {
  readonly store: AccountStore;
  readonly reason: OpenReason;
  readonly account: DeviceAccount;
}

export type VaultMode = 'stored' | 'memory';

interface CopyMessage {
  readonly kind: 'replaced' | 'deleted';
  readonly version: typeof COPY_MESSAGE_VERSION;
}

interface Opening {
  readonly copy: OpenCopy;
  readonly by: 'session' | 'password' | 'prf';
}

@Injectable({ providedIn: 'root' })
export class DeviceVault implements SessionDevice {
  private readonly openStorage = inject(DEVICE_STORAGE_OPENER);
  private readonly storagePresent = inject(DEVICE_STORAGE_PRESENT);
  private readonly derivation = inject(PASSWORD_KEY_DERIVATION);
  private readonly channels = inject(COPY_CHANNELS);
  private readonly persist = inject(STORAGE_PERSISTENCE);
  private readonly locks = inject(TAB_LOCKS);
  private readonly reporter = inject(ErrorReporter);
  private readonly openedCopy = signal<OpenedCopy | null>(null);
  private readonly currentMode = signal<VaultMode | null>(null);
  private readonly lockedCopy = signal(false);
  private sharedStorage: Promise<DeviceStorage> | null = null;
  private memoryOnly: MemoryDeviceStorage | null = null;
  private activeStorage: DeviceStorage | null = null;
  private channel: CopyChannel | null = null;
  private account: DeviceAccount | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private persistAsked = false;
  private pendingSalt: string | null = null;
  private readonly copies = new WeakMap<AccountStore, OpenCopy>();

  readonly opened = this.openedCopy.asReadonly();
  readonly mode = this.currentMode.asReadonly();
  readonly locked = this.lockedCopy.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.closeOpen());
  }

  prfInput(): Promise<Uint8Array<ArrayBuffer> | null> {
    return this.run(async () => {
      try {
        const storage = await this.presentStorage();
        const stored = storage === null ? null : await storage.deviceSalt();
        return await prfInput(stored ?? (this.pendingSalt ??= newDeviceSalt()));
      } catch {
        return null;
      }
    });
  }

  signedIn(account: DeviceAccount, secret: SignInSecret, storeNothing = false): Promise<void> {
    return this.run(async () => {
      try {
        await this.withMemoryFallback(() => this.openAtSignIn(account, secret, storeNothing));
      } finally {
        zeroed(secret);
      }
    });
  }

  restored(account: DeviceAccount): Promise<void> {
    return this.run(() => this.withMemoryFallback(() => this.openAtRestore(account)));
  }

  signedOut(account: DeviceAccount): Promise<void> {
    return this.run(async () => {
      const storage = await this.storageOf(account);
      this.closeOpen();
      await this.endSessions(storage);
    });
  }

  sessionLost(): Promise<void> {
    return this.run(async () => {
      this.closeOpen();
      await this.endSessions(await this.presentStorage().catch(() => null));
    });
  }

  signedOutElsewhere(): void {
    void this.run(async () => this.closeOpen());
  }

  forget(account: DeviceAccount): Promise<void> {
    return this.run(async () => {
      const storage = await this.storageOf(account);
      this.pendingSalt = null;
      const salt = storage === null ? null : await storage.deviceSalt();
      if (storage === null || salt === null) {
        this.closeOpen();
        return;
      }
      const tags = await accountTags(salt, account);
      const entries = await storage.entries();
      const forgotten = entries.filter(
        (entry) => isDonor(entry) && entry.userHandleTag === tags.userHandleTag,
      );
      const remaining = entries.length - forgotten.length;
      await storage.write({
        deleteCopies: forgotten.map((entry) => entry.copyId),
        ...(remaining === 0 ? { deviceSalt: null } : {}),
      });
      this.closeOpen();
      for (const entry of forgotten) {
        this.announce(entry.copyId, 'deleted');
      }
      await this.afterRemoval(storage);
    });
  }

  passwordChanged(account: DeviceAccount, password: string): Promise<void> {
    return this.run(async () => {
      const opened = this.openedFor(account);
      if (opened === null || this.activeStorage === null) {
        return;
      }
      await this.rewrapWithPassword(this.activeStorage, opened.store, password);
    });
  }

  passwordRemoved(account: DeviceAccount): Promise<void> {
    return this.run(async () => {
      const storage = this.openedFor(account) === null ? null : this.activeStorage;
      const entry = storage === null ? null : await this.entryOf(storage, account);
      if (storage === null || entry === null) {
        return;
      }
      await storage.write({
        putEntries: [{ ...entry, wraps: entry.wraps.filter((wrap) => wrap.kind !== 'password') }],
      });
    });
  }

  passkeyAdded(account: DeviceAccount, reading: PrfReading): Promise<void> {
    return this.run(async () => {
      try {
        const opened = this.openedFor(account);
        const storage = this.activeStorage;
        if (opened === null || storage === null) {
          return;
        }
        const entry = await this.entryOf(storage, account);
        if (entry === null || entry.copyId !== opened.store.copyId) {
          return;
        }
        const copy = this.copyOf(opened.store);
        const wrap = await copy.wrapWithPrf(reading.credentialId, reading.output);
        await storage.write({
          putEntries: [
            { ...entry, wraps: [...withoutPrfOf(entry.wraps, reading.credentialId), wrap] },
          ],
        });
      } finally {
        reading.output.fill(0);
      }
    });
  }

  replaceContents(store: AccountStore, contents: CopyContents): Promise<boolean> {
    return this.run(async () => {
      const storage = this.activeStorage;
      if (this.openedCopy()?.store !== store || storage === null) {
        return false;
      }
      const entries = await storage.entries();
      if (!entries.some((entry) => entry.copyId === store.copyId)) {
        return false;
      }
      await store.replace(contents);
      this.channel?.postMessage(copyMessage('replaced'));
      return true;
    });
  }

  withCopyLock<T>(store: AccountStore, work: () => Promise<T>): Promise<T> {
    const locks = this.locks;
    if (locks === null) {
      return work();
    }
    return locks.request(`${COPY_LOCK_PREFIX}${store.copyId}`, work) as Promise<T>;
  }

  private async openAtSignIn(
    account: DeviceAccount,
    secret: SignInSecret,
    storeNothing: boolean,
  ): Promise<void> {
    this.closeOpen();
    const storage = await this.storageFor(storeNothing);
    const salt = await this.saltOf(storage);
    const tags = await accountTags(salt, account);
    const entries = await storage.entries();
    const entry = entryFor(entries, tags);
    const opening = entry === null ? null : await this.openExisting(storage, entry, secret);
    if (entry !== null && opening === null && !refusedBy(entry.wraps, secret)) {
      await this.committed(storage, withoutSessions(entries));
      this.lockedCopy.set(true);
      return;
    }
    const others = entries.filter((candidate) => candidate.copyId !== entry?.copyId);
    const copy = opening?.copy ?? (await OpenCopy.create());
    const kept = opening === null ? [] : entry!.wraps.filter((wrap) => wrap.kind !== 'session');
    const sessionKey = await generateSessionKey();
    const wraps: KeyWrap[] = [...kept, await copy.wrapWithSessionKey(sessionKey)];
    if (secret.kind === 'prf') {
      wraps.splice(0, wraps.length, ...withoutPrfOf(wraps, secret.reading.credentialId));
      wraps.push(await copy.wrapWithPrf(secret.reading.credentialId, secret.reading.output));
    }
    await this.committed(
      storage,
      joined(withoutSessions(others), {
        deleteCopies: entry !== null && opening === null ? [entry.copyId] : [],
        putEntries: [{ copyId: copy.copyId, kind: 'donor', ...tags, wraps }],
        putSessionKeys: [{ copyId: copy.copyId, key: sessionKey }],
      }),
    );
    const store = await this.adopt(storage, account, copy);
    const load = await store.load();
    this.openedCopy.set({ store, reason: load === 'loaded' ? 'sign-in' : 'empty', account });
    if (secret.kind === 'password' && opening?.by !== 'password') {
      await this.rewrapWithPassword(storage, store, secret.password);
    }
  }

  private async openAtRestore(account: DeviceAccount): Promise<void> {
    if (this.openedFor(account) !== null) {
      return;
    }
    this.closeOpen();
    const storage = await this.storageFor(false);
    const entries = await storage.entries();
    const salt = await this.saltOf(storage);
    const tags = await accountTags(salt, account);
    const entry = entryFor(entries, tags);
    const opening =
      entry === null ? null : await this.openExisting(storage, entry, { kind: 'none' });
    const others = entries.filter((candidate) => candidate.copyId !== entry?.copyId);
    if (opening !== null) {
      await this.committed(
        storage,
        joined(withoutSessions(others), {
          putEntries: entry!.lookupTag === tags.lookupTag ? [] : [{ ...entry!, ...tags }],
        }),
      );
      const store = await this.adopt(storage, account, opening.copy);
      const load = await store.load();
      this.openedCopy.set({ store, reason: load === 'loaded' ? 'restored' : 'empty', account });
      return;
    }
    if (entry !== null) {
      await this.committed(storage, withoutSessions(entries));
      this.lockedCopy.set(true);
      return;
    }
    if (entries.length === 0 && storage.kind === 'indexed-db' && hadStoredCopy()) {
      this.reporter.report('device-store-evicted', 'global');
    }
    const copy = await OpenCopy.create();
    const sessionKey = await generateSessionKey();
    await this.committed(
      storage,
      joined(withoutSessions(others), {
        putEntries: [
          {
            copyId: copy.copyId,
            kind: 'donor',
            ...tags,
            wraps: [await copy.wrapWithSessionKey(sessionKey)],
          },
        ],
        putSessionKeys: [{ copyId: copy.copyId, key: sessionKey }],
      }),
    );
    const store = await this.adopt(storage, account, copy);
    this.openedCopy.set({ store, reason: 'empty', account });
  }

  private async openExisting(
    storage: DeviceStorage,
    entry: RegistryEntry,
    secret: SignInSecret,
  ): Promise<Opening | null> {
    const sessionWrap = entry.wraps.find((wrap) => wrap.kind === 'session');
    const sessionKey = sessionWrap === undefined ? null : await storage.sessionKey(entry.copyId);
    if (sessionWrap !== undefined && sessionKey !== null) {
      const copy = await refusedAsNull(openWithSessionKey(entry, sessionWrap, sessionKey));
      if (copy !== null) {
        return { copy, by: 'session' };
      }
    }
    if (secret.kind === 'password') {
      const passwordWrap = entry.wraps.find((wrap) => wrap.kind === 'password');
      if (passwordWrap !== undefined) {
        const copy = await refusedAsNull(
          openWithPassword(entry, passwordWrap, secret.password, this.derivation),
        );
        if (copy !== null) {
          return { copy, by: 'password' };
        }
      }
    }
    if (secret.kind === 'prf') {
      const prfWrap = entry.wraps.find(
        (wrap) => wrap.kind === 'prf' && wrap.credentialId === secret.reading.credentialId,
      );
      if (prfWrap !== undefined) {
        const copy = await refusedAsNull(openWithPrf(entry, prfWrap, secret.reading.output));
        if (copy !== null) {
          return { copy, by: 'prf' };
        }
      }
    }
    return null;
  }

  private async rewrapWithPassword(
    storage: DeviceStorage,
    store: AccountStore,
    password: string,
  ): Promise<void> {
    const copy = this.copyOf(store);
    let wrap: KeyWrap;
    try {
      wrap = await copy.wrapWithPassword(password, this.derivation);
    } catch (failure: unknown) {
      if (failure instanceof PasswordKeyFailure || failure instanceof CopyRefused) {
        return;
      }
      throw failure;
    }
    const entry = (await storage.entries()).find((candidate) => candidate.copyId === copy.copyId);
    if (entry === undefined) {
      return;
    }
    await storage.write({
      putEntries: [
        { ...entry, wraps: [...entry.wraps.filter((kept) => kept.kind !== 'password'), wrap] },
      ],
    });
  }

  private async adopt(
    storage: DeviceStorage,
    account: DeviceAccount,
    copy: OpenCopy,
  ): Promise<AccountStore> {
    const store = new AccountStore(copy, storage, DONOR_FEED);
    this.account = account;
    this.activeStorage = storage;
    this.copies.set(store, copy);
    this.listen(store);
    if (storage.kind === 'indexed-db') {
      markStoredCopy(true);
      if (!this.persistAsked) {
        this.persistAsked = true;
        this.persist();
      }
    }
    return store;
  }

  private copyOf(store: AccountStore): OpenCopy {
    const copy = this.copies.get(store);
    if (copy === undefined) {
      throw new CopyRefused('closed');
    }
    return copy;
  }

  private listen(store: AccountStore): void {
    const channel = this.channels(`${COPY_CHANNEL_PREFIX}${store.copyId}`);
    this.channel = channel;
    channel?.addEventListener('message', (event: Event) => {
      const message = (event as MessageEvent<unknown>).data as Partial<CopyMessage> | null;
      if (this.openedCopy()?.store !== store || message?.version !== COPY_MESSAGE_VERSION) {
        return;
      }
      if (message.kind === 'replaced') {
        void store.load().catch(() => undefined);
      } else if (message.kind === 'deleted') {
        void this.run(async () => {
          if (this.openedCopy()?.store === store) {
            this.closeOpen();
          }
        });
      }
    });
  }

  private announce(copyId: string, kind: CopyMessage['kind']): void {
    const opened = this.openedCopy();
    if (opened !== null && opened.store.copyId === copyId && this.channel !== null) {
      this.channel.postMessage(copyMessage(kind));
      return;
    }
    const channel = this.channels(`${COPY_CHANNEL_PREFIX}${copyId}`);
    channel?.postMessage(copyMessage(kind));
    channel?.close();
  }

  private openedFor(account: DeviceAccount): OpenedCopy | null {
    const opened = this.openedCopy();
    return opened !== null && this.account?.userHandle === account.userHandle ? opened : null;
  }

  private closeOpen(): void {
    const opened = this.openedCopy();
    this.openedCopy.set(null);
    this.lockedCopy.set(false);
    opened?.store.close();
    this.channel?.close();
    this.channel = null;
    this.account = null;
    if (this.activeStorage === this.memoryOnly) {
      this.memoryOnly = null;
      this.currentMode.set(this.sharedStorage === null ? null : 'stored');
    }
    this.activeStorage = null;
  }

  private async afterRemoval(storage: DeviceStorage): Promise<void> {
    if (storage.kind !== 'indexed-db' || (await storage.entries()).length > 0) {
      return;
    }
    markStoredCopy(false);
    this.sharedStorage = null;
    await storage.destroy().catch(() => undefined);
  }

  private async storageOf(account: DeviceAccount): Promise<DeviceStorage | null> {
    if (this.openedFor(account) !== null && this.activeStorage !== null) {
      return this.activeStorage;
    }
    try {
      return await this.presentStorage();
    } catch {
      return null;
    }
  }

  private async presentStorage(): Promise<DeviceStorage | null> {
    if (this.sharedStorage === null && !(await this.storagePresent())) {
      return null;
    }
    return this.storageFor(false);
  }

  private async endSessions(storage: DeviceStorage | null): Promise<void> {
    if (storage === null) {
      return;
    }
    const change = withoutSessions(await storage.entries());
    if ((change.putEntries ?? []).length === 0 && (change.deleteCopies ?? []).length === 0) {
      return;
    }
    await this.committed(storage, change);
    await this.afterRemoval(storage);
  }

  private async committed(storage: DeviceStorage, change: StorageChange): Promise<void> {
    await storage.write(change);
    for (const copyId of change.deleteCopies ?? []) {
      this.announce(copyId, 'deleted');
    }
  }

  private async withMemoryFallback(open: () => Promise<void>): Promise<void> {
    try {
      await open();
    } catch (failure: unknown) {
      const storage = this.activeStorage ?? (await this.sharedStorage?.catch(() => null));
      this.closeOpen();
      if (storage?.kind !== 'indexed-db') {
        throw failure;
      }
      await this.endSessions(storage).catch(() => undefined);
      this.reporter.report('device-store-open', 'global', failure);
      this.sharedStorage = Promise.resolve(new MemoryDeviceStorage());
      await open();
    }
  }

  private async storageFor(storeNothing: boolean): Promise<DeviceStorage> {
    if (storeNothing) {
      this.memoryOnly = new MemoryDeviceStorage();
      this.currentMode.set('memory');
      return this.memoryOnly;
    }
    if (this.sharedStorage === null) {
      this.sharedStorage = this.openStorage().catch((failure: unknown) => {
        this.reporter.report('device-store-open', 'global', failure);
        return new MemoryDeviceStorage();
      });
    }
    const storage = await this.sharedStorage;
    this.currentMode.set(storage.kind === 'indexed-db' ? 'stored' : 'memory');
    return storage;
  }

  private async saltOf(storage: DeviceStorage): Promise<string> {
    const stored = await storage.deviceSalt();
    if (stored !== null) {
      return stored;
    }
    const salt = this.pendingSalt ?? newDeviceSalt();
    await storage.write({ deviceSalt: salt });
    this.pendingSalt = null;
    return salt;
  }

  private async entryOf(
    storage: DeviceStorage,
    account: DeviceAccount,
  ): Promise<RegistryEntry | null> {
    const salt = await storage.deviceSalt();
    return salt === null
      ? null
      : entryFor(await storage.entries(), await accountTags(salt, account));
  }

  private run<T>(work: () => Promise<T>): Promise<T> {
    const locked = () => {
      const locks = this.locks;
      return locks === null ? work() : (locks.request(VAULT_LOCK_NAME, work) as Promise<T>);
    };
    const next = this.queue.then(locked, locked);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

interface AccountTags {
  readonly lookupTag: string;
  readonly userHandleTag: string;
}

async function accountTags(salt: string, account: DeviceAccount): Promise<AccountTags> {
  return {
    lookupTag: await lookupTag(salt, account.email),
    userHandleTag: await userHandleTag(salt, account.userHandle),
  };
}

function entryFor(entries: readonly RegistryEntry[], tags: AccountTags): RegistryEntry | null {
  return (
    entries.find((entry) => isDonor(entry) && entry.userHandleTag === tags.userHandleTag) ?? null
  );
}

function withoutSessions(entries: readonly RegistryEntry[]): StorageChange {
  const withSession = entries.filter((entry) =>
    entry.wraps.some((wrap) => wrap.kind === 'session'),
  );
  const kept = withSession
    .map((entry) => ({ ...entry, wraps: entry.wraps.filter((wrap) => wrap.kind !== 'session') }))
    .filter((entry) => entry.wraps.length > 0);
  return {
    deleteCopies: withSession
      .filter((entry) => !kept.some((candidate) => candidate.copyId === entry.copyId))
      .map((entry) => entry.copyId),
    putEntries: kept,
    deleteSessionKeys: kept.map((entry) => entry.copyId),
  };
}

function joined(first: StorageChange, second: StorageChange): StorageChange {
  return {
    deleteCopies: [...(first.deleteCopies ?? []), ...(second.deleteCopies ?? [])],
    putEntries: [...(first.putEntries ?? []), ...(second.putEntries ?? [])],
    putSessionKeys: [...(first.putSessionKeys ?? []), ...(second.putSessionKeys ?? [])],
    deleteSessionKeys: [...(first.deleteSessionKeys ?? []), ...(second.deleteSessionKeys ?? [])],
  };
}

function isDonor(entry: RegistryEntry): boolean {
  return entry.kind === 'donor';
}

function refusedBy(wraps: readonly KeyWrap[], secret: SignInSecret): boolean {
  switch (secret.kind) {
    case 'password':
      return wraps.some((wrap) => wrap.kind === 'password');
    case 'prf':
      return wraps.some(
        (wrap) => wrap.kind === 'prf' && wrap.credentialId === secret.reading.credentialId,
      );
    case 'none':
      return false;
  }
}

function withoutPrfOf(wraps: readonly KeyWrap[], credentialId: string): KeyWrap[] {
  return wraps.filter((wrap) => wrap.kind !== 'prf' || wrap.credentialId !== credentialId);
}

function zeroed(secret: SignInSecret): void {
  if (secret.kind === 'prf') {
    secret.reading.output.fill(0);
  }
}

async function refusedAsNull(opening: Promise<OpenCopy>): Promise<OpenCopy | null> {
  try {
    return await opening;
  } catch (failure: unknown) {
    if (failure instanceof CopyRefused || failure instanceof PasswordKeyFailure) {
      return null;
    }
    throw failure;
  }
}

function copyMessage(kind: CopyMessage['kind']): CopyMessage {
  return { kind, version: COPY_MESSAGE_VERSION };
}

function hadStoredCopy(): boolean {
  try {
    return localStorage.getItem(DEVICE_COPY_MARKER_KEY) === '1';
  } catch {
    return false;
  }
}

function markStoredCopy(present: boolean): void {
  try {
    if (present) {
      localStorage.setItem(DEVICE_COPY_MARKER_KEY, '1');
    } else {
      localStorage.removeItem(DEVICE_COPY_MARKER_KEY);
    }
  } catch {
    return;
  }
}
