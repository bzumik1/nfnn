import {
  AuthResponse,
  Donor,
  Passkey,
  PasskeyAssertionCredential,
  PasskeyCreationOptions,
  PasskeyRegistrationCredential,
  PasskeySignInOptions,
} from '../donor';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
  PasskeyFailure,
} from '../passkey-authenticator';
import { checkerboard } from '../../../shared/ui/qr-code/testing/qr-matrices';

export function sampleDonor(overrides: Partial<Donor> = {}): Donor {
  return {
    id: '01a18e56-bdb0-775a-bd0a-a60756831369',
    type: 'PERSON',
    name: 'Jana Nováková',
    companyIdentifier: null,
    address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    email: 'jana@example.cz',
    preferredLocale: 'cs',
    variableSymbol: '1234567890',
    roles: ['DONOR'],
    registeredAt: '2026-10-17T10:00:00Z',
    hasPassword: true,
    secondFactor: { enabled: false, neededForAdministration: false },
    ...overrides,
  };
}

export function authResponse(accessToken: string, donor: Donor = sampleDonor()): AuthResponse {
  return { user: donor, accessToken, accessTokenExpiresAt: '2026-10-17T10:15:00Z' };
}

export function problem(type: string, title = 'Problem', detail = ''): Record<string, unknown> {
  return { type: `https://nfnn.cz/problems/${type}`, title, detail, status: 401 };
}

export const SAMPLE_CHALLENGE = 'c'.repeat(43);

export function secondFactorRequired(): Record<string, unknown> {
  return {
    ...problem(
      'auth/second-factor-required',
      'Zadejte kód z aplikace',
      'Přihlášení dokončíte šestimístným kódem z ověřovací aplikace.',
    ),
    challenge: SAMPLE_CHALLENGE,
    challengeExpiresAt: '2026-10-17T10:05:00Z',
  };
}

export function secondFactorEnrolment(): Record<string, unknown> {
  return {
    secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    otpauthUri:
      'otpauth://totp/Nov%C3%A1%20nad%C4%9Bje:jana%40example.cz?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Nov%C3%A1%20nad%C4%9Bje&algorithm=SHA1&digits=6&period=30',
    qrCode: checkerboard(25),
  };
}

export function passkeySignInOptions(): PasskeySignInOptions {
  return {
    challenge: SAMPLE_CHALLENGE,
    rpId: 'nfnn.cz',
    timeout: 300000,
    userVerification: 'required',
    allowCredentials: [],
  };
}

export function passkeyCreationOptions(): PasskeyCreationOptions {
  return {
    challenge: SAMPLE_CHALLENGE,
    rp: { id: 'nfnn.cz', name: 'Nová naděje' },
    user: { id: 'AaGOVr2wd1q9CqYHVoMTaQ', name: 'jana@example.cz', displayName: 'Jana Nováková' },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -8 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 300000,
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    attestation: 'none',
  };
}

export const SAMPLE_ASSERTION: PasskeyAssertionCredential = {
  id: 'Y3JlZGVudGlhbA',
  rawId: 'Y3JlZGVudGlhbA',
  type: 'public-key',
  response: {
    clientDataJSON: 'Y2xpZW50',
    authenticatorData: 'YXV0aA',
    signature: 'c2ln',
    userHandle: 'AaGOVr2wd1q9CqYHVoMTaQ',
  },
};

export const SAMPLE_REGISTRATION: PasskeyRegistrationCredential = {
  id: 'Y3JlZGVudGlhbA',
  rawId: 'Y3JlZGVudGlhbA',
  type: 'public-key',
  response: { clientDataJSON: 'Y2xpZW50', attestationObject: 'YXR0', transports: ['internal'] },
};

export function samplePasskey(overrides: Partial<Passkey> = {}): Passkey {
  return {
    id: '019a1b2c-3d4e-7f00-8000-000000000001',
    name: 'iPhone',
    createdAt: '2026-10-17T10:00:00Z',
    lastUsedAt: null,
    ...overrides,
  };
}

export class FakePasskeyAuthenticator implements Pick<
  PasskeyAuthenticator,
  'supported' | 'create' | 'get'
> {
  available = true;
  failure: PasskeyFailure | null = null;
  readonly created: PasskeyCreationOptions[] = [];
  readonly requested: PasskeySignInOptions[] = [];

  supported(): boolean {
    return this.available;
  }

  create(options: PasskeyCreationOptions): Promise<PasskeyRegistrationCredential> {
    this.created.push(options);
    return this.failure === null
      ? Promise.resolve(SAMPLE_REGISTRATION)
      : Promise.reject(new PasskeyCeremonyError(this.failure));
  }

  get(options: PasskeySignInOptions): Promise<PasskeyAssertionCredential> {
    this.requested.push(options);
    return this.failure === null
      ? Promise.resolve(SAMPLE_ASSERTION)
      : Promise.reject(new PasskeyCeremonyError(this.failure));
  }
}
