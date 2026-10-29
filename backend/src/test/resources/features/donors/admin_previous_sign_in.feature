@donors
Feature: An administrator sees when they last signed in to the administration

  The overview of the administration starts with what happened since the administrator's
  previous sign-in. The site keeps the last two sign-ins to the administration of each
  administrator (with the password and the code, or with a passkey), and only the
  administrator reads their own. Refreshing a session is no sign-in.

  Background:
    Given the time is "2026-10-28T20:14:00Z"
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: The first sign-in to the administration has no previous one
    When "Jana" asks for her previous sign-in
    Then the response status is 200
    And there is no previous sign-in

  Scenario: Signing in again names the sign-in before it, and refreshing the session does not count
    Given the time is "2026-10-29T08:30:00Z"
    When "Jana" signs in again
    And 5 minutes pass
    And the browser session of "Jana" is refreshed
    And "Jana" asks for her previous sign-in
    Then the response status is 200
    And the previous sign-in was at "2026-10-28T20:14:00Z"

  Scenario: A sign-in with a passkey counts too
    Given "Jana" added a passkey named "Mac"
    And the time is "2026-10-30T07:00:00Z"
    When "Jana" signs in with the passkey "Mac"
    And "Jana" asks for her previous sign-in
    Then the previous sign-in was at "2026-10-28T20:14:00Z"

  Scenario: A connected application reads the previous sign-in of the administrator who connected it
    Given the time is "2026-10-29T08:30:00Z"
    And "Jana" signs in again
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sends GET "/api/admin/donors/me/previous-sign-in"
    Then the response status is 200
    And the previous sign-in was at "2026-10-28T20:14:00Z"

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for his previous sign-in
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token asks for the previous sign-in
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
