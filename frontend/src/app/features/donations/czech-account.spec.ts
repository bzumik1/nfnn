import { sharedCases } from '../../../testing/shared-cases';
import { accountMatchesIban, bankCodeOf, ibanOfAccountNumber } from './czech-account';

for (const sharedCase of sharedCases('payment/account.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it('when the browser derives the IBAN of the account number and compares it with the served one, then it gives the expected IBAN and match', () => {
      const { accountNumber, iban } = sharedCase.input;

      expect({
        ibanOfNumber: ibanOfAccountNumber(accountNumber),
        matches: accountMatchesIban(accountNumber, iban),
      }).toEqual(sharedCase.expected);
    });
  });
}

describe('Given an account as the bank or the learned link writes it', () => {
  it.each([
    ['2000145399/0800', '0800'],
    ['19-2000145399/0800', '0800'],
    ['1234567890/0800', '0800'],
  ])('when the bank code of %j is read, then it is %j', (account, bankCode) => {
    expect(bankCodeOf(account)).toBe(bankCode);
  });

  it.each(['CZ6508000000192000145399', '2000145399', '2000145399/80', 'abc/0800', ''])(
    'when the bank code of %j is read, then there is none, because it is no Czech account with a bank code',
    (account) => {
      expect(bankCodeOf(account)).toBeNull();
    },
  );
});
