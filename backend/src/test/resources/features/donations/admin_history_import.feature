@donations
Feature: An administrator loads older bank payments without restarting the server

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Locked history ends the run as locked and leaves the covered period as it was
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode |
      | 2001 | 2026-02-10 | 300.00 | 2900233333 | 2010     |
      | 2002 | 2026-10-20 | 500.00 | 2900233333 | 2010     |
    And the application starts the import
    And 60 seconds pass
    When "Jana" asks for older bank payments from 2026-01-01
    Then the response status is 202
    And the history import says:
      | from                 | 2026-01-01     |
      | to                   | 2026-11-05     |
      | needsUnlockedHistory | true           |
      | status               | HISTORY_LOCKED |
      | failure              | HISTORY_LOCKED |
    And Fio was asked for movements from 2026-01-01 to 2026-11-05
    And 1 bank payments are stored
    And the admin action "REQUEST_HISTORY_IMPORT" by "Jana" is recorded with details containing "Vyžádáno načtení starších plateb z banky od 2026-01-01"
    When "Jana" asks for the import state
    Then the import state says:
      | coveredFrom           | 2026-08-08     |
      | coveredTo             | 2026-11-05     |
      | lastFailure.kind      | HISTORY_LOCKED |
      | historyImport.status  | HISTORY_LOCKED |
      | historyImport.from    | 2026-01-01     |
      | defaultHistoryFrom    | 2026-01-01     |

  Scenario: After the history is unlocked the same request loads the older payments, pairs them and widens the covered period
    Given a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | variableSymbol |
      | 2001 | 2026-02-10 | 300.00 | 2900233333 | 2010     | {Petr}         |
      | 2002 | 2026-10-20 | 500.00 | 2900233333 | 2010     | {Petr}         |
    And the application starts the import
    And 60 seconds pass
    And the bank history is unlocked
    When "Jana" asks for older bank payments from 2026-01-01
    Then the response status is 202
    And the history import says:
      | status | COMPLETED |
      | added  | 1         |
    And 2 bank payments are stored
    And "Petr" has 2 donations
    When "Jana" asks for the import state
    Then the import state says:
      | coveredFrom             | 2026-01-01 |
      | coveredTo               | 2026-11-05 |
      | historyImport.status    | COMPLETED  |
      | historyImport.added     | 1          |
      | historyImport.finishedAt | 2026-11-05T11:01:00Z |

  Scenario Outline: A request <days> days back needs the unlocked history only beyond the 89 days Fio serves without it
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode |
      | 2001 | 2026-08-08 | 300.00 | 2900233333 | 2010     |
    When "Jana" asks for older bank payments from <from>
    Then the response status is 202
    And the history import says:
      | needsUnlockedHistory | <needsUnlock> |
      | status               | <status>      |

    Examples:
      | days | from       | needsUnlock | status         |
      | 89   | 2026-08-08 | false       | COMPLETED      |
      | 91   | 2026-08-06 | true        | HISTORY_LOCKED |

  Scenario: Reading a covered window again stores nothing twice and closes the gap a long pause left
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode |
      | 2001 | 2026-10-20 | 300.00 | 2900233333 | 2010     |
      | 2002 | 2026-12-15 | 400.00 | 2900233333 | 2010     |
      | 2003 | 2027-03-20 | 500.00 | 2900233333 | 2010     |
    And the application starts the import
    And 150 days pass
    And the hourly import runs
    And 60 seconds pass
    And the bank history is unlocked
    When "Jana" asks for older bank payments from 2026-11-01
    Then the history import says:
      | status | COMPLETED |
      | added  | 1         |
    And 3 bank payments are stored
    When "Jana" asks for the import state
    Then the import state says:
      | coveredFrom | 2026-11-01 |
      | coveredTo   | 2027-04-04 |
    When 60 seconds pass
    And "Jana" asks for older bank payments from 2026-11-01
    Then the history import says:
      | status | COMPLETED |
      | added  | 0         |
    And 3 bank payments are stored

  Scenario: A request right after another bank request waits for the bank's 30 seconds
    Given the application starts the import
    And 10 seconds pass
    When "Jana" asks for older bank payments from 2026-09-01
    Then the response status is 202
    And the history import says:
      | status    | QUEUED               |
      | startsAt  | 2026-11-05T11:00:30Z |
    And Fio was asked 1 times
    When the queued history import runs
    And "Jana" asks for the import state
    Then the import state says:
      | historyImport.status | COMPLETED |
    And Fio was asked 2 times

  Scenario Outline: A start <case> is refused
    When "Jana" asks for older bank payments from <from>
    Then the response status is 400
    And the problem type ends with "<problem>"
    And no admin action is recorded for "Jana"

    Examples:
      | case               | from       | problem                             |
      | after today        | 2026-11-06 | donations/history-start-in-future   |
      | before 2000        | 1999-12-31 | donations/history-start-too-early   |

  Scenario: A request without a day is refused with the field named
    When "Jana" asks for older bank payments without a day
    Then the response status is 400
    And the problem lists an error for field "from"

  Scenario: Requests are limited per client address
    When "Jana" asks for older bank payments from 2026-10-01 10 times
    Then the response status is 202
    When "Jana" asks for older bank payments from 2026-10-01
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"

  Scenario: A donor without the administrator role is refused
    Given a person "Petr" is registered
    When "Petr" asks for older bank payments from 2026-01-01
    Then the response status is 403
    And the problem type ends with "auth/forbidden"

  Scenario: Without a token the request is refused
    When someone without a token asks for older bank payments from 2026-01-01
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
