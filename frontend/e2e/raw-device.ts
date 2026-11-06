import type { Page } from '@playwright/test';

export const DEVICE_DATABASE = 'nfnn.device';

export interface RawDevice {
  readonly databases: readonly string[];
  readonly text: string;
  readonly wraps: readonly string[];
  readonly copyIds: readonly string[];
  readonly marker: string | null;
  readonly drafts: number;
}

export function rawDevice(page: Page): Promise<RawDevice> {
  return page.evaluate(async (name) => {
    const listed = (await indexedDB.databases()).map((database) => database.name ?? '');
    if (!listed.includes(name)) {
      return {
        databases: listed,
        text: '',
        wraps: [],
        copyIds: [],
        marker: localStorage.getItem('nfnn.device-copy'),
        drafts: 0,
      };
    }
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values: unknown[] = [];
    for (const store of Array.from(database.objectStoreNames)) {
      const read = (method: 'getAll' | 'getAllKeys') =>
        new Promise((resolve, reject) => {
          const request = database.transaction(store).objectStore(store)[method]();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      values.push(store, await read('getAll'), await read('getAllKeys'));
    }
    database.close();
    const drafts = ((values[values.indexOf('drafts') + 1] ?? []) as unknown[]).length;
    const copies = (values[values.indexOf('copies') + 1] ?? []) as {
      copyId: string;
      wraps: { kind: string }[];
    }[];
    const webStorage = [localStorage, sessionStorage].map((storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? '';
        return [key, storage.getItem(key)];
      }),
    );
    values.push(webStorage, document.cookie);
    const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    return {
      databases: listed,
      text: JSON.stringify(values, (_key, value: unknown) => {
        if (value instanceof CryptoKey) {
          return '<CryptoKey>';
        }
        if (value instanceof ArrayBuffer) {
          return base64(new Uint8Array(value));
        }
        if (ArrayBuffer.isView(value)) {
          return base64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        }
        return value;
      }),
      wraps: copies.flatMap((copy) => copy.wraps.map((wrap) => wrap.kind)).sort(),
      copyIds: copies.map((copy) => copy.copyId),
      marker: localStorage.getItem('nfnn.device-copy'),
      drafts,
    };
  }, DEVICE_DATABASE);
}

export function leaked(text: string, canary: string): boolean {
  const forms = [0, 1, 2].flatMap((pad) => {
    const base64 = Buffer.concat([Buffer.alloc(pad), Buffer.from(canary)]).toString('base64');
    const stable = base64.slice([0, 2, 3][pad], -3);
    return [stable, stable.replace(/\+/g, '-').replace(/\//g, '_')];
  });
  const hex = Buffer.from(canary).toString('hex');
  const lower = text.toLowerCase();
  return (
    [canary, encodeURIComponent(canary), ...forms].some((form) => text.includes(form)) ||
    lower.includes(hex)
  );
}
