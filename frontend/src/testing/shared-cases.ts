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
  readonly details?: string;
  readonly servedDetails?: PaymentDetailsExpected;
  readonly amountMinor: number;
  readonly variableSymbol?: string;
  readonly purpose?: 'DONATION' | 'ACCOUNT_VERIFICATION';
}

export type SpaydExpected =
  | { readonly spayd: string }
  | {
      readonly refused: {
        readonly fields: readonly ('amountMinor' | 'variableSymbol' | 'details')[];
      };
    };

export interface PaymentDetailsInput {
  readonly recipient: {
    readonly accountNumber: string;
    readonly iban: string;
    readonly name: string;
  };
}

export interface PaymentDetailsExpected {
  readonly account: {
    readonly number: string;
    readonly iban: string;
    readonly recipientName: string;
  };
  readonly currency: 'CZK';
  readonly messages: {
    readonly donation: string;
    readonly accountVerification: string;
  };
  readonly accountVerificationAmountMinor: number;
}

export interface PaymentAccountInput {
  readonly accountNumber: string;
  readonly iban: string;
}

export interface PaymentAccountExpected {
  readonly ibanOfNumber: string | null;
  readonly matches: boolean;
}

export interface PaymentQrInput {
  readonly spayd: string;
}

export interface EncoderQrInput {
  readonly text: string;
  readonly errorCorrection: 'L' | 'M' | 'Q' | 'H';
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

export type RowsInput = Readonly<Record<string, unknown>>;
export type Answer = Readonly<Record<string, unknown>>;

export interface SharedCaseTopics {
  readonly 'admin-overview/year-overview.json': SharedCase<RowsInput, Answer>;
  readonly 'donor-summary/summary.json': SharedCase<RowsInput, Answer>;
  readonly 'monthly-report/formatting.json': SharedCase<Answer, { readonly text: string }>;
  readonly 'monthly-report/report.json': SharedCase<RowsInput, Answer>;
  readonly 'payment/account.json': SharedCase<PaymentAccountInput, PaymentAccountExpected>;
  readonly 'payment/details.json': SharedCase<PaymentDetailsInput, PaymentDetailsExpected>;
  readonly 'payment/spayd.json': SharedCase<SpaydInput, SpaydExpected>;
  readonly 'qr/encoder.json': SharedCase<EncoderQrInput, QrSymbol>;
  readonly 'qr/payment.json': SharedCase<PaymentQrInput, QrSymbol>;
  readonly 'qr/totp.json': SharedCase<TotpQrInput, QrSymbol>;
  readonly 'receipts/formatting.json': SharedCase<
    ReceiptFormattingInput,
    ReceiptFormattingExpected
  >;
  readonly 'totp/uri.json': SharedCase<TotpUriInput, { readonly uri: string }>;
}

export type SharedCaseTopic = keyof SharedCaseTopics;

const REGISTERED_TOPICS: Readonly<Record<SharedCaseTopic, true>> = {
  'admin-overview/year-overview.json': true,
  'donor-summary/summary.json': true,
  'monthly-report/formatting.json': true,
  'monthly-report/report.json': true,
  'payment/account.json': true,
  'payment/details.json': true,
  'payment/spayd.json': true,
  'qr/encoder.json': true,
  'qr/payment.json': true,
  'qr/totp.json': true,
  'receipts/formatting.json': true,
  'totp/uri.json': true,
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
