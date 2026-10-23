import {
  AdminActionResponse,
  AdminBackupsResponse,
  BackupFileResponse,
  BackupRunResponse,
  AdminDonorDetailResponse,
  AdminOverviewResponse,
  AdminReportResponse,
  AdminSettingResponse,
  AdminSettingsResponse,
  AdministratorResponse,
  AdminDonorResponse,
  AdminPaymentListResponse,
  AdminPaymentResponse,
  AdminReceiptResponse,
  DonorAccountResponse,
  ImportStateResponse,
  MonthOverviewResponse,
  PairedDonationResponse,
  SymbolClaimResponse,
} from '../admin-api';
import { BankAccountItem } from '../../donations/bank-accounts-api';
import { DonationItem } from '../../donations/donations-api';

export function importState(overrides: Partial<ImportStateResponse> = {}): ImportStateResponse {
  return {
    coveredFrom: '2026-07-20',
    coveredTo: '2026-10-17',
    lastAttemptedAt: '2026-10-18T10:00:00Z',
    lastSucceededAt: '2026-10-17T10:00:00Z',
    lastFailure: null,
    consecutiveFailures: 0,
    reportedOutage: null,
    ...overrides,
  };
}

export function unpairedPayment(
  overrides: Partial<AdminPaymentResponse> = {},
): AdminPaymentResponse {
  return {
    id: '019a1c00-0000-7000-8000-000000001001',
    bankTransactionId: 1001,
    bookedOn: '2026-10-10',
    amountMinor: 50000,
    currency: 'CZK',
    variableSymbol: '1111111111',
    counterpartyAccount: '2900233333/2010',
    counterpartyName: 'Nováková Jana',
    messageForRecipient: 'Dar pro fond',
    importedAt: '2026-10-17T10:00:00Z',
    unpairedByAdminAt: null,
    donation: null,
    ...overrides,
  };
}

export function pairedDonation(
  overrides: Partial<PairedDonationResponse> = {},
): PairedDonationResponse {
  return {
    id: '019a1c00-0000-7000-8000-00000000d001',
    donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    donorName: 'Jana Nováková',
    pairedBy: 'VARIABLE_SYMBOL',
    status: 'RECEIVED',
    recordedAt: '2026-10-17T10:00:05Z',
    receiptIssued: false,
    ...overrides,
  };
}

export function paymentList(
  items: AdminPaymentResponse[],
  overrides: Partial<AdminPaymentListResponse> = {},
): AdminPaymentListResponse {
  return { year: null, availableYears: [], items, ...overrides };
}

export function foundDonor(overrides: Partial<AdminDonorResponse> = {}): AdminDonorResponse {
  return {
    donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    name: 'Jana Nováková',
    type: 'PERSON',
    variableSymbol: '4821937560',
    companyIdentifier: null,
    ...overrides,
  };
}

export function administrator(
  overrides: Partial<AdministratorResponse> = {},
): AdministratorResponse {
  return {
    donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    name: 'Jana Nováková',
    email: 'jana@example.cz',
    secondFactorEnabled: true,
    ...overrides,
  };
}

export function symbolClaim(overrides: Partial<SymbolClaimResponse> = {}): SymbolClaimResponse {
  return {
    id: '019a1c00-0000-7000-8000-00000000c001',
    donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    donorName: 'Jana Nováková',
    account: '1234567/0800',
    variableSymbol: '6123456789',
    answer: 'CONFIRMED',
    answeredAt: '2026-10-20T09:00:00Z',
    donationCount: 3,
    ...overrides,
  };
}

export function adminAction(overrides: Partial<AdminActionResponse> = {}): AdminActionResponse {
  return {
    id: '019a1c00-0000-7000-8000-00000000e001',
    adminId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    adminName: 'Jana Nováková',
    adminEmail: 'jana@example.cz',
    action: 'PAIR_PAYMENT',
    subjectId: '019a1c00-0000-7000-8000-000000001001',
    details:
      'Bank payment 019a1c00-0000-7000-8000-000000001001 paired to donor 01a18e56-bdb0-775a-bd0a-a60756831369 by hand',
    performedAt: '2026-10-22T10:00:00Z',
    ...overrides,
  };
}

export function donorAccount(overrides: Partial<DonorAccountResponse> = {}): DonorAccountResponse {
  return {
    donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    type: 'PERSON',
    name: 'Jana Nováková',
    companyIdentifier: null,
    address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    email: 'jana@example.cz',
    variableSymbol: '4821937560',
    preferredLocale: 'cs',
    registeredAt: '2026-10-17T08:00:00Z',
    emailVerified: true,
    administrator: false,
    secondFactorEnabled: false,
    erasedAt: null,
    ...overrides,
  };
}

export function adminBankAccount(overrides: Partial<BankAccountItem> = {}): BankAccountItem {
  return {
    id: '0192f0c4-0000-7000-8000-000000000001',
    accountNumber: '2900233333/2010',
    status: 'ACTIVE',
    verifiedOn: '2026-10-17',
    connectedFrom: null,
    disconnectedOn: null,
    donationCount: 2,
    totalAmountMinor: 50000,
    currency: 'CZK',
    lastDonationOn: '2026-10-12',
    shared: false,
    pairingExcluded: false,
    verificationPaymentOn: null,
    symbolOffer: null,
    confirmedSymbols: [],
    ...overrides,
  };
}

export function adminDonation(overrides: Partial<DonationItem> = {}): DonationItem {
  return {
    id: '0192f0f1-0000-7000-8000-000000000001',
    receiptNumber: null,
    receivedAt: '2026-10-12',
    amountMinor: 30000,
    currency: 'CZK',
    purpose: 'Obecný příspěvek',
    status: 'RECEIVED',
    source: 'BANK_TRANSFER',
    pairedBy: 'SENDER_ACCOUNT',
    senderAccount: '2900233333/2010',
    confirmedSymbol: null,
    receiptAvailable: true,
    ...overrides,
  };
}

export function adminReceipt(overrides: Partial<AdminReceiptResponse> = {}): AdminReceiptResponse {
  return {
    id: '019a1c00-0000-7000-8000-00000000f001',
    number: '2026-000001',
    kind: 'SINGLE',
    donationId: '0192f0f1-0000-7000-8000-000000000001',
    donationReceivedOn: '2026-10-12',
    year: null,
    issuedOn: '2026-10-17',
    issuedAt: '2026-10-17T09:00:00Z',
    locale: 'cs',
    active: true,
    ...overrides,
  };
}

export function donorDetail(
  overrides: Partial<AdminDonorDetailResponse> = {},
): AdminDonorDetailResponse {
  return {
    donor: {
      donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
      name: 'Jana Nováková',
      type: 'PERSON',
      variableSymbol: '4821937560',
      companyIdentifier: null,
      address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
      preferredLocale: 'cs',
      registeredAt: '2026-10-17T08:00:00Z',
      erasedAt: null,
    },
    bankAccounts: [adminBankAccount()],
    donations: {
      items: [
        adminDonation(),
        adminDonation({
          id: '0192f0f1-0000-7000-8000-000000000002',
          receivedAt: '2026-10-10',
          amountMinor: 50000,
          pairedBy: 'VARIABLE_SYMBOL',
          senderAccount: null,
          receiptNumber: '2026-000001',
        }),
      ],
      totalAmountMinor: 80000,
      currency: 'CZK',
      count: 2,
    },
    receipts: [
      adminReceipt({
        donationId: '0192f0f1-0000-7000-8000-000000000002',
        donationReceivedOn: '2026-10-10',
      }),
    ],
    ...overrides,
  };
}

export function reportView(overrides: Partial<AdminReportResponse> = {}): AdminReportResponse {
  return {
    settings: {
      recipients: ['info@nfnn.cz'],
      sendDay: 1,
      sections: { donors: true, donations: true, unpairedPayments: true, bankImport: true },
      changedAt: null,
    },
    sentReports: [],
    nextReport: { month: '2026-09', dueOn: '2026-10-01' },
    lastEndedMonth: '2026-09',
    ...overrides,
  };
}

export function monthOverview(
  overrides: Partial<MonthOverviewResponse> = {},
): MonthOverviewResponse {
  return {
    month: '2026-10',
    received: { count: 1, totalMinor: 99900, currency: 'CZK' },
    newDonors: 1,
    paired: { count: 1, totalMinor: 99900, currency: 'CZK' },
    unpaired: { count: 0, totalMinor: 0, currency: 'CZK' },
    ...overrides,
  };
}

export function overview(overrides: Partial<AdminOverviewResponse> = {}): AdminOverviewResponse {
  return {
    year: 2026,
    availableYears: [2026, 2025],
    donorsRegistered: 3,
    newDonors: 3,
    received: { count: 5, totalMinor: 288350, currency: 'CZK' },
    paired: { count: 4, totalMinor: 273350, currency: 'CZK' },
    unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
    months: [
      monthOverview(),
      monthOverview({
        month: '2026-09',
        received: { count: 3, totalMinor: 168450, currency: 'CZK' },
        newDonors: 1,
        paired: { count: 2, totalMinor: 153450, currency: 'CZK' },
        unpaired: { count: 1, totalMinor: 15000, currency: 'CZK' },
      }),
      monthOverview({
        month: '2026-08',
        received: { count: 1, totalMinor: 20000, currency: 'CZK' },
        newDonors: 1,
        paired: { count: 1, totalMinor: 20000, currency: 'CZK' },
      }),
    ],
    ...overrides,
  };
}

export function backupFile(overrides: Partial<BackupFileResponse> = {}): BackupFileResponse {
  return {
    fileName: 'nfnn-2026-10-23_0300.dump',
    kind: 'DAILY',
    sizeBytes: 1590,
    createdAt: '2026-10-23T01:00:03Z',
    ...overrides,
  };
}

export function backupRun(overrides: Partial<BackupRunResponse> = {}): BackupRunResponse {
  return {
    outcome: 'OK',
    startedAt: '2026-10-23T01:00:00Z',
    finishedAt: '2026-10-23T01:00:03Z',
    fileName: 'nfnn-2026-10-23_0300.dump',
    sizeBytes: 1590,
    tables: null,
    requestId: null,
    error: null,
    ...overrides,
  };
}

export function backupsView(overrides: Partial<AdminBackupsResponse> = {}): AdminBackupsResponse {
  return {
    available: true,
    backups: [
      backupFile(),
      backupFile({
        fileName: 'nfnn-2026-10-22_0300.dump',
        sizeBytes: 1000,
        createdAt: '2026-10-22T01:00:03Z',
      }),
    ],
    lastBackup: backupRun(),
    lastTestRestore: backupRun({
      startedAt: '2026-10-18T02:00:00Z',
      finishedAt: '2026-10-18T02:00:05Z',
      fileName: 'nfnn-2026-10-18_0300.dump',
      tables: 37,
    }),
    lastRestore: null,
    restoreFiles: [],
    pendingRequests: 0,
    problems: [],
    ...overrides,
  };
}

export function setting(overrides: Partial<AdminSettingResponse> = {}): AdminSettingResponse {
  return {
    name: 'PUBLIC_URL',
    group: 'SITE',
    secret: false,
    value: 'https://nfnn.cz',
    configured: true,
    stored: true,
    unreadable: false,
    ...overrides,
  };
}

export function settingsView(
  overrides: Partial<AdminSettingsResponse> = {},
): AdminSettingsResponse {
  return {
    settings: [
      setting(),
      setting({ name: 'MAIL_HOST', group: 'MAIL', value: 'smtp-relay.brevo.com' }),
      setting({ name: 'MAIL_PORT', group: 'MAIL', value: '587' }),
      setting({ name: 'MAIL_USERNAME', group: 'MAIL', value: 'abc@smtp-brevo.com' }),
      setting({ name: 'MAIL_PASSWORD', group: 'MAIL', secret: true, value: null }),
      setting({ name: 'MAIL_AUTH', group: 'MAIL', value: 'true' }),
      setting({ name: 'MAIL_STARTTLS', group: 'MAIL', value: 'true' }),
      setting({ name: 'MAIL_FROM', group: 'MAIL', value: 'info@nfnn.cz' }),
      setting({ name: 'CONTACT_RECIPIENT', group: 'MAIL', value: 'info@nfnn.cz' }),
      setting({
        name: 'FIO_TOKEN',
        group: 'BANK',
        secret: true,
        value: null,
        configured: false,
        stored: false,
      }),
      setting({
        name: 'FIO_HISTORY_FROM',
        group: 'BANK',
        value: null,
        configured: false,
        stored: false,
      }),
      setting({
        name: 'PAIRING_EXCLUDED_ACCOUNTS',
        group: 'BANK',
        value: null,
        configured: false,
        stored: false,
      }),
      setting({
        name: 'RECEIPT_SIGNATORY_NAME',
        group: 'RECEIPTS',
        value: 'Pavel Znamenáček',
        stored: false,
      }),
      setting({
        name: 'RECEIPT_SIGNATORY_ROLE',
        group: 'RECEIPTS',
        value: 'předseda správní rady',
        stored: false,
      }),
      setting({ name: 'RECEIPT_FIRST_YEAR', group: 'RECEIPTS', value: '2026', stored: false }),
      setting({
        name: 'TUNNEL_TOKEN',
        group: 'TUNNEL',
        secret: true,
        value: null,
        configured: false,
        stored: true,
        unreadable: true,
      }),
    ],
    secretsCanBeStored: true,
    ...overrides,
  };
}
