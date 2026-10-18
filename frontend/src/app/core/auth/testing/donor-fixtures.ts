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
    ...overrides,
  };
}

export function authResponse(accessToken: string, donor: Donor = sampleDonor()): AuthResponse {
  return { user: donor, accessToken, accessTokenExpiresAt: '2026-10-17T10:15:00Z' };
}

export function problem(type: string, title = 'Problem', detail = ''): Record<string, unknown> {
  return { type: `https://nfnn.cz/problems/${type}`, title, detail, status: 401 };
}
