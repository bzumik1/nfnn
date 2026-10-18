export const PASSWORD_MIN_LENGTH = 12;

export type DonorType = 'PERSON' | 'COMPANY';

export type DonorLocale = 'cs' | 'en';

export interface DonorAddress {
  street: string;
  city: string;
  postalCode: string;
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

export interface AuthResponse {
  user: Donor;
  accessToken: string;
  accessTokenExpiresAt: string;
}
