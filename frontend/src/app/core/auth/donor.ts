import { QrMatrix } from '../../shared/ui/qr-code/qr-matrix';

export const PASSWORD_MIN_LENGTH = 12;

export type DonorType = 'PERSON' | 'COMPANY';

export type DonorLocale = 'cs' | 'en';

export interface DonorAddress {
  street: string;
  city: string;
  postalCode: string;
}

export interface SecondFactorState {
  enabled: boolean;
  neededForAdministration: boolean;
}

export interface Donor {
  id: string;
  type: DonorType;
  name: string;
  companyIdentifier: string | null;
  address: DonorAddress;
  email: string;
  preferredLocale: DonorLocale;
  variableSymbol: string;
  roles: string[];
  registeredAt: string;
  secondFactor: SecondFactorState;
}

export interface RegisterDonorRequest {
  type: DonorType;
  name: string;
  companyIdentifier: string | null;
  address: DonorAddress;
  email: string;
  password: string;
  preferredLocale: DonorLocale;
}

export interface UpdateDonorProfileRequest {
  name?: string;
  address?: DonorAddress;
  preferredLocale?: DonorLocale;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface EmailChangeRequest {
  newEmail: string;
  password: string;
}

export interface SecondFactorDisableRequest {
  password: string;
  code: string;
}

export interface SecondFactorEnrolment {
  secret: string;
  otpauthUri: string;
  qrCode: QrMatrix;
}

export type OAuthScope = 'admin:read' | 'admin:write';

export interface ClientDescription {
  host: string;
  name: string;
  loopback: boolean;
}

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string | null;
  resource: string | null;
  state: string | null;
  approved: boolean;
}

export interface RedirectResponse {
  redirectTo: string;
}

export interface ConnectedApp {
  id: string;
  client: string;
  scopes: OAuthScope[];
  grantedAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface ConnectedAppList {
  items: ConnectedApp[];
}

export interface AuthResponse {
  user: Donor;
  accessToken: string;
  accessTokenExpiresAt: string;
}
