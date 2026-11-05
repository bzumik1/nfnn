import { base64UrlToBytes, bytesToBase64Url, framed, randomBytes } from './device-bytes';
import { hkdfSha256 } from './hkdf';
import {
  type Argon2Parameters,
  deriveWithMeasuredParameters,
  acceptedParameters,
  deriveWithParameters,
  PASSWORD_SALT_LENGTH,
  type PasswordKeyDerivation,
} from './password-key';

const ROOT_KEY_LENGTH = 32;
const COPY_ID_LENGTH = 16;
const COPY_SALT_LENGTH = 32;
const IV_LENGTH = 12;
const NO_SALT = new Uint8Array(0);
const AES_GCM = 'AES-GCM';

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
  private root: Uint8Array<ArrayBuffer> | null;
  private dataKey: CryptoKey | null;

  private constructor(
    readonly copyId: string,
    readonly copySalt: string,
    root: Uint8Array<ArrayBuffer>,
    dataKey: CryptoKey,
  ) {
    this.root = root;
    this.dataKey = dataKey;
  }

  static async create(): Promise<OpenCopy> {
    return OpenCopy.withRoot(
      {
        copyId: bytesToBase64Url(randomBytes(COPY_ID_LENGTH)),
        copySalt: bytesToBase64Url(randomBytes(COPY_SALT_LENGTH)),
      },
      randomBytes(ROOT_KEY_LENGTH),
    );
  }

  static async withRoot(identity: CopyIdentity, root: Uint8Array<ArrayBuffer>): Promise<OpenCopy> {
    const dataKeyBytes = await hkdfSha256(
      root,
      NO_SALT,
      framed('nfnn-data-v1', identity.copyId),
      32,
    );
    try {
      const dataKey = await importAesKey(dataKeyBytes);
      return new OpenCopy(identity.copyId, identity.copySalt, root, dataKey);
    } finally {
      dataKeyBytes.fill(0);
    }
  }

  async sealRecord(
    address: RecordAddress,
    plaintext: Uint8Array<ArrayBuffer>,
  ): Promise<SealedRecord> {
    return seal(this.openDataKey(), recordAad(this.copyId, address), plaintext);
  }

  async openRecord(address: RecordAddress, record: SealedRecord): Promise<Uint8Array<ArrayBuffer>> {
    const dataKey = this.openDataKey();
    try {
      return await unseal(dataKey, recordAad(this.copyId, address), record);
    } catch {
      throw new CopyRefused('damaged');
    }
  }

  async wrapWithPassword(
    password: string,
    derivation: PasswordKeyDerivation,
    now?: () => number,
  ): Promise<PasswordWrap> {
    const root = this.openRoot();
    const salt = randomBytes(PASSWORD_SALT_LENGTH);
    const measured = await deriveWithMeasuredParameters(derivation, password, salt, now);
    const keyEncryptionKey = await passwordKeyEncryptionKey(this.copyId, measured.key);
    return {
      kind: 'password',
      salt: bytesToBase64Url(salt),
      parameters: measured.parameters,
      ...(await seal(
        keyEncryptionKey,
        passwordWrapAad(this.copyId, salt, measured.parameters),
        root,
      )),
    };
  }

  async wrapWithPrf(credentialId: string, prfOutput: Uint8Array<ArrayBuffer>): Promise<PrfWrap> {
    const root = this.openRoot();
    const keyEncryptionKey = await prfKeyEncryptionKey(this.copyId, credentialId, prfOutput);
    return {
      kind: 'prf',
      credentialId,
      ...(await seal(keyEncryptionKey, wrapAad(this.copyId, 'prf', credentialId), root)),
    };
  }

  async wrapWithSessionKey(sessionKey: CryptoKey): Promise<SessionWrap> {
    const root = this.openRoot();
    return {
      kind: 'session',
      ...(await seal(sessionKey, wrapAad(this.copyId, 'session', ''), root)),
    };
  }

  async rekeyed(): Promise<OpenCopy> {
    this.openRoot();
    const rekeyed = await OpenCopy.withRoot(this, randomBytes(ROOT_KEY_LENGTH));
    this.close();
    return rekeyed;
  }

  close(): void {
    this.root?.fill(0);
    this.root = null;
    this.dataKey = null;
  }

  private openRoot(): Uint8Array<ArrayBuffer> {
    if (this.root === null) {
      throw new CopyRefused('closed');
    }
    return this.root;
  }

  private openDataKey(): CryptoKey {
    if (this.dataKey === null) {
      throw new CopyRefused('closed');
    }
    return this.dataKey;
  }
}

export async function openWithPassword(
  identity: CopyIdentity,
  wrap: KeyWrap,
  password: string,
  derivation: PasswordKeyDerivation,
): Promise<OpenCopy> {
  if (wrap.kind !== 'password') {
    throw new CopyRefused('wrong-wrap');
  }
  const salt = decoded(wrap.salt);
  if (salt.length !== PASSWORD_SALT_LENGTH || !acceptedParameters(wrap.parameters)) {
    throw new CopyRefused('damaged');
  }
  const passwordKey = await deriveWithParameters(derivation, password, salt, wrap.parameters);
  const keyEncryptionKey = await passwordKeyEncryptionKey(identity.copyId, passwordKey);
  return unwrapRoot(
    identity,
    keyEncryptionKey,
    passwordWrapAad(identity.copyId, salt, wrap.parameters),
    wrap,
  );
}

export async function openWithPrf(
  identity: CopyIdentity,
  wrap: KeyWrap,
  prfOutput: Uint8Array<ArrayBuffer>,
): Promise<OpenCopy> {
  if (wrap.kind !== 'prf') {
    throw new CopyRefused('wrong-wrap');
  }
  const keyEncryptionKey = await prfKeyEncryptionKey(identity.copyId, wrap.credentialId, prfOutput);
  return unwrapRoot(
    identity,
    keyEncryptionKey,
    wrapAad(identity.copyId, 'prf', wrap.credentialId),
    wrap,
  );
}

export async function openWithSessionKey(
  identity: CopyIdentity,
  wrap: KeyWrap,
  sessionKey: CryptoKey,
): Promise<OpenCopy> {
  if (wrap.kind !== 'session') {
    throw new CopyRefused('wrong-wrap');
  }
  return unwrapRoot(identity, sessionKey, wrapAad(identity.copyId, 'session', ''), wrap);
}

export async function generateSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_GCM, length: 256 }, false, ['encrypt', 'decrypt']);
}

async function unwrapRoot(
  identity: CopyIdentity,
  keyEncryptionKey: CryptoKey,
  additionalData: Uint8Array<ArrayBuffer>,
  wrap: SealedRecord,
): Promise<OpenCopy> {
  const iv = decoded(wrap.iv);
  const sealed = decoded(wrap.sealed);
  if (iv.length !== IV_LENGTH) {
    throw new CopyRefused('damaged');
  }
  let root: Uint8Array<ArrayBuffer>;
  try {
    root = new Uint8Array(
      await crypto.subtle.decrypt({ name: AES_GCM, iv, additionalData }, keyEncryptionKey, sealed),
    );
  } catch {
    throw new CopyRefused('wrong-secret');
  }
  if (root.length !== ROOT_KEY_LENGTH) {
    root.fill(0);
    throw new CopyRefused('wrong-secret');
  }
  return OpenCopy.withRoot(identity, root);
}

async function passwordKeyEncryptionKey(
  copyId: string,
  passwordKey: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  try {
    return await keyEncryptionKeyFrom(passwordKey, framed('nfnn-kek-password-v1', copyId));
  } finally {
    passwordKey.fill(0);
  }
}

async function prfKeyEncryptionKey(
  copyId: string,
  credentialId: string,
  prfOutput: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return keyEncryptionKeyFrom(prfOutput, framed('nfnn-kek-prf-v1', copyId, credentialId));
}

async function keyEncryptionKeyFrom(
  secret: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const bytes = await hkdfSha256(secret, NO_SALT, info, 32);
  try {
    return await importAesKey(bytes);
  } finally {
    bytes.fill(0);
  }
}

function importAesKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: AES_GCM }, false, ['encrypt', 'decrypt']);
}

function recordAad(copyId: string, address: RecordAddress): Uint8Array<ArrayBuffer> {
  return framed(
    'nfnn-record-v1',
    copyId,
    address.collection,
    address.recordId,
    String(address.schemaVersion),
  );
}

function passwordWrapAad(
  copyId: string,
  salt: Uint8Array<ArrayBuffer>,
  parameters: Argon2Parameters,
): Uint8Array<ArrayBuffer> {
  return framed(
    'nfnn-wrap-v1',
    copyId,
    'password',
    '',
    salt,
    parameters.algorithm,
    String(parameters.version),
    String(parameters.memoryKiB),
    String(parameters.iterations),
    String(parameters.parallelism),
  );
}

function decoded(value: string): Uint8Array<ArrayBuffer> {
  try {
    return base64UrlToBytes(value);
  } catch {
    throw new CopyRefused('damaged');
  }
}

function wrapAad(
  copyId: string,
  kind: KeyWrap['kind'],
  credentialId: string,
): Uint8Array<ArrayBuffer> {
  return framed('nfnn-wrap-v1', copyId, kind, credentialId);
}

async function seal(
  key: CryptoKey,
  additionalData: Uint8Array<ArrayBuffer>,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<SealedRecord> {
  const iv = randomBytes(IV_LENGTH);
  const sealed = await crypto.subtle.encrypt({ name: AES_GCM, iv, additionalData }, key, plaintext);
  return { iv: bytesToBase64Url(iv), sealed: bytesToBase64Url(new Uint8Array(sealed)) };
}

async function unseal(
  key: CryptoKey,
  additionalData: Uint8Array<ArrayBuffer>,
  record: SealedRecord,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = base64UrlToBytes(record.iv);
  if (iv.length !== IV_LENGTH) {
    throw new RangeError('Wrong IV length');
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: AES_GCM, iv, additionalData },
    key,
    base64UrlToBytes(record.sealed),
  );
  return new Uint8Array(plaintext);
}
