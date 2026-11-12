import { describe, expect, it } from 'vitest';
import type { CopyContents } from '../../../core/device/store/account-store';
import { isVisitMark, markOf, visitChanges } from './visit-changes';

const ME = '01a18e56-0000-7000-8000-00000000a001';
const PAVEL = '01a18e56-0000-7000-8000-00000000a002';
const ANDREA = '01a18e56-0000-7000-8000-00000000a003';
const JANA = '01a18e56-0000-7000-8000-00000000d001';
const PETR = '01a18e56-0000-7000-8000-00000000d002';

function payment(id: string, bookedOn: string, amountMinor: number) {
  return {
    id,
    version: `v-${id}`,
    bankTransactionId: Number(id.slice(-4)),
    bookedOn,
    amountMinor,
    currency: 'CZK',
    variableSymbol: null,
    counterpartyAccount: null,
    counterpartyName: null,
    messageForRecipient: null,
    importedAt: `${bookedOn}T10:00:00Z`,
    unpairedByAdminAt: null,
    accountVerification: false,
  };
}

function gift(id: string, paymentId: string, donorId: string) {
  return {
    id,
    donorId,
    paymentId,
    receivedAt: '2026-11-10',
    amountMinor: 50000,
    currency: 'CZK',
    status: 'RECEIVED',
    source: 'BANK_TRANSFER',
    purpose: 'GENERAL',
    pairedBy: 'VARIABLE_SYMBOL',
    bankAccountId: null,
    symbolClaimId: null,
    recordedAt: '2026-11-10T09:00:00Z',
  };
}

function record(donorId: string, name: string) {
  return {
    donorId,
    name,
    type: 'PERSON',
    variableSymbol: '4821937560',
    companyIdentifier: null,
    address: null,
    preferredLocale: 'cs',
    registeredAt: '2026-11-10T08:00:00Z',
    erasedAt: null,
  };
}

function account(donorId: string, name: string) {
  return { donorId, name, administrator: true };
}

function receipt(id: string, donorId: string) {
  return { id, donorId, status: 'ACTIVE', kind: 'YEARLY', number: id, issuedAt: '2026-11-10' };
}

function action(id: string, adminId: string) {
  return {
    id,
    adminId,
    action: 'PAIR_PAYMENT',
    subjectId: JANA,
    performedAt: '2026-11-10T12:00:00Z',
    client: null,
  };
}

interface Rows {
  readonly payments?: readonly unknown[];
  readonly donations?: readonly unknown[];
  readonly records?: readonly unknown[];
  readonly receipts?: readonly unknown[];
  readonly accounts?: readonly unknown[];
  readonly audit?: readonly unknown[];
}

function copyOf(rows: Rows): CopyContents {
  const chunk = (id: string, chunkRows: readonly unknown[] = []) => ({
    id,
    rowsSha256: id,
    rows: chunkRows,
  });
  return {
    chunks: [
      chunk('donations/payments:2026-11', rows.payments),
      chunk('donations/donations:2026-11', rows.donations),
      chunk('donations/donor-records:2026-11', rows.records),
      chunk('donations/receipts:2026', rows.receipts),
      chunk('donors/accounts:2026-01', rows.accounts),
      chunk('donors/audit:2026-11', rows.audit),
    ],
    summary: { donations: { today: '2026-11-12', byYear: [] } },
    storedAt: '2026-11-10T13:00:00Z',
  };
}

const BEFORE: Rows = {
  payments: [payment('p-0001', '2026-11-09', 10000)],
  donations: [gift('g-0001', 'p-0001', JANA)],
  records: [record(JANA, 'Jana Nováková')],
  receipts: [receipt('r-0001', JANA)],
  accounts: [account(ME, 'Jakub Správce'), account(PAVEL, 'Pavel Znamenáček')],
  audit: [action('a-0001', PAVEL)],
};

function changesBetween(before: CopyContents, after: CopyContents) {
  return visitChanges(markOf(before, '2026-11-10T13:05:00Z'), after, ME);
}

describe('Given the mark of what this device showed at the last visit and the copy after a sync', () => {
  it('when nothing came in between, then every kind is empty and nothing is new', () => {
    const changes = changesBetween(copyOf(BEFORE), copyOf(BEFORE));

    expect(changes).toEqual({
      payments: { count: 0, totalMinor: 0 },
      paired: { count: 0, totalMinor: 0, bookedFrom: null },
      unpaired: { count: 0, totalMinor: 0, bookedFrom: null },
      newDonors: 0,
      receipts: 0,
      otherAdministrators: [],
      anything: false,
    });
  });

  it('when payments came in, then it counts them with their total and splits them into paired and waiting, each from its earliest booking', () => {
    const after: Rows = {
      ...BEFORE,
      payments: [
        payment('p-0004', '2026-11-11', 20000),
        payment('p-0003', '2026-11-08', 30000),
        payment('p-0002', '2026-11-10', 50000),
        ...BEFORE.payments!,
      ],
      donations: [gift('g-0002', 'p-0002', JANA), ...BEFORE.donations!],
    };

    const changes = changesBetween(copyOf(BEFORE), copyOf(after));

    expect(changes.payments).toEqual({ count: 3, totalMinor: 100000 });
    expect(changes.paired).toEqual({ count: 1, totalMinor: 50000, bookedFrom: '2026-11-10' });
    expect(changes.unpaired).toEqual({ count: 2, totalMinor: 50000, bookedFrom: '2026-11-08' });
    expect(changes.anything).toBe(true);
  });

  it('when a payment held before was paired since, then it is not counted as a new payment', () => {
    const after: Rows = {
      ...BEFORE,
      payments: [payment('p-0002', '2026-11-10', 50000), ...BEFORE.payments!],
      donations: BEFORE.donations,
    };
    const before: Rows = { ...after, donations: [] };

    const changes = changesBetween(copyOf(before), copyOf(after));

    expect(changes.payments.count).toBe(0);
    expect(changes.unpaired.count).toBe(0);
    expect(changes.paired.count).toBe(0);
  });

  it('when donors registered, then it counts the new donor records only', () => {
    const after: Rows = {
      ...BEFORE,
      records: [...BEFORE.records!, record(PETR, 'Petr Dvořák')],
    };

    const changes = changesBetween(copyOf(BEFORE), copyOf(after));

    expect(changes.newDonors).toBe(1);
    expect(changes.anything).toBe(true);
  });

  it('when receipts were issued, then it counts every new receipt, whatever became of it since', () => {
    const after: Rows = {
      ...BEFORE,
      receipts: [
        receipt('r-0003', PETR),
        { ...receipt('r-0002', JANA), status: 'REPLACED' },
        ...BEFORE.receipts!,
      ],
    };

    const changes = changesBetween(copyOf(BEFORE), copyOf(after));

    expect(changes.receipts).toBe(2);
  });

  it('when other administrators acted, then it names each with their count, the busiest first, and leaves out what this administrator did', () => {
    const after: Rows = {
      ...BEFORE,
      accounts: [...BEFORE.accounts!, account(ANDREA, 'Andrea Znamenáčková')],
      audit: [
        action('a-0006', ANDREA),
        action('a-0005', ME),
        action('a-0004', PAVEL),
        action('a-0003', ANDREA),
        action('a-0002', ANDREA),
        ...BEFORE.audit!,
      ],
    };

    const changes = changesBetween(copyOf(BEFORE), copyOf(after));

    expect(changes.otherAdministrators).toEqual([
      { adminId: ANDREA, name: 'Andrea Znamenáčková', actions: 3 },
      { adminId: PAVEL, name: 'Pavel Znamenáček', actions: 1 },
    ]);
    expect(changes.anything).toBe(true);
  });

  it('when two administrators did as much, then they come in Czech order of their names, and one the copy holds no account for comes last without a name', () => {
    const unknown = '01a18e56-0000-7000-8000-00000000a009';
    const after: Rows = {
      ...BEFORE,
      accounts: [...BEFORE.accounts!, account(ANDREA, 'Čermáková Andrea')],
      audit: [
        action('a-0004', unknown),
        action('a-0003', PAVEL),
        action('a-0002', ANDREA),
        ...BEFORE.audit!,
      ],
    };

    const changes = changesBetween(copyOf(BEFORE), copyOf(after));

    expect(changes.otherAdministrators).toEqual([
      { adminId: ANDREA, name: 'Čermáková Andrea', actions: 1 },
      { adminId: PAVEL, name: 'Pavel Znamenáček', actions: 1 },
      { adminId: unknown, name: null, actions: 1 },
    ]);
  });

  it('when only this administrator acted, then nothing is new', () => {
    const after: Rows = { ...BEFORE, audit: [action('a-0002', ME), ...BEFORE.audit!] };

    const changes = changesBetween(copyOf(BEFORE), copyOf(after));

    expect(changes.otherAdministrators).toEqual([]);
    expect(changes.anything).toBe(false);
  });

  it('when the mark is taken, then it holds the time and the ids of every kind it compares, and nothing else of the rows', () => {
    expect(markOf(copyOf(BEFORE), '2026-11-10T13:05:00Z')).toEqual({
      at: '2026-11-10T13:05:00Z',
      payments: ['p-0001'],
      donors: [JANA],
      receipts: ['r-0001'],
      actions: ['a-0001'],
    });
  });

  it('when a stored mark is checked, then only one with a time and lists of ids passes', () => {
    expect(isVisitMark(markOf(copyOf(BEFORE), '2026-11-10T13:05:00Z'))).toBe(true);
    expect(isVisitMark(null)).toBe(false);
    expect(
      isVisitMark({ at: '2026-11-10T13:05:00Z', payments: [], donors: [], receipts: [] }),
    ).toBe(false);
    expect(isVisitMark({ at: 1, payments: [], donors: [], receipts: [], actions: [] })).toBe(false);
    expect(
      isVisitMark({ at: '2026-11-10', payments: [1], donors: [], receipts: [], actions: [] }),
    ).toBe(false);
  });

  it('when the copy before held a kind in another month chunk, then a row is new only when no chunk of the kind held it before', () => {
    const before = copyOf(BEFORE);
    const moved: CopyContents = {
      ...copyOf({}),
      chunks: [
        ...copyOf({ ...BEFORE, payments: [] }).chunks,
        { id: 'donations/payments:2026-10', rowsSha256: 'x', rows: BEFORE.payments! },
      ],
    };

    const changes = changesBetween(before, moved);

    expect(changes.payments.count).toBe(0);
  });
});
