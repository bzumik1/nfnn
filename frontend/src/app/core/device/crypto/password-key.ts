export interface Argon2Parameters {
  readonly algorithm: 'argon2id';
  readonly version: 19;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
}

export const STRONG_PASSWORD_PARAMETERS: Argon2Parameters = {
  algorithm: 'argon2id',
  version: 19,
  memoryKiB: 128 * 1024,
  iterations: 3,
  parallelism: 1,
};

export const STANDARD_PASSWORD_PARAMETERS: Argon2Parameters = {
  algorithm: 'argon2id',
  version: 19,
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
};

export const STRONG_PARAMETERS_BUDGET_MS = 1000;
export const PASSWORD_KEY_LENGTH = 32;
export const PASSWORD_SALT_LENGTH = 16;
export const DERIVATION_TIMEOUT_MS = 30_000;

export type PasswordKeyFailureReason = 'memory' | 'timeout' | 'failed';

export class PasswordKeyFailure extends Error {
  constructor(readonly reason: PasswordKeyFailureReason) {
    super(`Password key derivation failed: ${reason}`);
  }
}

export interface PasswordKeyQuestion {
  readonly password: Uint8Array<ArrayBuffer>;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly parameters: Argon2Parameters;
}

export type PasswordKeyAnswer =
  { readonly key: Uint8Array<ArrayBuffer> } | { readonly failure: PasswordKeyFailureReason };

export interface PasswordKeyDerivation {
  derive(question: PasswordKeyQuestion): Promise<Uint8Array<ArrayBuffer>>;
}

export interface MeasuredPasswordKey {
  readonly key: Uint8Array<ArrayBuffer>;
  readonly parameters: Argon2Parameters;
}

export function passwordBytes(password: string): Uint8Array<ArrayBuffer> {
  throw new Error('not implemented');
}

export async function deriveWithMeasuredParameters(
  derivation: PasswordKeyDerivation,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  now: () => number = () => performance.now(),
): Promise<MeasuredPasswordKey> {
  throw new Error('not implemented');
}

export async function deriveWithParameters(
  derivation: PasswordKeyDerivation,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  parameters: Argon2Parameters,
): Promise<Uint8Array<ArrayBuffer>> {
  throw new Error('not implemented');
}

export type WorkerFactory = () => Worker;

export class WorkerPasswordKeyDerivation implements PasswordKeyDerivation {
  constructor(
    private readonly startWorker: WorkerFactory = () =>
      new Worker(new URL('./argon2.worker', import.meta.url), { type: 'module' }),
    private readonly timeoutMs = DERIVATION_TIMEOUT_MS,
  ) {}

  derive(question: PasswordKeyQuestion): Promise<Uint8Array<ArrayBuffer>> {
    throw new Error('not implemented');
  }
}
