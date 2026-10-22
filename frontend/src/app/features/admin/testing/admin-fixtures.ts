import {
  AdministratorResponse,
  AdminDonorResponse,
  AdminPaymentListResponse,
  AdminPaymentResponse,
  ImportStateResponse,
  PairedDonationResponse,
} from '../admin-api';

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
