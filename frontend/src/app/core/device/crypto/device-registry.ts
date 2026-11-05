import type { CopyIdentity, KeyWrap } from './copy-keys';

export type CopyKind = 'donor' | 'administration';

export interface RegistryEntry extends CopyIdentity {
  readonly kind: CopyKind;
  readonly lookupTag: string;
  readonly userHandleTag: string | null;
  readonly wraps: readonly KeyWrap[];
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
  throw new Error('not implemented');
}

export async function lookupTag(deviceSalt: string, email: string): Promise<string> {
  throw new Error('not implemented');
}

export async function userHandleTag(deviceSalt: string, userHandle: string): Promise<string> {
  throw new Error('not implemented');
}

export async function registryEntry(input: RegistryEntryInput): Promise<RegistryEntry> {
  throw new Error('not implemented');
}
