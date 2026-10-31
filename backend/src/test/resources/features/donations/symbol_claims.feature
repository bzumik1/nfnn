@donations
Feature: A donor is asked whether an old variable symbol from their verified account is theirs, and payments with a confirmed one are paired with them

  Background:
    Given a person of the foundation signs the receipts

  Scenario: After a one-koruna verification the account asks about its one old symbol, and confirming pairs the payments the question counted and later ones, learning nothing
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-08-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1003 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1004 | 2026-10-16 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    And the hourly import runs
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about symbol "6123456789" with 3 payments from "2026-08" to "2026-10"
    And bank account "1234567/0800" was last verified by a payment on 2026-10-14
    And bank account "1234567/0800" lists no confirmed symbol
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 200
    And the confirmation paired 3 payments and changed no yearly receipt
    And bank payment 1001 is paired with "Jana" by confirmed symbol
    And bank payment 1002 is paired with "Jana" by confirmed symbol
    And bank payment 1004 is paired with "Jana" by confirmed symbol
    And "Jana" has learned only sender account "1234567/0800"
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 1234567/0800  | ACTIVE |               |                | 0             | 0                |                | false  |
    And bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" lists confirmed symbols "6123456789"
    When "Jana" asks for her donations
    Then the donation received on 2026-08-05 is listed as paired by confirmed symbol "6123456789" through sender account "1234567/0800"
    And the donation received on 2026-10-14 is listed as paired by variable symbol without a sender account
    When the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1005 | 2026-10-20 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    And 3 days pass
    And the hourly import runs
    Then bank payment 1005 is paired with "Jana" by confirmed symbol
    And the import paired 0 by symbol, 0 by account and 1 by confirmed symbol

  Scenario: The one-koruna verification may come after the account was learned from an ordinary gift, which asks nothing by itself
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1001 | 2026-09-01 | 300.00 | 1234567 | 0800     | Nováková Jana | {Jana}         |
      | 1002 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    And the application starts the import
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" was never verified by a payment
    When the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1003 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the hourly import runs
    And "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about symbol "6123456789" with 1 payment from "2026-09" to "2026-09"
    And bank account "1234567/0800" was last verified by a payment on 2026-10-14

  Scenario: Neither an ordinary gift, a one-koruna payment without the message nor one without the symbol asks about the old symbol
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-01 | 300.00 | 1234567 | 0800     | Nováková Jana | {Jana}         |                                       |
      | 1003 | 2026-10-05 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         |                                       |
      | 1004 | 2026-10-09 | 1.00   | 1234567 | 0800     | Nováková Jana |                | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" has a donation of "1.00" CZK received on 2026-10-09 paired by sender account
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" was never verified by a payment
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 409
    And the problem type ends with "donations/symbol-offer-not-available"
    And the problem has the title "Tato otázka už neplatí"
    And bank payment 1001 is unpaired

  Scenario: An account that sent two old symbols before the verification asks about neither
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-08-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-09-05 | 200.00 | 1234567 | 0800     | Nováková Jana | 5123456789     |                                       |
      | 1003 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" was last verified by a payment on 2026-10-14

  Scenario: A family account that sent a registered donor's symbol before the verification asks nothing, also after that donor turned pairing off
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-08-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-09-05 | 200.00 | 1234567 | 0800     | Nováková Jana | {Petr}         |                                       |
      | 1003 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Petr" disconnects bank account "1234567/0800"
    And 1 days pass
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank payment 1001 is unpaired

  Scenario: A symbol another donor confirmed for the account is not asked about after the account changed hands
    Given today is 2026-10-10
    And a person "Petr" is registered
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name         | variableSymbol | message                               |
      | 1001 | 2026-10-01 | 500.00 | 1234567 | 0800     | Svoboda Petr | 6123456789     |                                       |
      | 1002 | 2026-10-05 | 1.00   | 1234567 | 0800     | Svoboda Petr | {Petr}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Petr" confirms symbol "6123456789" at bank account "1234567/0800"
    And bank payment 1001 is paired with "Petr" by confirmed symbol
    And "Petr" disconnects bank account "1234567/0800"
    And today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1003 | 2026-10-12 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1004 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the hourly import runs
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" was last verified by a payment on 2026-10-14
    And bank payment 1003 is unpaired

  Scenario: A symbol first sent after the verification day is never asked about and does not block the question about the earlier one
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-12 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
      | 1003 | 2026-10-14 | 200.00 | 1234567 | 0800     | Nováková Jana | 5123456789     |                                       |
    And the application starts the import
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about symbol "6123456789" with 1 payment from "2026-09" to "2026-09"
    When "Jana" confirms symbol "5123456789" at bank account "1234567/0800"
    Then the response status is 409
    And the problem type ends with "donations/symbol-offer-not-available"
    And bank payment 1003 is unpaired

  Scenario: Declining pairs nothing, and the question does not come back
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    When "Jana" declines symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 204
    And the stored answer of "Jana" to symbol "6123456789" from bank account "1234567/0800" is "DECLINED"
    And bank payment 1001 is unpaired
    And "Jana" has 1 donation
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" lists no confirmed symbol
    When the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-20 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    And 3 days pass
    And the hourly import runs
    Then bank payment 1003 is unpaired
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol

  Scenario: A person verifying from an account the bank names like a company is not asked, nor a company from a person's account, while an account without a name is
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a company "Stavby" is registered with identification number "45274649"
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | ABC s.r.o.    | 6123456789     |                                       |
      | 1002 | 2026-10-14 | 1.00   | 1234567 | 0800     | ABC s.r.o.    | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
      | 1003 | 2026-09-05 | 500.00 | 2345678 | 0800     | Nováková Jana | 7123456789     |                                       |
      | 1004 | 2026-10-14 | 1.00   | 2345678 | 0800     | Nováková Jana | {Stavby}       | OVERENI UCTU NADACNI FOND NOVA NADEJE |
      | 1005 | 2026-09-05 | 500.00 | 3456789 | 0800     |               | 8123456789     |                                       |
      | 1006 | 2026-10-14 | 1.00   | 3456789 | 0800     |               | {Petr}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" was last verified by a payment on 2026-10-14
    When "Stavby" asks for its bank accounts
    Then bank account "2345678/0800" asks about no symbol
    When "Petr" asks for his bank accounts
    Then bank account "3456789/0800" asks about symbol "8123456789" with 1 payment from "2026-09" to "2026-09"

  Scenario: An excluded account asks nothing, and a symbol confirmed before the account was excluded pairs no further payment
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name        | variableSymbol | message                               |
      | 1001 | 2026-10-10 | 500.00 | 2400000002 | 2010     | Sběrný účet | {Jana}         |                                       |
      | 1002 | 2026-10-12 | 300.00 | 2400000002 | 2010     | Sběrný účet | 6123456789     |                                       |
      | 1003 | 2026-10-14 | 1.00   | 2400000002 | 2010     | Sběrný účet | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" learned the sender account of bank payment 1001 before it was excluded
    When "Jana" asks for her bank accounts
    Then bank account "2400000002/2010" is excluded from pairing
    And bank account "2400000002/2010" asks about no symbol
    When "Jana" confirms symbol "6123456789" at bank account "2400000002/2010"
    Then the response status is 409
    And the problem type ends with "donations/symbol-offer-not-available"
    Given "Jana" has confirmed symbol "6123456789" from bank account "2400000002/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name        | variableSymbol |
      | 1004 | 2026-10-18 | 300.00 | 2400000002 | 2010     | Sběrný účet | 6123456789     |
    When 1 days pass
    And the hourly import runs
    Then bank payment 1002 is unpaired
    And bank payment 1004 is unpaired
    And "Jana" has 2 donations

  Scenario: A question shown before another donor verified the account too is refused when answered, and a shared account asks nothing
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" asks for her bank accounts
    And bank account "1234567/0800" asks about symbol "6123456789" with 1 payment from "2026-09" to "2026-09"
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name         | variableSymbol |
      | 1003 | 2026-10-16 | 300.00 | 1234567 | 0800     | Svoboda Petr | {Petr}         |
    And the hourly import runs
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 409
    And the problem type ends with "donations/symbol-offer-not-available"
    And the problem has the title "Tato otázka už neplatí"
    And bank payment 1001 is unpaired
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 1234567/0800  | ACTIVE |               |                | 0             | 0                |                | true   |
    And bank account "1234567/0800" asks about no symbol

  Scenario: Payments with a confirmed symbol stay unpaired on the days another donor's verified link covers the account too
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    And bank payment 1001 is paired with "Jana" by confirmed symbol
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-16 | 300.00 | 1234567 | 0800     | Svoboda Petr  | {Petr}         |
      | 1004 | 2026-10-16 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    When the hourly import runs
    Then bank payment 1003 is paired with "Petr"
    And bank payment 1004 is unpaired
    And the import paired 1 by symbol, 0 by account and 0 by confirmed symbol
    And bank payment 1001 is paired with "Jana" by confirmed symbol

  Scenario: Once a donor registers with the confirmed symbol, new payments with it go to that donor and the earlier pairs stay
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-10-03 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-05 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    And bank payment 1001 is paired with "Jana" by confirmed symbol
    And donations is told that a person "Petr" registered with variable symbol "6123456789"
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-16 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    When the hourly import runs
    Then bank payment 1003 is paired with "Petr"
    And "Petr" has a donation of "500.00" CZK received on 2026-10-16 paired by variable symbol
    And bank payment 1001 is paired with "Jana" by confirmed symbol
    And "Jana" has 2 donations

  Scenario: A confirmed symbol pairs up to the disconnect day and again from a proved reconnect, never in between, and a reconnected account awaiting its payment asks nothing
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-10 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    And "Jana" disconnects bank account "1234567/0800"
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-17 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
      | 1004 | 2026-10-18 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    And 2 days pass
    And the hourly import runs
    And bank payment 1003 is paired with "Jana" by confirmed symbol
    And bank payment 1004 is unpaired
    And "Jana" reconnects bank account "1234567/0800"
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" lists confirmed symbols "6123456789"
    When the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1005 | 2026-10-19 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         |
      | 1006 | 2026-10-19 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    And the hourly import runs
    Then bank payment 1006 is paired with "Jana" by confirmed symbol
    And bank payment 1004 is unpaired
    And the import paired 1 by symbol, 0 by account and 1 by confirmed symbol
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" lists confirmed symbols "6123456789"

  Scenario: A donor whose one-koruna verification took the account over on the day the previous holder turned pairing off is not asked
    Given today is 2026-10-10
    And a person "Petr" is registered
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-01 | 300.00 | 1234567 | 0800     | Svoboda Petr  | {Petr}         |
      | 1002 | 2026-10-03 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |
    And the application starts the import
    And "Petr" disconnects bank account "1234567/0800"
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1003 | 2026-10-10 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And today is 2026-10-17
    And the hourly import runs
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 1234567/0800  | ACTIVE | 2026-10-11    |                | 0             | 0                |                | false  |
    And bank account "1234567/0800" asks about no symbol
    And bank account "1234567/0800" was last verified by a payment on 2026-10-10

  Scenario: An old symbol written with and without leading zeros is one symbol, and a standing order with the symbol 0 still pairs by account
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-08-10 | 500.00 | 1234567 | 0800     | Nováková Jana | 0612345678     |                                       |
      | 1002 | 2026-09-10 | 500.00 | 1234567 | 0800     | Nováková Jana | 612345678      |                                       |
      | 1003 | 2026-09-12 | 300.00 | 1234567 | 0800     | Nováková Jana | 0              |                                       |
      | 1004 | 2026-10-05 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" has a donation of "300.00" CZK received on 2026-09-12 paired by sender account
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about symbol "612345678" with 2 payments from "2026-08" to "2026-09"
    When "Jana" confirms symbol "612345678" at bank account "1234567/0800"
    Then the response status is 200
    And the confirmation paired 2 payments and changed no yearly receipt
    And bank payment 1001 is paired with "Jana" by confirmed symbol
    And bank payment 1002 is paired with "Jana" by confirmed symbol
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 1234567/0800  | ACTIVE |               |                | 1             | 30000            | 2026-09-12     | false  |
    And bank account "1234567/0800" lists confirmed symbols "612345678"

  Scenario: A deeper import that brings a second old symbol from before the verification withdraws an open question
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2025-02-03 | 200.00 | 1234567 | 0800     | Nováková Jana | 5123456789     |                                       |
      | 1002 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1003 | 2026-10-10 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And no bank payment 1001 is stored
    And "Jana" asks for her bank accounts
    And bank account "1234567/0800" asks about symbol "6123456789" with 1 payment from "2026-09" to "2026-09"
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And 1 days pass
    And the application starts the import
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 409
    And the problem type ends with "donations/symbol-offer-not-available"
    And bank payment 1002 is unpaired
    When "Jana" asks for her bank accounts
    Then bank account "1234567/0800" asks about no symbol

  Scenario: After the confirmation a deeper import pairs the older payments with the confirmed symbol in the same run
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2025-02-03 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1003 | 2026-10-10 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And no bank payment 1001 is stored
    And "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    And the confirmation paired 1 payment and changed no yearly receipt
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    When 1 days pass
    And the application starts the import
    Then bank payment 1001 is paired with "Jana" by confirmed symbol
    And the import paired 0 by symbol, 0 by account and 1 by confirmed symbol

  Scenario: A confirmation that adds donations to a year with an issued yearly receipt says so, never for a year before the first receipt year, and the next download replaces the receipt
    Given today is 2027-01-15
    And a person "Jana" is registered
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And the bank account has these movements:
      | id   | date       | amount  | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2025-11-05 | 500.00  | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-06-05 | 500.00  | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1003 | 2026-09-01 | 1000.00 | 1234567 | 0800     | Nováková Jana | {Jana}         |                                       |
      | 1004 | 2027-01-12 | 1.00    | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    And "Jana" downloads her yearly receipt for 2026
    And the receipt "Jana" downloaded is the frozen receipt issued to her last
    And the issued receipt has number "2027-000001"
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-09-01 | 100000      |
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 200
    And the confirmation paired 2 payments and changed the yearly receipt for 2026
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the receipt "Jana" downloaded is the frozen receipt issued to her last
    And the issued receipt has number "2027-000002"
    And the frozen receipt holds:
      | field             | value       |
      | replaces.number   | 2027-000001 |
      | replaces.issuedOn | 2027-01-15  |
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-06-05 | 50000       |
      | 2026-09-01 | 100000      |
    And its proof differs from the receipt it replaces
    And receipt "2027-000001" is superseded

  Scenario: A second answer, an answer at another donor's account and a malformed symbol are refused
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-09-05 | 500.00 | 1234567 | 0800     | Nováková Jana | 6123456789     |                                       |
      | 1002 | 2026-10-14 | 1.00   | 1234567 | 0800     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    When "Petr" tries to confirm symbol "6123456789" at bank account "1234567/0800" of "Jana"
    Then the response status is 404
    And the problem type ends with "donations/bank-account-not-found"
    When "Jana" confirms symbol "0612" at bank account "1234567/0800"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "variableSymbol"
    When "Jana" confirms symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 200
    When "Jana" declines symbol "6123456789" at bank account "1234567/0800"
    Then the response status is 409
    And the problem type ends with "donations/symbol-claim-already-answered"
    And the problem has the title "Na tuto otázku jste už odpověděli"
    And the stored answer of "Jana" to symbol "6123456789" from bank account "1234567/0800" is "CONFIRMED"
    And bank payment 1001 is paired with "Jana" by confirmed symbol

  Scenario: Answering needs a signed-in donor
    When someone without a token confirms symbol "6123456789" at a bank account
    Then the response status is 401
    When someone without a token declines symbol "6123456789" at a bank account
    Then the response status is 401

  Scenario: A confirmed symbol pairs nothing from an account the donor has not verified, and the account is not learned
    Given today is 2026-10-17
    And a person "Jana" is registered
    And "Jana" has confirmed symbol "6123456789" from bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    When the application starts the import
    Then bank payment 1001 is unpaired
    And the import paired 0 by symbol, 0 by account and 0 by confirmed symbol
    And "Jana" has learned no sender account
