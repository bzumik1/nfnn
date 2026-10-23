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
