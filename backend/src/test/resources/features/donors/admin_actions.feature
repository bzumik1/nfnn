@donors
Feature: An administrator reads what administrators changed and when

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And a person "Eva" is registered
    And "Jana" is an administrator

  Scenario: The trail lists every administrator's change newest first with who did it, what and on whom
    Given "Jana" made "Petr" an administrator
    And 1 minutes pass
    And "Jana" removes "Petr" from the administrators
    When "Jana" asks for the admin actions
    Then the response status is 200
    And the admin actions are:
      | action                | adminName     | adminEmail      | subject | donor | summary                                                                       |
      | REVOKE_ADMINISTRATION | Jana Nováková | jana@example.cz | Petr    | Petr  | Role správce odebrána dárci Petr Svoboda; všechna přihlášení dárce skončila. |
      | GRANT_ADMINISTRATION  | Jana Nováková | jana@example.cz | Petr    | Petr  | Role správce udělena dárci Petr Svoboda.                                      |
    And the admin actions have no more pages
    And every admin action names when it was performed and what it changed

  Scenario: Each change reads as a sentence in Czech or in English, an older English record included, and keeps its stored details
    Given "Jana" recorded "GRANT_ADMINISTRATION" before the history was written in Czech as "Administrator role granted to donor <Eva>"
    And "Jana" made "Petr" an administrator
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action               | donor | summary                                  | details                                    |
      | GRANT_ADMINISTRATION | Petr  | Role správce udělena dárci Petr Svoboda. | Role správce udělena dárci <Petr>          |
      | GRANT_ADMINISTRATION | Eva   | Role správce udělena dárci Eva Nováková.     | Administrator role granted to donor <Eva>  |
    When "Jana" asks for the admin actions in "en"
    Then the admin actions are:
      | action               | summary                                               |
      | GRANT_ADMINISTRATION | Administrator role given to donor Petr Svoboda.       |
      | GRANT_ADMINISTRATION | Administrator role given to donor Eva Nováková.           |

  Scenario: A long trail is read page by page from the newest change back
    Given "Jana" made "Petr" an administrator
    And 1 minutes pass
    And "Jana" made "Eva" an administrator
    And 1 minutes pass
    And "Jana" removes "Petr" from the administrators
    When "Jana" asks for the 2 newest admin actions
    Then the response status is 200
    And the admin actions are:
      | action                | subject |
      | REVOKE_ADMINISTRATION | Petr    |
      | GRANT_ADMINISTRATION  | Eva     |
    And the admin actions have more pages
    When "Jana" asks for the 2 admin actions before the oldest one listed
    Then the admin actions are:
      | action               | subject |
      | GRANT_ADMINISTRATION | Petr    |
    And the admin actions have no more pages

  Scenario: A change made by an administrator who is no longer one still names the administrator
    Given "Jana" made "Petr" an administrator
    And "Petr" enables the second factor
    And "Petr" signs in again
    And 1 minutes pass
    And "Petr" made "Eva" an administrator
    And 1 minutes pass
    And "Jana" removes "Petr" from the administrators
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action                | adminName     | subject |
      | REVOKE_ADMINISTRATION | Jana Nováková | Petr    |
      | GRANT_ADMINISTRATION  | Petr Svoboda  | Eva     |
      | GRANT_ADMINISTRATION  | Jana Nováková | Petr    |

  Scenario: A page size outside 1 to 200 is refused
    When "Jana" asks for the 0 newest admin actions
    Then the response status is 400
    When "Jana" asks for the 201 newest admin actions
    Then the response status is 400

  Scenario: A donor without the role and a request without a token are refused
    When "Petr" asks for the admin actions
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token asks for the admin actions
    Then the response status is 401
