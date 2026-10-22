Feature: An administrator reads the state of the bank import

  Scenario: An administrator sees the covered period, the last attempt and the outage being reported
    Given today is 2026-10-17
    And a person "Jana" is registered
    And "Jana" is an administrator
    And the application starts the import
    And 1 days pass
    And Fio refuses the next request because the token is not valid
    And the hourly import runs
    When "Jana" asks for the import state
    Then the response status is 200
    And the import state says:
      | coveredFrom         | 2026-07-20           |
      | coveredTo           | 2026-10-17           |
      | lastSucceededAt     | 2026-10-17T10:00:00Z |
      | lastAttemptedAt     | 2026-10-18T10:00:00Z |
      | lastFailure.kind    | UNAUTHORIZED         |
      | consecutiveFailures | 1                    |
      | reportedOutage      | UNAUTHORIZED         |

  Scenario: Before the first import the state is empty
    Given a person "Jana" is registered
    And "Jana" is an administrator
    When "Jana" asks for the import state
    Then the response status is 200
    And the import state has no coverage, no attempt and no outage

  Scenario: A donor without the administrator role is refused
    Given a person "Jana" is registered
    When "Jana" asks for the import state
    Then the response status is 403
    And the problem type ends with "auth/forbidden"

  Scenario: Without a token the import state is not served
    When someone without a token asks for the import state
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: The administrator role takes effect at the next sign-in with the second factor
    Given a person "Jana" is registered
    And "Jana" is given the administrator role without signing in again
    When "Jana" asks for the import state
    Then the response status is 403
    When "Jana" signs in again
    And "Jana" asks for the import state
    Then the response status is 403
    When "Jana" enables the second factor
    And "Jana" signs in again
    And "Jana" asks for the import state
    Then the response status is 200
