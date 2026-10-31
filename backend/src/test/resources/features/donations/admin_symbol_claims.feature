@donations
Feature: An administrator lists the answers about older variable symbols and corrects a wrong one

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name         | variableSymbol | message                               |
      | 1001 | 2026-08-05 | 500.00 | 1234567 | 0800     | Svoboda Petr | 6123456789     |                                       |
      | 1002 | 2026-09-05 | 500.00 | 1234567 | 0800     | Svoboda Petr | 6123456789     |                                       |
      | 1003 | 2026-10-14 | 1.00   | 1234567 | 0800     | Svoboda Petr | {Petr}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And a person of the foundation signs the receipts

  Scenario: The answers are listed newest first with the donor, the account, the symbol and the donations they paired
    Given "Petr" confirms symbol "6123456789" at bank account "1234567/0800"
    When "Jana" asks for the symbol answers
    Then the response status is 200
    And the symbol answers are:
      | donorName    | account      | variableSymbol | answer    | donationCount |
      | Petr Svoboda | 1234567/0800 | 6123456789     | CONFIRMED | 2             |

  Scenario: Reversing a wrong "Yes" deletes the donations it paired, turns the answer into "No", keeps the payments unpaired at the next import and audits the action
    Given "Petr" confirms symbol "6123456789" at bank account "1234567/0800"
    And bank payment 1001 is paired with "Petr" by confirmed symbol
    When "Jana" reverses the symbol answer of "Petr" to "6123456789"
    Then the response status is 204
    And "Petr" has 1 donation
    And the stored answer of "Petr" to symbol "6123456789" from bank account "1234567/0800" is "DECLINED"
    And bank payment 1001 is unpaired
    And bank payment 1002 is unpaired
    And the admin action "REVERSE_SYMBOL_CLAIM" by "Jana" on the symbol answer of "Petr" to "6123456789" is recorded
    When the hourly import runs
    Then bank payment 1001 is unpaired
    When "Petr" asks for his bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" lists no confirmed symbol
    When "Jana" asks for the symbol answers
    Then the symbol answers are:
      | donorName    | account      | variableSymbol | answer   | donationCount |
      | Petr Svoboda | 1234567/0800 | 6123456789     | DECLINED | 0             |

  Scenario: A "Yes" whose donations a downloaded receipt already covers cannot be reversed
    Given "Petr" confirms symbol "6123456789" at bank account "1234567/0800"
    And "Petr" downloads the receipt of his donation received on 2026-08-05
    When "Jana" reverses the symbol answer of "Petr" to "6123456789"
    Then the response status is 409
    And the problem type ends with "donations/symbol-claim-has-receipt"
    And bank payment 1001 is paired with "Petr" by confirmed symbol
    And the stored answer of "Petr" to symbol "6123456789" from bank account "1234567/0800" is "CONFIRMED"
    And no admin action is recorded for "Jana"

  Scenario: A "No" cannot be reversed, only deleted, after which the account asks the donor again
    Given "Petr" declines symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 204
    When "Jana" reverses the symbol answer of "Petr" to "6123456789"
    Then the response status is 409
    And the problem type ends with "donations/symbol-claim-not-confirmed"
    When "Jana" deletes the symbol answer of "Petr" to "6123456789"
    Then the response status is 204
    And "Petr" has no stored answer to symbol "6123456789" from bank account "1234567/0800"
    And the admin action "RESET_SYMBOL_CLAIM" by "Jana" on the symbol answer of "Petr" to "6123456789" is recorded
    When "Petr" asks for his bank accounts
    Then bank account "1234567/0800" asks about symbol "6123456789" with 2 payments from "2026-08" to "2026-09"

  Scenario: A "Yes" cannot be deleted before it is reversed
    Given "Petr" confirms symbol "6123456789" at bank account "1234567/0800"
    When "Jana" deletes the symbol answer of "Petr" to "6123456789"
    Then the response status is 409
    And the problem type ends with "donations/symbol-claim-still-confirmed"
    And the stored answer of "Petr" to symbol "6123456789" from bank account "1234567/0800" is "CONFIRMED"
    And bank payment 1001 is paired with "Petr" by confirmed symbol

  Scenario: An unknown answer is not found
    When "Jana" reverses an unknown symbol answer
    Then the response status is 404
    And the problem type ends with "donations/symbol-claim-not-found"
    When "Jana" deletes an unknown symbol answer
    Then the response status is 404
    And the problem type ends with "donations/symbol-claim-not-found"

  Scenario: A donor without the role and a request without a token are refused
    When "Petr" asks for the symbol answers
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token asks for the symbol answers
    Then the response status is 401
