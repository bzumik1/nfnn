import { utf8 } from './device-bytes';
import {
  DERIVATION_TIMEOUT_MS,
  deriveWithMeasuredParameters,
  deriveWithParameters,
  PasswordKeyFailure,
  passwordBytes,
  STANDARD_PASSWORD_PARAMETERS,
  STRONG_ATTEMPT_TIMEOUT_MS,
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
  onmessageerror: ((event: MessageEvent) => void) | null = null;

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

  garble(): void {
    this.onmessageerror?.({ data: null } as MessageEvent);
  }
}

describe('Given the password key of a device copy', () => {
  it('when a password is written in two Unicode forms, then both give the same bytes (NFC)', () => {
    const composed = 'Kn\u00ed\u017eka';
    const decomposed = 'Kni\u0301z\u030cka';

    expect(decomposed).not.toBe(composed);
    expect(passwordBytes(decomposed)).toEqual(passwordBytes(composed));
    expect(passwordBytes('heslo')).toEqual(utf8('heslo'));
  });

  it('when the strong parameters run within a second, then the key uses 128 MiB and three passes', async () => {
    const derivation = new ScriptedDerivation([{ takesMs: 900 }]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT);

    expect(measured.parameters).toEqual(STRONG_PASSWORD_PARAMETERS);
    expect(derivation.requested).toEqual([STRONG_PASSWORD_PARAMETERS]);
    expect(measured.key).toHaveLength(32);
  });

  it('when the strong parameters take longer than a second, then the key is derived again with 64 MiB', async () => {
    const derivation = new ScriptedDerivation([{ takesMs: 1400 }, { takesMs: 700 }]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT);

    expect(measured.parameters).toEqual(STANDARD_PASSWORD_PARAMETERS);
    expect(derivation.requested).toEqual([
      STRONG_PASSWORD_PARAMETERS,
      STANDARD_PASSWORD_PARAMETERS,
    ]);
  });

  it('when the device cannot give the strong parameters their memory, then the key uses 64 MiB', async () => {
    const derivation = new ScriptedDerivation([{ fails: new PasswordKeyFailure('memory') }, {}]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT);

    expect(measured.parameters).toEqual(STANDARD_PASSWORD_PARAMETERS);
  });

  it('when the strong attempt runs out of its own short time, then the key is derived again with 64 MiB', async () => {
    const derivation = new ScriptedDerivation([{ fails: new PasswordKeyFailure('timeout') }, {}]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT);

    expect(measured.parameters).toEqual(STANDARD_PASSWORD_PARAMETERS);
    expect(derivation.timeouts).toEqual([STRONG_ATTEMPT_TIMEOUT_MS, undefined]);
    expect(STRONG_ATTEMPT_TIMEOUT_MS).toBeLessThan(DERIVATION_TIMEOUT_MS);
  });

  it('when the strong attempt fails for another reason, then the key is derived again with 64 MiB', async () => {
    const derivation = new ScriptedDerivation([{ fails: new PasswordKeyFailure('failed') }, {}]);

    const measured = await deriveWithMeasuredParameters(derivation, 'heslo', SALT);

    expect(measured.parameters).toEqual(STANDARD_PASSWORD_PARAMETERS);
  });

  it('when the strong key came too late, then its bytes are zeroed before the 64 MiB key is derived', async () => {
    const derivation = new ScriptedDerivation([{ takesMs: 1400 }, {}]);

    await deriveWithMeasuredParameters(derivation, 'heslo', SALT);

    expect(Array.from(derivation.keys[0])).toEqual(new Array(32).fill(0));
    expect(Array.from(derivation.keys[1])).not.toEqual(new Array(32).fill(0));
  });

  it('when the strong attempt throws something other than a derivation failure, then it reaches the caller and nothing is derived again', async () => {
    const unexpected = new TypeError('unexpected');
    const derivation = new ScriptedDerivation([{ throws: unexpected }, {}]);

    await expect(deriveWithMeasuredParameters(derivation, 'heslo', SALT)).rejects.toBe(unexpected);
    expect(derivation.requested).toEqual([STRONG_PASSWORD_PARAMETERS]);
  });

  it('when the standard parameters fail too, then the failure reaches the caller', async () => {
    const derivation = new ScriptedDerivation([
      { fails: new PasswordKeyFailure('memory') },
      { fails: new PasswordKeyFailure('memory') },
    ]);

    await expect(deriveWithMeasuredParameters(derivation, 'heslo', SALT)).rejects.toEqual(
      new PasswordKeyFailure('memory'),
    );
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
    expect(again.key).toEqual(first.key);
    expect(other.key).not.toEqual(first.key);
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
      worker.answer({ key: new Uint8Array(32).fill(9), elapsedMs: 420 });

      await expect(derived).resolves.toEqual({ key: new Uint8Array(32).fill(9), elapsedMs: 420 });
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

    it('and its answer cannot be read, then the derivation fails and the worker ends', async () => {
      const worker = new FakeWorker();

      const derived = derivationWith(worker).derive({
        password: utf8('heslo'),
        salt: SALT,
        parameters: STRONG_PASSWORD_PARAMETERS,
      });
      worker.garble();

      await expect(derived).rejects.toEqual(new PasswordKeyFailure('failed'));
      expect(worker.terminated).toBe(true);
    });

    it('and the key arrives, then the transferred bytes themselves are the key, so zeroing it zeroes the only copy', async () => {
      const worker = new FakeWorker();
      const sent = new Uint8Array(32).fill(9);

      const derived = derivationWith(worker).derive({
        password: utf8('heslo'),
        salt: SALT,
        parameters: STRONG_PASSWORD_PARAMETERS,
      });
      worker.answer({ key: sent, elapsedMs: 1 });

      expect((await derived).key).toBe(sent);
    });

    for (const [name, data] of [
      ['a key of 16 bytes', { key: new Uint8Array(16), elapsedMs: 1 }],
      ['a key that is no byte array', { key: 'AAAA', elapsedMs: 1 }],
      ['no time', { key: new Uint8Array(32) }],
      ['nothing it knows', { hello: true }],
    ] as const) {
      it(`and it answers ${name}, then the derivation fails and the worker ends`, async () => {
        const worker = new FakeWorker();

        const derived = derivationWith(worker).derive({
          password: utf8('heslo'),
          salt: SALT,
          parameters: STRONG_PASSWORD_PARAMETERS,
        });
        worker.answer(data);

        await expect(derived).rejects.toEqual(new PasswordKeyFailure('failed'));
        expect(worker.terminated).toBe(true);
      });
    }

    it('and the browser refuses to start the worker, then the derivation fails', async () => {
      const derivation = new WorkerPasswordKeyDerivation(() => {
        throw new DOMException('Refused', 'SecurityError');
      });

      await expect(
        derivation.derive({
          password: utf8('heslo'),
          salt: SALT,
          parameters: STRONG_PASSWORD_PARAMETERS,
        }),
      ).rejects.toEqual(new PasswordKeyFailure('failed'));
    });

    it('and a call names a shorter time, then that time ends the derivation', async () => {
      vi.useFakeTimers();
      const worker = new FakeWorker();

      const derived = derivationWith(worker, 30_000).derive(
        { password: utf8('heslo'), salt: SALT, parameters: STRONG_PASSWORD_PARAMETERS },
        5_000,
      );
      const refusal = expect(derived).rejects.toEqual(new PasswordKeyFailure('timeout'));
      await vi.advanceTimersByTimeAsync(5_000);

      await refusal;
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

    it('and its key arrives after the time ran out, then the derivation stays timed out', async () => {
      vi.useFakeTimers();
      const worker = new FakeWorker();

      const derived = derivationWith(worker, 1_000).derive({
        password: utf8('heslo'),
        salt: SALT,
        parameters: STRONG_PASSWORD_PARAMETERS,
      });
      const refusal = expect(derived).rejects.toEqual(new PasswordKeyFailure('timeout'));
      await vi.advanceTimersByTimeAsync(1_000);
      worker.answer({ key: new Uint8Array(32), elapsedMs: 1 });

      await refusal;
      expect(worker.onmessage).toBeNull();
    });
  });
});
