import { argon2id as hashWasmArgon2id } from 'hash-wasm';
import type {
  PasswordKeyAnswer,
  PasswordKeyFailureReason,
  PasswordKeyQuestion,
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
  throw new Error('not implemented');
}

export function argon2FailureOf(failure: unknown): PasswordKeyFailureReason {
  throw new Error('not implemented');
}
