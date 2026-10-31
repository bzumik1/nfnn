@content
Feature: An administrator writes projects, the stories of the children the foundation helped, and publishes them

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: A new project is a draft with its year and an address made from its title
    When "Jana" creates a project:
      | title | Dominik, 7 let                                  |
      | year  | 2024                                            |
      | tag   | Kompenzační pomůcky                             |
      | perex | Pomohli jsme mu získat speciální kočárek.       |
      | body  | Dominik se narodil s dětskou mozkovou obrnou.   |
    Then the response status is 201
    And the project says:
      | slug        | dominik-7-let       |
      | title       | Dominik, 7 let      |
      | year        | 2024                |
      | tag         | Kompenzační pomůcky |
      | publishedOn |                     |
    And the admin action "CREATE_PROJECT" by "Jana" on the project "dominik-7-let" is recorded with details containing "napsán"
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action         | summary                          |
      | CREATE_PROJECT | Napsán projekt „Dominik, 7 let“. |
    When someone without a token asks for the projects
    Then the response status is 200
    And the project list has 0 items
    When someone without a token asks for the project "dominik-7-let"
    Then the response status is 404
    And the problem type ends with "content/project-not-found"

  Scenario: Published projects are listed by year, the newest year first, and withdrawing takes one down
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "dominik.png"
    And "Jana" creates a project:
      | title         | Dominik, 7 let          |
      | year          | 2024                    |
      | perex         | Perex.                  |
      | body          | Text.                   |
      | coverImage    | {uploaded}              |
      | coverImageAlt | Dominik na novém vozíku |
    And "Jana" creates a project:
      | title | Tomáš, 9 let |
      | year  | 2023         |
      | perex | Perex.       |
      | body  | Text.        |
    And "Jana" creates a project:
      | title | Eliška, 6 let |
      | year  | 2025          |
      | perex | Perex.        |
      | body  | Text.         |
    When "Jana" publishes the project "dominik-7-let" on 2026-10-23
    Then the response status is 200
    And the project says:
      | publishedOn    | 2026-10-23                    |
      | coverImage.url | /api/content/media/{uploaded} |
      | coverImage.alt | Dominik na novém vozíku       |
    And the admin action "PUBLISH_PROJECT" by "Jana" on the project "dominik-7-let" is recorded with details containing "zveřejněn od 2026-10-23"
    When "Jana" publishes the project "tomas-9-let" on 2026-10-01
    And "Jana" publishes the project "eliska-6-let" on 2026-09-01
    And someone without a token asks for the projects
    Then the project list titles are:
      | Eliška, 6 let  |
      | Dominik, 7 let |
      | Tomáš, 9 let   |
    And the project list says:
      | total   | 3     |
      | hasMore | false |
    When someone without a token asks for the project "dominik-7-let"
    Then the response status is 200
    And the project says:
      | year           | 2024                          |
      | coverImage.url | /api/content/media/{uploaded} |
    When "Jana" withdraws the project "tomas-9-let"
    Then the response status is 200
    And the admin action "UNPUBLISH_PROJECT" by "Jana" on the project "tomas-9-let" is recorded with details containing "stažen z webu"
    When someone without a token asks for the projects
    Then the project list titles are:
      | Eliška, 6 let  |
      | Dominik, 7 let |
    When "Jana" asks for the projects
    Then the project list titles are:
      | Tomáš, 9 let   |
      | Eliška, 6 let  |
      | Dominik, 7 let |

  Scenario: Within a year, projects for children come first, then adults, animals and the others
    When "Jana" creates a project:
      | title    | Plná miska pro útulek |
      | year     | 2025                  |
      | category | ANIMALS               |
      | perex    | Perex.                |
      | body     | Text.                 |
    Then the response status is 201
    And the project says:
      | category | ANIMALS |
    When "Jana" creates a project:
      | title | Sbírka pro nemocnici |
      | year  | 2025                 |
      | perex | Perex.               |
      | body  | Text.                |
    Then the project says:
      | category | OTHER |
    And "Jana" creates a project:
      | title    | Dominik, 7 let |
      | year     | 2025           |
      | category | CHILDREN       |
      | perex    | Perex.         |
      | body     | Text.          |
    And "Jana" creates a project:
      | title    | Eliška, 6 let |
      | year     | 2026          |
      | category | ANIMALS       |
      | perex    | Perex.        |
      | body     | Text.         |
    And "Jana" publishes the project "plna-miska-pro-utulek" on 2026-10-01
    And "Jana" publishes the project "sbirka-pro-nemocnici" on 2026-10-01
    And "Jana" publishes the project "dominik-7-let" on 2026-10-01
    And "Jana" publishes the project "eliska-6-let" on 2026-10-01
    When someone without a token asks for the projects
    Then the project list titles are:
      | Eliška, 6 let         |
      | Dominik, 7 let        |
      | Plná miska pro útulek |
      | Sbírka pro nemocnici  |
    When "Jana" changes the project "sbirka-pro-nemocnici":
      | title    | Sbírka pro nemocnici |
      | year     | 2025                 |
      | category | ADULTS               |
      | perex    | Perex.               |
      | body     | Text.                |
    Then the response status is 200
    And the project says:
      | category | ADULTS |
    When someone without a token asks for the projects
    Then the project list titles are:
      | Eliška, 6 let         |
      | Dominik, 7 let        |
      | Sbírka pro nemocnici  |
      | Plná miska pro útulek |
    And the project list says:
      | items.1.category | CHILDREN |
    When "Jana" asks for the projects
    Then the project list titles are:
      | Eliška, 6 let         |
      | Dominik, 7 let        |
      | Sbírka pro nemocnici  |
      | Plná miska pro útulek |
    When "Jana" creates a project:
      | title    | Titulek |
      | category | PLANTS  |
      | perex    | Perex.  |
      | body     | Text.   |
    Then the response status is 400
    And the problem lists an error for field "category"

  Scenario: A project published with a future date appears on the site on that day, and the administration says when it is live
    Given "Jana" creates a project:
      | title | Klára, 4 roky |
      | year  | 2026          |
      | perex | Perex.        |
      | body  | Text.         |
    And the project says:
      | live | false |
    When "Jana" publishes the project "klara-4-roky" on 2026-11-01
    Then the project says:
      | publishedOn | 2026-11-01 |
      | live        | false      |
    When someone without a token asks for the projects
    Then the project list has 0 items
    When today is 2026-11-01
    And "Jana" asks for the project "klara-4-roky"
    Then the project says:
      | live | true |
    When someone without a token asks for the projects
    Then the project list titles are:
      | Klára, 4 roky |
    And the project list says:
      | items.0.live | true |

  Scenario: Editing a project replaces its photo and deleting it removes the photo too
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "prvni.png"
    And "Jana" creates a project:
      | title      | S fotkou   |
      | perex      | Perex.     |
      | body       | Text.      |
      | coverImage | {uploaded} |
    And "Jana" uploads a 800 by 600 pixel PNG image named "druha.png"
    When "Jana" changes the project "s-fotkou":
      | title      | S novou fotkou |
      | year       | 2025           |
      | perex      | Nový perex.    |
      | body       | Nový text.     |
      | coverImage | {uploaded}     |
    Then the response status is 200
    And the project says:
      | title | S novou fotkou |
      | year  | 2025           |
    And the admin action "UPDATE_PROJECT" by "Jana" on the project "s-fotkou" is recorded with details containing "upraven"
    When someone without a token asks for the image uploaded as "prvni.png"
    Then the response status is 404
    When "Jana" deletes the project "s-fotkou"
    Then the response status is 204
    And the admin action "DELETE_PROJECT" by "Jana" on the project "s-fotkou" is recorded with details containing "smazán"
    When someone without a token asks for the image uploaded as "druha.png"
    Then the response status is 404
    When "Jana" asks for the project "s-fotkou"
    Then the response status is 404
    And the problem type ends with "content/project-not-found"

  Scenario: A year outside 2005–2100, missing texts, a taken address and an unknown photo are refused
    When "Jana" creates a project:
      | title | Titulek |
      | year  | 2004    |
      | perex | Perex.  |
      | body  | Text.   |
    Then the response status is 400
    And the problem lists an error for field "year"
    When "Jana" creates a project:
      | title |       |
      | perex |       |
      | body  | Text. |
    Then the response status is 400
    And the problem lists errors for fields "title" and "perex"
    Given "Jana" creates a project:
      | title | Dominik |
      | perex | Perex.  |
      | body  | Text.   |
    When "Jana" creates a project:
      | title | Dominik znovu |
      | slug  | dominik       |
      | perex | Perex.        |
      | body  | Text.         |
    Then the response status is 409
    And the problem type ends with "content/slug-taken"
    When "Jana" creates a project:
      | title      | Titulek                              |
      | perex      | Perex.                               |
      | body       | Text.                                |
      | coverImage | 0199f3e0-0000-7000-8000-000000000000 |
    Then the response status is 404
    And the problem type ends with "content/media-not-found"
    When "Jana" publishes the project "neexistuje" on 2026-10-23
    Then the response status is 404
    And the problem type ends with "content/project-not-found"

  Scenario: A donor without the administrator role and a visitor without a token cannot manage projects
    Given a person "Petr" is registered
    When "Petr" asks for the projects
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token creates a project
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: After its address changes, the old address still leads to the project
    Given "Jana" creates a project:
      | title | Dominik, 7 let                            |
      | year  | 2024                                      |
      | perex | Pomohli jsme mu získat speciální kočárek. |
      | body  | Text o Dominikovi.                        |
    And "Jana" publishes the project "dominik-7-let" on 2026-10-20
    When "Jana" changes the project "dominik-7-let":
      | title | Dominik, 8 let                            |
      | slug  | dominik-8-let                             |
      | year  | 2025                                      |
      | perex | Pomohli jsme mu získat speciální kočárek. |
      | body  | Text o Dominikovi.                        |
    Then the response status is 200
    When someone without a token asks for the project "dominik-7-let"
    Then the response status is 200
    And the project says:
      | slug | dominik-8-let |
      | year | 2025          |
    When someone without a token asks for the news article "dominik-7-let"
    Then the response status is 404
