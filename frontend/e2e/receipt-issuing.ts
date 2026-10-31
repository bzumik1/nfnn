import { Page, Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SYNTHETIC_PORTRAIT_PNG_BASE64,
  SYNTHETIC_SIGNATURE_JSON,
} from '../src/app/features/donations/receipt-pdf/testing/synthetic-art';

interface FrozenCase {
  readonly name: string;
  readonly expected: Record<string, unknown> & {
    readonly kind: 'SINGLE' | 'YEARLY';
    readonly year: number | null;
    readonly signatory: Record<string, unknown>;
  };
}

const FROZEN_CASES: { cases: FrozenCase[] } = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'shared-cases', 'receipts', 'v1', 'frozen.json'),
    'utf8',
  ),
);

export const SINGLE_PERSON_CS = 'History sample: one gift of a person, Czech';
export const YEARLY_ONE = "A person's year with exactly one gift, Czech";
export const YEARLY_120 =
  "History sample: a person's year with 120 gifts over several pages, Czech";

export const RECEIPT_ISSUING_URL = '/api/donations/me/receipts';

interface ReceiptImage {
  readonly sha256: string;
  readonly bytes: Buffer;
  readonly mediaType: string;
}

function image(bytes: Buffer, mediaType: string): ReceiptImage {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes, mediaType };
}

export const syntheticSignature = image(
  Buffer.from(SYNTHETIC_SIGNATURE_JSON, 'utf8'),
  'application/json',
);
export const syntheticPortrait = image(
  Buffer.from(SYNTHETIC_PORTRAIT_PNG_BASE64, 'base64'),
  'image/png',
);

function frozenCase(name: string): FrozenCase['expected'] {
  const found = FROZEN_CASES.cases.find((sharedCase) => sharedCase.name === name);
  if (found === undefined) {
    throw new Error(`shared-cases/receipts/v1/frozen.json has no case ${name}`);
  }
  return found.expected;
}

export interface ReceiptIssuing {
  readonly singleNumber: string;
  readonly yearlyCase?: string;
  readonly withArt?: boolean;
}

function issuedReceipt(subject: { year?: number; donationId?: string }, issuing: ReceiptIssuing) {
  const yearly = subject.year !== undefined;
  const base = frozenCase(yearly ? (issuing.yearlyCase ?? YEARLY_ONE) : SINGLE_PERSON_CS);
  const number = yearly ? `${(subject.year ?? 0) + 1}-000001` : issuing.singleNumber;
  const receipt = {
    ...base,
    number,
    year: yearly ? subject.year : null,
    signatory: issuing.withArt
      ? {
          ...base.signatory,
          signatureImage: { sha256: syntheticSignature.sha256 },
          portraitImage: { sha256: syntheticPortrait.sha256 },
        }
      : base.signatory,
  };
  return {
    id: `0192f0f2-0000-7000-8000-${number.replace('-', '').padStart(12, '0')}`,
    status: 'ACTIVE',
    kind: base.kind,
    number,
    donationId: yearly ? null : (subject.donationId ?? null),
    year: receipt.year,
    issuedAt: '2026-10-31T09:30:00Z',
    supersededAt: null,
    receipt,
  };
}

export async function answerReceiptIssuing(route: Route, issuing: ReceiptIssuing): Promise<void> {
  const subject = route.request().postDataJSON() as { year?: number; donationId?: string };
  await route.fulfill({ status: 200, json: issuedReceipt(subject, issuing) });
}

export async function mockReceiptIssuing(page: Page, issuing: ReceiptIssuing): Promise<void> {
  await page.route(
    (url) => url.pathname === RECEIPT_ISSUING_URL,
    (route) => answerReceiptIssuing(route, issuing),
  );
  for (const art of [syntheticSignature, syntheticPortrait]) {
    await page.route(
      (url) => url.pathname === `/api/donations/me/receipt-images/${art.sha256}`,
      (route) => route.fulfill({ status: 200, contentType: art.mediaType, body: art.bytes }),
    );
  }
}
