export interface Argon2Parameters {
  readonly algorithm: 'argon2id';
  readonly version: 19;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
}

export const PASSWORD_KEY_LENGTH = 32;

export type PasswordKeyFailureReason = 'memory' | 'timeout' | 'failed';

export interface PasswordKeyQuestion {
  readonly password: Uint8Array<ArrayBuffer>;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly parameters: Argon2Parameters;
}

export interface DerivedPasswordKey {
  readonly key: Uint8Array<ArrayBuffer>;
  readonly elapsedMs: number;
}

export type PasswordKeyAnswer = DerivedPasswordKey | { readonly failure: PasswordKeyFailureReason };
