@donations
Feature: Imported payments are paired with donors

  Scenario: A payment carrying the donor's variable symbol becomes the donor's donation
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    When the application starts the import
    Then bank payment 1001 is paired with "Jana"
    And "Jana" has 1 donation
    And "Jana" has a donation of "500.00" CZK received on 2026-10-15 paired by variable symbol

  Scenario: A payment with a variable symbol nobody has stays unpaired and teaches no account
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 1111111111     |
    When the application starts the import
    Then bank payment 1001 is unpaired
    And "Jana" has 0 donations
    And "Jana" has learned no sender account

  Scenario: A payment without a variable symbol whose message carries the donor's symbol is paired by that symbol
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message                       |
      | 1001 | 2026-10-10 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |                               |
      | 1002 | 2026-10-15 | 1.00   | 2900233333 | 2010     | Nováková Jana |                | OVERENI UCTU VS {Jana}        |
    When the application starts the import
    Then bank payment 1002 is paired with "Jana"
    And "Jana" has learned sender account "2900233333/2010"
    And bank payment 1001 is paired with "Jana"
    And "Jana" has a donation of "1.00" CZK received on 2026-10-15 paired by variable symbol

  Scenario: A payment without a variable symbol whose message carries a number no donor has is paired by its account
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message            |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |                    |
      | 1002 | 2026-10-15 | 300.00 | 2900233333 | 2010     | Nováková Jana |                | faktura 2026000123 |
    When the application starts the import
    Then bank payment 1002 is paired with "Jana"
    And "Jana" has a donation of "300.00" CZK received on 2026-10-15 paired by sender account

  Scenario: A payment without a variable symbol from an unknown account stays unpaired
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the application starts the import
    Then bank payment 1001 is unpaired
    And "Jana" has 0 donations

  Scenario: The sender account is learned from a payment with the symbol and a later payment from it without a symbol is paired
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" has learned sender account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-16 | 300.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the hourly import runs
    Then bank payment 1002 is paired with "Jana"
    And "Jana" has 2 donations
    And "Jana" has a donation of "300.00" CZK received on 2026-10-16 paired by sender account

  Scenario: Earlier unpaired payments from a newly learned account are paired in the same run
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    And bank payment 1001 is unpaired
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-16 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    When the hourly import runs
    Then bank payment 1002 is paired with "Jana"
    And bank payment 1001 is paired with "Jana"
    And "Jana" has a donation of "200.00" CZK received on 2026-10-10 paired by sender account
    And "Jana" has learned sender account "2900233333/2010"

  Scenario: A payment with an unknown variable symbol from a learned account stays unpaired without the donor's confirmation
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-16 | 300.00 | 2900233333 | 2010     | Nováková Jana | 1111111111     |
    When the hourly import runs
    Then bank payment 1002 is unpaired
    And "Jana" has 1 donation

  Scenario: A payment carrying another donor's variable symbol goes to that donor even from a learned account, and that donor learns the account too
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-16 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Petr}         |
    When the hourly import runs
    Then bank payment 1002 is paired with "Petr"
    And "Petr" has a donation of "300.00" CZK received on 2026-10-16 paired by variable symbol
    And "Petr" has learned sender account "2900233333/2010"
    And "Jana" has 1 donation
    And "Jana" has learned sender account "2900233333/2010"

  Scenario: An account used with two donors' symbols pairs no further payment without a symbol, and the earlier account-based donation is kept
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-06 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    And bank payment 1002 is paired with "Jana"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-15 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Petr}         |
      | 1004 | 2026-10-16 | 100.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the hourly import runs
    Then bank payment 1003 is paired with "Petr"
    And bank payment 1004 is unpaired
    And bank payment 1002 is paired with "Jana"
    And "Jana" has a donation of "200.00" CZK received on 2026-10-06 paired by sender account
    And "Jana" has 2 donations
    And "Petr" has 1 donation

  Scenario: An account is never learned from a payment without a variable symbol
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Jana Nováková |                |
      | 1002 | 2026-10-12 | 300.00 | 2900233333 | 2010     | Jana Nováková |                |
    When the application starts the import
    Then "Jana" has learned no sender account
    And bank payment 1001 is unpaired
    And bank payment 1002 is unpaired

  Scenario: Payments are never paired by the sender's name alone
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Jana Nováková |                |
      | 1002 | 2026-10-12 | 300.00 |            |          | Jana Nováková |                |
    When the application starts the import
    Then bank payment 1001 is unpaired
    And bank payment 1002 is unpaired
    And "Jana" has 0 donations

  Scenario: A payment from a foreign account is paired by symbol only and nothing is learned
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account                | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | DE89370400440532013000 |          | Nováková Jana | {Jana}         |
    When the application starts the import
    Then bank payment 1001 is paired with "Jana"
    And "Jana" has a donation of "500.00" CZK received on 2026-10-15 paired by variable symbol
    And "Jana" has learned no sender account

  Scenario: A donor whose registration is announced after paying gets the payments with their symbol and the earlier payments from the same account
    Given today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-08 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1002 | 2026-10-12 | 500.00 | 2900233333 | 2010     | Nováková Jana | 4821937560     |
    And the application starts the import
    And bank payment 1001 is unpaired
    And bank payment 1002 is unpaired
    When donations is told that a person "Jana" registered with variable symbol "4821937560"
    Then bank payment 1002 is paired with "Jana"
    And bank payment 1001 is paired with "Jana"
    And "Jana" has a donation of "500.00" CZK received on 2026-10-12 paired by variable symbol
    And "Jana" has a donation of "200.00" CZK received on 2026-10-08 paired by sender account
    And "Jana" has learned sender account "2900233333/2010"

  Scenario: A paired payment keeps its donor when imported again
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When 1 days pass
    And the hourly import runs
    Then the import reported 1 movements received, 0 new and 1 known
    And bank payment 1001 is paired with "Jana"
    And "Jana" has 1 donation

  Scenario: A payment with a variable symbol padded with zeros is paired with the donor whose symbol it spells
    Given today is 2026-10-17
    And donations is told that a person "Jana" registered with variable symbol "4821937"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 000{Jana}      |
    When the application starts the import
    Then bank payment 1001 is paired with "Jana"
    And "Jana" has a donation of "500.00" CZK received on 2026-10-15 paired by variable symbol

  Scenario: A standing order with the variable symbol 0 from a learned account is paired by the sender account
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-12 | 300.00 | 2900233333 | 2010     | Nováková Jana | 0              |
    When the application starts the import
    Then bank payment 1002 is paired with "Jana"
    And "Jana" has a donation of "300.00" CZK received on 2026-10-12 paired by sender account
