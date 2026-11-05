import { argon2id } from '../argon2';
import type {
  Argon2Parameters,
  DerivedPasswordKey,
  PasswordKeyDerivation,
  PasswordKeyQuestion,
} from '../password-key';
import { PASSWORD_KEY_LENGTH, PasswordKeyFailure } from '../password-key';

export class SmallArgon2Derivation implements PasswordKeyDerivation {
  readonly requested: Argon2Parameters[] = [];

  async derive(question: PasswordKeyQuestion): Promise<DerivedPasswordKey> {
    this.requested.push(question.parameters);
    const key = await argon2id({
      password: question.password,
      salt: question.salt,
      memoryKiB: 64,
      iterations: 1,
      parallelism: 1,
      hashLength: PASSWORD_KEY_LENGTH,
    });
    return { key, elapsedMs: 0 };
  }
}

export interface ScriptedOutcome {
  readonly takesMs?: number;
  readonly fails?: PasswordKeyFailure;
  readonly throws?: unknown;
}

export class ScriptedDerivation implements PasswordKeyDerivation {
  readonly requested: Argon2Parameters[] = [];
  readonly timeouts: (number | undefined)[] = [];
  readonly keys: Uint8Array<ArrayBuffer>[] = [];
  private readonly inner = new SmallArgon2Derivation();

  constructor(private readonly outcomes: readonly ScriptedOutcome[]) {}

  async derive(question: PasswordKeyQuestion, timeoutMs?: number): Promise<DerivedPasswordKey> {
    const outcome = this.outcomes[this.requested.length] ?? {};
    this.requested.push(question.parameters);
    this.timeouts.push(timeoutMs);
    if (outcome.throws !== undefined) {
      throw outcome.throws;
    }
    if (outcome.fails !== undefined) {
      throw outcome.fails;
    }
    const { key } = await this.inner.derive(question);
    this.keys.push(key);
    return { key, elapsedMs: outcome.takesMs ?? 0 };
  }
}
