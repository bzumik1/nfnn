import { base64UrlToBytes, bytesToBase64Url, framed } from './device-bytes';
import { prfInput, readPrf } from './prf';

const DEVICE_SALT = bytesToBase64Url(new Uint8Array(32).fill(3));
const CREDENTIAL_BYTES = [1, 2, 3, 4];
const CREDENTIAL = bytesToBase64Url(new Uint8Array(CREDENTIAL_BYTES));
const OTHER_CREDENTIAL = bytesToBase64Url(new Uint8Array([9, 9, 9]));
const USER_HANDLE = new Uint8Array(16).fill(6);

interface Answer {
  readonly rawId?: readonly number[];
  readonly userHandle?: Uint8Array | null;
  readonly flags?: number;
}

function authenticatorData(flags: number): ArrayBuffer {
  const data = new Uint8Array(37);
  data[32] = flags;
  return data.buffer;
}

const USER_PRESENT_AND_VERIFIED = 0x05;
const USER_PRESENT_ONLY = 0x01;

function credentialsAnswering(
  extensionResults: AuthenticationExtensionsClientOutputs | null,
  answer: Answer = {},
) {
  const rawId = new Uint8Array(answer.rawId ?? CREDENTIAL_BYTES);
  const userHandle = answer.userHandle === undefined ? USER_HANDLE : answer.userHandle;
  const get = vi.fn().mockResolvedValue(
    extensionResults === null
      ? null
      : {
          type: 'public-key',
          rawId: rawId.buffer,
          response: {
            userHandle: userHandle === null ? null : new Uint8Array(userHandle).buffer,
            authenticatorData: authenticatorData(answer.flags ?? USER_PRESENT_AND_VERIFIED),
          },
          getClientExtensionResults: () => extensionResults,
        },
  );
  return { get, credentials: { get } as unknown as CredentialsContainer };
}

function askedOptions(get: ReturnType<typeof vi.fn>): PublicKeyCredentialRequestOptions {
  return get.mock.calls[0][0].publicKey as PublicKeyCredentialRequestOptions;
}

describe('Given the passkey PRF of the device copies', () => {
  it('when the input is made from the device salt, then it is the SHA-256 of the framed label and salt', async () => {
    const expected = new Uint8Array(
      await crypto.subtle.digest('SHA-256', framed('nfnn-prf-v1', base64UrlToBytes(DEVICE_SALT))),
    );

    expect(Array.from(await prfInput(DEVICE_SALT))).toEqual(Array.from(expected));
    expect(Array.from(await prfInput(bytesToBase64Url(new Uint8Array(32).fill(4))))).not.toEqual(
      Array.from(expected),
    );
  });

  it('when it is read for known passkeys, then only those are allowed, user verification is required and the device input is asked for', async () => {
    const { get, credentials } = credentialsAnswering({
      prf: { results: { first: new Uint8Array(32).fill(8).buffer } },
    });

    await readPrf(credentials, {
      rpId: 'nfnn.cz',
      deviceSalt: DEVICE_SALT,
      credentialIds: [CREDENTIAL, OTHER_CREDENTIAL],
    });

    const publicKey = askedOptions(get);
    expect(publicKey.rpId).toBe('nfnn.cz');
    expect(publicKey.userVerification).toBe('required');
    expect(new Uint8Array(publicKey.challenge as ArrayBuffer)).toHaveLength(32);
    expect(
      publicKey.allowCredentials?.map((allowed) =>
        bytesToBase64Url(new Uint8Array(allowed.id as ArrayBuffer)),
      ),
    ).toEqual([CREDENTIAL, OTHER_CREDENTIAL]);
    expect(
      Array.from(new Uint8Array(publicKey.extensions?.prf?.eval?.first as ArrayBuffer)),
    ).toEqual(Array.from(await prfInput(DEVICE_SALT)));
  });

  it('when it is read without known passkeys, then the browser may offer any passkey of the site', async () => {
    const { get, credentials } = credentialsAnswering({
      prf: { results: { first: new Uint8Array(32).fill(8).buffer } },
    });

    await readPrf(credentials, { rpId: 'nfnn.cz', deviceSalt: DEVICE_SALT, credentialIds: [] });

    expect(askedOptions(get).allowCredentials).toBeUndefined();
  });

  it('when the authenticator answers a PRF output, then the passkey, its user handle and a copy of the 32 bytes come back and the browser bytes are zeroed', async () => {
    const output = new Uint8Array(32).fill(8);
    const { credentials } = credentialsAnswering({ prf: { results: { first: output.buffer } } });

    const read = await readPrf(credentials, {
      rpId: 'nfnn.cz',
      deviceSalt: DEVICE_SALT,
      credentialIds: [CREDENTIAL],
    });

    expect(read?.credentialId).toBe(CREDENTIAL);
    expect(read?.userHandle).toBe(bytesToBase64Url(USER_HANDLE));
    expect(Array.from(read?.output ?? [])).toEqual(new Array(32).fill(8));
    expect(Array.from(output)).toEqual(new Array(32).fill(0));
  });

  it('when the output comes as a view into a larger buffer, then exactly its 32 bytes come back and are zeroed there', async () => {
    const buffer = new Uint8Array(48).fill(1);
    buffer.fill(8, 8, 40);
    const view = new Uint8Array(buffer.buffer, 8, 32);
    const { credentials } = credentialsAnswering({ prf: { results: { first: view } } });

    const read = await readPrf(credentials, {
      rpId: 'nfnn.cz',
      deviceSalt: DEVICE_SALT,
      credentialIds: [],
    });

    expect(Array.from(read?.output ?? [])).toEqual(new Array(32).fill(8));
    expect(Array.from(buffer.subarray(8, 40))).toEqual(new Array(32).fill(0));
    expect(Array.from(buffer.subarray(0, 8))).toEqual(new Array(8).fill(1));
  });

  it('when the passkey has no user handle, then the reading has none either', async () => {
    const { credentials } = credentialsAnswering(
      { prf: { results: { first: new Uint8Array(32).buffer } } },
      { userHandle: null },
    );

    const read = await readPrf(credentials, {
      rpId: 'nfnn.cz',
      deviceSalt: DEVICE_SALT,
      credentialIds: [CREDENTIAL],
    });

    expect(read?.userHandle).toBeNull();
  });

  for (const [name, answer] of [
    ['a passkey that was not asked for', { rawId: [7, 7] }],
    ['without user verification', { flags: USER_PRESENT_ONLY }],
  ] as const) {
    it(`when it answers ${name}, then the PRF is absent and the browser bytes are zeroed`, async () => {
      const output = new Uint8Array(32).fill(8);
      const { credentials } = credentialsAnswering(
        { prf: { results: { first: output.buffer } } },
        answer,
      );

      expect(
        await readPrf(credentials, {
          rpId: 'nfnn.cz',
          deviceSalt: DEVICE_SALT,
          credentialIds: [CREDENTIAL],
        }),
      ).toBeNull();
      expect(Array.from(output)).toEqual(new Array(32).fill(0));
    });
  }

  it('when it answers an output of the wrong length, then the browser bytes are zeroed too', async () => {
    const output = new Uint8Array(16).fill(8);
    const { credentials } = credentialsAnswering({ prf: { results: { first: output.buffer } } });

    await readPrf(credentials, {
      rpId: 'nfnn.cz',
      deviceSalt: DEVICE_SALT,
      credentialIds: [CREDENTIAL],
    });

    expect(Array.from(output)).toEqual(new Array(16).fill(0));
  });

  for (const [name, results] of [
    ['no PRF extension at all', {}],
    ['PRF not enabled', { prf: { enabled: false } }],
    ['PRF without results', { prf: {} }],
    ['an output of the wrong length', { prf: { results: { first: new Uint8Array(16).buffer } } }],
  ] as const) {
    it(`when the authenticator answers ${name}, then the PRF is absent`, async () => {
      const { credentials } = credentialsAnswering(results);

      expect(
        await readPrf(credentials, {
          rpId: 'nfnn.cz',
          deviceSalt: DEVICE_SALT,
          credentialIds: [CREDENTIAL],
        }),
      ).toBeNull();
    });
  }

  it('when the ceremony gives no credential, then the PRF is absent', async () => {
    const { credentials } = credentialsAnswering(null);

    expect(
      await readPrf(credentials, {
        rpId: 'nfnn.cz',
        deviceSalt: DEVICE_SALT,
        credentialIds: [CREDENTIAL],
      }),
    ).toBeNull();
  });

  it('when the visitor cancels the ceremony, then the refusal reaches the caller instead of an absent PRF', async () => {
    const cancelled = new DOMException('The operation was cancelled.', 'NotAllowedError');
    const credentials = {
      get: vi.fn().mockRejectedValue(cancelled),
    } as unknown as CredentialsContainer;

    await expect(
      readPrf(credentials, { rpId: 'nfnn.cz', deviceSalt: DEVICE_SALT, credentialIds: [] }),
    ).rejects.toBe(cancelled);
  });
});
