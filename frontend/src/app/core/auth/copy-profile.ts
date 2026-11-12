import type { Donor } from './donor';
import type { SessionKind } from './session-jar';

export const OFFLINE_SESSION_DAYS = 14;
export const OFFLINE_SESSION_MS = OFFLINE_SESSION_DAYS * 24 * 60 * 60 * 1000;

export type CopyProfile = Pick<
  Donor,
  'id' | 'type' | 'name' | 'email' | 'roles' | 'address' | 'companyIdentifier' | 'variableSymbol'
>;

export interface CopySession {
  readonly kind: SessionKind;
  readonly acceptedAt: string;
  readonly wrap: string;
}

export function copyProfileOf(donor: Donor): CopyProfile {
  return {
    id: donor.id,
    type: donor.type,
    name: donor.name,
    email: donor.email,
    roles: donor.roles,
    address: donor.address,
    companyIdentifier: donor.companyIdentifier,
    variableSymbol: donor.variableSymbol,
  };
}

export function isCopyProfile(value: unknown): value is CopyProfile {
  if (!isRecord(value) || !isRecord(value['address'])) {
    return false;
  }
  const address = value['address'];
  return (
    typeof value['id'] === 'string' &&
    (value['type'] === 'PERSON' || value['type'] === 'COMPANY') &&
    typeof value['name'] === 'string' &&
    typeof value['email'] === 'string' &&
    Array.isArray(value['roles']) &&
    value['roles'].every((role) => typeof role === 'string') &&
    typeof address['street'] === 'string' &&
    typeof address['city'] === 'string' &&
    typeof address['postalCode'] === 'string' &&
    (value['companyIdentifier'] === null || typeof value['companyIdentifier'] === 'string') &&
    typeof value['variableSymbol'] === 'string'
  );
}

export function opensOffline(
  session: unknown,
  expected: SessionKind,
  wrap: string,
  now: number,
): session is CopySession {
  if (
    !isRecord(session) ||
    session['kind'] !== expected ||
    !remembers(expected) ||
    session['wrap'] !== wrap
  ) {
    return false;
  }
  const acceptedAt =
    typeof session['acceptedAt'] === 'string' ? Date.parse(session['acceptedAt']) : NaN;
  return Number.isFinite(acceptedAt) && acceptedAt <= now && now - acceptedAt <= OFFLINE_SESSION_MS;
}

export function donorFromCopy(profile: CopyProfile): Donor {
  return {
    id: profile.id,
    type: profile.type,
    name: profile.name,
    email: profile.email,
    roles: [...profile.roles],
    address: { ...profile.address },
    companyIdentifier: profile.companyIdentifier,
    variableSymbol: profile.variableSymbol,
    preferredLocale: 'cs',
    registeredAt: '',
    hasPassword: false,
    secondFactor: { enabled: false, neededForAdministration: false },
    pendingEmailChange: null,
    version: '',
  };
}

function remembers(kind: SessionKind): boolean {
  return kind === 'APP' || kind === 'REMEMBERED';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
