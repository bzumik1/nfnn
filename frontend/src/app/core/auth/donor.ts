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
  qrPngBase64: string;
}

export interface AuthResponse {
  user: Donor;
  accessToken: string;
  accessTokenExpiresAt: string;
}
