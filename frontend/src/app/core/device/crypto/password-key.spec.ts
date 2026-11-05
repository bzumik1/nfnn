import { utf8 } from './device-bytes';
import {
  deriveWithMeasuredParameters,
  deriveWithParameters,
  PasswordKeyFailure,
  passwordBytes,
  STANDARD_PASSWORD_PARAMETERS,
  STRONG_PASSWORD_PARAMETERS,
  WorkerPasswordKeyDerivation,
} from './password-key';
import { ScriptedDerivation, SmallArgon2Derivation } from './testing/password-key-derivations';

const SALT = new Uint8Array(16).fill(7);

class FakeWorker {
  readonly posted: unknown[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  answer(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  crash(): void {
    this.onerror?.({ message: 'boom' } as ErrorEvent);
  }
}

describe('Given the password key of a device copy', () => {
  it('when a password is written in two Unicode forms, then both give the same bytes (NFC)', () => {
    expect(passwordBytes('Knížka')).toEqual(passwordBytes('Knížka'));
    expect(passwordBytes('heslo')).toEqual(utf8('heslo'));
  });

  it('when the strong parameters run within a second, then the key uses 128 MiB and three passes', async () => {
    const derivation = new ScriptedDerivation([{ takesMs: 900 }]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT, derivation.now);

    expect(measured.parameters).toEqual(STRONG_PASSWORD_PARAMETERS);
    expect(derivation.requested).toEqual([STRONG_PASSWORD_PARAMETERS]);
    expect(measured.key).toHaveLength(32);
  });

  it('when the strong parameters take longer than a second, then the key is derived again with 64 MiB', async () => {
    const derivation = new ScriptedDerivation([{ takesMs: 1400 }, { takesMs: 700 }]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT, derivation.now);

    expect(measured.parameters).toEqual(STANDARD_PASSWORD_PARAMETERS);
    expect(derivation.requested).toEqual([
      STRONG_PASSWORD_PARAMETERS,
      STANDARD_PASSWORD_PARAMETERS,
    ]);
  });

  it('when the device cannot give the strong parameters their memory, then the key uses 64 MiB', async () => {
    const derivation = new ScriptedDerivation([{ fails: new PasswordKeyFailure('memory') }, {}]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT, derivation.now);

    expect(measured.parameters).toEqual(STANDARD_PASSWORD_PARAMETERS);
  });

  it('when the standard parameters fail too, then the failure reaches the caller', async () => {
    const derivation = new ScriptedDerivation([
      { fails: new PasswordKeyFailure('memory') },
      { fails: new PasswordKeyFailure('memory') },
    ]);

    await expect(
      deriveWithMeasuredParameters(derivation, 'heslo', SALT, derivation.now),
    ).rejects.toEqual(new PasswordKeyFailure('memory'));
  });

  it('when a stored wrap names its parameters, then the key is derived with exactly those', async () => {
    const derivation = new SmallArgon2Derivation();

    const first = await deriveWithParameters(
      derivation,
      'heslo',
      SALT,
      STANDARD_PASSWORD_PARAMETERS,
    );
    const again = await deriveWithParameters(
      derivation,
      'heslo',
      SALT,
      STANDARD_PASSWORD_PARAMETERS,
    );
    const other = await deriveWithParameters(
      derivation,
      'jine',
      SALT,
      STANDARD_PASSWORD_PARAMETERS,
    );

    expect(derivation.requested).toEqual([
      STANDARD_PASSWORD_PARAMETERS,
      STANDARD_PASSWORD_PARAMETERS,
      STANDARD_PASSWORD_PARAMETERS,
    ]);
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  describe('when the key is derived in a worker', () => {
    afterEach(() => vi.useRealTimers());

    function derivationWith(worker: FakeWorker, timeoutMs = 30_000): WorkerPasswordKeyDerivation {
      return new WorkerPasswordKeyDerivation(() => worker as unknown as Worker, timeoutMs);
    }

    it('then the worker gets the question, its key comes back and the worker ends', async () => {
      const worker = new FakeWorker();
      const question = {
        password: utf8('heslo'),
        salt: SALT,
        parameters: STRONG_PASSWORD_PARAMETERS,
      };

      const derived = derivationWith(worker).derive(question);
      worker.answer({ key: new Uint8Array(32).fill(9) });

      await expect(derived).resolves.toEqual(new Uint8Array(32).fill(9));
      expect(worker.posted).toEqual([question]);
      expect(worker.terminated).toBe(true);
    });

    it('and the worker answers a failure, then the derivation fails for that reason', async () => {
      const worker = new FakeWorker();

      const derived = derivationWith(worker).derive({
        password: utf8('heslo'),
        salt: SALT,
        parameters: STRONG_PASSWORD_PARAMETERS,
      });
      worker.answer({ failure: 'memory' });

      await expect(derived).rejects.toEqual(new PasswordKeyFailure('memory'));
      expect(worker.terminated).toBe(true);
    });

    it('and the worker crashes, then the derivation fails and the worker ends', async () => {
      const worker = new FakeWorker();

      const derived = derivationWith(worker).derive({
        password: utf8('heslo'),
        salt: SALT,
        parameters: STRONG_PASSWORD_PARAMETERS,
      });
      worker.crash();

      await expect(derived).rejects.toEqual(new PasswordKeyFailure('failed'));
      expect(worker.terminated).toBe(true);
    });

    it('and the worker never answers, then the derivation times out and the worker ends', async () => {
      vi.useFakeTimers();
      const worker = new FakeWorker();

      const derived = derivationWith(worker, 30_000).derive({
        password: utf8('heslo'),
        salt: SALT,
        parameters: STRONG_PASSWORD_PARAMETERS,
      });
      const refusal = expect(derived).rejects.toEqual(new PasswordKeyFailure('timeout'));
      await vi.advanceTimersByTimeAsync(30_000);

      await refusal;
      expect(worker.terminated).toBe(true);
    });
  });
});
