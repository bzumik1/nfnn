import type { CopyIdentity, KeyWrap } from './copy-keys';
import { base64UrlToBytes, bytesToBase64Url, framed, randomBytes } from './device-bytes';

export type CopyKind = 'donor' | 'administration';

export interface RegistryEntry extends CopyIdentity {
  readonly kind: CopyKind;
  readonly lookupTag: string;
  readonly userHandleTag: string | null;
  readonly wraps: readonly KeyWrap[];
  readonly deviceSecret?: string;
}

export interface RegistryEntryInput {
  readonly copy: CopyIdentity;
  readonly kind: CopyKind;
  readonly deviceSalt: string;
  readonly email: string;
  readonly userHandle: string | null;
  readonly wraps: readonly KeyWrap[];
}

export function newDeviceSalt(): string {
  return bytesToBase64Url(randomBytes(32));
}

export async function lookupTag(deviceSalt: string, email: string): Promise<string> {
  return tagOf('nfnn-lookup-v1', deviceSalt, email.trim().toLowerCase());
}

export async function userHandleTag(deviceSalt: string, userHandle: string): Promise<string> {
  return tagOf('nfnn-user-handle-v1', deviceSalt, base64UrlToBytes(userHandle));
}

export async function registryEntry(input: RegistryEntryInput): Promise<RegistryEntry> {
  return {
    copyId: input.copy.copyId,
    kind: input.kind,
    lookupTag: await lookupTag(input.deviceSalt, input.email),
    userHandleTag:
      input.userHandle === null ? null : await userHandleTag(input.deviceSalt, input.userHandle),
    wraps: [...input.wraps],
  };
}

async function tagOf(
  label: string,
  deviceSalt: string,
  value: string | Uint8Array,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    framed(label, base64UrlToBytes(deviceSalt), value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export function mayWrapWithPassword(kind: CopyKind, wraps: readonly KeyWrap[]): boolean {
  return kind === 'donor' || !wraps.some((wrap) => wrap.kind === 'prf');
}
