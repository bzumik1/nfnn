import { base64UrlToBytes, bytesToBase64Url, framed } from './device-bytes';
import { prfInput, readPrf } from './prf';

const COPY_SALT = bytesToBase64Url(new Uint8Array(32).fill(3));
const CREDENTIAL = bytesToBase64Url(new Uint8Array([1, 2, 3, 4]));

function credentialsAnswering(extensionResults: AuthenticationExtensionsClientOutputs | null) {
  const get = vi
    .fn()
    .mockResolvedValue(
      extensionResults === null
        ? null
        : { type: 'public-key', getClientExtensionResults: () => extensionResults },
    );
  return { get, credentials: { get } as unknown as CredentialsContainer };
}

describe('Given the passkey PRF of a device copy', () => {
  it('when the input is made from the copy salt, then it is the SHA-256 of the framed label and salt', async () => {
    const expected = new Uint8Array(
      await crypto.subtle.digest('SHA-256', framed('nfnn-prf-v1', base64UrlToBytes(COPY_SALT))),
    );

    expect(await prfInput(COPY_SALT)).toEqual(expected);
    expect(await prfInput(bytesToBase64Url(new Uint8Array(32).fill(4)))).not.toEqual(expected);
  });

  it('when it is read, then only that passkey is allowed, user verification is required and the PRF input is asked for', async () => {
    const { get, credentials } = credentialsAnswering({
      prf: { results: { first: new Uint8Array(32).fill(8).buffer } },
    });

    await readPrf(credentials, { rpId: 'nfnn.cz', credentialId: CREDENTIAL, copySalt: COPY_SALT });

    const publicKey = get.mock.calls[0][0].publicKey as PublicKeyCredentialRequestOptions;
    expect(publicKey.rpId).toBe('nfnn.cz');
    expect(publicKey.userVerification).toBe('required');
    expect(new Uint8Array(publicKey.challenge as ArrayBuffer)).toHaveLength(32);
    expect(
      publicKey.allowCredentials?.map((allowed) => new Uint8Array(allowed.id as ArrayBuffer)),
    ).toEqual([new Uint8Array([1, 2, 3, 4])]);
    expect(new Uint8Array(publicKey.extensions?.prf?.eval?.first as ArrayBuffer)).toEqual(
      await prfInput(COPY_SALT),
    );
  });

  it('when the authenticator answers a PRF output, then its 32 bytes come back as a copy', async () => {
    const output = new Uint8Array(32).fill(8);
    const { credentials } = credentialsAnswering({ prf: { results: { first: output.buffer } } });

    const read = await readPrf(credentials, {
      rpId: 'nfnn.cz',
      credentialId: CREDENTIAL,
      copySalt: COPY_SALT,
    });

    expect(read).toEqual(new Uint8Array(32).fill(8));
    output.fill(0);
    expect(read).toEqual(new Uint8Array(32).fill(8));
  });

  for (const [name, results] of [
    ['no PRF extension at all', {}],
    ['PRF not enabled', { prf: { enabled: false } }],
    ['PRF without results', { prf: {} }],
  ] as const) {
    it(`when the authenticator answers ${name}, then the PRF is absent`, async () => {
      const { credentials } = credentialsAnswering(results);

      expect(
        await readPrf(credentials, {
          rpId: 'nfnn.cz',
          credentialId: CREDENTIAL,
          copySalt: COPY_SALT,
        }),
      ).toBeNull();
    });
  }

  it('when the authenticator answers an output of the wrong length, then the PRF is absent', async () => {
    const { credentials } = credentialsAnswering({
      prf: { results: { first: new Uint8Array(16).buffer } },
    });

    expect(
      await readPrf(credentials, {
        rpId: 'nfnn.cz',
        credentialId: CREDENTIAL,
        copySalt: COPY_SALT,
      }),
    ).toBeNull();
  });

  it('when the ceremony gives no credential, then the PRF is absent', async () => {
    const { credentials } = credentialsAnswering(null);

    expect(
      await readPrf(credentials, {
        rpId: 'nfnn.cz',
        credentialId: CREDENTIAL,
        copySalt: COPY_SALT,
      }),
    ).toBeNull();
  });
});
