@operations
Feature: The administration refuses a change of the settings made from a version that changed meanwhile

  Background:
    Given today is 2026-10-23
    And the first setup was completed
    And a person "Jana" is registered
    And a person "Eva" is registered
    And "Jana" is an administrator
    And "Eva" is an administrator

  Scenario: Of two changes of the settings made from one version, the second waits at the lock and is refused as changed meanwhile with what holds now
    When these settings changes start one after another from the versions read before them, while the settings lock is held:
      | who  | write                            |
      | Jana | sets SESSION_REMEMBER_DAYS to 14 |
      | Eva  | sets SESSION_REMEMBER_DAYS to 21 |
    Then write 1 answers 202
    And write 2 is refused as "operations/changed-meanwhile" with the version now stored and the current record

  Scenario: An administrator who saves settings another administrator changed since they opened the page is told so with the stored values, and can then save theirs in their place
    Given "Jana" opens the settings
    And "Eva" sets SESSION_REMEMBER_DAYS to "14" from the version stored now
    When "Jana" sets SESSION_REMEMBER_DAYS to "21" from the version read before
    Then the response status is 409
    And the problem type ends with "operations/changed-meanwhile"
    And the refusal names the settings version now stored and the stored SESSION_REMEMBER_DAYS "14"
    And the refusal names no stored ADMIN_EMAILS
    When "Jana" sets SESSION_REMEMBER_DAYS to "21" from the version in the refusal
    Then the response status is 202
    And the answer names the settings version now stored
    And the stored "SESSION_REMEMBER_DAYS" is "21"

  Scenario: A change of the settings from a browser that names no version is refused before anything is stored
    When "Jana" sets SESSION_REMEMBER_DAYS to "14" naming no version
    Then the response status is 428
    And the problem type ends with "shared/version-required"
    And no setting SESSION_REMEMBER_DAYS is stored
    And the backend does not restart

  Scenario: A change of the settings without a token is refused before anything is stored
    When someone without a token sets SESSION_REMEMBER_DAYS to "14" from the version stored now
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    And no setting SESSION_REMEMBER_DAYS is stored
    And the backend does not restart
