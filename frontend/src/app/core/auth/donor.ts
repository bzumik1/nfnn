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
  hasPassword: boolean;
  secondFactor: SecondFactorState;
}

export interface RegisterDonorRequest {
  type: DonorType;
  name: string;
  companyIdentifier: string | null;
  address: DonorAddress;
  email: string;
  password: string | null;
  preferredLocale: DonorLocale;
}

export interface UpdateDonorProfileRequest {
  name?: string;
  address?: DonorAddress;
  preferredLocale?: DonorLocale;
}

export interface PasskeyConfirmation {
  challenge: string;
  credential: PasskeyAssertionCredential;
}

export interface Confirmation {
  password?: string;
  passkey?: PasskeyConfirmation;
}

export interface ChangePasswordRequest {
  currentPassword?: string;
  passkey?: PasskeyConfirmation;
  newPassword: string;
}

export interface EmailChangeRequest extends Confirmation {
  newEmail: string;
}

export interface SecondFactorRecovery {
  message: string;
  expiresAt: string;
  accountNumber: string;
  iban: string;
  amountMinor: number;
  currency: string;
  usableFrom: string | null;
}

export interface SecondFactorDisableRequest extends Confirmation {
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
  secondFactorCode?: string;
  passkey?: PasskeyConfirmation;
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

export interface PasskeyCredentialDescriptor {
  type: 'public-key';
  id: string;
  transports: string[];
}

export interface PasskeyCreationOptions {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  timeout: number;
  excludeCredentials: PasskeyCredentialDescriptor[];
  authenticatorSelection: {
    residentKey: 'required';
    requireResidentKey: boolean;
    userVerification: 'required';
  };
  attestation: 'none';
}

export interface PasskeySignInOptions {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: 'required';
  allowCredentials: PasskeyCredentialDescriptor[];
}

export interface PasskeyRegistrationCredential {
  id: string;
  rawId: string;
  type: 'public-key';
  response: { clientDataJSON: string; attestationObject: string; transports: string[] };
}

export interface PasskeyAssertionCredential {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string | null;
  };
}

export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface PasskeyList {
  items: Passkey[];
}
