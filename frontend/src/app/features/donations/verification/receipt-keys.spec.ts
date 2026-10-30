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

  it('when it is read on nfnn.cz, then the public RFC 8032 test keys are never trusted', async () => {
    for (const host of ['nfnn.cz', 'www.nfnn.cz']) {
      const trusted = await trustedKeys(listOf(TEST_1, TEST_2, SHA_ABC, SERVER_KEY), host);

      expect(trusted?.keys.map((key) => key.keyId)).toEqual(['a31fc94e']);
    }
  });
});
