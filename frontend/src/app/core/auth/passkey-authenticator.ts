import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import {
  PasskeyAssertionCredential,
  PasskeyCreationOptions,
  PasskeyCredentialDescriptor,
  PasskeyRegistrationCredential,
  PasskeySignInOptions,
} from './donor';

export type PasskeyFailure = 'cancelled' | 'already-registered' | 'unsupported' | 'failed';

export class PasskeyCeremonyError extends Error {
  constructor(readonly reason: PasskeyFailure) {
    super(`Passkey ceremony ended: ${reason}`);
  }
}

@Injectable({ providedIn: 'root' })
export class PasskeyAuthenticator {
  private readonly window = inject(DOCUMENT).defaultView;

  supported(): boolean {
    return (
      this.window !== null &&
      typeof this.window.PublicKeyCredential === 'function' &&
      typeof this.window.navigator.credentials?.create === 'function'
    );
  }

  async create(options: PasskeyCreationOptions): Promise<PasskeyRegistrationCredential> {
    const credential = await this.run(() =>
      this.credentials().create({
        publicKey: {
          challenge: fromBase64Url(options.challenge),
          rp: options.rp,
          user: { ...options.user, id: fromBase64Url(options.user.id) },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          excludeCredentials: options.excludeCredentials.map(descriptorOf),
          authenticatorSelection: options.authenticatorSelection,
          attestation: options.attestation,
        },
      }),
    );
    const response = credential.response as AuthenticatorAttestationResponse;
    return {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: 'public-key',
      response: {
        clientDataJSON: toBase64Url(response.clientDataJSON),
        attestationObject: toBase64Url(response.attestationObject),
        transports:
          typeof response.getTransports === 'function' ? [...response.getTransports()] : [],
      },
    };
  }

  async get(options: PasskeySignInOptions): Promise<PasskeyAssertionCredential> {
    const credential = await this.run(() =>
      this.credentials().get({
        publicKey: {
          challenge: fromBase64Url(options.challenge),
          rpId: options.rpId,
          timeout: options.timeout,
          userVerification: options.userVerification,
          allowCredentials: options.allowCredentials.map(descriptorOf),
        },
      }),
    );
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: 'public-key',
      response: {
        clientDataJSON: toBase64Url(response.clientDataJSON),
        authenticatorData: toBase64Url(response.authenticatorData),
        signature: toBase64Url(response.signature),
        userHandle: response.userHandle === null ? null : toBase64Url(response.userHandle),
      },
    };
  }

  private credentials(): CredentialsContainer {
    if (!this.supported() || this.window === null) {
      throw new PasskeyCeremonyError('unsupported');
    }
    return this.window.navigator.credentials;
  }

  private async run(ceremony: () => Promise<Credential | null>): Promise<PublicKeyCredential> {
    let credential: Credential | null;
    try {
      credential = await ceremony();
    } catch (failure: unknown) {
      throw new PasskeyCeremonyError(reasonOf(failure));
    }
    if (credential === null || credential.type !== 'public-key') {
      throw new PasskeyCeremonyError('cancelled');
    }
    return credential as PublicKeyCredential;
  }
}

function reasonOf(failure: unknown): PasskeyFailure {
  if (failure instanceof PasskeyCeremonyError) {
    return failure.reason;
  }
  const name = failure instanceof Error ? failure.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'AbortError':
      return 'cancelled';
    case 'InvalidStateError':
      return 'already-registered';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'failed';
  }
}

function descriptorOf(descriptor: PasskeyCredentialDescriptor): PublicKeyCredentialDescriptor {
  return {
    type: descriptor.type,
    id: fromBase64Url(descriptor.id),
    transports: descriptor.transports as AuthenticatorTransport[],
  };
}

export function toBase64Url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
