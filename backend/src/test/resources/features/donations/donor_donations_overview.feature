Feature: A donor sees their own donations and their summary

  Scenario: A donor without donations gets an empty list and a zero summary
    Given today is 2026-01-20
    And a person "Jana" is registered
    When "Jana" asks for her donations
    Then the response status is 200
    And the donation list is empty
    And the list totals 0 minor CZK in 0 donations
    When "Jana" asks for her donation summary
    Then the response status is 200
    And the summary totals 0 minor CZK in 0 donations
    And the summary has no last donation
    And the summary has no years

  Scenario: A donor's donations from two years come newest first with their total
    Given today is 2026-01-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-11-30 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-01-10 | 500.00  | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1003 | 2025-12-20 | 1250.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for her donations
    Then the response status is 200
    And the donation list holds:
      | receivedAt | amountMinor | currency | purpose          | status   | source        |
      | 2026-01-10 | 50000       | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
      | 2025-12-20 | 125000      | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
      | 2025-11-30 | 100000      | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
    And every listed donation has an id and no receipt number yet
    And the list totals 275000 minor CZK in 3 donations

  Scenario: The purpose follows the language the donor reads in
    Given today is 2026-01-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-01-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for her donations in English
    Then the response status is 200
    And the donation list holds:
      | receivedAt | amountMinor | currency | purpose              | status   | source        |
      | 2026-01-10 | 50000       | CZK      | General contribution | RECEIVED | BANK_TRANSFER |

  Scenario: The summary adds up the donations per year, newest year first
    Given today is 2026-01-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-11-30 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-01-10 | 500.00  | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1003 | 2025-12-20 | 1250.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for her donation summary
    Then the response status is 200
    And the summary totals 275000 minor CZK in 3 donations
    And the summary's last donation was received on 2026-01-10
    And the summary by year is:
      | year | count | totalAmountMinor |
      | 2026 | 1     | 50000            |
      | 2025 | 2     | 225000           |

  Scenario: Asking for one year gives only that year's donations and their total
    Given today is 2026-01-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-11-30 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-01-10 | 500.00  | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1003 | 2025-12-20 | 1250.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for her donations in 2025
    Then the response status is 200
    And the donation list holds:
      | receivedAt | amountMinor | currency | purpose          | status   | source        |
      | 2025-12-20 | 125000      | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
      | 2025-11-30 | 100000      | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
    And the list totals 225000 minor CZK in 2 donations

  Scenario: A year without donations gives an empty list
    Given today is 2026-01-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-01-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for her donations in 2024
    Then the response status is 200
    And the donation list is empty
    And the list totals 0 minor CZK in 0 donations

  Scenario: An empty year counts as no year
    Given today is 2026-01-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-11-30 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-01-10 | 500.00  | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for her donations in year ""
    Then the response status is 200
    And the donation list holds:
      | receivedAt | amountMinor | currency | purpose          | status   | source        |
      | 2026-01-10 | 50000       | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
      | 2025-11-30 | 100000      | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
    And the list totals 150000 minor CZK in 2 donations

  Scenario Outline: A year that is not a four-digit number is refused
    Given today is 2026-01-20
    And a person "Jana" is registered
    When "Jana" asks for her donations in year "<year>"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "year"

    Examples:
      | year  |
      | 99    |
      | 10000 |
      | abc   |

  Scenario: Each donor sees only their own donations
    Given today is 2026-01-20
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-01-10 | 500.00  | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-01-12 | 1200.00 | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
    And the application starts the import
    When "Jana" asks for her donations
    Then the response status is 200
    And the donation list holds:
      | receivedAt | amountMinor | currency | purpose          | status   | source        |
      | 2026-01-10 | 50000       | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
    And the list totals 50000 minor CZK in 1 donation
    When "Petr" asks for his donations
    Then the response status is 200
    And the donation list holds:
      | receivedAt | amountMinor | currency | purpose          | status   | source        |
      | 2026-01-12 | 120000      | CZK      | Obecný příspěvek | RECEIVED | BANK_TRANSFER |
    And the list totals 120000 minor CZK in 1 donation
    When "Petr" asks for his donation summary
    Then the response status is 200
    And the summary totals 120000 minor CZK in 1 donation
    And the summary's last donation was received on 2026-01-12
    And the summary by year is:
      | year | count | totalAmountMinor |
      | 2026 | 1     | 120000           |

  Scenario: Without a token neither the list nor the summary answers
    When someone without a token asks for the donations
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token asks for the donation summary
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
