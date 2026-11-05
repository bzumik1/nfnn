import { argon2id as hashWasmArgon2id } from 'hash-wasm';
import {
  PASSWORD_KEY_LENGTH,
  type PasswordKeyAnswer,
  type PasswordKeyFailureReason,
  type PasswordKeyQuestion,
} from './password-key';

export interface Argon2idInput {
  readonly password: Uint8Array<ArrayBuffer>;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly hashLength: number;
}

export async function argon2id(input: Argon2idInput): Promise<Uint8Array<ArrayBuffer>> {
  const tag = await hashWasmArgon2id({
    password: input.password,
    salt: input.salt,
    memorySize: input.memoryKiB,
    iterations: input.iterations,
    parallelism: input.parallelism,
    hashLength: input.hashLength,
    outputType: 'binary',
  });
  return new Uint8Array(tag);
}

export async function argon2WorkerAnswer(
  question: PasswordKeyQuestion,
): Promise<PasswordKeyAnswer> {
  try {
    return {
      key: await argon2id({
        password: question.password,
        salt: question.salt,
        memoryKiB: question.parameters.memoryKiB,
        iterations: question.parameters.iterations,
        parallelism: question.parameters.parallelism,
        hashLength: PASSWORD_KEY_LENGTH,
      }),
    };
  } catch (failure: unknown) {
    return { failure: argon2FailureOf(failure) };
  } finally {
    question.password.fill(0);
  }
}

export function argon2FailureOf(failure: unknown): PasswordKeyFailureReason {
  if (failure instanceof RangeError) {
    return 'memory';
  }
  return failure instanceof Error && /memory/i.test(failure.message) ? 'memory' : 'failed';
}
