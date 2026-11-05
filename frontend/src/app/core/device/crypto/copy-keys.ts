import type { Argon2Parameters, PasswordKeyDerivation } from './password-key';

export interface CopyIdentity {
  readonly copyId: string;
  readonly copySalt: string;
}

export interface RecordAddress {
  readonly collection: string;
  readonly recordId: string;
  readonly schemaVersion: number;
}

export interface SealedRecord {
  readonly iv: string;
  readonly sealed: string;
}

export interface PasswordWrap extends SealedRecord {
  readonly kind: 'password';
  readonly salt: string;
  readonly parameters: Argon2Parameters;
}

export interface PrfWrap extends SealedRecord {
  readonly kind: 'prf';
  readonly credentialId: string;
}

export interface SessionWrap extends SealedRecord {
  readonly kind: 'session';
}

export type KeyWrap = PasswordWrap | PrfWrap | SessionWrap;

export type CopyRefusalReason = 'wrong-secret' | 'wrong-wrap' | 'damaged' | 'closed';

export class CopyRefused extends Error {
  constructor(readonly reason: CopyRefusalReason) {
    super(`Device copy refused: ${reason}`);
  }
}

export class OpenCopy implements CopyIdentity {
  private constructor(
    readonly copyId: string,
    readonly copySalt: string,
  ) {}

  static async create(): Promise<OpenCopy> {
    throw new Error('not implemented');
  }

  async sealRecord(
    address: RecordAddress,
    plaintext: Uint8Array<ArrayBuffer>,
  ): Promise<SealedRecord> {
    throw new Error('not implemented');
  }

  async openRecord(address: RecordAddress, record: SealedRecord): Promise<Uint8Array<ArrayBuffer>> {
    throw new Error('not implemented');
  }

  async wrapWithPassword(
    password: string,
    derivation: PasswordKeyDerivation,
    now?: () => number,
  ): Promise<PasswordWrap> {
    throw new Error('not implemented');
  }

  async wrapWithPrf(credentialId: string, prfOutput: Uint8Array<ArrayBuffer>): Promise<PrfWrap> {
    throw new Error('not implemented');
  }

  async wrapWithSessionKey(sessionKey: CryptoKey): Promise<SessionWrap> {
    throw new Error('not implemented');
  }

  async rekeyed(): Promise<OpenCopy> {
    throw new Error('not implemented');
  }

  close(): void {
    throw new Error('not implemented');
  }
}

export async function openWithPassword(
  identity: CopyIdentity,
  wrap: KeyWrap,
  password: string,
  derivation: PasswordKeyDerivation,
): Promise<OpenCopy> {
  throw new Error('not implemented');
}

export async function openWithPrf(
  identity: CopyIdentity,
  wrap: KeyWrap,
  prfOutput: Uint8Array<ArrayBuffer>,
): Promise<OpenCopy> {
  throw new Error('not implemented');
}

export async function openWithSessionKey(
  identity: CopyIdentity,
  wrap: KeyWrap,
  sessionKey: CryptoKey,
): Promise<OpenCopy> {
  throw new Error('not implemented');
}

export async function generateSessionKey(): Promise<CryptoKey> {
  throw new Error('not implemented');
}
