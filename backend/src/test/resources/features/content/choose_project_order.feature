@content
Feature: An administrator chooses how the site orders the projects

  Jakub 2026-10-30: the order of the projects is chosen in the administration, and every choice says
  how it orders. Until someone chooses, the newest year comes first and within a year the projects
  for children, then adults, animals and the others. The home page, the list of projects on the site
  and the list in the administration (drafts first there) follow the same order, and within the same
  place the project published last comes first.

  Background:
    Given today is 2026-10-30
    And a person "Jana" is registered
    And "Jana" is an administrator
    And "Jana" creates a project:
      | title    | Dominik  |
      | year     | 2025     |
      | category | CHILDREN |
      | perex    | Perex.   |
      | body     | Text.    |
    And "Jana" creates a project:
      | title    | Petr   |
      | year     | 2025   |
      | category | ADULTS |
      | perex    | Perex. |
      | body     | Text.  |
    And "Jana" creates a project:
      | title    | Útulek  |
      | year     | 2025    |
      | category | ANIMALS |
      | perex    | Perex.  |
      | body     | Text.   |
    And "Jana" creates a project:
      | title    | Ellinka  |
      | year     | 2024     |
      | category | CHILDREN |
      | perex    | Perex.   |
      | body     | Text.    |
    And "Jana" creates a project:
      | title    | Kamna  |
      | year     | 2026   |
      | category | OTHER  |
      | perex    | Perex. |
      | body     | Text.  |
    And "Jana" publishes the project "dominik" on 2026-10-01
    And "Jana" publishes the project "ellinka" on 2026-10-02
    And "Jana" publishes the project "utulek" on 2026-10-03
    And "Jana" publishes the project "kamna" on 2026-10-04
    And "Jana" publishes the project "petr" on 2026-10-05

  Scenario: Until an administrator chooses, the newest year comes first and within it the projects for children
    When "Jana" asks for the project order
    Then the response status is 200
    And the project order is "YEAR_THEN_CATEGORY"
    When someone without a token asks for the projects
    Then the project list titles are:
      | Kamna   |
      | Dominik |
      | Petr    |
      | Útulek  |
      | Ellinka |

  Scenario: Ordered by year alone, a year shows its projects from the one published last, whatever their category
    Given 1 minutes pass
    When "Jana" sets the project order to "YEAR"
    Then the response status is 200
    And the project order is "YEAR"
    And the admin action "CHANGE_PROJECT_ORDER" by "Jana" is recorded with details containing "z YEAR_THEN_CATEGORY na YEAR"
    When "Jana" asks for the 1 newest admin actions
    Then the admin actions are:
      | action               | summary                                                                                   |
      | CHANGE_PROJECT_ORDER | Řazení projektů na webu změněno z „podle roku, v něm podle kategorie“ na „podle roku“. |
    When "Jana" asks for the project order
    Then the project order is "YEAR"
    When someone without a token asks for the projects
    Then the project list titles are:
      | Kamna   |
      | Petr    |
      | Útulek  |
      | Dominik |
      | Ellinka |
    When someone without a token asks for the home content
    Then the home project titles are:
      | Kamna  |
      | Petr   |
      | Útulek |

  Scenario: Ordered by category first, every project for children leads, from the newest year
    Given "Jana" creates a project:
      | title    | Koncept |
      | year     | 2023    |
      | category | OTHER   |
      | perex    | Perex.  |
      | body     | Text.   |
    When "Jana" sets the project order to "CATEGORY_THEN_YEAR"
    Then the response status is 200
    And the project order is "CATEGORY_THEN_YEAR"
    When someone without a token asks for the projects
    Then the project list titles are:
      | Dominik |
      | Ellinka |
      | Petr    |
      | Útulek  |
      | Kamna   |
    When someone without a token asks for the home content
    Then the home project titles are:
      | Dominik |
      | Ellinka |
      | Petr    |
    When "Jana" asks for the projects
    Then the project list titles are:
      | Koncept |
      | Dominik |
      | Ellinka |
      | Petr    |
      | Útulek  |
      | Kamna   |

  Scenario: Choosing the order already chosen changes nothing and records nothing
    When "Jana" sets the project order to "YEAR_THEN_CATEGORY"
    Then the response status is 200
    And the project order is "YEAR_THEN_CATEGORY"
    And no admin action "CHANGE_PROJECT_ORDER" is recorded

  Scenario: An unknown or missing order is refused
    When "Jana" sets the project order to "TITLE"
    Then the response status is 400
    And the problem lists an error for field "order"
    When "Jana" sets the project order without one
    Then the response status is 400
    And the problem lists an error for field "order"
    When "Jana" asks for the project order
    Then the project order is "YEAR_THEN_CATEGORY"

  Scenario: A donor without the administrator role and a visitor without a token cannot see or choose the order
    Given a person "Petr" is registered
    When "Petr" asks for the project order
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" sets the project order to "YEAR"
    Then the response status is 403
    When someone without a token sets the project order to "YEAR"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
