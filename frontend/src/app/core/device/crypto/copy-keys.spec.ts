import {
  CopyRefused,
  generateSessionKey,
  type KeyWrap,
  OpenCopy,
  type PasswordWrap,
  openWithPassword,
  openWithPrf,
  openWithSessionKey,
  type RecordAddress,
  type SealedRecord,
} from './copy-keys';
import { base64UrlToBytes, bytesToBase64Url, utf8 } from './device-bytes';
import { STANDARD_PASSWORD_PARAMETERS, STRONG_PASSWORD_PARAMETERS } from './password-key';
import { ScriptedDerivation, SmallArgon2Derivation } from './testing/password-key-derivations';

const GIFTS_2026: RecordAddress = { collection: 'donations', recordId: '2026', schemaVersion: 1 };
const PRF_OUTPUT = new Uint8Array(32).fill(0x5a);
const CREDENTIAL = 'Y3JlZGVudGlhbC0x';

function flipped(record: SealedRecord): SealedRecord {
  const bytes = base64UrlToBytes(record.sealed);
  bytes[3] ^= 0x01;
  return { ...record, sealed: bytesToBase64Url(bytes) };
}

async function refusal(promise: Promise<unknown>): Promise<CopyRefused> {
  try {
    await promise;
  } catch (failure: unknown) {
    if (failure instanceof CopyRefused) {
      return failure;
    }
    throw failure;
  }
  throw new Error('Expected a refusal');
}

describe('Given a new device copy', () => {
  let copy: OpenCopy;

  beforeEach(async () => {
    copy = await OpenCopy.create();
  });

  it('when it is created, then it has a random copy id and salt of its own', async () => {
    const other = await OpenCopy.create();

    expect(base64UrlToBytes(copy.copyId)).toHaveLength(16);
    expect(base64UrlToBytes(copy.copySalt)).toHaveLength(32);
    expect(other.copyId).not.toBe(copy.copyId);
    expect(other.copySalt).not.toBe(copy.copySalt);
  });

  it('when a record is sealed and opened at the same address, then the plaintext comes back', async () => {
    const sealed = await copy.sealRecord(GIFTS_2026, utf8('{"gifts":[100,500]}'));

    expect(new TextDecoder().decode(await copy.openRecord(GIFTS_2026, sealed))).toBe(
      '{"gifts":[100,500]}',
    );
    expect(base64UrlToBytes(sealed.iv)).toHaveLength(12);
    expect(sealed.sealed).not.toContain(bytesToBase64Url(utf8('gifts')));
  });

  it('when the same record is sealed twice, then the two ciphertexts differ (a fresh IV each time)', async () => {
    const first = await copy.sealRecord(GIFTS_2026, utf8('same'));
    const second = await copy.sealRecord(GIFTS_2026, utf8('same'));

    expect(second.iv).not.toBe(first.iv);
    expect(second.sealed).not.toBe(first.sealed);
  });

  describe('when a sealed record is opened at another address', () => {
    for (const [name, address] of [
      ['another collection', { ...GIFTS_2026, collection: 'receipts' }],
      ['another record id', { ...GIFTS_2026, recordId: '2025' }],
      ['another schema version', { ...GIFTS_2026, schemaVersion: 2 }],
    ] as const) {
      it(`(${name}), then it is refused as damaged`, async () => {
        const sealed = await copy.sealRecord(GIFTS_2026, utf8('{}'));

        expect((await refusal(copy.openRecord(address, sealed))).reason).toBe('damaged');
      });
    }
  });

  it('when a record is moved into another copy, then that copy refuses it', async () => {
    const other = await OpenCopy.create();
    const sealed = await copy.sealRecord(GIFTS_2026, utf8('{}'));

    expect((await refusal(other.openRecord(GIFTS_2026, sealed))).reason).toBe('damaged');
  });

  it('when one byte of a sealed record is flipped, then it is refused as damaged', async () => {
    const sealed = await copy.sealRecord(GIFTS_2026, utf8('{"gifts":[100]}'));

    expect((await refusal(copy.openRecord(GIFTS_2026, flipped(sealed)))).reason).toBe('damaged');
  });

  it('when keys are made or imported, then none of them can be exported', async () => {
    const importKey = vi.spyOn(crypto.subtle, 'importKey');
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey');

    const created = await OpenCopy.create();
    await created.sealRecord(GIFTS_2026, utf8('{}'));
    const wrap = await created.wrapWithPrf(CREDENTIAL, PRF_OUTPUT);
    await openWithPrf(created, wrap, PRF_OUTPUT);
    await created.wrapWithSessionKey(await generateSessionKey());

    const extractableFlags = [
      ...importKey.mock.calls.map((call) => call[3]),
      ...generateKey.mock.calls.map((call) => call[1]),
    ];
    expect(extractableFlags.length).toBeGreaterThan(0);
    expect(extractableFlags.every((extractable) => extractable === false)).toBe(true);
    vi.restoreAllMocks();
  });

  it('when it is closed, then it seals, opens and wraps nothing more', async () => {
    const sealed = await copy.sealRecord(GIFTS_2026, utf8('{}'));

    copy.close();

    expect((await refusal(copy.sealRecord(GIFTS_2026, utf8('{}')))).reason).toBe('closed');
    expect((await refusal(copy.openRecord(GIFTS_2026, sealed))).reason).toBe('closed');
    expect((await refusal(copy.wrapWithPrf(CREDENTIAL, PRF_OUTPUT))).reason).toBe('closed');
  });

  it('when it is re-keyed, then it keeps its id, the old records no longer open and the old copy is closed', async () => {
    const old = await copy.sealRecord(GIFTS_2026, utf8('{}'));

    const rekeyed = await copy.rekeyed();

    expect(rekeyed.copyId).toBe(copy.copyId);
    expect(rekeyed.copySalt).toBe(copy.copySalt);
    expect((await refusal(rekeyed.openRecord(GIFTS_2026, old))).reason).toBe('damaged');
    expect((await refusal(copy.sealRecord(GIFTS_2026, utf8('{}')))).reason).toBe('closed');
    const fresh = await rekeyed.sealRecord(GIFTS_2026, utf8('{"new":true}'));
    expect(new TextDecoder().decode(await rekeyed.openRecord(GIFTS_2026, fresh))).toBe(
      '{"new":true}',
    );
  });

  describe('when it is wrapped with the password', () => {
    let derivation: SmallArgon2Derivation;
    let wrap: KeyWrap;
    let sealed: SealedRecord;

    beforeEach(async () => {
      derivation = new SmallArgon2Derivation();
      sealed = await copy.sealRecord(GIFTS_2026, utf8('{"gifts":[100]}'));
      wrap = await copy.wrapWithPassword('Knížka 2026', derivation, () => 0);
    });

    it('then the wrap names its salt and Argon2id parameters and holds no root key in the clear', () => {
      expect(wrap.kind).toBe('password');
      if (wrap.kind !== 'password') {
        return;
      }
      expect(base64UrlToBytes(wrap.salt)).toHaveLength(16);
      expect(wrap.parameters).toEqual(STRONG_PASSWORD_PARAMETERS);
      expect(base64UrlToBytes(wrap.sealed)).toHaveLength(32 + 16);
    });

    it('then the same password opens a copy that reads the old records', async () => {
      const opened = await openWithPassword(copy, wrap, 'Knížka 2026', derivation);

      expect(new TextDecoder().decode(await opened.openRecord(GIFTS_2026, sealed))).toBe(
        '{"gifts":[100]}',
      );
    });

    it('then the password typed in its decomposed form opens it too', async () => {
      const opened = await openWithPassword(copy, wrap, 'Knížka 2026', derivation);

      expect(opened.copyId).toBe(copy.copyId);
    });

    it('then a wrong password is refused as a wrong secret', async () => {
      expect((await refusal(openWithPassword(copy, wrap, 'knizka 2026', derivation))).reason).toBe(
        'wrong-secret',
      );
    });

    it('then the stored parameters are used again when it is opened', async () => {
      await openWithPassword(copy, wrap, 'Knížka 2026', derivation);

      expect(derivation.requested.at(-1)).toEqual(STRONG_PASSWORD_PARAMETERS);
    });

    it('then the wrap moved to another copy is refused', async () => {
      const other = await OpenCopy.create();

      expect((await refusal(openWithPassword(other, wrap, 'Knížka 2026', derivation))).reason).toBe(
        'wrong-secret',
      );
    });

    it('then the wrap is not taken as a passkey or session wrap', async () => {
      expect((await refusal(openWithPrf(copy, wrap, PRF_OUTPUT))).reason).toBe('wrong-wrap');
      expect(
        (await refusal(openWithSessionKey(copy, wrap, await generateSessionKey()))).reason,
      ).toBe('wrong-wrap');
    });
  });

  describe('when a stored password wrap was tampered with', () => {
    let derivation: SmallArgon2Derivation;
    let wrap: PasswordWrap;

    beforeEach(async () => {
      derivation = new SmallArgon2Derivation();
      wrap = await copy.wrapWithPassword('heslo', derivation, () => 0);
      derivation.requested.length = 0;
    });

    for (const [name, parameters] of [
      ['4 GiB of memory', { ...STRONG_PASSWORD_PARAMETERS, memoryKiB: 4 * 1024 * 1024 }],
      ['less than 64 MiB', { ...STRONG_PASSWORD_PARAMETERS, memoryKiB: 1024 }],
      ['no passes', { ...STRONG_PASSWORD_PARAMETERS, iterations: 0 }],
      ['a thousand passes', { ...STRONG_PASSWORD_PARAMETERS, iterations: 1000 }],
      ['four lanes', { ...STRONG_PASSWORD_PARAMETERS, parallelism: 4 }],
      ['a fractional memory size', { ...STRONG_PASSWORD_PARAMETERS, memoryKiB: 65536.5 }],
      ['another algorithm', { ...STRONG_PASSWORD_PARAMETERS, algorithm: 'argon2i' }],
      ['another version', { ...STRONG_PASSWORD_PARAMETERS, version: 16 }],
    ] as const) {
      it(`(${name}), then it is refused as damaged before any key is derived`, async () => {
        const tampered = { ...wrap, parameters } as unknown as KeyWrap;

        expect((await refusal(openWithPassword(copy, tampered, 'heslo', derivation))).reason).toBe(
          'damaged',
        );
        expect(derivation.requested).toEqual([]);
      });
    }

    it('(a salt of 8 bytes), then it is refused as damaged before any key is derived', async () => {
      const tampered = { ...wrap, salt: bytesToBase64Url(new Uint8Array(8)) };

      expect((await refusal(openWithPassword(copy, tampered, 'heslo', derivation))).reason).toBe(
        'damaged',
      );
      expect(derivation.requested).toEqual([]);
    });

    it('(other accepted parameters), then the wrap does not open, because its parameters are bound to it', async () => {
      const tampered = {
        ...wrap,
        parameters: { ...wrap.parameters, iterations: 4 },
      };

      expect((await refusal(openWithPassword(copy, tampered, 'heslo', derivation))).reason).toBe(
        'wrong-secret',
      );
    });

    it('(another salt), then the wrap does not open', async () => {
      const tampered = { ...wrap, salt: bytesToBase64Url(new Uint8Array(16).fill(1)) };

      expect((await refusal(openWithPassword(copy, tampered, 'heslo', derivation))).reason).toBe(
        'wrong-secret',
      );
    });
  });

  describe('when a stored wrap or record is not base64url', () => {
    it('then the record is refused as damaged', async () => {
      const sealed = await copy.sealRecord(GIFTS_2026, utf8('{}'));

      expect(
        (await refusal(copy.openRecord(GIFTS_2026, { ...sealed, sealed: 'not base64url!' })))
          .reason,
      ).toBe('damaged');
      expect((await refusal(copy.openRecord(GIFTS_2026, { ...sealed, iv: 'AAAA' }))).reason).toBe(
        'damaged',
      );
    });

    it('then a passkey or password wrap is refused as damaged', async () => {
      const prfWrap = await copy.wrapWithPrf(CREDENTIAL, PRF_OUTPUT);
      const passwordWrap = await copy.wrapWithPassword(
        'heslo',
        new SmallArgon2Derivation(),
        () => 0,
      );

      expect((await refusal(openWithPrf(copy, { ...prfWrap, iv: '%%' }, PRF_OUTPUT))).reason).toBe(
        'damaged',
      );
      expect(
        (
          await refusal(
            openWithPassword(
              copy,
              { ...passwordWrap, salt: '***' },
              'heslo',
              new SmallArgon2Derivation(),
            ),
          )
        ).reason,
      ).toBe('damaged');
    });
  });

  it('when the device is slow, then the password wrap keeps the 64 MiB parameters it measured', async () => {
    const derivation = new ScriptedDerivation([{ takesMs: 2500 }, { takesMs: 1200 }]);

    const wrap = await copy.wrapWithPassword('heslo', derivation, derivation.now);

    expect(wrap.parameters).toEqual(STANDARD_PASSWORD_PARAMETERS);
    const opened = await openWithPassword(copy, wrap, 'heslo', derivation);
    expect(opened.copyId).toBe(copy.copyId);
    expect(derivation.requested.at(-1)).toEqual(STANDARD_PASSWORD_PARAMETERS);
  });

  describe('when it is wrapped with a passkey PRF output', () => {
    let wrap: KeyWrap;

    beforeEach(async () => {
      wrap = await copy.wrapWithPrf(CREDENTIAL, PRF_OUTPUT);
    });

    it('then the same output opens it', async () => {
      const sealed = await copy.sealRecord(GIFTS_2026, utf8('{}'));

      const opened = await openWithPrf(copy, wrap, PRF_OUTPUT);

      expect(new TextDecoder().decode(await opened.openRecord(GIFTS_2026, sealed))).toBe('{}');
      expect(wrap).toMatchObject({ kind: 'prf', credentialId: CREDENTIAL });
    });

    it('then another output is refused as a wrong secret', async () => {
      expect((await refusal(openWithPrf(copy, wrap, new Uint8Array(32).fill(1)))).reason).toBe(
        'wrong-secret',
      );
    });

    it('then the wrap relabelled for another passkey is refused', async () => {
      const relabelled = { ...wrap, credentialId: 'b3RoZXI' } as KeyWrap;

      expect((await refusal(openWithPrf(copy, relabelled, PRF_OUTPUT))).reason).toBe(
        'wrong-secret',
      );
    });

    it('then a flipped byte of the wrap is refused', async () => {
      expect((await refusal(openWithPrf(copy, flipped(wrap) as KeyWrap, PRF_OUTPUT))).reason).toBe(
        'wrong-secret',
      );
    });
  });

  describe('when it is wrapped with a session key', () => {
    it('then that key opens it and another session key does not', async () => {
      const sessionKey = await generateSessionKey();
      const wrap = await copy.wrapWithSessionKey(sessionKey);

      const opened = await openWithSessionKey(copy, wrap, sessionKey);

      expect(opened.copyId).toBe(copy.copyId);
      expect(
        (await refusal(openWithSessionKey(copy, wrap, await generateSessionKey()))).reason,
      ).toBe('wrong-secret');
    });

    it('then the session key itself cannot be exported', async () => {
      const sessionKey = await generateSessionKey();

      expect(sessionKey.extractable).toBe(false);
      await expect(crypto.subtle.exportKey('raw', sessionKey)).rejects.toThrow();
    });
  });

  it('when a wrap is relabelled as another kind, then it does not open', async () => {
    const sessionKey = await generateSessionKey();
    const wrap = await copy.wrapWithPrf(CREDENTIAL, PRF_OUTPUT);
    const relabelled = { kind: 'session', iv: wrap.iv, sealed: wrap.sealed } as KeyWrap;

    expect((await refusal(openWithSessionKey(copy, relabelled, sessionKey))).reason).toBe(
      'wrong-secret',
    );
  });
});
