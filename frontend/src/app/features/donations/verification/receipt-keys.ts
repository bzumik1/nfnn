import { hexOf, type ProofKey } from './receipt-proof';

export interface ReceiptKeysResponse {
  readonly foundation: { readonly name: string; readonly companyIdentifier: string };
  readonly keys: readonly ReceiptKeyEntry[];
}

export interface ReceiptKeyEntry {
  readonly keyId: string;
  readonly algorithm: string;
  readonly publicKey: string;
  readonly status: string;
  readonly registeredAt: string;
}

export interface TrustedKeys {
  readonly foundationCompanyIdentifier: string;
  readonly keys: readonly ProofKey[];
}

const PUBLIC_TEST_KEY_IDS: readonly string[] = [
  '21fe31df',
  '39f713d0',
  'dac073e0',
  '91384c41',
  '5f9b247e',
];
const PRODUCTION_HOSTS: readonly string[] = ['nfnn.cz', 'www.nfnn.cz'];
const ALGORITHM = 'Ed25519';
const STATUSES: readonly string[] = ['active', 'revoked'];
const KEY_ID = /^[0-9a-f]{8}$/;
const COMPANY_IDENTIFIER = /^[0-9]{8}$/;
const PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;
const PUBLIC_KEY_BYTES = 32;
const KEY_ID_BYTES = 4;

export async function trustedKeys(list: unknown, hostname: string): Promise<TrustedKeys | null> {
  if (!isRecord(list) || !isRecord(list['foundation']) || !Array.isArray(list['keys'])) {
    return null;
  }
  const companyIdentifier = list['foundation']['companyIdentifier'];
  if (typeof companyIdentifier !== 'string' || !COMPANY_IDENTIFIER.test(companyIdentifier)) {
    return null;
  }
  const production = PRODUCTION_HOSTS.includes(hostname);
  const keys: ProofKey[] = [];
  for (const entry of list['keys'] as unknown[]) {
    const key = await trustedKey(entry);
    if (key !== null && !(production && PUBLIC_TEST_KEY_IDS.includes(key.keyId))) {
      keys.push(key);
    }
  }
  return { foundationCompanyIdentifier: companyIdentifier, keys };
}

export function keyLookup(trusted: TrustedKeys | null): (keyId: string) => ProofKey | undefined {
  return (keyId) => trusted?.keys.find((key) => key.keyId === keyId);
}

async function trustedKey(entry: unknown): Promise<ProofKey | null> {
  if (!isRecord(entry)) {
    return null;
  }
  const { keyId, algorithm, publicKey, status } = entry;
  if (
    typeof keyId !== 'string' ||
    !KEY_ID.test(keyId) ||
    algorithm !== ALGORITHM ||
    typeof status !== 'string' ||
    !STATUSES.includes(status) ||
    typeof publicKey !== 'string' ||
    !PUBLIC_KEY.test(publicKey)
  ) {
    return null;
  }
  const bytes = base64UrlBytes(publicKey);
  if (bytes === null || bytes.length !== PUBLIC_KEY_BYTES) {
    return null;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (hexOf(digest.slice(0, KEY_ID_BYTES)) !== keyId) {
    return null;
  }
  return { keyId, publicKey: bytes, status: status as ProofKey['status'] };
}

function base64UrlBytes(text: string): Uint8Array<ArrayBuffer> | null {
  let binary: string;
  try {
    binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  bytes.forEach((_, index) => (bytes[index] = binary.charCodeAt(index)));
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
