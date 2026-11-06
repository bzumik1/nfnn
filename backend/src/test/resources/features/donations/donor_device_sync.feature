@donations
Feature: A donor's device keeps a copy of the donor's data by downloading only the chunks that changed

  Background:
    Given a person of the foundation signs the receipts

  Scenario: A device gets a chunk of donations per year, with the summary, and never another donor's gifts
    Given today is 2026-10-20
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2025-11-30 | 100.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |                                       |
      | 1002 | 2026-03-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |                                       |
      | 1003 | 2026-05-05 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
      | 1004 | 2026-04-01 | 900.00 | 2900244444 | 0800     | Svoboda Petr  | {Petr}         |                                       |
    And the application starts the import
    When a device of "Jana" syncs
    Then the response status is 200
    And the device downloaded the chunks "bank-accounts, donations:2025, donations:2026"
    And the device holds the chunk "bank-accounts" with 1 row
    And the device holds these chunks of donations:
      | id             | count |
      | donations:2025 | 1     |
      | donations:2026 | 2     |
    And the device's copy names "Jana" as its subject
    And every chunk on the device hashes to its rowsSha256
    And the device's chunk "donations:2026" holds the donations:
      | receivedAt | amountMinor | status   | source        | purpose              | pairedBy        |
      | 2026-05-05 | 100         | RECEIVED | BANK_TRANSFER | ACCOUNT_VERIFICATION | VARIABLE_SYMBOL |
      | 2026-03-10 | 50000       | RECEIVED | BANK_TRANSFER | GENERAL              | VARIABLE_SYMBOL |
    And the device's chunks of donations hold every donation "Jana" lists and no other
    And the device's summary totals 60100 minor CZK in 3 donations
    And the device's summary by year is:
      | year | count | totalAmountMinor |
      | 2026 | 2     | 50100            |
      | 2025 | 1     | 10000            |
    And the device's summary makes yearly receipts available through 2025 from 2026
    And the device's summary says the bank data are as of the last import
    And no chunk on the device holds a donation of "Petr"

  Scenario: A new payment changes only the chunk of its year, and an unchanged manifest downloads nothing
    Given today is 2026-10-20
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-11-30 | 100.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-03-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And a device of "Jana" syncs
    When a device of "Jana" syncs
    Then the device downloaded no chunk
    And the device removed no chunk
    When the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1005 | 2026-10-19 | 250.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the hourly import runs
    And a device of "Jana" syncs
    Then the device downloaded the chunks "donations:2026"
    And the device removed no chunk
    And the device's chunk "donations:2026" holds the donations:
      | receivedAt | amountMinor | status   | source        | purpose | pairedBy        |
      | 2026-10-19 | 25000       | RECEIVED | BANK_TRANSFER | GENERAL | VARIABLE_SYMBOL |
      | 2026-03-10 | 50000       | RECEIVED | BANK_TRANSFER | GENERAL | VARIABLE_SYMBOL |
    And the device's summary totals 85000 minor CZK in 3 donations
    And every chunk on the device hashes to its rowsSha256

  Scenario: An unpaired gift leaves its chunk, and the chunk of a year without gifts leaves the device
    Given today is 2026-10-20
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2025-11-30 | 100.00 | 2900244444 | 0800     | Svoboda Petr | {Petr}         |
      | 1002 | 2026-03-10 | 500.00 | 2900244444 | 0800     | Svoboda Petr | {Petr}         |
      | 1003 | 2026-04-10 | 300.00 | 2900244444 | 0800     | Svoboda Petr | {Petr}         |
    And the application starts the import
    And a device of "Petr" syncs
    When "Jana" unpairs payment 1001
    And "Jana" unpairs payment 1003
    And a device of "Petr" syncs
    Then the device downloaded the chunks "donations:2026"
    And the device removed the chunks "donations:2025"
    And the device holds these chunks of donations:
      | id             | count |
      | donations:2026 | 1     |
    And the device's chunk "donations:2026" holds the donations:
      | receivedAt | amountMinor | status   | source        | purpose | pairedBy        |
      | 2026-03-10 | 50000       | RECEIVED | BANK_TRANSFER | GENERAL | VARIABLE_SYMBOL |
    And the device's summary totals 50000 minor CZK in 1 donation
    When "Petr" asks for the sync chunks "donations:2025,donations:2026"
    Then the response status is 200
    And the chunks answer holds "donations:2026" and lists "donations:2025" as missing

  Scenario: Issued receipts, bank accounts and answered older symbols come in chunks of their own, as the donor's other answers list them
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-08-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-09-05 | 400.00 | 7654321 | 0800     | Nováková Jana | {Jana}         |                                       |
      | 1003 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And a device of "Jana" syncs
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    And "Jana" issues the receipt of her donation received on 2026-09-05
    And a device of "Jana" syncs
    Then the device downloaded the chunks "bank-accounts, donations:2026, receipts:2026, symbol-claims"
    And the device's chunk "receipts:2026" holds every receipt "Jana" lists for 2026
    And the device's chunk "bank-accounts" holds every bank account "Jana" lists
    And the device's chunk "symbol-claims" holds symbol "6123456789" of bank account "1234567/0800" answered "CONFIRMED"
    And the device's chunk "donations:2026" holds the donations:
      | receivedAt | amountMinor | status   | source        | purpose              | pairedBy         |
      | 2026-10-14 | 100         | RECEIVED | BANK_TRANSFER | ACCOUNT_VERIFICATION | VARIABLE_SYMBOL  |
      | 2026-09-05 | 40000       | RECEIVED | BANK_TRANSFER | GENERAL              | VARIABLE_SYMBOL  |
      | 2026-08-05 | 50000       | RECEIVED | BANK_TRANSFER | GENERAL              | CONFIRMED_SYMBOL |
    And the device's donation received on 2026-08-05 names its bank account and its symbol claim
    And every chunk on the device hashes to its rowsSha256
    When "Jana" issues the receipt of her donation received on 2026-09-05
    And a device of "Jana" syncs
    Then the device downloaded no chunk

  Scenario: A receipt comes in the chunk of the year it certifies, not of the year it was issued, and a replacement keeps the receipt it replaces beside it
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Jana" issues the receipt of her donation received on 2026-10-01
    And "Jana" issues her yearly receipt for 2026
    And a device of "Jana" syncs
    Then the device downloaded the chunks "bank-accounts, donations:2026, receipts:2026"
    And the device holds the chunk "receipts:2026" with 2 rows
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Jana" issues her yearly receipt for 2026
    And a device of "Jana" syncs
    Then the device downloaded the chunks "receipts:2026"
    And the device removed no chunk
    And the device holds the chunk "receipts:2026" with 3 rows
    And the device's chunk "receipts:2026" holds every receipt "Jana" lists for 2026

  Scenario: A yearly receipt that an unpairing withdrew stays in its chunk as withdrawn, so the device no longer offers it
    Given today is 2026-12-20
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 3001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 3002 | 2026-10-12 | 200.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026
    And a device of "Jana" syncs
    Then the device's chunk "receipts:2026" holds receipts with the statuses "ACTIVE"
    When "Andrea" unpairs payment 3002
    And a device of "Jana" syncs
    Then the device holds the chunk "receipts:2026" with 1 row
    And the device's chunk "receipts:2026" holds receipts with the statuses "WITHDRAWN"
    And the device's chunk "receipts:2026" holds every receipt "Jana" lists for 2026
    And the device's chunks of donations hold every donation "Jana" lists and no other

  Scenario: The device of an erased donor is signed out, so its token gets neither the manifest nor a chunk
    Given today is 2026-10-20
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Petr" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message                               |
      | 1002 | 2026-09-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |                                       |
      | 1003 | 2026-10-05 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" issues the receipt of her donation received on 2026-09-10
    And a device of "Jana" syncs
    And the device downloaded the chunks "bank-accounts, donations:2026, receipts:2026"
    When "Petr" erased the donor "Jana"
    And "Jana" asks for her sync manifest
    Then the response status is 401
    And the problem type ends with "auth/session-ended"
    When "Jana" asks for the sync chunks "donations:2026"
    Then the response status is 401
    And the problem type ends with "auth/session-ended"

  Scenario: The chunks come in the asked order, a repeated chunk once, up to 64 in one request, and no cache keeps an answer
    Given today is 2026-10-20
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-11-30 | 100.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-03-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for the sync chunks "donations:2026,donations:2025,donations:2026,receipts:2026"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the chunks answer holds "donations:2026, donations:2025" and lists "receipts:2026" as missing
    When "Jana" asks for 64 sync chunks
    Then the response status is 200
    When "Jana" asks for her sync manifest
    Then the response status is 200
    And the answer is JSON that must not be cached

  Scenario: Asking for chunks that are not chunk ids, too many or none is refused
    Given a person "Jana" is registered
    When "Jana" asks for the sync chunks "donations:26"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for the sync chunks "payments:2026"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for 65 sync chunks
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for the sync chunks ""
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: The manifest and the chunks together answer 60 requests of one donor in 15 minutes, from any address
    Given a person "Jana" is registered
    And a person "Petr" is registered
    When "Jana" asks for her sync manifest 30 times
    And "Jana" asks for the sync chunks "donations:2026" 30 times
    Then the response status is 200
    When the following requests come from another client address
    And "Jana" asks for her sync manifest
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    When "Jana" asks for the sync chunks "donations:2026"
    Then the response status is 429
    When "Petr" asks for his sync manifest
    Then the response status is 200
    When 15 minutes pass
    And "Jana" asks for her sync manifest
    Then the response status is 200

  Scenario: The manifest and the chunks need a signed-in donor
    When someone without a token asks for the sync manifest
    Then the response status is 401
    When someone without a token asks for the sync chunks "donations:2026"
    Then the response status is 401
