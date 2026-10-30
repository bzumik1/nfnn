import { keyLookup, type ReceiptKeysResponse, trustedKeys } from './receipt-keys';

const TEST_1 = {
  keyId: '21fe31df',
  algorithm: 'Ed25519',
  publicKey: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  status: 'active',
  registeredAt: '2026-11-13T11:00:00Z',
};

const TEST_2 = {
  keyId: '39f713d0',
  algorithm: 'Ed25519',
  publicKey: 'PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw',
  status: 'revoked',
  registeredAt: '2026-11-14T11:00:00Z',
};

const SHA_ABC = {
  keyId: '5f9b247e',
  algorithm: 'Ed25519',
  publicKey: '7Bcrk61eVjv0kyxw4SRQNMNUZ-8u_U1k6_gZaDRn4r8',
  status: 'active',
  registeredAt: '2026-11-15T11:00:00Z',
};

const SERVER_KEY = {
  keyId: 'a31fc94e',
  algorithm: 'Ed25519',
  publicKey: 'XW4rKhHjpuXGxMChuPfT4qm0xtjg8aKzxNXm9wgZKjs',
  status: 'active',
  registeredAt: '2026-11-26T11:00:00Z',
};

const TEST_3 = {
  keyId: 'dac073e0',
  algorithm: 'Ed25519',
  publicKey: '_FHNjmIYoaONpH7QAjDwWAgW7RO6MwOsXeuRFUiQgCU',
  status: 'active',
  registeredAt: '2026-11-16T11:00:00Z',
};

const TEST_1024 = {
  keyId: '91384c41',
  algorithm: 'Ed25519',
  publicKey: 'J4EX_BRMcjQPZ9DyMW6Dhs7_vyskKMnFH-98WX8dQm4',
  status: 'active',
  registeredAt: '2026-11-17T11:00:00Z',
};

const ED25519CTX = {
  keyId: 'c07ba992',
  algorithm: 'Ed25519',
  publicKey: '38lCXk-Wj38MKfAlnPX5rtaFHCu0rYv7hgz-4KskgpI',
  status: 'active',
  registeredAt: '2026-11-18T11:00:00Z',
};

const RFC_8032_TEST_KEYS = [TEST_1, TEST_2, TEST_3, TEST_1024, SHA_ABC, ED25519CTX];

function listOf(...keys: unknown[]): ReceiptKeysResponse {
  return {
    foundation: { name: 'Nová naděje - nadační fond', companyIdentifier: '27278794' },
    keys,
  } as ReceiptKeysResponse;
}

describe('Given the key list the server publishes', () => {
  it('when it is read on the test server, then every well-formed key is trusted with its status', async () => {
    const trusted = await trustedKeys(listOf(TEST_1, TEST_2), 'localhost');

    expect(trusted?.foundationCompanyIdentifier).toBe('27278794');
    expect(trusted?.keys.map((key) => [key.keyId, key.status, key.publicKey.length])).toEqual([
      ['21fe31df', 'active', 32],
      ['39f713d0', 'revoked', 32],
    ]);
  });

  it('when a key is looked up by its id, then it is found and an unknown id is not', async () => {
    const lookup = keyLookup(await trustedKeys(listOf(TEST_1), 'localhost'));

    expect(lookup('21fe31df')?.keyId).toBe('21fe31df');
    expect(lookup('39f713d0')).toBeUndefined();
    expect(keyLookup(null)('21fe31df')).toBeUndefined();
  });

  it('when a key id does not belong to its public key, then that key is left out', async () => {
    const trusted = await trustedKeys(
      listOf({ ...SHA_ABC, keyId: '21fe31df' }, SHA_ABC),
      'localhost',
    );

    expect(trusted?.keys.map((key) => key.keyId)).toEqual(['5f9b247e']);
  });

  it('when a key is not Ed25519, not 32 bytes, not base64url or of an unknown status, then it is left out', async () => {
    const trusted = await trustedKeys(
      listOf(
        { ...TEST_1, algorithm: 'Ed448' },
        { ...TEST_1, publicKey: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHUR' },
        { ...TEST_1, publicKey: '11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo' },
        { ...TEST_1, status: 'retired' },
        { ...TEST_1, keyId: '21FE31DF' },
        'a key',
        SHA_ABC,
      ),
      'localhost',
    );

    expect(trusted?.keys.map((key) => key.keyId)).toEqual(['5f9b247e']);
  });

  it('when the list itself is malformed, then nothing is trusted', async () => {
    expect(await trustedKeys(null, 'localhost')).toBeNull();
    expect(await trustedKeys({ keys: [TEST_1] }, 'localhost')).toBeNull();
    expect(
      await trustedKeys(
        { foundation: { name: 'x', companyIdentifier: '2727879' }, keys: [TEST_1] },
        'localhost',
      ),
    ).toBeNull();
    expect(
      await trustedKeys({ foundation: listOf().foundation, keys: 'none' }, 'localhost'),
    ).toBeNull();
  });

  it('when it is read on any host but this computer, then none of the public RFC 8032 test keys is trusted', async () => {
    for (const host of ['nfnn.cz', 'www.nfnn.cz', 'nfnn.cz.', 'nfnn.znamenacek.duckdns.org']) {
      const trusted = await trustedKeys(listOf(...RFC_8032_TEST_KEYS, SERVER_KEY), host);

      expect(trusted?.keys.map((key) => key.keyId)).toEqual(['a31fc94e']);
    }
  });

  it('when it is read on this computer, then the RFC 8032 test keys the tests sign with are trusted', async () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const trusted = await trustedKeys(listOf(...RFC_8032_TEST_KEYS), host);

      expect(trusted?.keys.map((key) => key.keyId)).toEqual(
        RFC_8032_TEST_KEYS.map((key) => key.keyId),
      );
    }
  });

  it('when a key id differs from its public key only in its last byte, then that key is left out', async () => {
    const trusted = await trustedKeys(listOf({ ...SERVER_KEY, keyId: 'a31fc94f' }), 'nfnn.cz');

    expect(trusted?.keys).toEqual([]);
  });

  it('when one entry is malformed and another is good, then the good one is trusted alone', async () => {
    const trusted = await trustedKeys(
      listOf({ ...TEST_1, publicKey: 'short' }, SERVER_KEY),
      'nfnn.cz',
    );

    expect(trusted?.keys.map((key) => key.keyId)).toEqual(['a31fc94e']);
  });

  it('when a key id is listed twice, then that key counts as revoked whatever either entry says', async () => {
    for (const keys of [
      [SERVER_KEY, { ...SERVER_KEY, status: 'revoked' }],
      [{ ...SERVER_KEY, status: 'revoked' }, SERVER_KEY],
      [SERVER_KEY, SERVER_KEY],
    ]) {
      const lookup = keyLookup(await trustedKeys(listOf(...keys, TEST_1), 'localhost'));

      expect(lookup('a31fc94e')?.status).toBe('revoked');
      expect(lookup('21fe31df')?.status).toBe('active');
    }
  });
});
