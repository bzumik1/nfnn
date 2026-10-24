@donations
Feature: An administrator sees a donor's bank accounts, donations and receipts and removes a wrongly learned account

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator

  Scenario: The donor's donations card lists the record, the bank accounts, the donations and the receipts
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-05 | 200.00 | 2900233333 | 2010     | Svoboda Petr |                |
      | 1002 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |
      | 1003 | 2026-10-12 | 300.00 | 2900233333 | 2010     | Svoboda Petr |                |
    And the application starts the import
    And "Petr" downloads the receipt of his donation received on 2026-10-10
    When "Jana" opens the donations of "Petr"
    Then the response status is 200
    And the donations card names "Petr Svoboda" with the variable symbol of "Petr"
    And the donor's bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE |               |                | 2             | 50000            | 2026-10-12     | false  |
    And the donor's donations total 100000 in 3 donations
    And the donor's donation received on 2026-10-10 carries receipt number "2026-000001"
    And the donor's receipts are:
      | number      | kind   | donationReceivedOn | year | issuedOn   | active |
      | 2026-000001 | SINGLE | 2026-10-10         |      | 2026-10-17 | true   |

  Scenario: A donor who never gave has an empty card
    When "Jana" opens the donations of "Petr"
    Then the response status is 200
    And the donor's bank accounts are none
    And the donor's donations total 0 in 0 donations
    And the donor's receipts are none

  Scenario: An administrator turns the pairing from an account off and on again for the donor, and both steps are audited
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |
    And the application starts the import
    When "Jana" turns off the pairing from bank account "2900233333/2010" of "Petr"
    Then the response status is 204
    And the admin action "DISCONNECT_SENDER_ACCOUNT" by "Jana" on "Petr" is recorded
    When "Petr" asks for his bank accounts
    Then the bank accounts are:
      | accountNumber   | status       | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | DISCONNECTED |               | 2026-10-17     | 0             | 0                |                | false  |
    When 2 days pass
    And "Jana" turns on the pairing from bank account "2900233333/2010" of "Petr"
    Then the response status is 204
    And the admin action "RECONNECT_SENDER_ACCOUNT" by "Jana" on "Petr" is recorded
    When "Petr" asks for his bank accounts
    Then the bank accounts are:
      | accountNumber   | status           | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | AWAITING_PAYMENT | 2026-10-19    |                | 0             | 0                |                | false  |
      | 2900233333/2010 | DISCONNECTED     |               | 2026-10-17     | 0             | 0                |                | false  |
    When "Jana" turns off the pairing from bank account "2900233333/2010" of "Petr"
    Then the response status is 204
    When "Jana" turns off the pairing from the disconnected bank account "2900233333/2010" of "Petr"
    Then the response status is 409
    And the problem type ends with "donations/bank-account-already-disconnected"

  Scenario: Removing a wrongly learned account deletes the donations it paired and the donor's answers about it, and the payments stay unpaired
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol | message                               |
      | 1001 | 2026-08-05 | 150.00 | 2900233333 | 2010     | Svoboda Petr | 6123456789     |                                       |
      | 1002 | 2026-10-05 | 200.00 | 2900233333 | 2010     | Svoboda Petr |                |                                       |
      | 1003 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |                                       |
      | 1004 | 2026-10-14 | 1.00   | 2900233333 | 2010     | Svoboda Petr | {Petr}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Petr" confirms symbol "6123456789" at bank account "2900233333/2010"
    And bank payment 1001 is paired with "Petr" by confirmed symbol
    And "Petr" has 4 donations
    When "Jana" removes bank account "2900233333/2010" of "Petr"
    Then the response status is 204
    And "Petr" has 2 donations
    And bank payment 1001 is unpaired
    And bank payment 1002 is unpaired
    And bank payment 1003 is paired with "Petr"
    And bank payment 1004 is paired with "Petr"
    And "Petr" has learned no sender account
    And "Petr" has no stored answer about symbol "6123456789"
    And the admin action "REMOVE_SENDER_ACCOUNT_LINK" by "Jana" on "Petr" is recorded
    When the hourly import runs
    Then bank payment 1001 is unpaired
    And bank payment 1002 is unpaired
    When "Jana" opens the donations of "Petr"
    Then the donor's bank accounts are none

  Scenario: An account whose donations a downloaded receipt covers cannot be removed
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-05 | 200.00 | 2900233333 | 2010     | Svoboda Petr |                |
      | 1002 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |
    And the application starts the import
    And "Petr" downloads the receipt of his donation received on 2026-10-05
    When "Jana" removes bank account "2900233333/2010" of "Petr"
    Then the response status is 409
    And the problem type ends with "donations/bank-account-has-receipt"
    And "Petr" has 2 donations
    And "Petr" has learned sender account "2900233333/2010"
    And no admin action is recorded for "Jana"

  Scenario: A disconnected account can still be removed with the donations it paired while it was connected
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-05 | 200.00 | 2900233333 | 2010     | Svoboda Petr |                |
      | 1002 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |
    And the application starts the import
    And "Petr" disconnects bank account "2900233333/2010"
    When "Jana" removes bank account "2900233333/2010" of "Petr"
    Then the response status is 204
    And "Petr" has 1 donation
    And bank payment 1001 is unpaired
    And "Petr" has learned no sender account

  Scenario: An unknown donor or account answers 404
    When "Jana" opens the donations of an unknown donor
    Then the response status is 404
    And the problem type ends with "donations/donor-not-found"
    When "Jana" removes an unknown bank account of "Petr"
    Then the response status is 404
    And the problem type ends with "donations/bank-account-not-found"
    When "Jana" turns off the pairing from an unknown bank account of "Petr"
    Then the response status is 404
    And the problem type ends with "donations/bank-account-not-found"

  Scenario: A donor without the administrator role is refused and without a token nothing is served
    When "Petr" opens the donations of "Petr"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" removes an unknown bank account of "Petr"
    Then the response status is 403
    When someone without a token opens the donations of a donor
    Then the response status is 401
