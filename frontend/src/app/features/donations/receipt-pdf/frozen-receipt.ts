export type ReceiptLocale = 'cs' | 'en';

export interface FrozenAddress {
  readonly street: string;
  readonly city: string;
  readonly postalCode: string;
}

export interface FrozenImage {
  readonly sha256: string;
}

export interface FrozenGift {
  readonly receivedOn: string;
  readonly amountMinor: number;
  readonly source: 'BANK_TRANSFER' | 'MANUAL';
}

export interface FrozenReceipt {
  readonly schemaVersion: 1;
  readonly kind: 'SINGLE' | 'YEARLY';
  readonly number: string;
  readonly issuedOn: string;
  readonly locale: ReceiptLocale;
  readonly year: number | null;
  readonly replaces: { readonly number: string; readonly issuedOn: string } | null;
  readonly foundation: {
    readonly name: string;
    readonly companyIdentifier: string;
    readonly address: FrozenAddress;
    readonly registryCourt: string;
    readonly registryFile: string;
    readonly bankAccountNumber: string;
    readonly issuePlace: string;
    readonly issuePlaceEn: string;
  };
  readonly donor: {
    readonly type: 'PERSON' | 'COMPANY';
    readonly name: string;
    readonly companyIdentifier: string | null;
    readonly address: FrozenAddress;
    readonly variableSymbol: string;
  };
  readonly gifts: readonly FrozenGift[];
  readonly total: { readonly amountMinor: number; readonly currency: 'CZK' };
  readonly signatory: {
    readonly name: string;
    readonly role: string;
    readonly signatureImage: FrozenImage | null;
    readonly portraitImage?: FrozenImage | null;
  };
  readonly texts: {
    readonly cs: Readonly<Record<string, string>>;
    readonly en: Readonly<Record<string, string>> | null;
  };
  readonly verification: { readonly keyId: string; readonly qrText: string };
}

export interface IssuedReceipt {
  readonly id: string;
  readonly status: 'ACTIVE' | 'REPLACED' | 'WITHDRAWN';
  readonly kind: 'SINGLE' | 'YEARLY';
  readonly number: string;
  readonly donationId: string | null;
  readonly year: number | null;
  readonly issuedAt: string;
  readonly supersededAt: string | null;
  readonly receipt: FrozenReceipt;
}

export type ReceiptSubject = { readonly donationId: string } | { readonly year: number };
