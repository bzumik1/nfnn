import { sharedCases } from '../../../testing/shared-cases';
import { accountMatchesIban, ibanOfAccountNumber } from './czech-account';

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
