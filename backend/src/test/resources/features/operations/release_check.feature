@operations
Feature: An administrator sees the release the server runs and the latest published release

  Background:
    Given today is 2026-11-14
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Before the first check only the running release is known
    When "Jana" asks for the release
    Then the response status is 200
    And the release answer says:
      | running         | dev   |
      | updateAvailable | false |
    And the release answer has no "latest"
    And the release answer has no "checkedAt"

  Scenario: The latest published release is shown after the daily check, and a failed check keeps it
    Given GitHub publishes the release "2026.11.5" at "2026-11-14T09:30:12Z"
    When the server checks for the latest release
    And "Jana" asks for the release
    Then the response status is 200
    And the release answer says:
      | running            | dev                  |
      | latest.version     | 2026.11.5            |
      | latest.publishedAt | 2026-11-14T09:30:12Z |
      | updateAvailable    | false                |
    And the release answer has no "failure"
    Given GitHub answers the release check with status 403
    When the server checks for the latest release
    And "Jana" asks for the release
    Then the release answer says:
      | latest.version | 2026.11.5 |
      | failure        | STATUS    |

  Scenario: A release later than the Prague month is refused
    Given GitHub publishes the release "2027.1.1" at "2026-11-14T09:30:12Z"
    When the server checks for the latest release
    And "Jana" asks for the release
    Then the release answer says:
      | failure | REFUSED_ANSWER |
    And the release answer has no "latest"

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for the release
    Then the response status is 403
    When someone without a token asks for the release
    Then the response status is 401
