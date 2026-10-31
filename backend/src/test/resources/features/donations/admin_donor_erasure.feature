@donations
Feature: Donations keep an erased donor's gifts and issued receipts, and drop the record's personal data

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator

  Scenario: Erasing a donor anonymizes the record, drops the bank accounts and answers, and keeps the donations and receipts
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol | message                               |
      | 1001 | 2026-08-05 | 150.00 | 2900233333 | 2010     | Svoboda Petr | 6123456789     |                                       |
      | 1002 | 2026-10-05 | 200.00 | 2900233333 | 2010     | Svoboda Petr |                |                                       |
      | 1003 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |                                       |
      | 1004 | 2026-10-14 | 1.00   | 2900233333 | 2010     | Svoboda Petr | {Petr}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Petr" confirms symbol "6123456789" at bank account "2900233333/2010"
    And "Petr" issues the receipt of his donation received on 2026-10-10
    And the issued receipt is the single receipt of the donation of "Petr" received on 2026-10-10
    And the issued receipt has number "2026-000001"
    And "Petr" has 4 donations
    When "Jana" erases the donor "Petr"
    Then the response status is 204
    And "Petr" has 4 donations
    And "Petr" has no stored answer about symbol "6123456789"
    When "Jana" opens the donations of "Petr"
    Then the response status is 200
    And the donations card names "Vymazaný dárce" with the variable symbol of "Petr"
    And the donations card says the donor was erased on 2026-10-17
    And the donor's bank accounts are none
    And the donor's donations total 85100 in 4 donations
    And the donor's receipts are:
      | number      | kind   | donationReceivedOn | year | issuedOn   | active |
      | 2026-000001 | SINGLE | 2026-10-10         |      | 2026-10-17 | true   |
    And the stored data of receipt "2026-000001" still names the donor as issued:
      | donorName       | Petr Svoboda                     |
      | donorAddress    | Dlouhá 12, 400 01 Ústí nad Labem |
      | donorIdentifier |                                  |
    And bank payment 1004 still keeps what the bank statement says:
      | counterpartyName    | Svoboda Petr                          |
      | counterpartyAccount | 2900233333/2010                       |
      | message             | OVERENI UCTU NADACNI FOND NOVA NADEJE |

  Scenario: Payments of an erased donor are not paired any more, by symbol or by account
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |
    And the application starts the import
    And "Jana" erased the donor "Petr"
    When the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1002 | 2026-10-16 | 300.00 | 2900233333 | 2010     | Svoboda Petr | {Petr}         |
      | 1003 | 2026-10-16 | 200.00 | 2900233333 | 2010     | Svoboda Petr |                |
    And the hourly import runs
    Then bank payment 1001 is paired with "Petr"
    And bank payment 1002 is unpaired
    And bank payment 1003 is unpaired
    When "Jana" searches donors for "{Petr}"
    Then the found donors are none
    When "Jana" searches donors for "vymaz"
    Then the found donors are none
