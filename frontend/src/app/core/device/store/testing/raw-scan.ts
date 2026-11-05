import { openDB } from 'idb';

export interface RawDump {
  readonly text: string;
  readonly decodedTokens: readonly Uint8Array[];
}

export async function rawIndexedDbDump(): Promise<RawDump> {
  const values: unknown[] = [];
  for (const { name } of await indexedDB.databases()) {
    if (name === undefined) {
      continue;
    }
    const database = await openDB(name);
    for (const store of database.objectStoreNames) {
      values.push(store, await database.getAllKeys(store), await database.getAll(store));
    }
    database.close();
  }
  values.push(storageText(localStorage), storageText(sessionStorage), document.cookie);
  const text = JSON.stringify(values, (_key, value: unknown) =>
    value instanceof CryptoKey ? '<CryptoKey>' : value,
  );
  return { text, decodedTokens: decodedTokensOf(text) };
}

export function leaks(dump: RawDump, canary: string): boolean {
  const bytes = new TextEncoder().encode(canary);
  return (
    dump.text.includes(canary) ||
    dump.text.includes(JSON.stringify(canary).slice(1, -1)) ||
    dump.decodedTokens.some((token) => contains(token, bytes))
  );
}

function storageText(storage: Storage): string {
  return JSON.stringify(
    Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index) ?? '';
      return [key, storage.getItem(key)];
    }),
  );
}

function decodedTokensOf(text: string): Uint8Array[] {
  const tokens = text.match(/[A-Za-z0-9+/_-]{8,}={0,2}/g) ?? [];
  return tokens.flatMap((token) =>
    [0, 1, 2, 3].flatMap((skip) => {
      const decoded = decoded64(token.slice(skip));
      return decoded === null ? [] : [decoded];
    }),
  );
}

function decoded64(token: string): Uint8Array | null {
  const base64 = token.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const usable = base64.slice(0, base64.length - (base64.length % 4 === 1 ? 1 : 0));
  try {
    const binary = atob(usable + '='.repeat((4 - (usable.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((byte, offset) => haystack[start + offset] === byte)) {
      return true;
    }
  }
  return false;
}
