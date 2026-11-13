@donations
Feature: An administrator's device keeps a copy of the administration's donations by downloading only the chunks that changed

  Background:
    Given a person of the foundation signs the receipts

  Scenario: A device gets payments and gifts by month, donor records and their bank accounts by registration month, receipts by year, the older-symbol answers, the import state and the report settings, as the administration reads them
    Given today is 2026-10-17
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2025-11-30 | 100.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |                                       |
      | 1002 | 2026-08-05 | 500.00 | 1234567    | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1003 | 2026-09-05 | 400.00 | 7654321    | 0800     | Nováková Jana | {Jana}         |                                       |
      | 1004 | 2026-10-14 | 1.00   | 1234567    | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
      | 1005 | 2026-09-20 | 250.00 | 2900299999 | 0300     | Dvořák Karel  |                |                                       |
      | 1007 | 2026-10-15 | 200.00 | 1234567    | 0800     | Nováková Jana |                |                                       |
    And the application starts the import
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    And "Jana" issues the receipt of her donation received on 2026-09-05
    And an administration device of "Andrea" syncs the donations
    Then the administration device downloaded the chunks "donations:2025-11, donations:2026-08, donations:2026-09, donations:2026-10, donor-records:2026-10, import-state, links:2026-10, payments:2025-11, payments:2026-08, payments:2026-09, payments:2026-10, receipts:2026, report-settings, symbol-claims"
    And the administration device's copy names "Andrea" as its subject and holds the administration
    And every chunk on the administration device hashes to its rowsSha256
    And the administration device holds the chunk "donor-records:2026-10" with 2 rows
    And the administration device holds the chunk "payments:2026-09" with 2 rows
    And the administration device holds the chunk "donations:2026-09" with 1 row
    And the administration device's chunks of payments hold every payment the administration lists, those of erased donors without the payer
    And the administration device's chunks of donations hold every gift of "Jana" the administration lists
    And every gift on the administration device names a donor record, a payment, a bank account and an older-symbol answer it holds, 2 of them a bank account and 1 an older-symbol answer
    And the administration device holds the donor record of "Jana" as the administration reads it, with its bank accounts
    And the administration device's chunk "receipts:2026" holds every receipt the administration lists
    And every receipt of the administration device's chunk "receipts:2026" names the verification key its donor card names
    And the administration device's chunk "symbol-claims" holds every older-symbol answer the administration lists
    And the administration device's chunk "import-state" holds the stored import state the administration reads, without the run of older payments and the text of the failure
    And the administration device's chunk "report-settings" holds the monthly report settings, the sent reports, the next report and the last ended month the administration reads
    And the administration device's summary lists the years "2026, 2025"
    And the administration device's summary of every year is the administration's overview of that year
    And the administration device's summary names the day 2026-10-17 and the first receipt year the donor card reads

  Scenario: A failed import reaches the device with its kind and time, never the bank's or the server's text of the failure
    Given today is 2026-10-17
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And the application starts the import
    And 1 days pass
    And Fio refuses the next request because the token is not valid
    And the hourly import runs
    When an administration device of "Andrea" syncs the donations
    Then the administration device's chunk "import-state" holds the failure "UNAUTHORIZED" attempted at "2026-10-18T10:00:00Z" without its text
    And the administration device's chunk "import-state" holds the stored import state the administration reads, without the run of older payments and the text of the failure

  Scenario: A bank account learned in a later month stays in the chunk of its owner's registration month
    Given today is 2026-09-28
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And today is 2026-10-02
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1004 | 2026-10-01 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    When an administration device of "Andrea" syncs the donations
    Then the administration device holds the chunk "links:2026-09" with 1 row
    And the administration device holds the donor record of "Jana" as the administration reads it, with its bank accounts

  Scenario: A new payment changes only the chunks of its month and the import state, and an unchanged manifest downloads nothing
    Given today is 2026-10-20
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-09-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And an administration device of "Andrea" syncs the donations
    When an administration device of "Andrea" syncs the donations
    Then the administration device downloaded no chunk
    And the administration device removed no chunk
    When the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1005 | 2026-10-19 | 250.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And 60 minutes pass
    And the hourly import runs
    And an administration device of "Andrea" syncs the donations
    Then the administration device downloaded the chunks "donations:2026-10, import-state, payments:2026-10"
    And the administration device removed no chunk
    And the administration device's chunks of payments hold every payment the administration lists, those of erased donors without the payer
    And the administration device's summary of every year is the administration's overview of that year
    And every chunk on the administration device hashes to its rowsSha256

  Scenario: The turn of a month changes the report settings' last ended month, never their version
    Given today is 2026-10-20
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And an administration device of "Andrea" syncs the donations
    And the administration device notes the version of its report settings
    When today is 2026-11-01
    And an administration device of "Andrea" syncs the donations
    Then the administration device downloaded the chunks "report-settings"
    And the administration device's report settings keep the noted version, with the next report for "2026-10" and the last ended month "2026-10"
    And the administration device's chunk "report-settings" holds the monthly report settings, the sent reports, the next report and the last ended month the administration reads

  Scenario: An unpaired gift leaves the gifts of its month, and a month without gifts leaves the device
    Given today is 2026-10-20
    And the foundation wants bank history from 2026-01-01
    And the bank history is unlocked
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-03-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-04-10 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And an administration device of "Andrea" syncs the donations
    When "Andrea" unpairs payment 1002
    And an administration device of "Andrea" syncs the donations
    Then the administration device downloaded the chunks "payments:2026-04"
    And the administration device removed the chunks "donations:2026-04"
    And the administration device's chunks of payments hold every payment the administration lists, those of erased donors without the payer
    And the administration device's chunks of donations hold every gift of "Jana" the administration lists
    And the administration device's summary of every year is the administration's overview of that year

  Scenario: An erased donor stays as a placeholder while the donor's bank accounts, older-symbol answers, receipts and the payer of the donor's payments leave the device
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message                               |
      | 1002 | 2026-08-05 | 500.00 | 1234567    | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1003 | 2026-09-05 | 400.00 | 7654321    | 0800     | Nováková Jana | {Jana}         |                                       |
      | 1004 | 2026-10-14 | 1.00   | 1234567    | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
      | 1006 | 2026-09-07 | 900.00 | 2900244444 | 0800     | Svoboda Petr  | {Petr}         |                                       |
    And the application starts the import
    And "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    And "Jana" issues the receipt of her donation received on 2026-09-05
    And "Petr" issues the receipt of his donation received on 2026-09-07
    And an administration device of "Andrea" syncs the donations
    When "Andrea" erased the donor "Jana"
    And an administration device of "Andrea" syncs the donations
    Then the administration device removed the chunks "symbol-claims"
    And the administration device holds the donor record of "Jana" only as an erased placeholder, without bank accounts, older-symbol answers or receipts
    And the administration device holds the donor record of "Petr" as the administration reads it, with its bank accounts
    And the administration device's chunk "receipts:2026" holds every receipt the administration lists for 2026, except those of "Jana"
    And the administration device holds 3 payments of "Jana", each without the payer's name, account and message
    And every gift on the administration device names a donor record, a payment, a bank account and an older-symbol answer it holds, 0 of them a bank account and 0 an older-symbol answer
    And the administration device's chunks of payments hold every payment the administration lists, those of erased donors without the payer
    And every chunk on the administration device hashes to its rowsSha256

  Scenario: An administrator whose role was removed learns it at the next sync while the token is still valid, and the device keeps nothing
    Given today is 2026-10-20
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Jana" is an administrator
    And "Andrea" is an administrator
    And "Andrea" holds a browser token from before the signed-in devices
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-09-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And an administration device of "Andrea" syncs the donations
    When "Jana" removes "Andrea" from the administrators
    And an administration device of "Andrea" syncs the donations
    Then the administration device was told that "Andrea" no longer holds the administration
    When "Andrea" asks for the administration's donations sync chunks "payments:2026-09"
    Then the response status is 200
    And the administration's chunks answer holds "" and lists "payments:2026-09" as missing

  Scenario: The chunks come in the asked order, a repeated chunk once, up to 64 in one request, and no cache keeps an answer
    Given today is 2026-10-20
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-09-10 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    When "Andrea" asks for the administration's donations sync chunks "payments:2026-09,import-state,payments:2026-09,receipts:2026"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the administration's chunks answer holds "payments:2026-09, import-state" and lists "receipts:2026" as missing
    When "Andrea" asks for 64 of the administration's donations sync chunks
    Then the response status is 200
    When "Andrea" asks for the administration's donations sync manifest
    Then the response status is 200
    And the answer is JSON that must not be cached

  Scenario: Asking for chunks that are not chunk ids of the administration's donations, too many or none is refused
    Given a person "Andrea" is registered
    And "Andrea" is an administrator
    When "Andrea" asks for the administration's donations sync chunks "payments:26"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks "donations:2026"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks "accounts:2026-10"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks "payments:2026-00"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks "payments:2026-13"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks "receipts:2026-10"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks "donor-records:a"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks "import-state,,payments:2026-09"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for 65 of the administration's donations sync chunks
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donations sync chunks ""
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: The manifest and the chunks together answer 60 requests of one administrator in 15 minutes, from any address
    Given a person "Jana" is registered
    And a person "Andrea" is registered
    And "Jana" is an administrator
    And "Andrea" is an administrator
    When "Andrea" asks for the administration's donations sync manifest 30 times
    And "Andrea" asks for the administration's donations sync chunks "import-state" 30 times
    Then the response status is 200
    When the following requests come from another client address
    And "Andrea" asks for the administration's donations sync manifest
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    When "Andrea" asks for the administration's donations sync chunks "import-state"
    Then the response status is 429
    When "Jana" asks for the administration's donations sync manifest
    Then the response status is 200
    When 15 minutes pass
    And "Andrea" asks for the administration's donations sync manifest
    Then the response status is 200

  Scenario: The manifest and the chunks need an administrator
    Given a person "Jana" is registered
    When someone without a token asks for the administration's donations sync manifest
    Then the response status is 401
    When someone without a token asks for the administration's donations sync chunks "import-state"
    Then the response status is 401
    When "Jana" asks for the administration's donations sync manifest
    Then the response status is 403
    When "Jana" asks for the administration's donations sync chunks "import-state"
    Then the response status is 403
