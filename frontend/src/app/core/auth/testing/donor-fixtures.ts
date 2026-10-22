import { AuthResponse, Donor } from '../donor';

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
    qrPngBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNQTX4NRwzEcQBO0hcxU+9NfQAAAABJRU5ErkJggg==',
  };
}
