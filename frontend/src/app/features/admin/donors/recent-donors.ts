import type { DonorAccountResponse } from '../admin-api';

export interface CopiedGift {
  readonly id: string;
  readonly donorId: string;
  readonly receivedAt: string;
  readonly amountMinor: number;
  readonly status: string;
  readonly purpose: string;
  readonly recordedAt: string;
}

export interface LastGift {
  readonly receivedAt: string;
  readonly amountMinor: number;
}

export interface RecentDonor {
  readonly account: DonorAccountResponse;
  readonly lastGift: LastGift;
}

export function recentDonors(
  gifts: readonly CopiedGift[],
  accounts: readonly DonorAccountResponse[],
  limit: number,
): RecentDonor[] {
  const latestByDonor = new Map<string, CopiedGift>();
  for (const gift of gifts.filter(isContribution)) {
    const known = latestByDonor.get(gift.donorId);
    if (known === undefined || later(gift, known)) {
      latestByDonor.set(gift.donorId, gift);
    }
  }
  const accountsById = new Map(accounts.map((account) => [account.donorId, account]));
  return [...latestByDonor.values()]
    .sort((first, second) => (later(first, second) ? -1 : later(second, first) ? 1 : 0))
    .flatMap((gift) => {
      const account = accountsById.get(gift.donorId);
      return account === undefined
        ? []
        : [{ account, lastGift: { receivedAt: gift.receivedAt, amountMinor: gift.amountMinor } }];
    })
    .slice(0, limit);
}

function isContribution(gift: CopiedGift): boolean {
  return gift.status === 'RECEIVED' && gift.purpose !== 'ACCOUNT_VERIFICATION';
}

function later(gift: CopiedGift, other: CopiedGift): boolean {
  if (gift.receivedAt !== other.receivedAt) {
    return gift.receivedAt > other.receivedAt;
  }
  if (gift.recordedAt !== other.recordedAt) {
    return gift.recordedAt > other.recordedAt;
  }
  return gift.id > other.id;
}
