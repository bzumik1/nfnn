import type { RouteTarget } from './fixtures';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { syntheticPortrait, syntheticSignature, YEARLY_ONE } from './receipt-issuing';

export const YEARLY_RECEIPTS_URL = '/api/admin/donations/receipts/yearly';

type Outcome = 'ISSUED' | 'UNCHANGED' | 'REPLACED' | 'SKIPPED';

export interface YearlyDonor {
  readonly name: string;
  readonly outcome?: Outcome;
  readonly problem?: string;
  readonly receiptNumber?: string;
  readonly replacedNumber?: string;
}

export interface YearlyReceiptsMock {
  readonly year?: number;
  readonly donors: readonly YearlyDonor[];
  readonly erasedDonors?: number;
  readonly withArt?: boolean;
  readonly issueDelayMs?: number;
}

export interface YearlyReceiptsCalls {
  readonly posted: string[][];
  readonly images: string[];
}

interface FrozenReceipt extends Record<string, unknown> {
  readonly donor: Record<string, unknown>;
  readonly signatory: Record<string, unknown>;
}

const FROZEN: { cases: { name: string; expected: FrozenReceipt }[] } = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'shared-cases', 'receipts', 'v1', 'frozen.json'),
    'utf8',
  ),
);

function yearlyOne(): FrozenReceipt {
  const found = FROZEN.cases.find((sharedCase) => sharedCase.name === YEARLY_ONE);
  if (found === undefined) {
    throw new Error(`shared-cases/receipts/v1/frozen.json has no case ${YEARLY_ONE}`);
  }
  return found.expected;
}

export function donorIdOf(index: number): string {
  return `0192f0d0-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;
}

export function receiptNumberOf(index: number): string {
  return `2027-${String(index + 1).padStart(6, '0')}`;
}

function issuedReceipt(donor: YearlyDonor, index: number, year: number, withArt: boolean) {
  const base = yearlyOne();
  const number = donor.receiptNumber ?? receiptNumberOf(index);
  return {
    id: `0192f0f3-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
    donorId: donorIdOf(index),
    status: 'ACTIVE',
    kind: 'YEARLY',
    number,
    donationId: null,
    year,
    issuedAt: '2027-01-15T09:30:00Z',
    supersededAt: null,
    withdrawnAt: null,
    withdrawalReason: null,
    donorErased: false,
    receipt: {
      ...base,
      number,
      year,
      donor: { ...base.donor, name: donor.name },
      signatory: withArt
        ? {
            ...base.signatory,
            signatureImage: { sha256: syntheticSignature.sha256 },
            portraitImage: { sha256: syntheticPortrait.sha256 },
          }
        : base.signatory,
    },
  };
}

export async function mockYearlyReceipts(
  page: RouteTarget,
  mock: YearlyReceiptsMock,
): Promise<YearlyReceiptsCalls> {
  const year = mock.year ?? 2026;
  const calls: YearlyReceiptsCalls = { posted: [], images: [] };
  const indexOf = new Map(mock.donors.map((donor, index) => [donorIdOf(index), index]));
  await page.route(
    (url) => url.pathname === YEARLY_RECEIPTS_URL,
    async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: {
            year,
            yearlyReceiptsAvailableThrough: year,
            receiptsAvailableFrom: year - 1,
            erasedDonors: mock.erasedDonors ?? 0,
            donors: mock.donors.map((donor, index) => ({
              donorId: donorIdOf(index),
              name: donor.name,
              type: 'PERSON',
              giftCount: 1 + (index % 12),
              totalAmountMinor: 50000 + index * 1000,
              receipt:
                donor.outcome === 'UNCHANGED' || donor.outcome === 'REPLACED'
                  ? {
                      id: `0192f0f4-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
                      number: donor.replacedNumber ?? receiptNumberOf(index),
                      issuedAt: '2027-01-10T09:30:00Z',
                    }
                  : null,
            })),
          },
        });
      }
      const body = route.request().postDataJSON() as { year: number; donorIds: string[] };
      calls.posted.push(body.donorIds);
      if (mock.issueDelayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, mock.issueDelayMs));
      }
      const results = body.donorIds.map((donorId) => {
        const index = indexOf.get(donorId) ?? 0;
        const donor = mock.donors[index];
        const outcome = donor.outcome ?? 'ISSUED';
        return {
          donorId,
          outcome,
          problem: outcome === 'SKIPPED' ? (donor.problem ?? 'donations/donor-erased') : null,
          replacedNumber: outcome === 'REPLACED' ? (donor.replacedNumber ?? null) : null,
          receipt:
            outcome === 'SKIPPED' ? null : issuedReceipt(donor, index, year, mock.withArt ?? false),
        };
      });
      const count = (outcome: Outcome) =>
        results.filter((result) => result.outcome === outcome).length;
      return route.fulfill({
        json: {
          year,
          results,
          issued: count('ISSUED'),
          replaced: count('REPLACED'),
          unchanged: count('UNCHANGED'),
          skipped: count('SKIPPED'),
        },
      });
    },
  );
  for (const art of [syntheticSignature, syntheticPortrait]) {
    await page.route(
      (url) => url.pathname === `/api/admin/donations/receipt-images/${art.sha256}`,
      (route) => {
        calls.images.push(art.sha256);
        return route.fulfill({ status: 200, contentType: art.mediaType, body: art.bytes });
      },
    );
  }
  return calls;
}

export const FOUR_DONORS: readonly YearlyDonor[] = [
  { name: 'Dvořák Ota' },
  { name: 'Bílá Eva', outcome: 'REPLACED', replacedNumber: '2027-000090' },
  { name: 'Čermák Petr', outcome: 'SKIPPED', problem: 'donations/receipt-issue-limit' },
  { name: 'Adámek Jan', outcome: 'UNCHANGED' },
];
