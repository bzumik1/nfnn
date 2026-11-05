import { argon2id } from '../argon2';
import type { Argon2Parameters, PasswordKeyDerivation, PasswordKeyQuestion } from '../password-key';
import { PASSWORD_KEY_LENGTH, PasswordKeyFailure } from '../password-key';

export class SmallArgon2Derivation implements PasswordKeyDerivation {
  readonly requested: Argon2Parameters[] = [];

  async derive(question: PasswordKeyQuestion): Promise<Uint8Array<ArrayBuffer>> {
    this.requested.push(question.parameters);
    return argon2id({
      password: question.password,
      salt: question.salt,
      memoryKiB: 64,
      iterations: 1,
      parallelism: 1,
      hashLength: PASSWORD_KEY_LENGTH,
    });
  }
}

export interface ScriptedOutcome {
  readonly takesMs?: number;
  readonly fails?: PasswordKeyFailure;
}

export class ScriptedDerivation implements PasswordKeyDerivation {
  readonly requested: Argon2Parameters[] = [];
  private readonly inner = new SmallArgon2Derivation();
  private elapsed = 0;

  constructor(private readonly outcomes: readonly ScriptedOutcome[]) {}

  readonly now = (): number => this.elapsed;

  async derive(question: PasswordKeyQuestion): Promise<Uint8Array<ArrayBuffer>> {
    const outcome = this.outcomes[this.requested.length] ?? {};
    this.requested.push(question.parameters);
    this.elapsed += outcome.takesMs ?? 0;
    if (outcome.fails !== undefined) {
      throw outcome.fails;
    }
    return this.inner.derive(question);
  }
}
