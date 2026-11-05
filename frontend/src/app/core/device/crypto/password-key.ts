import { utf8 } from './device-bytes';
import {
  type Argon2Parameters,
  type DerivedPasswordKey,
  PASSWORD_KEY_LENGTH,
  type PasswordKeyFailureReason,
  type PasswordKeyQuestion,
} from './password-key-protocol';

export * from './password-key-protocol';

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
export const PASSWORD_SALT_LENGTH = 16;
export const DERIVATION_TIMEOUT_MS = 30_000;
export const STRONG_ATTEMPT_TIMEOUT_MS = 5_000;

export class PasswordKeyFailure extends Error {
  constructor(readonly reason: PasswordKeyFailureReason) {
    super(`Password key derivation failed: ${reason}`);
  }
}

export interface PasswordKeyDerivation {
  derive(question: PasswordKeyQuestion, timeoutMs?: number): Promise<DerivedPasswordKey>;
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
): Promise<MeasuredPasswordKey> {
  try {
    const { key, elapsedMs } = await deriveWithParameters(
      derivation,
      password,
      salt,
      STRONG_PASSWORD_PARAMETERS,
      STRONG_ATTEMPT_TIMEOUT_MS,
    );
    if (elapsedMs <= STRONG_PARAMETERS_BUDGET_MS) {
      return { key, parameters: STRONG_PASSWORD_PARAMETERS };
    }
    key.fill(0);
  } catch (failure: unknown) {
    if (!(failure instanceof PasswordKeyFailure)) {
      throw failure;
    }
  }
  const { key } = await deriveWithParameters(
    derivation,
    password,
    salt,
    STANDARD_PASSWORD_PARAMETERS,
  );
  return { key, parameters: STANDARD_PASSWORD_PARAMETERS };
}

export async function deriveWithParameters(
  derivation: PasswordKeyDerivation,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  parameters: Argon2Parameters,
  timeoutMs?: number,
): Promise<DerivedPasswordKey> {
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

  derive(question: PasswordKeyQuestion, timeoutMs?: number): Promise<DerivedPasswordKey> {
    return new Promise<DerivedPasswordKey>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.startWorker();
      } catch {
        reject(new PasswordKeyFailure('failed'));
        return;
      }
      const timer = setTimeout(
        () => finish(new PasswordKeyFailure('timeout')),
        timeoutMs ?? this.timeoutMs,
      );
      const finish = (outcome: DerivedPasswordKey | PasswordKeyFailure): void => {
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
      worker.onmessage = ({ data }: MessageEvent<unknown>) => finish(answerOf(data));
      worker.onerror = () => finish(new PasswordKeyFailure('failed'));
      worker.onmessageerror = () => finish(new PasswordKeyFailure('failed'));
      try {
        worker.postMessage(question);
      } catch {
        finish(new PasswordKeyFailure('failed'));
      }
    });
  }
}

function answerOf(data: unknown): DerivedPasswordKey | PasswordKeyFailure {
  const answer = data as Partial<Record<keyof DerivedPasswordKey | 'failure', unknown>> | null;
  if (
    answer?.key instanceof Uint8Array &&
    answer.key.length === PASSWORD_KEY_LENGTH &&
    typeof answer.elapsedMs === 'number' &&
    Number.isFinite(answer.elapsedMs)
  ) {
    return { key: answer.key as Uint8Array<ArrayBuffer>, elapsedMs: answer.elapsedMs };
  }
  return new PasswordKeyFailure(
    answer?.failure === 'memory' || answer?.failure === 'timeout' ? answer.failure : 'failed',
  );
}

export function acceptedParameters(stored: unknown): stored is Argon2Parameters {
  if (typeof stored !== 'object' || stored === null) {
    return false;
  }
  const parameters = stored as Partial<Record<keyof Argon2Parameters, unknown>>;
  return (
    parameters.algorithm === 'argon2id' &&
    parameters.version === 19 &&
    parameters.parallelism === 1 &&
    typeof parameters.iterations === 'number' &&
    Number.isInteger(parameters.iterations) &&
    parameters.iterations >= STANDARD_PASSWORD_PARAMETERS.iterations &&
    parameters.iterations <= MAXIMUM_ITERATIONS &&
    typeof parameters.memoryKiB === 'number' &&
    Number.isInteger(parameters.memoryKiB) &&
    parameters.memoryKiB >= STANDARD_PASSWORD_PARAMETERS.memoryKiB &&
    parameters.memoryKiB <= MAXIMUM_MEMORY_KIB
  );
}
