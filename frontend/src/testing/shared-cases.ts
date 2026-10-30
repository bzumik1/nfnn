import Ajv2020, { type AnySchemaObject } from 'ajv/dist/2020';
import { inject } from 'vitest';

export interface SharedCase<Input, Expected> {
  readonly name: string;
  readonly input: Input;
  readonly expected: Expected;
}

export interface SharedCaseFile<Input, Expected> {
  readonly source: 'v2-baseline' | 'edited';
  readonly logic: string;
  readonly cases: readonly SharedCase<Input, Expected>[];
}

export interface SharedCaseLibrary {
  readonly caseFiles: Readonly<Record<string, unknown>>;
  readonly schemas: Readonly<Record<string, AnySchemaObject>>;
}

declare module 'vitest' {
  interface ProvidedContext {
    sharedCases: SharedCaseLibrary;
  }
}

export interface QrSymbol {
  readonly errorCorrection: 'L' | 'M' | 'Q' | 'H';
  readonly version: number;
  readonly mode: 'NUMERIC' | 'ALPHANUMERIC' | 'BYTE' | 'KANJI';
  readonly eci: number | null;
  readonly mask: number;
  readonly size: number;
  readonly matrix: readonly string[];
}

export interface SpaydInput {
  readonly recipient: {
    readonly accountNumber: string;
    readonly iban: string;
    readonly name: string;
  };
  readonly amount?: string;
  readonly variableSymbol?: string;
  readonly purpose?: string;
}

export type SpaydExpected =
  | { readonly spayd: string }
  | {
      readonly refused: {
        readonly status: number;
        readonly type: string;
        readonly fields: readonly string[];
      };
    };

export interface PaymentQrInput {
  readonly spayd: string;
}

export interface TotpUriInput {
  readonly secret: string;
  readonly issuer: string;
  readonly accountName: string;
}

export interface TotpQrInput {
  readonly uri: string;
}

export type ReceiptFormattingInput =
  | { readonly format: 'czechAmount' | 'englishAmount'; readonly amountMinor: number }
  | { readonly format: 'czechDate' | 'englishDate'; readonly date: string }
  | {
      readonly format: 'donor';
      readonly company: boolean;
      readonly name: string;
      readonly companyIdentifier: string | null;
      readonly street: string;
      readonly city: string;
      readonly postalCode: string;
    };

export type ReceiptFormattingExpected =
  | { readonly text: string }
  | {
      readonly donor: {
        readonly company: boolean;
        readonly donorName: string;
        readonly donorIdentifier: string | null;
        readonly donorAddress: string;
      };
    };

export interface FrozenReceiptAddress {
  readonly street: string;
  readonly city: string;
  readonly postalCode: string;
}

export interface FrozenReceiptDocument {
  readonly kind: 'SINGLE' | 'YEARLY';
  readonly number: string;
  readonly issuedOn: string;
  readonly locale: 'cs' | 'en';
  readonly year: number | null;
  readonly replaces: { readonly number: string; readonly issuedOn: string } | null;
  readonly foundation: {
    readonly name: string;
    readonly companyIdentifier: string;
    readonly address: FrozenReceiptAddress;
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
    readonly address: FrozenReceiptAddress;
    readonly variableSymbol: string;
  };
  readonly gifts: readonly {
    readonly receivedOn: string;
    readonly amountMinor: number;
    readonly source: 'BANK_TRANSFER' | 'MANUAL';
  }[];
  readonly total: { readonly amountMinor: number; readonly currency: 'CZK' };
  readonly signatory: {
    readonly name: string;
    readonly role: string;
    readonly signatureImage: { readonly sha256: string } | null;
  };
}

export type FrozenReceiptInput = FrozenReceiptDocument & { readonly v2Sample: string };

export type FrozenReceipt = FrozenReceiptDocument & {
  readonly schemaVersion: 1;
  readonly texts: {
    readonly cs: Readonly<Record<string, string>>;
    readonly en: Readonly<Record<string, string>> | null;
  };
  readonly verification: { readonly keyId: string; readonly qrText: string };
};

export interface VerificationKey {
  readonly keyId: string;
  readonly publicKeyHex: string;
  readonly status: 'active' | 'revoked';
}

export interface VerifiedReceipt {
  readonly kind: 'single' | 'yearly';
  readonly number: string;
  readonly issuedOn: string;
  readonly year: number | null;
  readonly replaces: { readonly number: string; readonly issuedOn: string } | null;
  readonly donor: {
    readonly type: 'person' | 'company';
    readonly name: string;
    readonly street: string;
    readonly city: string;
    readonly postalCode: string;
    readonly companyIdentifier: string | null;
  };
  readonly gifts: readonly { readonly receivedOn: string; readonly amountMinor: number }[];
  readonly totalMinor: number;
}

export type VerificationInput =
  | {
      readonly receipt: VerifiedReceipt;
      readonly signingKeyId: string;
      readonly foundation: { readonly companyIdentifier: string };
      readonly keys: readonly VerificationKey[];
    }
  | {
      readonly qrText: string;
      readonly foundation: { readonly companyIdentifier: string };
      readonly keys: readonly VerificationKey[];
    };

export type VerificationExpected =
  | {
      readonly payloadHex: string;
      readonly signatureHex: string;
      readonly statusSha256: string;
      readonly qrText: string;
      readonly qr:
        | { readonly version: number; readonly errorCorrection: 'M' | 'L' }
        | { readonly refusal: 'donations/receipt-too-long' };
    }
  | { readonly verdict: 'valid'; readonly keyId: string; readonly receipt: VerifiedReceipt }
  | { readonly verdict: 'rejected'; readonly reason: string };

export type RowsInput = Readonly<Record<string, unknown>>;
export type Answer = Readonly<Record<string, unknown>>;

export interface SharedCaseTopics {
  readonly 'admin-overview/year-overview.json': SharedCase<RowsInput, Answer>;
  readonly 'donor-summary/summary.json': SharedCase<RowsInput, Answer>;
  readonly 'monthly-report/formatting.json': SharedCase<Answer, { readonly text: string }>;
  readonly 'monthly-report/report.json': SharedCase<RowsInput, Answer>;
  readonly 'payment/spayd.json': SharedCase<SpaydInput, SpaydExpected>;
  readonly 'qr/payment.json': SharedCase<PaymentQrInput, QrSymbol>;
  readonly 'qr/totp.json': SharedCase<TotpQrInput, QrSymbol>;
  readonly 'receipts/formatting.json': SharedCase<
    ReceiptFormattingInput,
    ReceiptFormattingExpected
  >;
  readonly 'receipts/v1/frozen.json': SharedCase<FrozenReceiptInput, FrozenReceipt>;
  readonly 'totp/uri.json': SharedCase<TotpUriInput, { readonly uri: string }>;
  readonly 'verification/payload.json': SharedCase<VerificationInput, VerificationExpected>;
}

export type SharedCaseTopic = keyof SharedCaseTopics;

const REGISTERED_TOPICS: Readonly<Record<SharedCaseTopic, true>> = {
  'admin-overview/year-overview.json': true,
  'donor-summary/summary.json': true,
  'monthly-report/formatting.json': true,
  'monthly-report/report.json': true,
  'payment/spayd.json': true,
  'qr/payment.json': true,
  'qr/totp.json': true,
  'receipts/formatting.json': true,
  'receipts/v1/frozen.json': true,
  'totp/uri.json': true,
  'verification/payload.json': true,
};

export const SHARED_CASE_TOPICS = Object.keys(REGISTERED_TOPICS) as readonly SharedCaseTopic[];

const SCHEMA_ID_PREFIX = 'https://nfnn.cz/shared-cases/';
const SCHEMAS = 'schemas/';
const DEFINITIONS = `${SCHEMAS}defs/`;

let library: SharedCaseLibrary | undefined;
let validator: Ajv2020 | undefined;

export function sharedCaseFiles(): readonly string[] {
  return Object.keys(frozenLibrary().caseFiles).sort();
}

export function topicSchemas(): readonly string[] {
  return Object.keys(frozenLibrary().schemas)
    .filter((schema) => !schema.startsWith(DEFINITIONS))
    .sort();
}

export function schemaOf(caseFile: string): string {
  return `${SCHEMAS}${caseFile.replace(/\.json$/, '.schema.json')}`;
}

export function schemaIdOf(schema: string): string {
  return SCHEMA_ID_PREFIX + schema;
}

export function sharedCaseContent(caseFile: string): unknown {
  return frozenLibrary().caseFiles[caseFile];
}

export function createSchemaValidator(): Ajv2020 {
  const created = new Ajv2020({ allErrors: true, allowUnionTypes: true });
  for (const schema of Object.values(frozenLibrary().schemas)) {
    created.addSchema(structuredClone(schema));
  }
  return created;
}

export function schemaViolations(caseFile: string, content: unknown): readonly string[] {
  validator ??= createSchemaValidator();
  const validate = validator.getSchema(schemaIdOf(schemaOf(caseFile)));
  if (validate === undefined) {
    return [`${schemaOf(caseFile)} is missing`];
  }
  return validate(content)
    ? []
    : (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`);
}

export function sharedCases<Topic extends SharedCaseTopic>(
  caseFile: Topic,
): readonly SharedCaseTopics[Topic][] {
  const content = sharedCaseContent(caseFile);
  const violations = schemaViolations(caseFile, content);
  if (violations.length > 0) {
    throw new Error(`${caseFile} does not match ${schemaOf(caseFile)}: ${violations.join('; ')}`);
  }
  return (content as { readonly cases: readonly SharedCaseTopics[Topic][] }).cases;
}

function frozenLibrary(): SharedCaseLibrary {
  library ??= deepFreeze(structuredClone(inject('sharedCases')));
  return library;
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
