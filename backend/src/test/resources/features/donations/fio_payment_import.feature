Feature: Incoming bank payments are imported from Fio

  Scenario: The first import asks for the last 89 days and stores only incoming payments
    Given today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount  | account                | bankCode | name          | variableSymbol | currency |
      | 1001 | 2026-10-15 | 500.00  | 2900233333             | 2010     | Nováková Jana |                |          |
      | 1002 | 2026-10-15 | -300.00 | 2900233333             | 2010     | Nováková Jana |                |          |
      | 1003 | 2026-10-16 | 20.00   | DE89370400440532013000 |          | Hans Müller   |                | EUR      |
    When the application starts the import
    Then Fio was asked for movements from 2026-07-20 to 2026-10-17
    And the import reported 3 movements received, 1 new and 0 known
    And 1 bank payments are stored
    And bank payment 1001 is stored with "500.00" CZK received on 2026-10-15 from "2900233333/2010"
    And no bank payment 1002 is stored
    And no bank payment 1003 is stored
    And the bank movements are covered from 2026-07-20 to 2026-10-17

  Scenario: The first import reaches further back when the history is unlocked
    Given today is 2026-10-17
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-02-03 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1002 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the application starts the import
    Then Fio was asked for movements from 2025-01-01 to 2026-10-17
    And 2 bank payments are stored
    And the bank movements are covered from 2025-01-01 to 2026-10-17

  Scenario: Locked history is attempted at startup and the import falls back to the last 89 days
    Given today is 2026-10-17
    And the foundation wants bank history from 2025-01-01
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-02-03 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1002 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the application starts the import
    Then Fio was asked for movements from 2025-01-01 to 2026-10-17
    And the import failed because the history older than 90 days is locked
    And the import state records the failure
    And 0 bank payments are stored
    And a follow-up import is due in 31 seconds
    When the follow-up import runs
    Then Fio was asked for movements from 2026-07-20 to 2026-10-17
    And Fio was asked 2 times
    And 1 bank payments are stored
    And the bank movements are covered from 2026-07-20 to 2026-10-17
    And no follow-up import is due

  Scenario: The deep history is attempted again at the next start until it is filled
    Given today is 2026-10-17
    And the foundation wants bank history from 2025-01-01
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-02-03 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1002 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    And the follow-up import runs
    When the application starts the import
    Then Fio was asked for movements from 2025-01-01 to 2026-10-17
    And the import failed because the history older than 90 days is locked
    And the bank movements are covered from 2026-07-20 to 2026-10-17
    Given the bank history is unlocked
    And the bank reports the period 2025-01-01 to 2026-10-17
    When the application starts the import
    Then Fio was asked for movements from 2025-01-01 to 2026-10-17
    And 2 bank payments are stored
    And the bank movements are covered from 2025-01-01 to 2026-10-17
    When the application starts the import
    Then Fio was asked for movements from 2026-10-14 to 2026-10-17

  Scenario: An hourly import asks only for the days since the last run with a three-day overlap
    Given today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    When 1 days pass
    And the hourly import runs
    Then Fio was asked for movements from 2026-10-14 to 2026-10-18
    And the bank movements are covered from 2026-07-20 to 2026-10-18

  Scenario: An hourly import does not ask for the pending deep history
    Given today is 2026-10-17
    And the foundation wants bank history from 2025-01-01
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    And the follow-up import runs
    When 1 days pass
    And the hourly import runs
    Then Fio was asked for movements from 2026-10-14 to 2026-10-18
    And the bank movements are covered from 2026-07-20 to 2026-10-18

  Scenario: A movement delivered twice is stored once
    Given today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    When 1 days pass
    And the hourly import runs
    Then the import reported 1 movements received, 0 new and 1 known
    And 1 bank payments are stored

  Scenario: The requested period is covered even when the bank reports only the days with movements
    Given today is 2026-10-15
    And the application starts the import
    And 3 days pass
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-18 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the bank reports the period 2026-10-18 to 2026-10-18
    When the hourly import runs
    Then Fio was asked for movements from 2026-10-12 to 2026-10-18
    And the bank movements are covered from 2026-07-18 to 2026-10-18

  Scenario: A deep import is covered from the day the bank reports
    Given today is 2026-10-17
    And the foundation wants bank history from 2025-01-01
    And the bank history is unlocked
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2025-03-10 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the bank reports the period 2025-02-03 to 2026-10-17
    When the application starts the import
    Then Fio was asked for movements from 2025-01-01 to 2026-10-17
    And the bank movements are covered from 2025-02-03 to 2026-10-17

  Scenario: A download refused by the 30-second limit changes nothing and is retried after the bank's retry time
    Given today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    And 1 days pass
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-18 | 300.00 | 2900233333 | 2010     | Nováková Jana |                |
    And Fio refuses the next request because the token was used less than 30 seconds ago
    When the hourly import runs
    Then the import failed because the token was used less than 30 seconds ago
    And the import state records the failure
    And 1 bank payments are stored
    And the bank movements are covered from 2026-07-20 to 2026-10-17
    And a follow-up import is due in 31 seconds
    When the follow-up import runs
    Then Fio was asked for movements from 2026-10-14 to 2026-10-18
    And 2 bank payments are stored
    And the bank movements are covered from 2026-07-20 to 2026-10-18

  Scenario: A rejected token is recorded as an authorization failure and the coverage is unchanged
    Given today is 2026-10-17
    And the application starts the import
    And 1 days pass
    And Fio refuses the next request because the token is not valid
    When the hourly import runs
    Then the import failed because the token is not valid
    And the import state records the failure
    And the bank movements are covered from 2026-07-20 to 2026-10-17
    And no follow-up import is due

  Scenario: A download that times out leaves the coverage unchanged so the next run asks again
    Given today is 2026-10-17
    And the application starts the import
    And 1 days pass
    And Fio refuses the next request because Fio is unreachable
    When the hourly import runs
    Then the import failed because Fio is unreachable
    And the import state records the failure
    And the bank movements are covered from 2026-07-20 to 2026-10-17
    And no follow-up import is due
    When the hourly import runs
    Then Fio was asked for movements from 2026-10-14 to 2026-10-18
    And the bank movements are covered from 2026-07-20 to 2026-10-18

  Scenario: A payment whose variable symbol has leading zeros keeps the symbol as sent and is matched without them
    Given today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | 0004821937     |
      | 1002 | 2026-10-16 | 300.00 | 2900233333 | 2010     | Nováková Jana | 0              |
    When the application starts the import
    Then bank payment 1001 carries variable symbol "0004821937" matched as "4821937"
    And bank payment 1002 carries variable symbol "0" and no symbol to match

  Scenario: A payment with overlong texts from the bank is stored with the texts cut to size
    Given today is 2026-10-17
    And the bank account has a movement 1001 on 2026-10-15 with a 300-character name, a 600-character message and a 70-character account
    When the application starts the import
    Then bank payment 1001 is stored with a 255-character name, a 500-character message and a 64-character account

  Scenario: The bank-side bookmark is never used
    Given today is 2026-10-17
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the application starts the import
    And 1 days pass
    And the hourly import runs
    And 1 days pass
    And the hourly import runs
    Then Fio was asked 3 times
    And every import completed
    And the bank-side bookmark was never used
