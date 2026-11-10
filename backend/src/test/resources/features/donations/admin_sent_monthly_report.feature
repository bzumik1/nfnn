@donations
Feature: An administrator opens a sent monthly report and sees what each sending said

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Each sending of a month is kept with the sections it carried, and a gift imported later does not change it
    Given a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-20 | 200.00 | 2900244444 | 2010     | Svoboda Petr | {Petr}         |
      | 1002 | 2026-10-21 | 150.00 | 2900255555 | 0800     | Dvořák Karel | 1111111111     |
    And the application starts the import
    And "Jana" changes the monthly report settings:
      | recipients | info@nfnn.cz, pavel@example.cz |
      | sendDay    | 1                              |
      | sections   | donors, donations              |
    And the monthly report check runs on 2026-11-01
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1003 | 2026-10-31 | 500.00 | 2900244444 | 2010     | Svoboda Petr | {Petr}         |
    And today is 2026-11-02
    And the application starts the import
    And "Jana" changes the monthly report settings:
      | recipients | info@nfnn.cz                                       |
      | sendDay    | 1                                                  |
      | sections   | donors, donations, unpairedPayments, bankImport    |
    And "Jana" sends the monthly report for "2026-10" again
    When "Jana" opens the sent monthly report for "2026-10"
    Then the response status is 200
    And the sent monthly report says:
      | month                                                   | 2026-10              |
      | firstSentAt                                             | 2026-11-01T06:00:00Z |
      | deliveries.0.sentAt                                     | 2026-11-02T11:00:00Z |
      | deliveries.0.byHand                                     | true                 |
      | deliveries.0.recipientCount                             | 1                    |
      | deliveries.0.content.donations.received.count           | 3                    |
      | deliveries.0.content.donations.received.totalMinor      | 85000                |
      | deliveries.0.content.unpairedPayments.count             | 1                    |
      | deliveries.0.content.unpairedPayments.totalMinor        | 15000                |
      | deliveries.0.content.bankImport.lastSucceededAt         | 2026-11-02T11:00:00Z |
      | deliveries.1.sentAt                                     | 2026-11-01T06:00:00Z |
      | deliveries.1.byHand                                     | false                |
      | deliveries.1.recipientCount                             | 2                    |
      | deliveries.1.content.donors.registered                  | 2                    |
      | deliveries.1.content.donors.newInMonth                  | 2                    |
      | deliveries.1.content.donations.received.count           | 2                    |
      | deliveries.1.content.donations.received.totalMinor      | 35000                |
      | deliveries.1.content.donations.paired.count             | 1                    |
      | deliveries.1.content.donations.paired.totalMinor        | 20000                |
      | deliveries.1.content.donations.receivedInYear.count     | 2                    |
      | deliveries.1.content.donations.receivedInYear.totalMinor | 35000               |
    And the sent monthly report leaves out "deliveries.1.content.unpairedPayments"
    And the sent monthly report leaves out "deliveries.1.content.bankImport"
    And the sent monthly report leaves out "recomputed"

  Scenario: A month sent before sendings were kept is recomputed from today's figures without the bank
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-09-20 | 200.00 | 2900255555 | 0800     | Dvořák Karel | 1111111111     |
    And the application starts the import
    And the report for "2026-09" was recorded as sent on 2026-10-19 before its sendings were kept
    When "Jana" opens the sent monthly report for "2026-09"
    Then the response status is 200
    And the sent monthly report says:
      | month                                      | 2026-09              |
      | firstSentAt                                | 2026-10-19T05:00:00Z |
      | recomputed.donors.registered               | 0                    |
      | recomputed.donations.received.count        | 1                    |
      | recomputed.unpairedPayments.count          | 1                    |
      | recomputed.unpairedPayments.totalMinor     | 20000                |
    And the sent monthly report lists no sending
    And the sent monthly report leaves out "recomputed.bankImport"

  Scenario: A month that was never sent is not found, and a month outside the calendar is refused without repeating it
    When "Jana" opens the sent monthly report for "2026-08"
    Then the response status is 404
    And the problem type ends with "donations/sent-report-not-found"
    When "Jana" opens the sent monthly report for "2026-13"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem does not repeat "2026-13"

  Scenario: A connected application reads a sent report as the administrator does
    Given the monthly report check runs on 2026-11-01
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read"
    When the connector exchanges the connector token for an API token
    And the exchanged API token opens the sent monthly report for "2026-10"
    Then the response status is 200
    And the sent monthly report says:
      | deliveries.0.byHand         | false |
      | deliveries.0.recipientCount | 1     |

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    And the monthly report check runs on 2026-11-01
    When "Petr" opens the sent monthly report for "2026-10"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token opens the sent monthly report for "2026-10"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
