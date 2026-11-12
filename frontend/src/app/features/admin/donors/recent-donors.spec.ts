import { donorAccount } from '../testing/admin-fixtures';
import { type CopiedGift, recentDonors } from './recent-donors';

const JANA = '01a18e56-bdb0-775a-bd0a-a60756831369';
const PETR = '019a1c00-0000-7000-8000-00000000a002';
const STAVBY = '019a1c00-0000-7000-8000-00000000a003';

function gift(overrides: Partial<CopiedGift> = {}): CopiedGift {
  return {
    id: '0192f0f1-0000-7000-8000-000000000001',
    donorId: JANA,
    receivedAt: '2026-10-12',
    amountMinor: 50000,
    status: 'RECEIVED',
    purpose: 'GENERAL',
    recordedAt: '2026-10-12T09:00:00Z',
    ...overrides,
  };
}

const accounts = [
  donorAccount({ donorId: JANA, name: 'Jana Nováková' }),
  donorAccount({ donorId: PETR, name: 'Petr Svoboda' }),
  donorAccount({ donorId: STAVBY, name: 'Stavby Novák s.r.o.' }),
];

describe('Given the gifts and donor accounts of the administration copy', () => {
  it('when donors gave on different days, then the one who gave last comes first, each once with the latest gift', () => {
    const recent = recentDonors(
      [
        gift({ id: 'g1', donorId: JANA, receivedAt: '2026-09-01', amountMinor: 10000 }),
        gift({ id: 'g2', donorId: PETR, receivedAt: '2026-10-20', amountMinor: 25000 }),
        gift({ id: 'g3', donorId: JANA, receivedAt: '2026-10-25', amountMinor: 30000 }),
      ],
      accounts,
      10,
    );

    expect(recent.map((item) => [item.account.name, item.lastGift])).toEqual([
      ['Jana Nováková', { receivedAt: '2026-10-25', amountMinor: 30000 }],
      ['Petr Svoboda', { receivedAt: '2026-10-20', amountMinor: 25000 }],
    ]);
  });

  it('when two gifts came on the same day, then the one recorded later counts as the later one', () => {
    const recent = recentDonors(
      [
        gift({ id: 'g1', donorId: PETR, recordedAt: '2026-10-12T10:00:00Z' }),
        gift({ id: 'g2', donorId: JANA, recordedAt: '2026-10-12T08:00:00Z' }),
        gift({ id: 'g3', donorId: STAVBY, recordedAt: '2026-10-12T10:00:00Z' }),
      ],
      accounts,
      10,
    );

    expect(recent.map((item) => item.account.name)).toEqual([
      'Stavby Novák s.r.o.',
      'Petr Svoboda',
      'Jana Nováková',
    ]);
  });

  it('when a gift was refunded or only verified an account, then it is not a contribution', () => {
    const recent = recentDonors(
      [
        gift({ id: 'g1', donorId: JANA, receivedAt: '2026-10-01', amountMinor: 20000 }),
        gift({ id: 'g2', donorId: JANA, receivedAt: '2026-10-30', status: 'REFUNDED' }),
        gift({
          id: 'g3',
          donorId: JANA,
          receivedAt: '2026-10-31',
          amountMinor: 100,
          purpose: 'ACCOUNT_VERIFICATION',
        }),
        gift({ id: 'g4', donorId: PETR, receivedAt: '2026-11-01', status: 'REFUNDED' }),
      ],
      accounts,
      10,
    );

    expect(recent.map((item) => [item.account.name, item.lastGift])).toEqual([
      ['Jana Nováková', { receivedAt: '2026-10-01', amountMinor: 20000 }],
    ]);
  });

  it('when more donors gave than the limit, then only the latest ones are listed', () => {
    const recent = recentDonors(
      [
        gift({ id: 'g1', donorId: JANA, receivedAt: '2026-10-01' }),
        gift({ id: 'g2', donorId: PETR, receivedAt: '2026-10-02' }),
        gift({ id: 'g3', donorId: STAVBY, receivedAt: '2026-10-03' }),
      ],
      accounts,
      2,
    );

    expect(recent.map((item) => item.account.name)).toEqual([
      'Stavby Novák s.r.o.',
      'Petr Svoboda',
    ]);
  });

  it('when a gift names a donor whose account the copy does not hold yet, then that donor is left out', () => {
    const recent = recentDonors(
      [
        gift({
          id: 'g1',
          donorId: '019a1c00-0000-7000-8000-00000000ffff',
          receivedAt: '2026-11-01',
        }),
        gift({ id: 'g2', donorId: JANA }),
      ],
      accounts,
      10,
    );

    expect(recent.map((item) => item.account.name)).toEqual(['Jana Nováková']);
  });

  it('when nobody gave yet, then nobody is listed', () => {
    expect(recentDonors([], accounts, 10)).toEqual([]);
  });
});
