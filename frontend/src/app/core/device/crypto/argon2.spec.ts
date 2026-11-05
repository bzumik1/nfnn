import { argon2FailureOf, argon2id, argon2WorkerAnswer } from './argon2';
import { utf8 } from './device-bytes';
import { bytesToHex } from './testing/hex';

const REFERENCE_ARGON2ID_V13 = [
  {
    name: 't=2, m=2^16, p=1',
    password: 'password',
    salt: 'somesalt',
    iterations: 2,
    memoryKiB: 1 << 16,
    parallelism: 1,
    tag: '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7',
  },
  {
    name: 't=2, m=2^8, p=1',
    password: 'password',
    salt: 'somesalt',
    iterations: 2,
    memoryKiB: 1 << 8,
    parallelism: 1,
    tag: '9dfeb910e80bad0311fee20f9c0e2b12c17987b4cac90c2ef54d5b3021c68bfe',
  },
  {
    name: 't=2, m=2^8, p=2',
    password: 'password',
    salt: 'somesalt',
    iterations: 2,
    memoryKiB: 1 << 8,
    parallelism: 2,
    tag: '6d093c501fd5999645e0ea3bf620d7b8be7fd2db59c20d9fff9539da2bf57037',
  },
  {
    name: 't=1, m=2^16, p=1',
    password: 'password',
    salt: 'somesalt',
    iterations: 1,
    memoryKiB: 1 << 16,
    parallelism: 1,
    tag: 'f6a5adc1ba723dddef9b5ac1d464e180fcd9dffc9d1cbf76cca2fed795d9ca98',
  },
  {
    name: 't=4, m=2^16, p=1',
    password: 'password',
    salt: 'somesalt',
    iterations: 4,
    memoryKiB: 1 << 16,
    parallelism: 1,
    tag: '9025d48e68ef7395cca9079da4c4ec3affb3c8911fe4f86d1a2520856f63172c',
  },
  {
    name: 't=2, m=2^16, p=1, another password',
    password: 'differentpassword',
    salt: 'somesalt',
    iterations: 2,
    memoryKiB: 1 << 16,
    parallelism: 1,
    tag: '0b84d652cf6b0c4beaef0dfe278ba6a80df6696281d7e0d2891b817d8c458fde',
  },
  {
    name: 't=2, m=2^16, p=1, another salt',
    password: 'password',
    salt: 'diffsalt',
    iterations: 2,
    memoryKiB: 1 << 16,
    parallelism: 1,
    tag: 'bdf32b05ccc42eb15d58fd19b1f856b113da1e9a5874fdcc544308565aa8141c',
  },
];

describe('Given Argon2id through hash-wasm', () => {
  for (const vector of REFERENCE_ARGON2ID_V13) {
    it(`when it hashes the reference implementation's vector ${vector.name}, then it gives the published tag`, async () => {
      const tag = await argon2id({
        password: utf8(vector.password),
        salt: utf8(vector.salt),
        iterations: vector.iterations,
        memoryKiB: vector.memoryKiB,
        parallelism: vector.parallelism,
        hashLength: 32,
      });

      expect(bytesToHex(tag)).toBe(vector.tag);
    });
  }
});

describe('Given the Argon2id worker', () => {
  it('when it gets a question, then it answers the 32-byte key the parameters give', async () => {
    const question = {
      password: utf8('heslo'),
      salt: utf8('sixteen byte slt'),
      parameters: {
        algorithm: 'argon2id' as const,
        version: 19 as const,
        memoryKiB: 64,
        iterations: 1,
        parallelism: 1,
      },
    };

    const answer = await argon2WorkerAnswer(question);

    expect(answer).toEqual({
      key: await argon2id({
        password: utf8('heslo'),
        salt: question.salt,
        memoryKiB: 64,
        iterations: 1,
        parallelism: 1,
        hashLength: 32,
      }),
    });
  });

  it('when it has derived the key, then the password bytes it received are zeroed', async () => {
    const password = utf8('heslo');

    await argon2WorkerAnswer({
      password,
      salt: utf8('sixteen byte slt'),
      parameters: {
        algorithm: 'argon2id',
        version: 19,
        memoryKiB: 64,
        iterations: 1,
        parallelism: 1,
      },
    });

    expect(Array.from(password)).toEqual([0, 0, 0, 0, 0]);
  });

  it('when the parameters are not ones it can run, then it answers a failure instead of a key', async () => {
    const answer = await argon2WorkerAnswer({
      password: utf8('heslo'),
      salt: utf8('sixteen byte slt'),
      parameters: {
        algorithm: 'argon2id',
        version: 19,
        memoryKiB: 64,
        iterations: 0,
        parallelism: 1,
      },
    });

    expect(answer).toEqual({ failure: 'failed' });
  });

  it('when the memory cannot be had, then the failure says memory', () => {
    expect(argon2FailureOf(new RangeError('WebAssembly.Memory(): could not allocate memory'))).toBe(
      'memory',
    );
    expect(argon2FailureOf(new Error('Out of memory'))).toBe('memory');
    expect(argon2FailureOf(new Error('Iterations should be a positive number'))).toBe('failed');
  });
});
