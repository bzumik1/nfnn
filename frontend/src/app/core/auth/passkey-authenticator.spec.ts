import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import {
  fromBase64Url,
  PasskeyAuthenticator,
  PasskeyCeremonyError,
  toBase64Url,
} from './passkey-authenticator';
import { passkeyCreationOptions, passkeySignInOptions } from './testing/donor-fixtures';

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

class FakePublicKeyCredential {}

function fakeWindow(credentials: Partial<CredentialsContainer> | undefined): Window {
  return {
    PublicKeyCredential: credentials === undefined ? undefined : FakePublicKeyCredential,
    navigator: { credentials },
  } as unknown as Window;
}

function authenticatorIn(window: Window): PasskeyAuthenticator {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: { defaultView: window } }],
  });
  return TestBed.inject(PasskeyAuthenticator);
}

describe('Given the passkey authenticator', () => {
  it('when bytes go to base64url and back, then nothing changes and no padding or unsafe characters appear', () => {
    const encoded = toBase64Url(bytes(251, 255, 191, 0, 1));

    expect(encoded).toBe('-_-_AAE');
    expect(new Uint8Array(fromBase64Url(encoded))).toEqual(new Uint8Array([251, 255, 191, 0, 1]));
  });

  it('when the browser has no WebAuthn, then passkeys are not supported and a ceremony fails as unsupported', async () => {
    const authenticator = authenticatorIn(fakeWindow(undefined));

    expect(authenticator.supported()).toBe(false);
    await expect(authenticator.get(passkeySignInOptions())).rejects.toEqual(
      new PasskeyCeremonyError('unsupported'),
    );
  });

  it('when a passkey signs in, then the options go to the browser as bytes and the answer comes back as base64url', async () => {
    const get = vi.fn().mockResolvedValue({
      id: 'Y3JlZA',
      type: 'public-key',
      rawId: bytes(99, 114, 101, 100),
      response: {
        clientDataJSON: bytes(1),
        authenticatorData: bytes(2),
        signature: bytes(3),
        userHandle: bytes(4),
      },
    });
    const authenticator = authenticatorIn(fakeWindow({ get, create: vi.fn() }));

    const credential = await authenticator.get(passkeySignInOptions());

    const publicKey = get.mock.calls[0][0].publicKey as PublicKeyCredentialRequestOptions;
    expect(publicKey.rpId).toBe('nfnn.cz');
    expect(publicKey.userVerification).toBe('required');
    expect(new Uint8Array(publicKey.challenge as ArrayBuffer)).toHaveLength(32);
    expect(credential).toEqual({
      id: 'Y3JlZA',
      rawId: 'Y3JlZA',
      type: 'public-key',
      response: {
        clientDataJSON: 'AQ',
        authenticatorData: 'Ag',
        signature: 'Aw',
        userHandle: 'BA',
      },
    });
  });

  it('when a passkey is created, then the user id is sent as bytes and the transports come back', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'Y3JlZA',
      type: 'public-key',
      rawId: bytes(99, 114, 101, 100),
      response: {
        clientDataJSON: bytes(1),
        attestationObject: bytes(5),
        getTransports: () => ['internal', 'hybrid'],
      },
    });
    const authenticator = authenticatorIn(fakeWindow({ create, get: vi.fn() }));

    const credential = await authenticator.create(passkeyCreationOptions());

    const publicKey = create.mock.calls[0][0].publicKey as PublicKeyCredentialCreationOptions;
    expect(new Uint8Array(publicKey.user.id as ArrayBuffer)).toHaveLength(16);
    expect(publicKey.authenticatorSelection?.residentKey).toBe('required');
    expect(credential.response).toEqual({
      clientDataJSON: 'AQ',
      attestationObject: 'BQ',
      transports: ['internal', 'hybrid'],
    });
  });

  it('when the authenticator also answers PRF or other extension results, then none of them is in what goes to the server', async () => {
    const prfOutput = new Uint8Array(32).fill(0x5a);
    const extensions = {
      prf: { enabled: true, results: { first: prfOutput.buffer } },
      credProps: { rk: true },
    };
    const get = vi.fn().mockResolvedValue({
      id: 'Y3JlZA',
      type: 'public-key',
      rawId: bytes(99, 114, 101, 100),
      response: {
        clientDataJSON: bytes(1),
        authenticatorData: bytes(2),
        signature: bytes(3),
        userHandle: null,
      },
      getClientExtensionResults: () => extensions,
    });
    const create = vi.fn().mockResolvedValue({
      id: 'Y3JlZA',
      type: 'public-key',
      rawId: bytes(99, 114, 101, 100),
      response: {
        clientDataJSON: bytes(1),
        attestationObject: bytes(5),
        getTransports: () => ['internal'],
      },
      getClientExtensionResults: () => extensions,
    });
    const authenticator = authenticatorIn(fakeWindow({ get, create }));

    const wire = JSON.stringify([
      await authenticator.get(passkeySignInOptions()),
      await authenticator.create(passkeyCreationOptions()),
    ]);

    expect(wire).not.toContain('clientExtensionResults');
    expect(wire).not.toContain('prf');
    expect(wire).not.toContain(toBase64Url(prfOutput.buffer));
  });

  describe('when the device offers a PRF input', () => {
    const input = new Uint8Array(32).fill(3);

    function verifiedData(): ArrayBuffer {
      const data = new Uint8Array(37);
      data[32] = 0x05;
      return data.buffer;
    }

    function prfResults(output: Uint8Array | null) {
      return () =>
        output === null
          ? { prf: { enabled: true } }
          : { prf: { results: { first: output.buffer } } };
    }

    it('and a passkey signs in, then the browser is asked to evaluate the input and the reading comes back beside the credential', async () => {
      const output = new Uint8Array(32).fill(0x5a);
      const get = vi.fn().mockResolvedValue({
        id: 'Y3JlZA',
        type: 'public-key',
        rawId: bytes(99, 114, 101, 100),
        response: {
          clientDataJSON: bytes(1),
          authenticatorData: verifiedData(),
          signature: bytes(3),
          userHandle: bytes(4),
        },
        getClientExtensionResults: prfResults(output),
      });
      const authenticator = authenticatorIn(fakeWindow({ get, create: vi.fn() }));

      const { credential, prf } = await authenticator.getWithPrf(passkeySignInOptions(), input);

      const publicKey = get.mock.calls[0][0].publicKey as PublicKeyCredentialRequestOptions;
      expect(publicKey.extensions).toEqual({ prf: { eval: { first: input } } });
      expect(prf?.credentialId).toBe('Y3JlZA');
      expect(prf?.output).toEqual(new Uint8Array(32).fill(0x5a));
      expect(output.every((byte) => byte === 0)).toBe(true);
      expect(JSON.stringify(credential)).not.toContain('prf');
    });

    it('and a passkey is created, then the input is evaluated at creation already, as Safari answers PRF only then or at a later sign-in', async () => {
      const create = vi.fn().mockResolvedValue({
        id: 'Y3JlZA',
        type: 'public-key',
        rawId: bytes(99, 114, 101, 100),
        response: {
          clientDataJSON: bytes(1),
          attestationObject: bytes(5),
          getTransports: () => ['internal'],
          getAuthenticatorData: () => verifiedData(),
        },
        getClientExtensionResults: prfResults(new Uint8Array(32).fill(0x6b)),
      });
      const authenticator = authenticatorIn(fakeWindow({ create, get: vi.fn() }));

      const { prf } = await authenticator.createWithPrf(passkeyCreationOptions(), input);

      const publicKey = create.mock.calls[0][0].publicKey as PublicKeyCredentialCreationOptions;
      expect(publicKey.extensions).toEqual({ prf: { eval: { first: input } } });
      expect(prf).toEqual({
        credentialId: 'Y3JlZA',
        userHandle: null,
        output: new Uint8Array(32).fill(0x6b),
      });
    });

    it('and the authenticator only says PRF is enabled, without a result, then no reading comes back', async () => {
      const create = vi.fn().mockResolvedValue({
        id: 'Y3JlZA',
        type: 'public-key',
        rawId: bytes(99, 114, 101, 100),
        response: {
          clientDataJSON: bytes(1),
          attestationObject: bytes(5),
          getTransports: () => ['internal'],
          getAuthenticatorData: () => verifiedData(),
        },
        getClientExtensionResults: prfResults(null),
      });
      const authenticator = authenticatorIn(fakeWindow({ create, get: vi.fn() }));

      expect((await authenticator.createWithPrf(passkeyCreationOptions(), input)).prf).toBeNull();
    });

    it('and the device has no input, then no extension is asked for and no reading comes back', async () => {
      const get = vi.fn().mockResolvedValue({
        id: 'Y3JlZA',
        type: 'public-key',
        rawId: bytes(99, 114, 101, 100),
        response: {
          clientDataJSON: bytes(1),
          authenticatorData: verifiedData(),
          signature: bytes(3),
          userHandle: null,
        },
        getClientExtensionResults: prfResults(new Uint8Array(32).fill(1)),
      });
      const authenticator = authenticatorIn(fakeWindow({ get, create: vi.fn() }));

      const { prf } = await authenticator.getWithPrf(passkeySignInOptions(), null);

      expect(get.mock.calls[0][0].publicKey.extensions).toBeUndefined();
      expect(prf).toBeNull();
    });
  });

  describe('when the browser refuses the ceremony', () => {
    it('then a dismissed prompt is cancelled and a known device is already registered', async () => {
      const dismissed = new Error('dismissed');
      dismissed.name = 'NotAllowedError';
      const known = new Error('known');
      known.name = 'InvalidStateError';
      const create = vi.fn().mockRejectedValueOnce(dismissed).mockRejectedValueOnce(known);
      const authenticator = authenticatorIn(fakeWindow({ create, get: vi.fn() }));

      await expect(authenticator.create(passkeyCreationOptions())).rejects.toEqual(
        new PasskeyCeremonyError('cancelled'),
      );
      await expect(authenticator.create(passkeyCreationOptions())).rejects.toEqual(
        new PasskeyCeremonyError('already-registered'),
      );
    });
  });
});
