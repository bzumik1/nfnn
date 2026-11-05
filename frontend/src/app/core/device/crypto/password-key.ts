import { utf8 } from './device-bytes';

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
export const MAXIMUM_MEMORY_KIB = 1024 * 1024;
export const MAXIMUM_ITERATIONS = 10;
export const PASSWORD_KEY_LENGTH = 32;
export const PASSWORD_SALT_LENGTH = 16;
export const DERIVATION_TIMEOUT_MS = 30_000;
export const STRONG_ATTEMPT_TIMEOUT_MS = 5_000;

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
  derive(question: PasswordKeyQuestion, timeoutMs?: number): Promise<Uint8Array<ArrayBuffer>>;
}

export interface MeasuredPasswordKey {
  readonly key: Uint8Array<ArrayBuffer>;
  readonly parameters: Argon2Parameters;
}

export function passwordBytes(password: string): Uint8Array<ArrayBuffer> {
  return utf8(password.normalize('NFC'));
}

export async function deriveWithMeasuredParameters(
  derivation: PasswordKeyDerivation,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  now: () => number = () => performance.now(),
): Promise<MeasuredPasswordKey> {
  const started = now();
  try {
    const key = await deriveWithParameters(
      derivation,
      password,
      salt,
      STRONG_PASSWORD_PARAMETERS,
      STRONG_ATTEMPT_TIMEOUT_MS,
    );
    if (now() - started <= STRONG_PARAMETERS_BUDGET_MS) {
      return { key, parameters: STRONG_PASSWORD_PARAMETERS };
    }
    key.fill(0);
  } catch (failure: unknown) {
    if (!(failure instanceof PasswordKeyFailure)) {
      throw failure;
    }
  }
  return {
    key: await deriveWithParameters(derivation, password, salt, STANDARD_PASSWORD_PARAMETERS),
    parameters: STANDARD_PASSWORD_PARAMETERS,
  };
}

export async function deriveWithParameters(
  derivation: PasswordKeyDerivation,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  parameters: Argon2Parameters,
  timeoutMs?: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = passwordBytes(password);
  try {
    return await derivation.derive({ password: bytes, salt, parameters }, timeoutMs);
  } finally {
    bytes.fill(0);
  }
}

export type WorkerFactory = () => Worker;

export class WorkerPasswordKeyDerivation implements PasswordKeyDerivation {
  constructor(
    private readonly startWorker: WorkerFactory = () =>
      new Worker(new URL('./argon2.worker', import.meta.url), { type: 'module' }),
    private readonly timeoutMs = DERIVATION_TIMEOUT_MS,
  ) {}

  derive(question: PasswordKeyQuestion, timeoutMs?: number): Promise<Uint8Array<ArrayBuffer>> {
    const worker = this.startWorker();
    return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new PasswordKeyFailure('timeout')),
        timeoutMs ?? this.timeoutMs,
      );
      const finish = (outcome: Uint8Array<ArrayBuffer> | PasswordKeyFailure): void => {
        clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
        if (outcome instanceof PasswordKeyFailure) {
          reject(outcome);
        } else {
          resolve(outcome);
        }
      };
      worker.onmessage = ({ data }: MessageEvent<PasswordKeyAnswer>) =>
        finish('key' in data ? copiedAndZeroed(data.key) : new PasswordKeyFailure(data.failure));
      worker.onerror = () => finish(new PasswordKeyFailure('failed'));
      worker.onmessageerror = () => finish(new PasswordKeyFailure('failed'));
      worker.postMessage(question);
    });
  }
}

function copiedAndZeroed(sent: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const key = new Uint8Array(sent);
  sent.fill(0);
  return key;
}

export function acceptedParameters(parameters: Argon2Parameters): boolean {
  return (
    parameters.algorithm === 'argon2id' &&
    parameters.version === 19 &&
    parameters.parallelism === 1 &&
    Number.isInteger(parameters.iterations) &&
    parameters.iterations >= STANDARD_PASSWORD_PARAMETERS.iterations &&
    parameters.iterations <= MAXIMUM_ITERATIONS &&
    Number.isInteger(parameters.memoryKiB) &&
    parameters.memoryKiB >= STANDARD_PASSWORD_PARAMETERS.memoryKiB &&
    parameters.memoryKiB <= MAXIMUM_MEMORY_KIB
  );
}
