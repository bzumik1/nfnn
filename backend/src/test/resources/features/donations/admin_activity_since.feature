@donations
Feature: An administrator sees what came in since a moment, such as the previous sign-in

  The overview of the administration starts with the payments the bank import brought since
  the administrator's previous sign-in, how many of them still wait to be paired, and the
  donors who registered since then. A payment counts by the moment it was imported.

  Background:
    Given today is 2026-10-28
    And a person "Jana" is registered
    And "Jana" is an administrator
    And a person "Petr" is registered

  Scenario: Payments imported and donors registered since the moment are counted, the earlier ones are not
    Given the time is "2026-10-28T12:00:00Z"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-28 | 300.00 | 2900244444 | 2010     | Svoboda Petr | {Petr}         |
      | 1002 | 2026-10-28 | 100.00 | 2900255555 | 0800     | Dvořák Karel | 1111111111     |
    And the application starts the import
    And the time is "2026-10-29T07:00:00Z"
    And a person "Eva" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1003 | 2026-10-29 | 500.00 | 2900233333 | 2010     | Nováková Eva | {Eva}          |
      | 1004 | 2026-10-29 | 150.00 | 2900255555 | 0800     | Dvořák Karel | 2222222222     |
      | 1005 | 2026-10-29 | 200.00 | 2900244444 | 2010     | Svoboda Petr | {Petr}         |
    And the hourly import runs
    When "Jana" asks what came in since "2026-10-28T20:14:00Z"
    Then the response status is 200
    And the activity since then says:
      | from                | 2026-10-28T20:14:00Z |
      | payments.count      | 3                    |
      | payments.totalMinor | 85000                |
      | paired.count        | 2                    |
      | paired.totalMinor   | 70000                |
      | unpaired.count      | 1                    |
      | unpaired.totalMinor | 15000                |
      | newDonors           | 1                    |
    When "Jana" asks what came in since "2026-10-28T12:00:00Z"
    Then the activity since then says:
      | payments.count | 5 |
      | unpaired.count | 2 |
      | newDonors      | 1 |
    When "Jana" asks what came in since "2026-10-29T07:00:01Z"
    Then the activity since then says:
      | payments.count | 0 |
      | newDonors      | 0 |

  Scenario: A missing or malformed moment is refused
    When "Jana" asks what came in without saying since when
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks what came in since "yesterday"
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: A connected application reads it too
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sends GET "/api/admin/donations/overview/since?from=2026-10-28T00:00:00Z"
    Then the response status is 200

  Scenario: A donor without the administrator role and a visitor without a token are refused
    When "Petr" asks what came in since "2026-10-28T20:14:00Z"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token asks what came in since "2026-10-28T20:14:00Z"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
