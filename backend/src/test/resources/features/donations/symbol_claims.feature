Feature: Payments with an old variable symbol a donor confirmed are paired with that donor

  Scenario: Earlier and later payments with the confirmed symbol from the donor's verified account are paired, and nothing is learned from them
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message      |
      | 1001 | 2026-09-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |              |
      | 1002 | 2026-10-01 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         | OVERENI UCTU |
    And the application starts the import
    And bank payment 1001 is unpaired
    And "Jana" has confirmed symbol "6123456789" from bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    When the hourly import runs
    Then bank payment 1001 is paired with "Jana" by confirmed symbol
    And bank payment 1003 is paired with "Jana" by confirmed symbol
    And the import paired 0 by symbol, 0 by account and 2 by confirmed symbol
    And "Jana" has 3 donations
    And "Jana" has a donation of "500.00" CZK received on 2026-10-15 paired by confirmed symbol
    And "Jana" has learned only sender account "2900233333/2010"
    When "Jana" asks for her donations
    Then the donation received on 2026-09-15 is listed as paired by confirmed symbol through sender account "2900233333/2010"

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

  Scenario: A declined symbol pairs nothing
    Given today is 2026-10-17
    And a person "Jana" is registered
    And "Jana" has declined symbol "6123456789" from bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    When the application starts the import
    Then bank payment 1002 is unpaired
    And "Jana" has 1 donation

  Scenario: Payments with the confirmed symbol stay unpaired on the days another donor's verified link covers the account too
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" has confirmed symbol "6123456789" from bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-06 | 300.00 | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
      | 1003 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    When the application starts the import
    Then bank payment 1003 is unpaired
    And the import paired 2 by symbol, 0 by account and 0 by confirmed symbol
    And "Jana" has 1 donation
    And "Petr" has 1 donation

  Scenario: An excluded account pairs nothing by a confirmed symbol, even when the donor learned it before it was excluded
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name        | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2400000002 | 2010     | Sběrný účet | {Jana}         |
    And the application starts the import
    And "Jana" learned the sender account of bank payment 1001 before it was excluded
    And "Jana" has confirmed symbol "6123456789" from bank account "2400000002/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name        | variableSymbol |
      | 1002 | 2026-10-18 | 300.00 | 2400000002 | 2010     | Sběrný účet | 6123456789     |
    When 1 days pass
    And the hourly import runs
    Then bank payment 1002 is unpaired
    And "Jana" has 1 donation

  Scenario: Once a donor registers with the confirmed symbol, new payments with it go to that donor and the earlier pairs stay
    Given today is 2026-10-17
    And a person "Jana" is registered
    And "Jana" has confirmed symbol "6123456789" from bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-06 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    And the application starts the import
    And bank payment 1002 is paired with "Jana" by confirmed symbol
    And donations is told that a person "Petr" registered with variable symbol "6123456789"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-16 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    When the hourly import runs
    Then bank payment 1003 is paired with "Petr"
    And "Petr" has a donation of "500.00" CZK received on 2026-10-16 paired by variable symbol
    And bank payment 1002 is paired with "Jana" by confirmed symbol
    And "Jana" has 2 donations

  Scenario: A disconnected account pairs the confirmed symbol up to the disconnect day and again from a proved reconnect, never in between
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" has confirmed symbol "6123456789" from bank account "2900233333/2010"
    And "Jana" disconnects bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-17 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
      | 1003 | 2026-10-18 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    And 2 days pass
    And the hourly import runs
    And bank payment 1002 is paired with "Jana" by confirmed symbol
    And bank payment 1003 is unpaired
    And "Jana" reconnects bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1004 | 2026-10-19 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1005 | 2026-10-19 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
    When the hourly import runs
    Then bank payment 1005 is paired with "Jana" by confirmed symbol
    And bank payment 1003 is unpaired
    And the import paired 1 by symbol, 0 by account and 1 by confirmed symbol

  Scenario: The confirmed symbol written with leading zeros is the same symbol, and a standing order with the symbol 0 still pairs by account
    Given today is 2026-10-17
    And a person "Jana" is registered
    And "Jana" has confirmed symbol "612345678" from bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | 0612345678     |
      | 1003 | 2026-10-12 | 300.00 | 2900233333 | 2010     | Nováková Jana | 0              |
    When the application starts the import
    Then bank payment 1002 is paired with "Jana" by confirmed symbol
    And bank payment 1003 is paired with "Jana"
    And "Jana" has a donation of "300.00" CZK received on 2026-10-12 paired by sender account
    And the import paired 1 by symbol, 1 by account and 1 by confirmed symbol

  Scenario: A deeper import after the confirmation pairs the older payments with the confirmed symbol in the same run
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-02-03 | 500.00 | 2900233333 | 2010     | Nováková Jana | 6123456789     |
      | 1002 | 2026-10-10 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And no bank payment 1001 is stored
    And "Jana" has confirmed symbol "6123456789" from bank account "2900233333/2010"
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    When 1 days pass
    And the application starts the import
    Then bank payment 1001 is paired with "Jana" by confirmed symbol
    And the import paired 0 by symbol, 0 by account and 1 by confirmed symbol
