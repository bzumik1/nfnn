import { BankAccountItem, SymbolOffer } from '../bank-accounts-api';

export function bankAccount(overrides: Partial<BankAccountItem> = {}): BankAccountItem {
  return {
    id: '0192f0c4-0000-7000-8000-000000000001',
    accountNumber: '2900233333/2010',
    status: 'ACTIVE',
    verifiedOn: '2026-03-12',
    connectedFrom: null,
    disconnectedOn: null,
    donationCount: 14,
    totalAmountMinor: 740000,
    currency: 'CZK',
    lastDonationOn: '2026-10-01',
    shared: false,
    pairingExcluded: false,
    verificationPaymentOn: null,
    symbolOffer: null,
    confirmedSymbols: [],
    ...overrides,
  };
}

export function symbolOffer(overrides: Partial<SymbolOffer> = {}): SymbolOffer {
  return {
    variableSymbol: '6123456789',
    paymentCount: 14,
    firstMonth: '2025-01',
    lastMonth: '2026-10',
    ...overrides,
  };
}
